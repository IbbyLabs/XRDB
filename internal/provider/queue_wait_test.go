package provider

import (
	"testing"
	"time"
)

// A source with its own queue ceiling uses it; every other source keeps the
// shared one from the environment.
func TestQueueWaitIsPerSourceWithAnEnvFallback(t *testing.T) {
	t.Setenv("XRDB_RATINGS_MAX_QUEUE_SECONDS", "3")

	if got := rateLimitFor("trakt").queueWait(); got != 5*time.Second {
		t.Errorf("trakt queue wait = %v, want 5s", got)
	}
	if got := rateLimitFor("wikidata").queueWait(); got != 3*time.Second {
		t.Errorf("wikidata queue wait = %v, want the 3s from the environment", got)
	}
	if got := rateLimitFor("nowhere").queueWait(); got != 3*time.Second {
		t.Errorf("unlisted source queue wait = %v, want the 3s from the environment", got)
	}
}

// The ceiling has to reach the pacer the client actually uses, not just the
// policy table.
func TestClientPacerCarriesTheSourceQueueWait(t *testing.T) {
	t.Setenv("XRDB_RATINGS_MAX_QUEUE_SECONDS", "2")

	for source, want := range map[string]time.Duration{"trakt": 5 * time.Second, "wikidata": 2 * time.Second} {
		tr, ok := newHTTPClient(source, 10*time.Second).Transport.(*throttledTransport)
		if !ok {
			t.Fatalf("%s: transport is not a throttledTransport", source)
		}
		if tr.pacer.maxWait != want {
			t.Errorf("%s pacer maxWait = %v, want %v", source, tr.pacer.maxWait, want)
		}
	}
}

// A sweep's share of a longer ceiling grows with it but stays a quarter, so a
// wider trakt queue is mostly for the person waiting on the render.
func TestBulkShareOfTheTraktCeiling(t *testing.T) {
	rl := rateLimitFor("trakt")
	if got := bulkMaxWait(CallerBulk, rl.queueWait(), rl.MinInterval); got != 1250*time.Millisecond {
		t.Errorf("bulk share of the trakt ceiling = %v, want 1.25s", got)
	}
}
