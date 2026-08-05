package provider

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// A spent allowance cannot be retried out of, and every retry is charged
// against the allowance that ran out.
func TestQuotaRefusalIsNotRetried(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":"app_limit_exceeded","code":429,"message":"App daily request limit exceeded"}`))
	}))
	defer srv.Close()

	client := &http.Client{Transport: &throttledTransport{
		source: "simkl",
		policy: RateLimit{MaxRetries: 3, MaxRetryWait: time.Second},
		pacer:  &pacer{},
	}}
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, srv.URL, nil)
	_, err := client.Do(req)

	if calls != 1 {
		t.Errorf("the request was sent %d times; a spent allowance must be asked once", calls)
	}
	var rl *RateLimitError
	if !errors.As(err, &rl) {
		t.Fatalf("expected a rate-limit error, got %v", err)
	}
	if !rl.QuotaExhausted {
		t.Error("the refusal was not marked as a spent allowance")
	}
}

// An ordinary "slow down" is still worth retrying.
func TestOrdinaryThrottleIsStillRetried(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 1 {
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":"rate_limit","message":"slow down"}`))
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	client := &http.Client{Transport: &throttledTransport{
		source: "trakt",
		policy: RateLimit{MaxRetries: 3, MaxRetryWait: time.Second},
		pacer:  &pacer{},
	}}
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, srv.URL, nil)
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("expected the retry to succeed, got %v", err)
	}
	defer resp.Body.Close()
	if calls != 2 {
		t.Errorf("calls = %d, want 2 (one refusal then one success)", calls)
	}
}

func TestQuotaMarkersAreRecognised(t *testing.T) {
	yes := []string{
		`{"error":"app_limit_exceeded","code":429}`,
		`{"message":"App daily request limit exceeded"}`,
		`{"error":"quota_exceeded"}`,
		`you are out of quota`,
	}
	for _, b := range yes {
		if !isQuotaRefusal([]byte(b)) {
			t.Errorf("not recognised as a spent allowance: %s", b)
		}
	}
	no := []string{``, `{"error":"rate_limit"}`, `{"message":"too many requests, slow down"}`}
	for _, b := range no {
		if isQuotaRefusal([]byte(b)) {
			t.Errorf("wrongly read as a spent allowance: %s", b)
		}
	}
}

// A spent allowance lasts until the source's window rolls over, far longer than
// the seconds an ordinary refusal asks for.
func TestQuotaRefusalCoolsOffForLonger(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Failure("simkl", &RateLimitError{Source: "simkl", RetryAfter: 2 * time.Second,
		Status: 429, QuotaExhausted: true}, CallerInteractive)
	h.mu.Lock()
	until := h.sources["simkl"].cooldownUntil[CallerInteractive]
	h.mu.Unlock()
	if d := time.Until(until); d < 30*time.Minute {
		t.Errorf("a spent allowance cooled off for only %s", d)
	}
}
