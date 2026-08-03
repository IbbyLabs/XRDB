package provider

import (
	"context"
	"net/http"
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
	g.rate = 0.001 // a wait no request would sit through
	for range int(g.burst) + 1 {
		g.take() // spend the burst so the next caller must wait
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
