package provider

import (
	"context"
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
	dailyWindow             = 24 * time.Hour
)

// budgetGovernor paces one source from the daily allowance it reports.
type budgetGovernor struct {
	source      string
	reserveFrac float64
	maxRPS      float64
	burst       float64

	// now and sleep are swapped in tests so no test waits on a real clock.
	now   func() time.Time
	sleep func(time.Duration, <-chan struct{}) error

	mu     sync.Mutex
	logger *slog.Logger
	rate   float64
	tokens float64
	last   time.Time
	// inReserve and loggedRate hold the gear the last log line described.
	inReserve  bool
	loggedRate float64
	seen       bool
}

// newBudgetGovernor builds the governor for a source, reading its knobs from the
// environment and falling back to the defaults above.
func newBudgetGovernor(source string) *budgetGovernor {
	reservePct := envFloat("XRDB_MDBLIST_RESERVE_PCT", mdblistDefaultReservePct, 0, 90)
	maxRPS := envFloat("XRDB_MDBLIST_MAX_RPS", mdblistDefaultMaxRPS, mdblistFloorRPS, 10)
	burst := envFloat("XRDB_MDBLIST_BURST", mdblistDefaultBurst, 1, 1000)

	g := &budgetGovernor{
		source:      source,
		reserveFrac: reservePct / 100,
		maxRPS:      maxRPS,
		burst:       burst,
		now:         time.Now,
		sleep:       sleepUntil,
	}
	g.rate, _ = g.rateFor(mdblistAssumedDailyLimit, mdblistAssumedDailyLimit, dailyWindow.Seconds())
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
	budget := time.Duration(-1)
	if deadline, ok := ctx.Deadline(); ok {
		budget = deadline.Sub(g.now()) - minCallBudget
	}
	delay, ok := g.take(budget)
	if !ok {
		return ErrGovernorBacklog
	}
	if delay > 0 {
		return g.sleep(delay, ctx.Done())
	}
	return nil
}

// take claims one token and reports how long the caller must hold off for it.
// A claim beyond what the bucket holds leaves the balance negative, so
// concurrent callers queue in order rather than all waking together.
//
// budget bounds the wait the caller can use; a negative budget is unbounded.
// The token is claimed only when the wait fits, so a refused request does not
// hold a slot the queue behind it could have used.
func (g *budgetGovernor) take(budget time.Duration) (time.Duration, bool) {
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
	if budget >= 0 && delay > budget {
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

	g.mu.Lock()
	secondsLeft := reset - float64(g.now().Unix())
	rate, inReserve := g.rateFor(limit, remaining, secondsLeft)
	previous, wasInReserve, wasSeen := g.loggedRate, g.inReserve, g.seen
	g.rate, g.inReserve, g.seen = rate, inReserve, true
	gearChanged := !wasSeen || inReserve != wasInReserve ||
		rate <= previous/2 || rate >= previous*2
	if gearChanged {
		g.loggedRate = rate
	}
	g.mu.Unlock()

	if !gearChanged {
		return
	}
	message := "A ratings source's daily allowance is pacing it at a new rate"
	if inReserve {
		message = "A ratings source has spent its daily allowance down to the reserve; pacing at the floor"
	}
	g.log().InfoContext(ctx, message,
		"source", g.source,
		"requests_per_second", math.Round(rate*100)/100,
		"remaining", int64(remaining),
		"limit", int64(limit),
		"reserve", int64(limit*g.reserveFrac),
		"resets_in", time.Duration(math.Max(secondsLeft, 0))*time.Second)
}

// rateFor spreads what is left of the allowance, less the reserve, over what is
// left of the window, then clamps the result to the configured band.
func (g *budgetGovernor) rateFor(limit, remaining, secondsLeft float64) (float64, bool) {
	if secondsLeft < 1 {
		// The window is at or past its reset, so the allowance is about to
		// refill and the clamp is the only thing left holding it back.
		secondsLeft = 1
	}
	usable := remaining - limit*g.reserveFrac
	if usable <= 0 {
		return mdblistFloorRPS, true
	}
	rate := usable / secondsLeft
	if rate < mdblistFloorRPS {
		rate = mdblistFloorRPS
	}
	if rate > g.maxRPS {
		rate = g.maxRPS
	}
	return rate, false
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
