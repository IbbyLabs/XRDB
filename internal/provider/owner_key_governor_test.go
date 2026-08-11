package provider

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"
)

// A visitor rendering with their own free-tier MDBList key gets a 1,000/day
// allowance back. The shared governor must not learn its rate from that, or one
// stranger's free key paces every render made with the server's own key. This is
// the 2026-08-01 incident (v3.49.2): the shared pacer dragged to 0.2 req/s.
func TestOwnerKeyDoesNotRepaceTheSharedGovernor(t *testing.T) {
	g, clock, _ := newTestGovernor(t)
	before := g.currentRate()
	freeKeyHeaders := allowanceHeaders(1000, 995, clock.t.Add(24*time.Hour))
	c := &http.Client{Transport: &throttledTransport{
		base:     &headerTransport{header: freeKeyHeaders},
		source:   "mdblist",
		policy:   RateLimit{MaxRetries: 1, MaxRetryWait: time.Second},
		pacer:    &pacer{},
		governor: g,
	}}

	ctx := WithKeys(context.Background(), map[string]string{KeyMDBList: "visitor-free-key"})
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://example.invalid/x", nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	resp, err := c.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	resp.Body.Close()

	if g.seen {
		t.Error("an owner-keyed response taught the shared governor its allowance")
	}
	if got := g.currentRate(); !closeEnough(got, before) {
		t.Errorf("the shared rate moved to %.5f/s from a foreign key; want it unchanged at %.5f/s", got, before)
	}

	// Control: the identical response with no owner key does re-pace the shared
	// governor, so it is the owner key that spares it and not the headers.
	g2, clock2, _ := newTestGovernor(t)
	c2 := &http.Client{Transport: &throttledTransport{
		base:     &headerTransport{header: allowanceHeaders(1000, 995, clock2.t.Add(24*time.Hour))},
		source:   "mdblist",
		policy:   RateLimit{MaxRetries: 1, MaxRetryWait: time.Second},
		pacer:    &pacer{},
		governor: g2,
	}}
	resp2, err := get(t, c2) // get() carries no owner key
	if err != nil {
		t.Fatalf("control request: %v", err)
	}
	resp2.Body.Close()
	if !g2.seen {
		t.Error("control: the governor should learn from a server-key response")
	}
}

// v3.49.2 exempted owner-keyed requests from governor.wait() as well as
// observe(), which removed the load shedding: unthrottled demand flooded MDBList
// until most calls hit the client timeout. wait() is load shedding, not
// bookkeeping, and must stay for every key. A cancelled owner-keyed request must
// still enter the wait and abandon it, not skip it.
func TestOwnerKeyStillWaitsOnTheGovernor(t *testing.T) {
	g := newBudgetGovernor("mdblist")
	// The ceiling band is the one that paces an owner-keyed call; the daily
	// budget models a quota such a call does not spend.
	g.maxRPS = 0.001 // a wait no request would sit through
	for range int(g.burst) + 1 {
		g.takeCeiling(0, false) // spend the burst so the next caller must wait
	}
	c := &http.Client{Transport: &throttledTransport{
		base:     &headerTransport{header: make(http.Header)},
		source:   "mdblist",
		policy:   RateLimit{MaxRetries: 1, MaxRetryWait: time.Second},
		pacer:    &pacer{},
		governor: g,
	}}

	ctx, cancel := context.WithCancel(WithKeys(context.Background(), map[string]string{KeyMDBList: "visitor-free-key"}))
	cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://example.invalid/x", nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	start := time.Now()
	if _, err := c.Do(req); err == nil {
		t.Error("an owner-keyed request skipped governor.wait(): a cancelled context did not gate it")
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Errorf("the wait took %s to honour cancellation", elapsed)
	}
}

// The withheld counter counts owner-keyed responses kept out of the governor, so
// a log read since process start can tell "the guard fired N times" from "no
// foreign traffic occurred". A server-keyed request must not touch it.
func TestWithheldCounterCountsOwnerKeyedGovernorSkips(t *testing.T) {
	g, clock, _ := newTestGovernor(t)
	tt := &throttledTransport{
		base:     &headerTransport{header: allowanceHeaders(1000, 995, clock.t.Add(24*time.Hour))},
		source:   "mdblist",
		policy:   RateLimit{MaxRetries: 1, MaxRetryWait: time.Second},
		pacer:    &pacer{},
		governor: g,
	}
	c := &http.Client{Transport: tt}

	ctx := WithKeys(context.Background(), map[string]string{KeyMDBList: "visitor-free-key"})
	for i := 0; i < 3; i++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://example.invalid/x", nil)
		if err != nil {
			t.Fatal(err)
		}
		resp, err := c.Do(req)
		if err != nil {
			t.Fatalf("owner-keyed request %d: %v", i, err)
		}
		resp.Body.Close()
	}
	if got := tt.withheld.Load(); got != 3 {
		t.Errorf("withheld counter = %d after three owner-keyed responses, want 3", got)
	}
	if g.seen {
		t.Error("the governor was fed despite the owner key")
	}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "http://example.invalid/x", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if got := tt.withheld.Load(); got != 3 {
		t.Errorf("a server-keyed request moved the withheld counter to %d, want it left at 3", got)
	}
}

func TestIsPowerOfTen(t *testing.T) {
	for _, n := range []int64{10, 100, 1000, 10000} {
		if !isPowerOfTen(n) {
			t.Errorf("isPowerOfTen(%d) = false, want true", n)
		}
	}
	for _, n := range []int64{0, 1, 2, 9, 11, 20, 50, 99, 101, 1001} {
		if isPowerOfTen(n) {
			t.Errorf("isPowerOfTen(%d) = true, want false", n)
		}
	}
}

// Clause 1 of the after-read depends on the withhold line actually reaching the
// log; if it silently did not, a clean window would read as "no foreign traffic"
// rather than "fix verified". So assert the line emits at info with the total.
func TestWithholdingLogsOnFirstOccurrence(t *testing.T) {
	g, clock, _ := newTestGovernor(t)
	var buf bytes.Buffer
	tt := &throttledTransport{
		base:     &headerTransport{header: allowanceHeaders(1000, 995, clock.t.Add(24*time.Hour))},
		source:   "mdblist",
		policy:   RateLimit{MaxRetries: 1, MaxRetryWait: time.Second},
		pacer:    &pacer{},
		governor: g,
		logger:   slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})),
	}
	c := &http.Client{Transport: tt}

	ctx := WithKeys(context.Background(), map[string]string{KeyMDBList: "visitor-free-key"})
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://example.invalid/x", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := c.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	out := buf.String()
	if !strings.Contains(out, "Withheld an owner-keyed response from the shared governor") {
		t.Errorf("first withhold did not log at info; got: %q", out)
	}
	if !strings.Contains(out, `"total":1`) {
		t.Errorf("withhold log line missing total=1; got: %q", out)
	}
	if !strings.Contains(out, `"source":"mdblist"`) {
		t.Errorf("withhold log line missing source; got: %q", out)
	}
}
