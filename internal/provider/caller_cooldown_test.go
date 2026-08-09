package provider

import (
	"net"
	"net/url"
	"testing"
	"time"
)

// A catalogue sweep drove six sources into cooldown on production and the
// sixteen real clients in that window lost their badges to somebody else's
// crawl. One caller's failure must not speak for another's — the same rule
// Remember already applies to one caller's success.
func rateLimited(source string) *RateLimitError {
	return &RateLimitError{Source: source, Status: 429, RetryAfter: time.Hour}
}

// 1. The fix. A refusal the sweep provoked must leave a person's render still
// reaching the source.
func TestABulkRefusalDoesNotHoldTheSourceFromPeople(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Failure("mdblist", rateLimited("mdblist"), CallerBulk)

	if h.CoolingOff("mdblist", CallerInteractive) {
		t.Error("a sweep's refusal cooled the source off for interactive renders")
	}
}

// 2. The protection still works in its own right. Without this, a change that
// simply never cools anything off passes case 1.
func TestAnInteractiveRefusalStillCoolsTheSourceOff(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Failure("mdblist", rateLimited("mdblist"), CallerInteractive)

	if !h.CoolingOff("mdblist", CallerInteractive) {
		t.Error("a refusal a person hit did not cool the source off for them")
	}
	// And it holds the sweep too: a source that will not answer an ordinary
	// render will not answer a crawl.
	if !h.CoolingOff("mdblist", CallerBulk) {
		t.Error("a refusal a person hit left the sweep still hammering the source")
	}
}

// 3. The sweep is genuinely still held back, so this is not just a way of
// ignoring cooldowns.
func TestABulkRefusalStillHoldsTheSweepBack(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Failure("mdblist", rateLimited("mdblist"), CallerBulk)

	if !h.CoolingOff("mdblist", CallerBulk) {
		t.Error("the sweep that caused the refusal is not being held out")
	}
}

// The breaker holds a source out after repeated failures of any kind, which is
// the path a timeout under our own load takes. It must split by caller too, or
// saturation still takes the source off everyone's poster.
func TestTheFailureBreakerAlsoSplitsByCaller(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	for i := 0; i < failureBreakerThreshold+1; i++ {
		h.Failure("anilist", timedOut(), CallerBulk)
	}
	if !h.CoolingOff("anilist", CallerBulk) {
		t.Fatal("repeated bulk failures did not hold the sweep back")
	}
	if h.CoolingOff("anilist", CallerInteractive) {
		t.Error("timeouts a sweep caused held the source out of people's renders")
	}
}

// A recovery clears both, so a source that comes back is picked up by everyone.
func TestASuccessClearsBothHolds(t *testing.T) {
	h := NewHealthTracker(10, time.Hour)
	h.Failure("mdblist", rateLimited("mdblist"), CallerInteractive)
	h.Success("mdblist", GoodKey("mdblist", "movie", "tt1"),
		&MediaMeta{Ratings: []Rating{{Source: "mdblist", Value: 8}}})

	for _, c := range []CallerClass{CallerInteractive, CallerBulk} {
		if h.CoolingOff("mdblist", c) {
			t.Errorf("a recovery left %s callers held out", c)
		}
	}
}

// A real timeout carries *url.Error, which satisfies net.Error and is what the
// classifier recognises. A plain string error never did, so a stub standing for
// a timeout stopped representing one.
func timedOut() error {
	return &url.Error{
		Op:  "Get",
		URL: "https://graphql.anilist.co",
		Err: &net.OpError{Op: "dial", Err: &timeoutErr{}},
	}
}

type timeoutErr struct{}

func (*timeoutErr) Error() string   { return "i/o timeout" }
func (*timeoutErr) Timeout() bool   { return true }
func (*timeoutErr) Temporary() bool { return true }
