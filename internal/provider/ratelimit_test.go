package provider

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// stubTransport answers with a scripted sequence of statuses.
type stubTransport struct {
	statuses   []int
	retryAfter string
	calls      atomic.Int32
}

func (s *stubTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	n := int(s.calls.Add(1)) - 1
	status := http.StatusOK
	if n < len(s.statuses) {
		status = s.statuses[n]
	}
	h := make(http.Header)
	if status == http.StatusTooManyRequests && s.retryAfter != "" {
		h.Set("Retry-After", s.retryAfter)
	}
	return &http.Response{
		StatusCode: status,
		Header:     h,
		Body:       io.NopCloser(strings.NewReader("{}")),
		Request:    req,
	}, nil
}

func newTestClient(t *testing.T, base http.RoundTripper, policy RateLimit) *http.Client {
	t.Helper()
	return &http.Client{Transport: &throttledTransport{
		base:   base,
		source: "testsource",
		policy: policy,
		pacer:  &pacer{interval: policy.MinInterval},
	}}
}

func get(t *testing.T, c *http.Client) (*http.Response, error) {
	t.Helper()
	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "http://example.invalid/x", nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	return c.Do(req)
}

func TestRetriesA429ThenSucceeds(t *testing.T) {
	stub := &stubTransport{statuses: []int{http.StatusTooManyRequests, http.StatusOK}}
	c := newTestClient(t, stub, RateLimit{MaxRetries: 3, MaxRetryWait: time.Second})

	resp, err := get(t, c)
	if err != nil {
		t.Fatalf("expected recovery after a 429, got %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
	if got := stub.calls.Load(); got != 2 {
		t.Errorf("made %d calls, want 2", got)
	}
}

// The whole point of the change: a source that keeps refusing must surface as a
// typed error, not as a body the caller parses into zero ratings.
func TestGivesUpWithTypedError(t *testing.T) {
	stub := &stubTransport{statuses: []int{429, 429, 429, 429, 429}}
	c := newTestClient(t, stub, RateLimit{MaxRetries: 1, MaxRetryWait: time.Second})

	_, err := get(t, c)
	if err == nil {
		t.Fatal("expected an error once the retry budget ran out")
	}
	if !errors.Is(err, ErrRateLimited) {
		t.Errorf("error %v does not match ErrRateLimited", err)
	}
	var rle *RateLimitError
	if !errors.As(err, &rle) {
		t.Fatalf("error %v is not a *RateLimitError", err)
	}
	if rle.Source != "testsource" || rle.Status != http.StatusTooManyRequests {
		t.Errorf("got source=%q status=%d", rle.Source, rle.Status)
	}
}

func TestServiceUnavailableIsTreatedAsThrottling(t *testing.T) {
	stub := &stubTransport{statuses: []int{http.StatusServiceUnavailable, http.StatusOK}}
	c := newTestClient(t, stub, RateLimit{MaxRetries: 2, MaxRetryWait: time.Second})

	resp, err := get(t, c)
	if err != nil {
		t.Fatalf("expected recovery after a 503, got %v", err)
	}
	defer resp.Body.Close()
	if stub.calls.Load() != 2 {
		t.Errorf("made %d calls, want 2", stub.calls.Load())
	}
}

// A gateway fault is not a throttle signal, so it must come straight back.
func TestGatewayErrorsAreNotRetried(t *testing.T) {
	stub := &stubTransport{statuses: []int{http.StatusBadGateway, http.StatusOK}}
	c := newTestClient(t, stub, RateLimit{MaxRetries: 3, MaxRetryWait: time.Second})

	resp, err := get(t, c)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadGateway {
		t.Errorf("status = %d, want 502 passed through", resp.StatusCode)
	}
	if stub.calls.Load() != 1 {
		t.Errorf("made %d calls, want 1 (no retry)", stub.calls.Load())
	}
}

// A source asking for longer than we are willing to wait should fail fast, so a
// render slot is not held hostage by someone else's outage.
func TestRetryAfterBeyondTheCapFailsImmediately(t *testing.T) {
	stub := &stubTransport{statuses: []int{429, 200}, retryAfter: "600"}
	c := newTestClient(t, stub, RateLimit{MaxRetries: 5, MaxRetryWait: 2 * time.Second})

	start := time.Now()
	_, err := get(t, c)
	if !errors.Is(err, ErrRateLimited) {
		t.Fatalf("expected ErrRateLimited, got %v", err)
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Errorf("took %s; should not have waited for an over-cap Retry-After", elapsed)
	}
	if stub.calls.Load() != 1 {
		t.Errorf("made %d calls, want 1", stub.calls.Load())
	}
}

func TestRetryAfterParsing(t *testing.T) {
	if got := retryAfter("5"); got != 5*time.Second {
		t.Errorf("seconds form: got %s, want 5s", got)
	}
	if got := retryAfter(""); got != 0 {
		t.Errorf("empty: got %s, want 0", got)
	}
	if got := retryAfter("not-a-date"); got != 0 {
		t.Errorf("garbage: got %s, want 0", got)
	}
	if got := retryAfter("-3"); got != 0 {
		t.Errorf("negative: got %s, want 0", got)
	}
	// A date in the past must not produce a negative wait.
	past := time.Now().Add(-time.Hour).UTC().Format(http.TimeFormat)
	if got := retryAfter(past); got != 0 {
		t.Errorf("past date: got %s, want 0", got)
	}
	future := time.Now().Add(30 * time.Second).UTC().Format(http.TimeFormat)
	if got := retryAfter(future); got <= 0 || got > 31*time.Second {
		t.Errorf("future date: got %s, want ~30s", got)
	}
}

func TestPacerSpacesRequests(t *testing.T) {
	p := &pacer{interval: 40 * time.Millisecond}
	start := time.Now()
	for i := 0; i < 3; i++ {
		if err := p.wait(nil); err != nil {
			t.Fatalf("wait: %v", err)
		}
	}
	// Three requests at a 40ms floor means at least two gaps.
	if elapsed := time.Since(start); elapsed < 80*time.Millisecond {
		t.Errorf("three paced requests took %s, want at least 80ms", elapsed)
	}
}

func TestPacerIsANoOpWithoutAnInterval(t *testing.T) {
	p := &pacer{}
	start := time.Now()
	for i := 0; i < 50; i++ {
		if err := p.wait(nil); err != nil {
			t.Fatalf("wait: %v", err)
		}
	}
	if elapsed := time.Since(start); elapsed > 20*time.Millisecond {
		t.Errorf("unpaced requests took %s, want no delay", elapsed)
	}
}

func TestPacerRespectsCancellation(t *testing.T) {
	p := &pacer{interval: 10 * time.Second}
	if err := p.wait(nil); err != nil { // consume the first free slot
		t.Fatalf("wait: %v", err)
	}
	done := make(chan struct{})
	close(done)
	start := time.Now()
	if err := p.wait(done); err == nil {
		t.Error("expected cancellation to abort the wait")
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Errorf("cancellation took %s to take effect", elapsed)
	}
}

// The known-dangerous sources must be paced, since both answer sustained
// overuse with a ban rather than a 429.
func TestTightPoliciesForBanHappySources(t *testing.T) {
	for _, source := range []string{"mal", "anilist"} {
		if got := rateLimitFor(source).MinInterval; got < time.Second {
			t.Errorf("%s MinInterval = %s, want at least 1s", source, got)
		}
	}
	if rateLimitFor("something-unlisted").MinInterval != 0 {
		t.Error("unlisted sources should not be paced by default")
	}
}

func TestBackoffGrowsAndStaysBounded(t *testing.T) {
	prev := time.Duration(0)
	for attempt := 0; attempt < 6; attempt++ {
		d := backoff(attempt)
		if d <= 0 {
			t.Fatalf("attempt %d: non-positive backoff %s", attempt, d)
		}
		if d > 13*time.Second {
			t.Errorf("attempt %d: backoff %s exceeds the bound", attempt, d)
		}
		if attempt > 0 && attempt < 4 && d < prev {
			t.Errorf("attempt %d: backoff %s did not grow past %s", attempt, d, prev)
		}
		prev = d
	}
}

func TestNewHTTPClientAppliesThePolicy(t *testing.T) {
	c := newHTTPClient("mal", 3*time.Second)
	if c.Timeout != 3*time.Second {
		t.Errorf("timeout = %s, want 3s", c.Timeout)
	}
	tt, ok := c.Transport.(*throttledTransport)
	if !ok {
		t.Fatalf("transport is %T, want *throttledTransport", c.Transport)
	}
	if tt.source != "mal" || tt.pacer.interval != time.Second {
		t.Errorf("got source=%q interval=%s", tt.source, tt.pacer.interval)
	}
}
