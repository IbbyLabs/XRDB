package provider

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// upstreamMsHeader carries how long the source itself took to answer, set on a
// gateway error so a caller can tell an instant refusal from a real timeout
// without timing our own queues.
const upstreamMsHeader = "X-Xrdb-Upstream-Ms"

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
// GateIsAQueue reports whether a gate is one of our request queues, which can
// clear in seconds, rather than the daily reserve, which is a decision that
// stands for hours.
func GateIsAQueue(gate string) bool {
	switch gate {
	case GatePacerBacklog, GateGovernorBacklog:
		return true
	}
	return false
}

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
//   - Trakt answers an overrun with a 429 that cools the source off for five
//     minutes for every caller. Measured 2026-08-22: roughly 85 calls in a
//     minute from a standing start earned one, and 351 inside five minutes
//     with the preceding 85 empty, so it is a burst limit rather than an
//     accumulated window. One second holds it to 60 a minute. The figure is a
//     floor derived from a single refusal, not a published limit.
//   - AlloCiné answers a burst and then refuses for a while. Measured
//     2026-09-02: unpaced sweeps were refused on 54 to 72 percent of what was
//     sent; at one request every two seconds, 209 answers in an hour and none
//     refused.
//
// MDBList carries no interval because it meters by the day: budgetGovernor
// paces it from the allowance its responses report.
var rateLimits = map[string]RateLimit{
	"mal":     {MinInterval: time.Second, MaxRetries: 2, MaxRetryWait: renderRetryBudget},
	"anilist": {MinInterval: 2 * time.Second, MaxRetries: 2, MaxRetryWait: renderRetryBudget},
	"mdblist": {MaxRetries: 3, MaxRetryWait: renderRetryBudget},
	"trakt":   {MinInterval: time.Second, MaxRetries: 3, MaxRetryWait: renderRetryBudget},
	"simkl":   {MinInterval: 100 * time.Millisecond, MaxRetries: 3, MaxRetryWait: renderRetryBudget},
	"kitsu":   {MinInterval: 100 * time.Millisecond, MaxRetries: 3, MaxRetryWait: renderRetryBudget},
	// A SPARQL query is expensive to serve and the Wikidata Query Service
	// throttles hard. The figure is conservative rather than measured: the cost
	// of pacing too loosely here is an address blocked by policy, which does not
	// clear the way a slow API does. The cost of pacing too tightly is an empty
	// badge, not a late one. A render whose source is held out completes without
	// it and is cached.
	"wikidata": {MinInterval: time.Second, MaxRetries: 2, MaxRetryWait: renderRetryBudget},
	"allocine": {MinInterval: 2 * time.Second, MaxRetries: 2, MaxRetryWait: renderRetryBudget},
}

// minIntervalSuffix names the per-source pacing override,
// XRDB_<SOURCE>_MIN_INTERVAL_SECONDS.
const minIntervalSuffix = "_MIN_INTERVAL_SECONDS"

// minIntervalOverrides holds the intervals set for individual sources. The
// interval in the table protects a host, and a source's host is movable:
// XRDB_JIKAN_URL points the MAL source at a self-hosted Jikan, which the name
// alone cannot tell from the public service.
//
// Read from the environment rather than a list of known sources, so a source
// gains an override without being enumerated here. Bounds are Trakt's: an
// unbounded value either removes the pacing or stalls every render behind it.
var minIntervalOverrides = readMinIntervalOverrides()

func readMinIntervalOverrides() map[string]time.Duration {
	out := map[string]time.Duration{}
	for _, kv := range os.Environ() {
		name, _, ok := strings.Cut(kv, "=")
		if !ok || !strings.HasPrefix(name, "XRDB_") || !strings.HasSuffix(name, minIntervalSuffix) {
			continue
		}
		source := strings.ToLower(strings.TrimSuffix(strings.TrimPrefix(name, "XRDB_"), minIntervalSuffix))
		if source == "" {
			continue
		}
		secs := envFloat(name, -1, 0.05, 10)
		if secs < 0 {
			continue
		}
		out[source] = time.Duration(secs * float64(time.Second))
	}
	return out
}

// LogMinIntervalOverrides reports the per-source pacing in force. A name that
// matches no source is accepted silently by the environment, so the parsed set
// is worth stating at startup.
//
// An override on a source the table also paces is called out separately: it
// wins, so a later change to the built-in interval does not reach an instance
// carrying one.
func LogMinIntervalOverrides(log *slog.Logger) {
	for source, d := range minIntervalOverrides {
		rl, known := rateLimits[source]
		switch {
		case known && rl.MinInterval != d:
			log.Warn("A source's request interval is overridden away from the built-in one",
				"source", source, "interval_ms", d.Milliseconds(),
				"built_in_ms", rl.MinInterval.Milliseconds(),
				"effect", "a change to the built-in pace will not reach this instance")
		case known:
			log.Info("A source's request interval is set from the environment to the built-in value",
				"source", source, "interval_ms", d.Milliseconds(), "in_default_table", true)
		default:
			log.Info("A source's request interval is set from the environment",
				"source", source, "interval_ms", d.Milliseconds(), "in_default_table", false)
		}
	}
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
	rl, ok := rateLimits[source]
	if !ok {
		rl = defaultRateLimit
	}
	if d, set := minIntervalOverrides[source]; set {
		rl.MinInterval = d
	}
	return rl
}

// pacer enforces a minimum gap between requests to one source.
type pacer struct {
	mu       sync.Mutex
	interval time.Duration
	next     time.Time
	// maxWait bounds how long a caller will queue for a slot. Past it the
	// request is refused instead of taking a slot it would not live to use: the
	// client timeout covers the queue wait as well as the call, so a long queue
	// cancelled every request in it before any of them were sent. It is the
	// ceiling for an interactive caller; bulkMaxWait narrows it for a sweep.
	maxWait time.Duration
}

// bulkQueueShare is the fraction of the queue ceiling a sweep may use. The rest
// is held for callers someone is waiting on.
const bulkQueueShare = 4

// bulkMaxWait is the ceiling for a caller class. Only a caller that names itself
// as a sweep yields; an unidentified one keeps the full ceiling, because it is
// indistinguishable from a person with an unusual user agent.
//
// The share is floored at one interval. A fraction of the ceiling is smaller
// than a slot on every source paced above 500ms, and a caller allowed to wait
// less than the wait a slot requires is refused on arrival however idle the
// source is — a queue nobody can join rather than a share of one.
func bulkMaxWait(class CallerClass, maxWait, interval time.Duration) time.Duration {
	if class != CallerBulk || maxWait <= 0 {
		return maxWait
	}
	share := maxWait / bulkQueueShare
	if share < interval {
		// Never past the ceiling everything else answers to. A source paced
		// slower than that ceiling is one a sweep genuinely cannot queue for,
		// and saying so is better than promoting bulk above the callers the
		// share exists to protect.
		if interval > maxWait {
			return maxWait
		}
		return interval
	}
	return share
}

// reserve takes the next slot and reports how long to hold before using it. It
// refuses before reserving, so a shed request does not hold a slot that its own
// timeout would have thrown away. maxWait is the caller's own ceiling rather
// than the pacer's, so a sweep can be refused where a person is queued.
func (p *pacer) reserve(budget time.Duration, bounded bool, maxWait time.Duration) (time.Duration, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	now := time.Now()
	slot := p.next
	if slot.Before(now) {
		slot = now
	}
	if maxWait > 0 && slot.Sub(now) > maxWait {
		return 0, ErrPacerBacklog
	}
	// A turn that arrives too late to use is worse than no turn: the client
	// timeout covers this queue as well as the call, so sleeping through it
	// cancels the request mid-flight and the cancellation is indistinguishable
	// from the source failing to answer. Refusing instead is attributable.
	if bounded && slot.Sub(now) > budget {
		return 0, ErrPacerBacklog
	}
	p.next = slot.Add(p.interval)
	return slot.Sub(now), nil
}

// wait blocks until the next request may go out, or the request is cancelled.
// It reserves its slot under the lock and sleeps outside it, so concurrent
// callers queue in order instead of all waking at the same instant.
func (p *pacer) wait(ctx context.Context) error {
	if p == nil || p.interval <= 0 {
		return nil
	}
	// How much of the caller's budget may be spent queuing, leaving the call
	// itself enough to complete. Negative means the caller set no deadline and
	// the queue is bounded by maxWait alone.
	// bounded says whether budget means anything. A negative budget is a
	// deadline already too close to leave the call its minimum, which is the
	// case that most needs refusing rather than the one to wave through.
	budget, bounded := time.Duration(0), false
	if deadline, ok := ctx.Deadline(); ok {
		budget, bounded = time.Until(deadline)-minCallBudget, true
	}
	delay, err := p.reserve(budget, bounded, bulkMaxWait(CallerClassFrom(ctx), p.maxWait, p.interval))
	if err != nil {
		return err
	}
	done := ctx.Done()
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
	// queued counts requests that waited in our own queue rather than going out
	// at once, so the wait is countable without a debug level.
	queued atomic.Int64
	// reportedRefusal holds the once-per-source report of an unmatched throttle
	// body. A throttled source produces them in bulk and the wording does not
	// vary between them.
	reportedRefusal atomic.Bool
	logger          *slog.Logger
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
		if err := t.pacer.wait(req.Context()); err != nil {
			return nil, err
		}
		queued := time.Now()
		if err := t.governor.wait(req.Context()); err != nil {
			return nil, err
		}
		inQueue := time.Since(queued)

		attemptReq := req
		if attempt > 0 && req.GetBody != nil {
			body, err := req.GetBody()
			if err != nil {
				return nil, err
			}
			attemptReq = req.Clone(req.Context())
			attemptReq.Body = body
		}

		sent := time.Now()
		resp, err := base.RoundTrip(attemptReq)
		if err != nil {
			return nil, err
		}
		// Measured here rather than around the whole call: the pacer and the
		// governor wait above, inside this same timeout, so a caller timing the
		// request would be timing our queue.
		upstream := time.Since(sent)
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
		// A slow source and a long queue in front of a fast one are the same
		// number to the caller, and they want opposite responses. Reported once
		// per order of magnitude so a hot path stays quiet while a read since
		// process start always finds the shape.
		if inQueue >= time.Millisecond {
			n := t.queued.Add(1)
			if n == 1 || isPowerOfTen(n) {
				t.log().InfoContext(req.Context(), "A ratings source's requests are waiting in our own queue",
					"source", t.source, "queue_ms", inQueue.Milliseconds(),
					"upstream_ms", upstream.Milliseconds(), "total", n)
			}
		}
		if !isThrottleStatus(resp.StatusCode) {
			// A gateway fault is not retried and carries no Retry-After, so it
			// leaves no other trace: the caller turns it into a plain error and
			// five of those hold the source out. The path carries no query, so
			// no credential reaches the log.
			if resp.StatusCode >= 500 {
				resp.Header.Set(upstreamMsHeader, strconv.FormatInt(upstream.Milliseconds(), 10))
				t.log().WarnContext(req.Context(), "A ratings source returned a gateway error",
					"source", t.source, "status", resp.StatusCode,
					"path", req.URL.Path, "attempt", attempt+1,
					"upstream_ms", upstream.Milliseconds())
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
		body := peek(resp)
		if isQuotaRefusal(body) {
			drain(resp)
			t.log().WarnContext(req.Context(), "A ratings source has spent its request quota; holding it back",
				"source", t.source, "status", lastStatus, "attempts", attempt+1)
			return nil, &RateLimitError{Source: t.source, RetryAfter: wait,
				Status: lastStatus, QuotaExhausted: true}
		}
		t.reportUnknownRefusal(req.Context(), lastStatus, body)

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

// reportUnknownRefusal records a throttle body none of the quotaMarkers matched.
// The list grows only when someone reads a new source's wording, and an
// unrecognised quota refusal is indistinguishable in the log from ordinary
// throttling, so without this it cannot be read.
//
// Only a structured body is logged: a JSON error is the wording worth having and
// the least likely to carry anything else, where 512 bytes of an HTML block page
// is neither. Once per source per process — the phrase is a property of the
// source, and a throttled source produces these in bulk.
func (t *throttledTransport) reportUnknownRefusal(ctx context.Context, status int, body []byte) {
	// 429 is where a spent allowance is said. A 503 is the source being unwell
	// and its body says nothing about quota.
	if status != http.StatusTooManyRequests {
		return
	}
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 || (trimmed[0] != '{' && trimmed[0] != '[') {
		return
	}
	if t.reportedRefusal.Swap(true) {
		return
	}
	t.log().InfoContext(ctx, "A ratings source refused with a body none of the quota phrases match",
		"source", t.source, "status", status, "body", string(trimmed),
		"effect", "the refusal is retried as ordinary throttling; add the phrase to quotaMarkers if it names a spent allowance")
}

// quotaMarkers are the phrases a source uses to say the refusal is a spent
// allowance rather than a moment of pressure.// quotaMarkers are the phrases a source uses to say the refusal is a spent
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

// proxySuffix names the per-source proxy setting, XRDB_<SOURCE>_PROXY.
const proxySuffix = "_PROXY"

// proxyOverrides holds the proxy each source is reached through. Named per
// source rather than as one setting with exclusions: a proxy is worth the
// latency for a source that is blocked or rate-limited by address, and not for
// the rest, and an exclusion list has to be edited whenever a source is added.
//
// Go's default transport already reads HTTP_PROXY and friends, which apply to
// every outbound request. These override that for one source.
var proxyOverrides = readProxyOverrides()

func readProxyOverrides() map[string]*url.URL {
	out := map[string]*url.URL{}
	for _, kv := range os.Environ() {
		name, value, ok := strings.Cut(kv, "=")
		if !ok || !strings.HasPrefix(name, "XRDB_") || !strings.HasSuffix(name, proxySuffix) {
			continue
		}
		source := strings.ToLower(strings.TrimSuffix(strings.TrimPrefix(name, "XRDB_"), proxySuffix))
		raw := strings.TrimSpace(value)
		if source == "" || raw == "" {
			continue
		}
		u, err := url.Parse(raw)
		if err != nil || u.Host == "" {
			slog.Default().Warn("Ignoring an unreadable proxy setting and reaching the source directly",
				"variable", name, "source", source)
			continue
		}
		out[source] = u
	}
	return out
}

// LogProxyOverrides reports which sources are reached through a proxy. The URL
// is redacted: a proxy address commonly carries credentials.
func LogProxyOverrides(log *slog.Logger) {
	for source, u := range proxyOverrides {
		log.Info("A source is reached through a proxy", "source", source, "proxy", u.Redacted())
	}
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
	if u, ok := proxyOverrides[source]; ok {
		// Cloned rather than shared, so one source's proxy does not become
		// every source's, and so the connection pools stay separate.
		base := http.DefaultTransport.(*http.Transport).Clone()
		base.Proxy = http.ProxyURL(u)
		transport.base = base
	}
	return &http.Client{Timeout: timeout, Transport: transport}
}
