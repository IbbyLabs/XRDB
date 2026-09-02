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
		if err := p.wait(context.Background()); err != nil {
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
		if err := p.wait(context.Background()); err != nil {
			t.Fatalf("wait: %v", err)
		}
	}
	if elapsed := time.Since(start); elapsed > 20*time.Millisecond {
		t.Errorf("unpaced requests took %s, want no delay", elapsed)
	}
}

func TestPacerRespectsCancellation(t *testing.T) {
	p := &pacer{interval: 10 * time.Second}
	if err := p.wait(context.Background()); err != nil { // consume the first free slot
		t.Fatalf("wait: %v", err)
	}
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	start := time.Now()
	if err := p.wait(cancelled); err == nil {
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

func TestPacerRefusesASweepWhereAPersonIsQueued(t *testing.T) {
	p := &pacer{interval: time.Second, maxWait: 2 * time.Second}
	// Two slots taken, so the next is two intervals out: past a sweep's ceiling
	// and at a person's. One taken slot no longer separates them, because a
	// sweep may now wait one interval rather than a fraction of one.
	for i := range 2 {
		if _, err := p.reserve(0, false, p.maxWait); err != nil {
			t.Fatalf("reserve %d: %v", i, err)
		}
	}

	if _, err := p.reserve(0, false, bulkMaxWait(CallerBulk, p.maxWait, p.interval)); !errors.Is(err, ErrPacerBacklog) {
		t.Fatalf("a sweep two slots back should be refused, got %v", err)
	}
	if _, err := p.reserve(0, false, bulkMaxWait(CallerInteractive, p.maxWait, p.interval)); err != nil {
		t.Fatalf("a person behind the same queue should be served: %v", err)
	}
}

// A share of the ceiling smaller than one slot is a queue nobody can join: the
// wait allowed is less than the wait a slot requires, so a sweep is refused on
// arrival however idle the source is. Five of the seven paced sources sit above
// that line, so the floor is the difference between a share and a ban.
func TestASweepMayAlwaysWaitOneSlot(t *testing.T) {
	p := &pacer{interval: 2 * time.Second, maxWait: 2 * time.Second}
	if _, err := p.reserve(0, false, p.maxWait); err != nil {
		t.Fatalf("first reserve: %v", err)
	}

	if _, err := p.reserve(0, false, bulkMaxWait(CallerBulk, p.maxWait, p.interval)); err != nil {
		t.Errorf("a sweep was refused the very next slot on an idle source: %v", err)
	}
}

func TestWaitTakesTheCeilingFromTheContextClass(t *testing.T) {
	p := &pacer{interval: time.Second, maxWait: 2 * time.Second}
	if _, err := p.reserve(0, false, p.maxWait); err != nil {
		t.Fatalf("first reserve: %v", err)
	}

	if _, err := p.reserve(0, false, p.maxWait); err != nil {
		t.Fatalf("second reserve: %v", err)
	}
	if err := p.wait(WithCallerClass(context.Background(), CallerBulk)); !errors.Is(err, ErrPacerBacklog) {
		t.Fatalf("wait should refuse a sweep from its context class, got %v", err)
	}
}

func TestOnlyANamedSweepYieldsTheQueue(t *testing.T) {
	const ceiling = 2 * time.Second
	// A short interval, so the share is the larger of the two and the yielding
	// is what is under test rather than the floor.
	const interval = 100 * time.Millisecond
	for _, tc := range []struct {
		class CallerClass
		want  time.Duration
	}{
		{CallerBulk, 500 * time.Millisecond},
		{CallerInteractive, ceiling},
		{CallerUnknown, ceiling},
	} {
		if got := bulkMaxWait(tc.class, ceiling, interval); got != tc.want {
			t.Errorf("%s: got %s, want %s", tc.class, got, tc.want)
		}
	}
}

// The floor applies only where the share falls short, and only to a sweep.
func TestTheFloorIsOneSlotAndOnlyForASweep(t *testing.T) {
	const ceiling = 2 * time.Second
	for _, tc := range []struct {
		name     string
		class    CallerClass
		interval time.Duration
		want     time.Duration
	}{
		{"a slot wider than the share", CallerBulk, time.Second, time.Second},
		{"a slot narrower than the share", CallerBulk, 100 * time.Millisecond, 500 * time.Millisecond},
		{"a person is not floored, they have the ceiling", CallerInteractive, 8 * time.Second, ceiling},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := bulkMaxWait(tc.class, ceiling, tc.interval); got != tc.want {
				t.Errorf("got %s, want %s", got, tc.want)
			}
		})
	}
}

// A sweep must never outlast a person in the queue. The floor lifts bulk to one
// slot, and a source paced slower than the ceiling would otherwise lift it past
// interactive — an inversion of the whole share, reachable from one env var
// since XRDB_<SOURCE>_MIN_INTERVAL_SECONDS accepts up to ten seconds.
func TestASweepNeverWaitsLongerThanAPerson(t *testing.T) {
	const ceiling = 2 * time.Second
	for _, interval := range []time.Duration{
		100 * time.Millisecond, time.Second, 2 * time.Second, 5 * time.Second, 10 * time.Second,
	} {
		bulk := bulkMaxWait(CallerBulk, ceiling, interval)
		person := bulkMaxWait(CallerInteractive, ceiling, interval)
		if bulk > person {
			t.Errorf("interval %s: a sweep may wait %s against a person's %s", interval, bulk, person)
		}
	}
}
