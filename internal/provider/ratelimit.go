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
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// ErrRateLimited reports that a source refused the request for rate-limit
// reasons and did not recover within the retry budget. Callers use it to tell a
// throttled source apart from a missing title, so a render can fall back to the
// last good ratings instead of silently dropping the badge.
var ErrRateLimited = errors.New("rate limited")

// pacerMaxWait is how long a render will queue for a paced source before the
// request is refused. The default is well under the per-source client timeouts,
// which cover the queue wait as well as the call.
func pacerMaxWait() time.Duration {
	secs := envFloat("XRDB_RATINGS_MAX_QUEUE_SECONDS", 2, 0.1, 30)
	return time.Duration(secs * float64(time.Second))
}

// ErrPacerBacklog reports that the queue in front of a paced source is longer
// than the caller can wait for, so the request was refused rather than started.
// It is a rate-limit refusal: the source is healthy, we are simply over its
// allowance for the moment.
var ErrPacerBacklog = fmt.Errorf("paced source backlog: %w", ErrRateLimited)

// ErrGovernorBacklog reports that the daily-budget queue in front of a source
// would not reach this request before its own timeout, so it was refused rather
// than left to expire in the queue and be recorded as the source timing out.
var ErrGovernorBacklog = fmt.Errorf("source budget backlog: %w", ErrRateLimited)

// ErrCoolingOff reports that a source was skipped because an earlier refusal
// left it in cooldown. It did not refuse this request.
var ErrCoolingOff = fmt.Errorf("source cooling off: %w", ErrRateLimited)

// ErrFailureBreaker reports a source held out by the breaker that trips after
// five consecutive failures of any kind. Nothing refused the request; the
// source is erroring, most often by timing out.
var ErrFailureBreaker = fmt.Errorf("source held out by the failure breaker: %w", ErrRateLimited)

// ErrBulkAllowanceHeld reports that a bulk caller was held out of the last of a
// source's daily allowance, which is reserved for interactive renders.
var ErrBulkAllowanceHeld = fmt.Errorf("daily allowance held for interactive callers: %w", ErrRateLimited)

// Gate names, as they appear in the "gate" field of a hold-out log line.
const (
	GateUpstreamRefusal = "upstream_refusal"
	GateCooldown        = "cooldown"
	GatePacerBacklog    = "pacer_backlog"
	GateBulkAllowance   = "bulk_allowance"
	// GateFailureBreaker is a hold-out from the breaker that trips after five
	// consecutive failures of any kind. The source never refused.
	GateFailureBreaker = "failure_breaker"
	// GateGovernorBacklog is a hold-out from our own daily-budget pacing, not
	// from anything the source did.
	GateGovernorBacklog = "governor_backlog"
	// GateUnattributed marks a rate-limit refusal none of the gates claims. It
	// is a gap in this function, not a fifth way to be held out.
	GateUnattributed = "unattributed"
)

// GateIsOurOwn reports whether a gate held the source back on our own decision
// rather than on anything the source did. Unrecognised gates are not ours: a
// gate this does not know about may be a source failing, and treating it as
// ours would make a broken render look sound.
func GateIsOurOwn(gate string) bool {
	switch gate {
	case GateBulkAllowance, GatePacerBacklog, GateGovernorBacklog:
		return true
	}
	return false
}

// HoldOutGate names which gate dropped a source from a render. Only
// GateUpstreamRefusal means the source itself refused.
func HoldOutGate(err error) string {
	if err == nil {
		return ""
	}
	var rl *RateLimitError
	switch {
	case errors.As(err, &rl):
		return GateUpstreamRefusal
	case errors.Is(err, ErrPacerBacklog):
		return GatePacerBacklog
	case errors.Is(err, ErrGovernorBacklog):
		return GateGovernorBacklog
	case errors.Is(err, ErrFailureBreaker):
		return GateFailureBreaker
	case errors.Is(err, ErrCoolingOff):
		return GateCooldown
	case errors.Is(err, ErrBulkAllowanceHeld):
		return GateBulkAllowance
	case errors.Is(err, ErrRateLimited):
		return GateUnattributed
	}
	return ""
}

// RateLimitError carries which source refused and how long it asked us to wait.
type RateLimitError struct {
	Source     string
	RetryAfter time.Duration
	Status     int
	// QuotaExhausted marks a refusal that stands until the source's quota
	// window rolls over. No amount of waiting inside the window helps, and
	// every further request is spent on being refused again.
	QuotaExhausted bool
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
	// MaxRetryWait caps how long a single Retry-After will be honoured. These
	// waits happen inside a live render, so the budget is the one a request can
	// afford, not the one the source asked for. A longer wait ends the attempt
	// and the refusal puts the source in cooldown instead.
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
//
// MDBList carries no interval because it meters by the day: budgetGovernor
// paces it from the allowance its responses report.
var rateLimits = map[string]RateLimit{
	"mal":     {MinInterval: time.Second, MaxRetries: 2, MaxRetryWait: renderRetryBudget},
	"anilist": {MinInterval: 2 * time.Second, MaxRetries: 2, MaxRetryWait: renderRetryBudget},
	"mdblist": {MaxRetries: 3, MaxRetryWait: renderRetryBudget},
	"trakt":   {MinInterval: 100 * time.Millisecond, MaxRetries: 3, MaxRetryWait: renderRetryBudget},
	"simkl":   {MinInterval: 100 * time.Millisecond, MaxRetries: 3, MaxRetryWait: renderRetryBudget},
	"kitsu":   {MinInterval: 100 * time.Millisecond, MaxRetries: 3, MaxRetryWait: renderRetryBudget},
}

// renderRetryBudget is how long a live render will sleep waiting for a source
// to stop refusing. Beyond it the attempt ends and the source cools off.
const renderRetryBudget = time.Second

var defaultRateLimit = RateLimit{MaxRetries: 2, MaxRetryWait: renderRetryBudget}

// rateLimitFor returns the policy for a source.
// PacedInterval is the floor between two requests to a source. A pacer_backlog
// hold-out means a deliberately conservative interval where this is large, and
// demand outrunning an ordinary one where it is small.
func PacedInterval(source string) time.Duration {
	return rateLimitFor(source).MinInterval
}

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
	// maxWait bounds how long a caller will queue for a slot. Past it the
	// request is refused instead of taking a slot it would not live to use: the
	// client timeout covers the queue wait as well as the call, so a long queue
	// cancelled every request in it before any of them were sent.
	maxWait time.Duration
}

// reserve takes the next slot and reports how long to hold before using it. It
// refuses before reserving, so a shed request does not hold a slot that its own
// timeout would have thrown away.
func (p *pacer) reserve() (time.Duration, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	now := time.Now()
	slot := p.next
	if slot.Before(now) {
		slot = now
	}
	if p.maxWait > 0 && slot.Sub(now) > p.maxWait {
		return 0, ErrPacerBacklog
	}
	p.next = slot.Add(p.interval)
	return slot.Sub(now), nil
}

// wait blocks until the next request may go out, or the request is cancelled.
// It reserves its slot under the lock and sleeps outside it, so concurrent
// callers queue in order instead of all waking at the same instant.
func (p *pacer) wait(done <-chan struct{}) error {
	if p == nil || p.interval <= 0 {
		return nil
	}
	delay, err := p.reserve()
	if err != nil {
		return err
	}
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
	// governor is set for sources that meter by the day and report what is
	// left of the allowance on every response.
	governor *budgetGovernor
	// withheld counts owner-keyed responses kept out of the governor, so a log
	// read since process start can confirm the guard actually fired rather than
	// the source simply having no foreign traffic.
	withheld atomic.Int64
	logger   *slog.Logger
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
		if err := t.governor.wait(req.Context()); err != nil {
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
		// Counted here rather than at the call site so retries and refusals are
		// charged too. The allowance meters requests, not answers.
		dailyBudgetFor(t.source).spend()
		// An owner-keyed render carries a foreign credential with its own
		// allowance. Its rate-limit headers describe that key, not the server's,
		// so feeding them to the shared governor would pace every other render
		// from one user's free-tier limit. wait() above stays unconditional —
		// that is the load shedding — but the budget must not learn a stranger's
		// allowance. Owner-keyed renders never mutate shared source state.
		if !HasOwnerKey(req.Context(), t.source) {
			t.governor.observe(req.Context(), resp.Header)
		} else if t.governor != nil {
			// Record that the guard fired. Logging the first and then each
			// order-of-magnitude keeps a hot path quiet while leaving a line a
			// read since process start can always find: the count proves foreign
			// traffic was present, so a governor that never left its own rate was
			// spared, not merely untested.
			n := t.withheld.Add(1)
			if n == 1 || isPowerOfTen(n) {
				t.log().InfoContext(req.Context(), "Withheld an owner-keyed response from the shared governor",
					"source", t.source, "total", n)
			}
		}
		if !isThrottleStatus(resp.StatusCode) {
			// A gateway fault is not retried and carries no Retry-After, so it
			// leaves no other trace: the caller turns it into a plain error and
			// five of those hold the source out. The path carries no query, so
			// no credential reaches the log.
			if resp.StatusCode >= 500 {
				t.log().WarnContext(req.Context(), "A ratings source returned a gateway error",
					"source", t.source, "status", resp.StatusCode,
					"path", req.URL.Path, "attempt", attempt+1)
			}
			return resp, nil
		}

		lastStatus = resp.StatusCode
		wait := retryAfter(resp.Header.Get("Retry-After"))
		if wait <= 0 {
			wait = backoff(attempt)
		}

		// A quota refusal cannot be retried out of. Spending the retry budget on
		// it burns the very allowance that is exhausted.
		if body := peek(resp); isQuotaRefusal(body) {
			drain(resp)
			t.log().WarnContext(req.Context(), "A ratings source has spent its request quota; holding it back",
				"source", t.source, "status", lastStatus, "attempts", attempt+1)
			return nil, &RateLimitError{Source: t.source, RetryAfter: wait,
				Status: lastStatus, QuotaExhausted: true}
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

// peek reads the front of a response body without closing it, so the caller can
// still drain the rest. These refusals carry a short JSON reason and nothing
// else, so a small prefix is the whole message.
func peek(resp *http.Response) []byte {
	if resp.Body == nil {
		return nil
	}
	buf := make([]byte, 512)
	n, _ := io.ReadFull(io.LimitReader(resp.Body, int64(len(buf))), buf)
	return buf[:n]
}

// quotaMarkers are the phrases a source uses to say the refusal is a spent
// allowance rather than a moment of pressure. SIMKL answers a spent daily
// allowance with {"error":"app_limit_exceeded", ...}.
var quotaMarkers = []string{
	"app_limit_exceeded",
	"daily request limit",
	"quota exceeded",
	"quota_exceeded",
	"out of quota",
}

// isQuotaRefusal reports whether a refusal body says the allowance is spent.
func isQuotaRefusal(body []byte) bool {
	if len(body) == 0 {
		return false
	}
	lower := strings.ToLower(string(body))
	for _, m := range quotaMarkers {
		if strings.Contains(lower, m) {
			return true
		}
	}
	return false
}

// drain reads and closes a response body so the connection can be reused.
func drain(resp *http.Response) {
	if resp.Body == nil {
		return
	}
	_, _ = io.CopyN(io.Discard, resp.Body, 4<<10)
	_ = resp.Body.Close()
}

// isPowerOfTen reports whether n is 10, 100, 1000, … — the milestones at which a
// running total earns another log line.
func isPowerOfTen(n int64) bool {
	if n < 10 {
		return false
	}
	for n%10 == 0 {
		n /= 10
	}
	return n == 1
}

// newHTTPClient builds the client a provider should use: its own timeout, plus
// the pacing and retry policy for that source.
func newHTTPClient(source string, timeout time.Duration) *http.Client {
	policy := rateLimitFor(source)
	transport := &throttledTransport{
		source: source,
		policy: policy,
		pacer:  &pacer{interval: policy.MinInterval, maxWait: pacerMaxWait()},
	}
	if source == "mdblist" {
		transport.governor = newBudgetGovernor(source)
	}
	return &http.Client{Timeout: timeout, Transport: transport}
}
