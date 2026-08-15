package provider

import (
	"context"
	"errors"
	"log/slog"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// MDBList meters by the day rather than by the second, and reports the state of
// that allowance on every response:
//
//	x-ratelimit-limit      the daily cap
//	x-ratelimit-remaining  what is left of it
//	x-ratelimit-reset      unix seconds at which it refills
//
// budgetGovernor paces from those three numbers: the sustained rate is whatever
// spends the remaining allowance, minus a reserve, evenly over the rest of the
// day. A token bucket sits in front of it so a catalogue page still goes out at
// once and only a sustained flood is paced.
const (
	// mdblistAssumedDailyLimit stands in until a response has been seen. The
	// allowance goes by plan, so the first response corrects it.
	mdblistAssumedDailyLimit         = 100000
	mdblistDefaultReservePct float64 = 25
	// mdblistDefaultMaxRPS is a self-imposed ceiling, not a published limit.
	// MDBList documents a daily allowance and no per-second rate; the 429s
	// carry Cloudflare's error 1015, whose threshold is not published. The
	// budget-derived rate is the real control and this is a margin under the
	// edge protection.
	mdblistDefaultMaxRPS float64 = 5
	mdblistDefaultBurst  float64 = 30
	// mdblistFloorRPS is the rate a spent reserve drops to. A degraded source
	// still answers; the health tracker handles one that does not.
	mdblistFloorRPS float64 = 0.2
	// mdblistDefaultReportSeconds is how often the remaining allowance is
	// written to the log. Transitions are reported as they happen; this is for
	// the long stretches between them.
	mdblistDefaultReportSeconds float64 = 300
	dailyWindow                         = 24 * time.Hour
)

// budgetGovernor paces one source from the daily allowance it reports.
type budgetGovernor struct {
	source      string
	reserveFrac float64
	maxRPS      float64
	// burst is the budget arm's bucket, recomputed from the surplus on every
	// allowance update. Never below mdblistDefaultBurst.
	burst float64
	// ceilBurst is the instantaneous allowance at the edge: how many calls may
	// leave at once before maxRPS paces them. The budget arm has its own,
	// because the two bound different things and one knob cannot serve both.
	ceilBurst float64

	// now and sleep are swapped in tests so no test waits on a real clock.
	now   func() time.Time
	sleep func(time.Duration, <-chan struct{}) error

	mu     sync.Mutex
	logger *slog.Logger
	rate   float64
	tokens float64
	last   time.Time
	// The ceiling band, metered separately so an owner-keyed call is paced by
	// this box's limit without drawing on the quota bucket.
	ceilTokens float64
	ceilLast   time.Time
	// inReserve and loggedRate hold the gear the last log line described.
	inReserve  bool
	loggedRate float64
	seen       bool
	// paced names the constraint that set the rate in force.
	paced pacedBy
	// reported is when the headroom was last written to the log.
	reported    time.Time
	reportEvery time.Duration
}

// backlogReason carries the constraint that set the rate a request was refused
// by, so a hold-out line answers its own question rather than needing to be
// joined to the nearest allowance report.
type backlogReason struct {
	err   error
	paced pacedBy
}

func (b *backlogReason) Error() string { return b.err.Error() }
func (b *backlogReason) Unwrap() error { return b.err }

// HoldOutReason names the constraint that set the rate a hold-out was refused
// by. Empty for gates whose refusal is not rate-derived.
func HoldOutReason(err error) string {
	var b *backlogReason
	if errors.As(err, &b) {
		return string(b.paced)
	}
	return ""
}

// pacedBy names the constraint that set the current rate. A hold-out reads the
// same whether the day is nearly spent or our own ceiling is the binding one.
type pacedBy string

const (
	pacedByBudget  pacedBy = "budget"
	pacedByCeiling pacedBy = "ceiling"
	pacedByFloor   pacedBy = "floor"
	// The budget rate came out above the band and was clamped to it. Distinct
	// from pacedByCeiling, which is the band refusing a call outright: the two
	// mean different things to whoever reads a held-out and one string for both
	// leaves them re-deriving which branch fired.
	pacedByBudgetCeiling pacedBy = "budget_ceiling"
	pacedByReserve       pacedBy = "reserve"
)

// newBudgetGovernor builds the governor for a source, reading its knobs from the
// environment and falling back to the defaults above.
func newBudgetGovernor(source string) *budgetGovernor {
	reservePct := envFloat("XRDB_MDBLIST_RESERVE_PCT", mdblistDefaultReservePct, 0, 90)
	maxRPS := envFloat("XRDB_MDBLIST_MAX_RPS", mdblistDefaultMaxRPS, mdblistFloorRPS, 10)
	ceilBurst := envFloat("XRDB_MDBLIST_BURST", mdblistDefaultBurst, 1, 1000)

	reportEvery := envFloat("XRDB_MDBLIST_REPORT_SECONDS", mdblistDefaultReportSeconds, 10, 3600)

	g := &budgetGovernor{
		source:      source,
		reserveFrac: reservePct / 100,
		maxRPS:      maxRPS,
		ceilBurst:   ceilBurst,
		reportEvery: time.Duration(reportEvery * float64(time.Second)),
		now:         time.Now,
		sleep:       sleepUntil,
	}
	g.rate, _, g.paced = g.rateFor(mdblistAssumedDailyLimit, mdblistAssumedDailyLimit, dailyWindow.Seconds())
	g.burst = g.burstFor(mdblistAssumedDailyLimit, mdblistAssumedDailyLimit, dailyWindow.Seconds())
	return g
}

func (g *budgetGovernor) log() *slog.Logger {
	if g.logger == nil {
		return slog.Default()
	}
	return g.logger
}

// minCallBudget is how much of a request's own timeout must survive the queue
// for the request to be worth queueing at all.
const minCallBudget = 1500 * time.Millisecond

// wait blocks until this request's turn, or until the request is cancelled. It
// refuses a turn that would arrive too late to use: the client timeout covers
// this queue as well as the call, so sleeping through it cancels the request
// inside our own queue and the source is recorded as having timed out.
func (g *budgetGovernor) wait(ctx context.Context) error {
	if g == nil {
		return nil
	}
	// bounded says whether budget means anything. A negative budget is not "no
	// deadline" — it is a deadline already too close to leave the call its
	// minimum, which is the case that most needs refusing.
	budget, bounded := time.Duration(0), false
	if deadline, ok := ctx.Deadline(); ok {
		budget, bounded = deadline.Sub(g.now())-minCallBudget, true
	}
	// The ceiling is this box's own rate band and applies to every call. The
	// daily budget models the quota on our key, which an owner-keyed call does
	// not spend, so it is not held against one.
	delay, ok := g.takeCeiling(budget, bounded)
	if !ok {
		return &backlogReason{err: ErrGovernorBacklog, paced: pacedByCeiling}
	}
	if !HasOwnerKey(ctx, g.source) {
		budgetDelay, budgetOK := g.take(budget, bounded)
		if !budgetOK {
			return &backlogReason{err: ErrGovernorBacklog, paced: g.pacedNow()}
		}
		// Both tokens are claimed, so the wait is the later of the two rather
		// than their sum.
		if budgetDelay > delay {
			delay = budgetDelay
		}
	}
	if delay > 0 {
		return g.sleep(delay, ctx.Done())
	}
	return nil
}

// takeCeiling claims one token from the band that protects this box, which every
// call passes whichever key it carries.
func (g *budgetGovernor) takeCeiling(budget time.Duration, bounded bool) (time.Duration, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()

	now := g.now()
	if g.ceilLast.IsZero() {
		g.ceilLast = now
		g.ceilTokens = g.ceilBurst
	}
	if elapsed := now.Sub(g.ceilLast); elapsed > 0 {
		g.ceilTokens += elapsed.Seconds() * g.maxRPS
		g.ceilLast = now
	}
	if g.ceilTokens > g.ceilBurst {
		g.ceilTokens = g.ceilBurst
	}
	remaining := g.ceilTokens - 1
	delay := time.Duration(0)
	if remaining < 0 {
		delay = time.Duration(-remaining / g.maxRPS * float64(time.Second))
	}
	if bounded && delay > budget {
		return 0, false
	}
	g.ceilTokens = remaining
	return delay, true
}

// take claims one token and reports how long the caller must hold off for it.
// A claim beyond what the bucket holds leaves the balance negative, so
// concurrent callers queue in order rather than all waking together.
//
// budget bounds the wait the caller can use; a negative budget is unbounded.
// The token is claimed only when the wait fits, so a refused request does not
// hold a slot the queue behind it could have used.
func (g *budgetGovernor) take(budget time.Duration, bounded bool) (time.Duration, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()

	now := g.now()
	if g.last.IsZero() {
		g.last = now
		g.tokens = g.burst
	}
	if elapsed := now.Sub(g.last); elapsed > 0 {
		g.tokens += elapsed.Seconds() * g.rate
		g.last = now
	}
	if g.tokens > g.burst {
		g.tokens = g.burst
	}
	remaining := g.tokens - 1
	delay := time.Duration(0)
	if remaining < 0 {
		delay = time.Duration(-remaining / g.rate * float64(time.Second))
	}
	if bounded && delay > budget {
		return 0, false
	}
	g.tokens = remaining
	return delay, true
}

// observe recomputes the rate from a response's allowance headers. A response
// without them leaves the current rate alone.
func (g *budgetGovernor) observe(ctx context.Context, h http.Header) {
	if g == nil || h == nil {
		return
	}
	limit, okLimit := headerNumber(h, "X-RateLimit-Limit")
	remaining, okRemaining := headerNumber(h, "X-RateLimit-Remaining")
	reset, okReset := headerNumber(h, "X-RateLimit-Reset")
	if !okLimit || !okRemaining || !okReset || limit <= 0 {
		return
	}

	now := g.now()
	g.mu.Lock()
	secondsLeft := reset - float64(g.now().Unix())
	rate, inReserve, paced := g.rateFor(limit, remaining, secondsLeft)
	burst := g.burstFor(limit, remaining, secondsLeft)
	g.paced = paced
	previous, wasInReserve, wasSeen := g.loggedRate, g.inReserve, g.seen
	g.rate, g.inReserve, g.seen = rate, inReserve, true
	g.burst = burst
	gearChanged := !wasSeen || inReserve != wasInReserve ||
		rate <= previous/2 || rate >= previous*2
	if gearChanged {
		g.loggedRate = rate
	}
	// A gear change reports a transition. Between transitions the allowance can
	// run most of the way down without a line, so the headroom is also reported
	// on a clock.
	due := now.Sub(g.reported) >= g.reportEvery
	if due {
		g.reported = now
	}
	g.mu.Unlock()

	fields := []any{
		"source", g.source,
		"requests_per_second", math.Round(rate*100) / 100,
		"paced_by", string(paced),
		"remaining", int64(remaining),
		"remaining_pct", math.Round(remaining/limit*1000) / 10,
		"limit", int64(limit),
		"reserve", int64(limit * g.reserveFrac),
		"resets_in", time.Duration(math.Max(secondsLeft, 0)) * time.Second,
	}
	if gearChanged {
		message := "A ratings source's daily allowance is pacing it at a new rate"
		if inReserve {
			message = "A ratings source has spent its daily allowance down to the reserve; pacing at the floor"
		}
		g.log().InfoContext(ctx, message, fields...)
		return
	}
	if due {
		g.log().InfoContext(ctx, "Reporting what is left of a ratings source's daily allowance", fields...)
	}
}

// rateFor spreads what is left of the allowance, less the reserve, over what is
// left of the window, then clamps the result to the configured band.
func (g *budgetGovernor) rateFor(limit, remaining, secondsLeft float64) (float64, bool, pacedBy) {
	if secondsLeft < 1 {
		// The window is at or past its reset, so the allowance is about to
		// refill and the clamp is the only thing left holding it back.
		secondsLeft = 1
	}
	usable := remaining - limit*g.reserveFrac
	if usable <= 0 {
		return mdblistFloorRPS, true, pacedByReserve
	}
	rate := usable / secondsLeft
	if rate < mdblistFloorRPS {
		return mdblistFloorRPS, false, pacedByFloor
	}
	if rate > g.maxRPS {
		return g.maxRPS, false, pacedByBudgetCeiling
	}
	return rate, false, pacedByBudget
}

// burstFor sizes the budget arm's bucket from how far ahead of the even-spend
// line we are. Spending the surplus only returns the day to the pace it would
// have been on anyway, so lending it cannot overrun the allowance.
//
// The surplus is widest exactly when the sustained rate is tightest, because
// both are driven by how much of the window is left: early in the day the rate
// divides the budget over many seconds, and little has been spent.
//
// This bounds no throughput. maxRPS and ceilBurst are what MDBList sees.
func (g *budgetGovernor) burstFor(limit, remaining, secondsLeft float64) float64 {
	usable := limit - limit*g.reserveFrac
	window := dailyWindow.Seconds()
	elapsed := window - secondsLeft
	if elapsed < 0 {
		elapsed = 0
	}
	if elapsed > window {
		elapsed = window
	}
	spent := limit - remaining
	surplus := usable*(elapsed/window) - spent
	if surplus < mdblistDefaultBurst {
		return mdblistDefaultBurst
	}
	return surplus
}

// pacedNow reports the constraint that set the rate in force.
func (g *budgetGovernor) pacedNow() pacedBy {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.paced
}

// currentRate reports the rate in force, for tests and for callers that only
// want to read it.
func (g *budgetGovernor) currentRate() float64 {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.rate
}

// headerNumber reads a numeric header, reporting whether it held one.
func headerNumber(h http.Header, name string) (float64, bool) {
	raw := strings.TrimSpace(h.Get(name))
	if raw == "" {
		return 0, false
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, false
	}
	return v, true
}

// envFloat reads a numeric setting, keeping the default when it is unset,
// unreadable, or outside the band the setting makes sense in.
func envFloat(name string, fallback, low, high float64) float64 {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil || v < low || v > high {
		slog.Default().Warn("Ignoring an out-of-range or unreadable setting and keeping the default",
			"variable", name, "value", raw, "min", low, "max", high, "default", fallback)
		return fallback
	}
	return v
}

// sleepUntil waits out a delay unless the request is cancelled first.
func sleepUntil(d time.Duration, done <-chan struct{}) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-done:
		return context.Canceled
	}
}
