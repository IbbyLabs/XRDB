package provider

import (
	"context"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"
)

// fakeClock stands in for time so no test here waits on a real one.
type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time          { return c.t }
func (c *fakeClock) advance(d time.Duration) { c.t = c.t.Add(d) }

// newTestGovernor builds a governor on a fake clock with the shipped defaults,
// recording sleeps instead of taking them.
func newTestGovernor(t *testing.T) (*budgetGovernor, *fakeClock, *[]time.Duration) {
	t.Helper()
	clock := &fakeClock{t: time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)}
	var slept []time.Duration
	g := &budgetGovernor{
		source:      "mdblist",
		reserveFrac: mdblistDefaultReservePct / 100.0,
		maxRPS:      mdblistDefaultMaxRPS,
		burst:       mdblistDefaultBurst,
		reportEvery: time.Duration(mdblistDefaultReportSeconds) * time.Second,
		now:         clock.now,
		sleep: func(d time.Duration, _ <-chan struct{}) error {
			slept = append(slept, d)
			clock.advance(d)
			return nil
		},
	}
	g.rate, _, _ = g.rateFor(mdblistAssumedDailyLimit, mdblistAssumedDailyLimit, dailyWindow.Seconds())
	return g, clock, &slept
}

// allowanceHeaders builds the three headers MDBList answers with.
func allowanceHeaders(limit, remaining int, resetAt time.Time) http.Header {
	h := make(http.Header)
	h.Set("X-RateLimit-Limit", strconv.Itoa(limit))
	h.Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
	h.Set("X-RateLimit-Reset", strconv.FormatInt(resetAt.Unix(), 10))
	return h
}

func closeEnough(got, want float64) bool { return math.Abs(got-want) < 0.001 }

// headerTransport answers 200 with a fixed set of headers.
type headerTransport struct{ header http.Header }

func (h *headerTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     h.header,
		Body:       io.NopCloser(strings.NewReader("{}")),
		Request:    req,
	}, nil
}

func TestGovernorRateFollowsTheRemainingAllowance(t *testing.T) {
	g, clock, _ := newTestGovernor(t)

	cases := []struct {
		name      string
		remaining int
		leftInDay time.Duration
		want      float64
		reserve   bool
	}{
		// 75,000 usable spread over a full day.
		{"full budget", 100000, 24 * time.Hour, 75000.0 / 86400, false},
		// 25,000 usable spread over half a day.
		{"half budget", 50000, 12 * time.Hour, 25000.0 / 43200, false},
		// Nothing above the 25,000 reserve is left to spend.
		{"in reserve", 25000, 12 * time.Hour, mdblistFloorRPS, true},
		{"under reserve", 10000, 12 * time.Hour, mdblistFloorRPS, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			g.observe(context.Background(), allowanceHeaders(100000, tc.remaining, clock.t.Add(tc.leftInDay)))
			if got := g.currentRate(); !closeEnough(got, tc.want) {
				t.Errorf("rate = %.5f/s, want %.5f/s", got, tc.want)
			}
			if g.inReserve != tc.reserve {
				t.Errorf("inReserve = %v, want %v", g.inReserve, tc.reserve)
			}
		})
	}
}

func TestGovernorClampsAtBothEnds(t *testing.T) {
	g, clock, _ := newTestGovernor(t)

	// A whole allowance with a minute of the day left computes at 1250/s.
	g.observe(context.Background(), allowanceHeaders(100000, 100000, clock.t.Add(time.Minute)))
	if got := g.currentRate(); got != mdblistDefaultMaxRPS {
		t.Errorf("rate = %.3f/s, want the %g/s ceiling", got, mdblistDefaultMaxRPS)
	}

	// A hundred requests above the reserve with a full day left computes at
	// 0.00116/s, which is slower than the floor.
	g.observe(context.Background(), allowanceHeaders(100000, 25100, clock.t.Add(24*time.Hour)))
	if got := g.currentRate(); !closeEnough(got, mdblistFloorRPS) {
		t.Errorf("rate = %.5f/s, want the %g/s floor", got, mdblistFloorRPS)
	}
}

// A reset already in the past means the allowance is refilling, so the ceiling
// is the only thing left holding the rate down.
func TestGovernorTreatsAPastResetAsAFreshWindow(t *testing.T) {
	g, clock, _ := newTestGovernor(t)
	g.observe(context.Background(), allowanceHeaders(100000, 100000, clock.t.Add(-time.Hour)))
	if got := g.currentRate(); got != mdblistDefaultMaxRPS {
		t.Errorf("rate = %.3f/s, want the %g/s ceiling", got, mdblistDefaultMaxRPS)
	}
}

func TestGovernorColdStartRateBeforeAnyHeader(t *testing.T) {
	g, _, _ := newTestGovernor(t)
	want := 75000.0 / 86400 // 0.868/s
	if got := g.currentRate(); !closeEnough(got, want) {
		t.Errorf("cold-start rate = %.5f/s, want %.5f/s", got, want)
	}
	if g.seen {
		t.Error("the governor claims to have seen headers before any response")
	}
}

// A response missing the headers, which is what a Cloudflare refusal looks like,
// must leave the rate where it was.
func TestGovernorKeepsItsRateWhenHeadersAreAbsent(t *testing.T) {
	g, clock, _ := newTestGovernor(t)
	g.observe(context.Background(), allowanceHeaders(100000, 50000, clock.t.Add(12*time.Hour)))
	before := g.currentRate()

	g.observe(context.Background(), make(http.Header))
	g.observe(context.Background(), nil)
	garbage := allowanceHeaders(100000, 50000, clock.t.Add(12*time.Hour))
	garbage.Set("X-RateLimit-Remaining", "not-a-number")
	g.observe(context.Background(), garbage)

	if got := g.currentRate(); got != before {
		t.Errorf("rate moved to %.5f/s on headerless responses, want %.5f/s", got, before)
	}
}

// A catalogue page of a few dozen titles goes straight out; only what follows
// it is paced.
func TestGovernorLetsABurstThrough(t *testing.T) {
	g, _, _ := newTestGovernor(t)

	for i := range int(mdblistDefaultBurst) {
		if delay, _ := g.take(0, false); delay != 0 {
			t.Fatalf("request %d in the burst waited %s", i+1, delay)
		}
	}
	delay, _ := g.take(0, false)
	want := time.Duration(float64(time.Second) / g.currentRate())
	if delay <= 0 {
		t.Fatal("the request past the burst was not paced")
	}
	if math.Abs(float64(delay-want)) > float64(10*time.Millisecond) {
		t.Errorf("first paced request waited %s, want about %s", delay, want)
	}
}

// The bucket refills at the computed rate, so waiting earns tokens back.
func TestGovernorRefillsAtTheComputedRate(t *testing.T) {
	g, clock, _ := newTestGovernor(t)
	g.observe(context.Background(), allowanceHeaders(100000, 100000, clock.t.Add(time.Minute))) // 5/s
	// A full allowance a minute from reset is far ahead of the even-spend line,
	// so the derived bucket is thousands deep and would never empty. Pinned to
	// the floor because the subject here is the refill, not the sizing, which
	// TestGovernorBurstFollowsTheSurplus covers.
	g.burst = mdblistDefaultBurst

	for range int(mdblistDefaultBurst) {
		if delay, _ := g.take(0, false); delay != 0 {
			t.Fatal("a request inside the burst was paced")
		}
	}
	clock.advance(2 * time.Second) // 10 tokens at 5/s
	for i := range 10 {
		if delay, _ := g.take(0, false); delay != 0 {
			t.Fatalf("refilled request %d waited %s", i+1, delay)
		}
	}
	if delay, _ := g.take(0, false); delay <= 0 {
		t.Error("the request past the refill was not paced")
	}
}

// Queued callers each get their own slot rather than all waking on the same one.
func TestGovernorQueuesConcurrentCallers(t *testing.T) {
	g, _, _ := newTestGovernor(t)
	for range int(mdblistDefaultBurst) {
		g.take(0, false)
	}
	first, _ := g.take(0, false)
	second, _ := g.take(0, false)
	gap := time.Duration(float64(time.Second) / g.currentRate())
	if second-first < gap/2 {
		t.Errorf("two queued requests are %s apart, want about %s", second-first, gap)
	}
}

func TestGovernorWaitRespectsCancellation(t *testing.T) {
	g := newBudgetGovernor("mdblist")
	g.rate = 0.001 // a wait no test would sit through
	for range int(g.burst) + 1 {
		g.take(0, false)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	start := time.Now()
	if err := g.wait(ctx); err == nil {
		t.Error("expected a cancelled request to abandon its wait")
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Errorf("cancellation took %s to take effect", elapsed)
	}
}

func TestNilGovernorIsANoOp(t *testing.T) {
	var g *budgetGovernor
	if err := g.wait(context.Background()); err != nil {
		t.Errorf("wait on no governor: %v", err)
	}
	g.observe(context.Background(), make(http.Header))
}

func TestGovernorSettingsComeFromTheEnvironment(t *testing.T) {
	t.Setenv("XRDB_MDBLIST_RESERVE_PCT", "40")
	t.Setenv("XRDB_MDBLIST_MAX_RPS", "2")
	t.Setenv("XRDB_MDBLIST_BURST", "10")

	g := newBudgetGovernor("mdblist")
	// The env knob sets the ceiling burst. The budget arm's bucket is derived
	// from the surplus and is not configurable.
	if g.reserveFrac != 0.4 || g.maxRPS != 2 || g.ceilBurst != 10 {
		t.Fatalf("got reserve=%.2f max=%.1f ceilBurst=%.0f", g.reserveFrac, g.maxRPS, g.ceilBurst)
	}
	// 60,000 usable over a full day, well under the 2/s ceiling.
	if got, _, _ := g.rateFor(100000, 100000, dailyWindow.Seconds()); !closeEnough(got, 60000.0/86400) {
		t.Errorf("rate = %.5f/s, want %.5f/s", got, 60000.0/86400)
	}
}

func TestGovernorKeepsDefaultsForUnusableSettings(t *testing.T) {
	for _, value := range []string{"", "banana", "-5", "500"} {
		t.Setenv("XRDB_MDBLIST_RESERVE_PCT", value)
		if g := newBudgetGovernor("mdblist"); g.reserveFrac != mdblistDefaultReservePct/100.0 {
			t.Errorf("reserve pct %q gave %.2f, want the default", value, g.reserveFrac)
		}
	}
}

// MDBList must not carry a fixed interval as well, or the burst it is meant to
// allow is spaced out again behind it.
func TestMDBListIsGovernedRatherThanPaced(t *testing.T) {
	if got := rateLimitFor("mdblist").MinInterval; got != 0 {
		t.Errorf("mdblist MinInterval = %s, want 0", got)
	}
	tt, ok := newHTTPClient("mdblist", time.Second).Transport.(*throttledTransport)
	if !ok {
		t.Fatal("mdblist client does not use the throttled transport")
	}
	if tt.governor == nil {
		t.Error("mdblist has no budget governor")
	}
	other, ok := newHTTPClient("trakt", time.Second).Transport.(*throttledTransport)
	if !ok {
		t.Fatal("trakt client does not use the throttled transport")
	}
	if other.governor != nil {
		t.Error("trakt was given a budget governor it does not report an allowance for")
	}
	if other.pacer.interval != 100*time.Millisecond {
		t.Errorf("trakt interval = %s, want 100ms", other.pacer.interval)
	}
}

// The transport has to hand the headers to the governor, or it never learns
// what the allowance is doing.
func TestTransportFeedsTheGovernor(t *testing.T) {
	g, clock, _ := newTestGovernor(t)
	stub := &headerTransport{header: allowanceHeaders(100000, 30000, clock.t.Add(24*time.Hour))}
	c := &http.Client{Transport: &throttledTransport{
		base:     stub,
		source:   "mdblist",
		policy:   RateLimit{MaxRetries: 1, MaxRetryWait: time.Second},
		pacer:    &pacer{},
		governor: g,
	}}

	resp, err := get(t, c)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()

	// 5,000 usable over a full day is slower than the floor.
	if got := g.currentRate(); !closeEnough(got, mdblistFloorRPS) {
		t.Errorf("rate = %.5f/s, want the %g/s floor", got, mdblistFloorRPS)
	}
	if !g.seen {
		t.Error("the governor was not shown the response headers")
	}
}

// The budget arm refused work while 99.7% of the day's allowance sat unspent,
// because its rate divides the remaining budget by the seconds left and that is
// smallest at the start of the window. The bucket follows the surplus instead:
// how far under the even-spend line we are, which is widest exactly then.
func TestGovernorBurstFollowsTheSurplus(t *testing.T) {
	g, _, _ := newTestGovernor(t)
	const limit = 100000
	usable := float64(limit) * (1 - g.reserveFrac)

	// 01:33, the measured case: 84,571s left, 334 spent.
	got := g.burstFor(limit, limit-334, 84571)
	want := usable*((dailyWindow.Seconds()-84571)/dailyWindow.Seconds()) - 334
	if math.Abs(got-want) > 1 {
		t.Errorf("burst = %.0f, want %.0f", got, want)
	}
	if got <= mdblistDefaultBurst {
		t.Errorf("burst = %.0f, no better than the fixed bucket that refused 42 renders", got)
	}

	// Spending ahead of the line earns no surplus, so the bucket cannot grow
	// past the floor for a caller that is already overspending.
	if got := g.burstFor(limit, 1000, 43200); got != mdblistDefaultBurst {
		t.Errorf("burst = %.0f for an overspending day, want the floor %.0f", got, mdblistDefaultBurst)
	}

	// The control: on the even-spend line exactly, there is nothing to lend.
	half := usable / 2
	if got := g.burstFor(limit, float64(limit)-half, dailyWindow.Seconds()/2); got != mdblistDefaultBurst {
		t.Errorf("burst = %.0f on the line, want the floor %.0f", got, mdblistDefaultBurst)
	}
}

// The two arms bound different things. One knob for both meant raising the
// budget bucket also widened what may hit the source at once.
func TestTheCeilingBurstIsSeparateFromTheBudgetBurst(t *testing.T) {
	t.Setenv("XRDB_MDBLIST_BURST", "120")
	g := newBudgetGovernor("mdblist")
	if g.ceilBurst != 120 {
		t.Errorf("ceilBurst = %.0f, want 120", g.ceilBurst)
	}
	// Derived, so a full allowance at the start of the window lends nothing.
	if g.burst != mdblistDefaultBurst {
		t.Errorf("budget burst = %.0f, want the floor %.0f; the env knob must not reach it",
			g.burst, mdblistDefaultBurst)
	}

	// The fields being distinct proves nothing about the bucket that reads
	// them: drive the ceiling and watch which number bounds it. With the arms
	// sharing one field this paces at 30.
	g.now = func() time.Time { return time.Unix(0, 0) }
	for i := range 60 {
		if delay, _ := g.takeCeiling(0, false); delay != 0 {
			t.Fatalf("ceiling paced call %d; it is reading the budget bucket, not its own", i+1)
		}
	}
}
