package provider

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// ErrRateLimited reports that a source refused the request for rate-limit
// reasons and did not recover within the retry budget. Callers use it to tell a
// throttled source apart from a missing title, so a render can fall back to the
// last good ratings instead of silently dropping the badge.
var ErrRateLimited = errors.New("rate limited")

// RateLimitError carries which source refused and how long it asked us to wait.
type RateLimitError struct {
	Source     string
	RetryAfter time.Duration
	Status     int
}

func (e *RateLimitError) Error() string {
	if e.RetryAfter > 0 {
		return fmt.Sprintf("%s: rate limited (http %d), retry after %s", e.Source, e.Status, e.RetryAfter)
	}
	return fmt.Sprintf("%s: rate limited (http %d)", e.Source, e.Status)
}

func (e *RateLimitError) Unwrap() error { return ErrRateLimited }

// RateLimit describes how hard a source may be hit.
//
// MinInterval is a floor on the gap between two requests to the same source.
// It is deliberately client-side: several of these APIs answer an overrun with
// a ban rather than a 429, so staying under the limit matters more than
// reacting to it.
type RateLimit struct {
	MinInterval time.Duration
	MaxRetries  int
	// MaxRetryWait caps how long a single Retry-After will be honoured. A
	// source asking for ten minutes should fail the render fast and let the
	// cached value stand, not hold a render slot for ten minutes.
	MaxRetryWait time.Duration
}

// rateLimits holds the per-source policy. Anything not listed gets
// defaultRateLimit, which is loose enough not to slow ordinary use.
//
// The two tight ones are deliberate:
//   - MAL bans on sustained overuse and the ban is permanent with no appeal
//     path, so it is held to roughly one request a second.
//   - AniList publishes 90 requests/minute but drops to 30 in degraded
//     windows, so it is paced for the degraded number rather than the happy one.
var rateLimits = map[string]RateLimit{
	"mal":     {MinInterval: time.Second, MaxRetries: 2, MaxRetryWait: 10 * time.Second},
	"anilist": {MinInterval: 2 * time.Second, MaxRetries: 2, MaxRetryWait: 10 * time.Second},
	"mdblist": {MinInterval: 100 * time.Millisecond, MaxRetries: 3, MaxRetryWait: 10 * time.Second},
	"trakt":   {MinInterval: 100 * time.Millisecond, MaxRetries: 3, MaxRetryWait: 10 * time.Second},
	"simkl":   {MinInterval: 100 * time.Millisecond, MaxRetries: 3, MaxRetryWait: 10 * time.Second},
	"kitsu":   {MinInterval: 100 * time.Millisecond, MaxRetries: 3, MaxRetryWait: 10 * time.Second},
}

var defaultRateLimit = RateLimit{MaxRetries: 2, MaxRetryWait: 5 * time.Second}

// rateLimitFor returns the policy for a source.
func rateLimitFor(source string) RateLimit {
	if rl, ok := rateLimits[source]; ok {
		return rl
	}
	return defaultRateLimit
}

// pacer enforces a minimum gap between requests to one source.
type pacer struct {
	mu       sync.Mutex
	interval time.Duration
	next     time.Time
}

// wait blocks until the next request may go out, or the request is cancelled.
// It reserves its slot under the lock and sleeps outside it, so concurrent
// callers queue in order instead of all waking at the same instant.
func (p *pacer) wait(done <-chan struct{}) error {
	if p == nil || p.interval <= 0 {
		return nil
	}
	p.mu.Lock()
	now := time.Now()
	slot := p.next
	if slot.Before(now) {
		slot = now
	}
	p.next = slot.Add(p.interval)
	p.mu.Unlock()

	delay := time.Until(slot)
	if delay <= 0 {
		return nil
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-done:
		return context.Canceled
	}
}

// throttledTransport paces requests to one source and retries the responses
// that mean "slow down" rather than "no".
type throttledTransport struct {
	base   http.RoundTripper
	source string
	policy RateLimit
	pacer  *pacer
	logger *slog.Logger
}

func (t *throttledTransport) log() *slog.Logger {
	if t.logger == nil {
		return slog.Default()
	}
	return t.logger
}

func (t *throttledTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	base := t.base
	if base == nil {
		base = http.DefaultTransport
	}
	// A body can only be replayed when the request knows how to rebuild it, so
	// a one-shot body means this attempt is the only attempt.
	retries := t.policy.MaxRetries
	if req.Body != nil && req.GetBody == nil {
		retries = 0
	}

	var lastStatus int
	for attempt := 0; ; attempt++ {
		if err := t.pacer.wait(req.Context().Done()); err != nil {
			return nil, err
		}

		attemptReq := req
		if attempt > 0 && req.GetBody != nil {
			body, err := req.GetBody()
			if err != nil {
				return nil, err
			}
			attemptReq = req.Clone(req.Context())
			attemptReq.Body = body
		}

		resp, err := base.RoundTrip(attemptReq)
		if err != nil {
			return nil, err
		}
		if !isThrottleStatus(resp.StatusCode) {
			return resp, nil
		}

		lastStatus = resp.StatusCode
		wait := retryAfter(resp.Header.Get("Retry-After"))
		if wait <= 0 {
			wait = backoff(attempt)
		}

		if attempt >= retries || wait > t.policy.MaxRetryWait {
			// Drain a little so the connection can be reused, then report the
			// refusal as a typed error rather than handing back a body the
			// caller would try to parse as ratings.
			drain(resp)
			t.log().WarnContext(req.Context(), "A ratings source is rate limiting us and did not recover",
				"source", t.source, "status", lastStatus, "retry_after", wait.String(), "attempts", attempt+1)
			return nil, &RateLimitError{Source: t.source, RetryAfter: wait, Status: lastStatus}
		}

		drain(resp)
		t.log().WarnContext(req.Context(), "A ratings source asked us to slow down; backing off",
			"source", t.source, "status", lastStatus, "wait", wait.String(), "attempt", attempt+1)

		timer := time.NewTimer(wait)
		select {
		case <-timer.C:
		case <-req.Context().Done():
			timer.Stop()
			return nil, req.Context().Err()
		}
		timer.Stop()
	}
}

// isThrottleStatus reports whether a status means "slow down and come back"
// rather than a definitive answer. 503 is included because several of these
// APIs use it for overload, and 502/504 are not: those are gateway faults where
// a retry is far less likely to help.
func isThrottleStatus(code int) bool {
	return code == http.StatusTooManyRequests || code == http.StatusServiceUnavailable
}

// retryAfter parses the header in both permitted forms: delay-seconds, or an
// HTTP-date. A date in the past yields zero so the caller falls back to backoff.
func retryAfter(v string) time.Duration {
	if v == "" {
		return 0
	}
	if secs, err := strconv.Atoi(v); err == nil {
		if secs < 0 {
			return 0
		}
		return time.Duration(secs) * time.Second
	}
	if when, err := http.ParseTime(v); err == nil {
		if d := time.Until(when); d > 0 {
			return d
		}
	}
	return 0
}

// backoff returns an exponentially growing delay with jitter, so a burst of
// requests that were throttled together do not all retry on the same tick.
func backoff(attempt int) time.Duration {
	base := time.Duration(1<<uint(attempt)) * 500 * time.Millisecond
	if base > 8*time.Second {
		base = 8 * time.Second
	}
	return base + time.Duration(rand.Int64N(int64(base/2)))
}

// drain reads and closes a response body so the connection can be reused.
func drain(resp *http.Response) {
	if resp.Body == nil {
		return
	}
	_, _ = io.CopyN(io.Discard, resp.Body, 4<<10)
	_ = resp.Body.Close()
}

// newHTTPClient builds the client a provider should use: its own timeout, plus
// the pacing and retry policy for that source.
func newHTTPClient(source string, timeout time.Duration) *http.Client {
	policy := rateLimitFor(source)
	return &http.Client{
		Timeout: timeout,
		Transport: &throttledTransport{
			source: source,
			policy: policy,
			pacer:  &pacer{interval: policy.MinInterval},
		},
	}
}
