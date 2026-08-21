package server

import (
	"sync"
	"testing"
	"time"
)

type testClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *testClock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *testClock) advance(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

// mustAllow drops the key naming for the tests that only care whether a
// request passed.
func mustAllow(l *callerLimiter, keys ...string) bool {
	ok, _ := l.allow(keys...)
	return ok
}

func newTestLimiter(t *testing.T, perMinute int) (*callerLimiter, *testClock) {
	t.Helper()
	clock := &testClock{t: time.Date(2026, 8, 8, 12, 0, 0, 0, time.UTC)}
	l := newCallerLimiterWithBurst(perMinute, perMinute)
	if l == nil {
		t.Fatal("newCallerLimiter returned nil for a positive rate")
	}
	l.now = clock.now
	return l, clock
}

func TestACallerGetsItsAllowanceAndNoMore(t *testing.T) {
	l, _ := newTestLimiter(t, 30)
	for i := range 30 {
		if !mustAllow(l, "profile:a") {
			t.Fatalf("request %d of the allowance was refused", i+1)
		}
	}
	if mustAllow(l, "profile:a") {
		t.Error("a request past the allowance was allowed")
	}
}

func TestTheAllowanceRefillsOverTheMinute(t *testing.T) {
	l, clock := newTestLimiter(t, 30)
	for range 30 {
		mustAllow(l, "profile:a")
	}
	if mustAllow(l, "profile:a") {
		t.Fatal("the allowance was not spent")
	}

	clock.advance(2 * time.Second) // one token at 30/min
	if !mustAllow(l, "profile:a") {
		t.Error("two seconds bought no allowance back")
	}
	if mustAllow(l, "profile:a") {
		t.Error("two seconds bought more than one request back")
	}

	clock.advance(time.Minute)
	for i := range 30 {
		if !mustAllow(l, "profile:a") {
			t.Fatalf("a full minute did not restore the allowance (failed at %d)", i+1)
		}
	}
}

// The point of two keys: a caller who mints a new profile still meets the limit
// on the address the answer has to reach.
func TestEitherKeyCanRefuseARequest(t *testing.T) {
	l, _ := newTestLimiter(t, 30)
	for range 30 {
		mustAllow(l, "profile:a", "ip:1.2.3.4")
	}

	if mustAllow(l, "profile:b", "ip:1.2.3.4") {
		t.Error("a fresh profile from an exhausted address was allowed")
	}
	if mustAllow(l, "profile:a", "ip:5.6.7.8") {
		t.Error("an exhausted profile from a fresh address was allowed")
	}
	if !mustAllow(l, "profile:b", "ip:5.6.7.8") {
		t.Error("a caller sharing neither key was refused")
	}
}

// A refused request must not spend the allowance of the key that was still
// under its limit, or one exhausted key drains every key beside it.
func TestARefusedRequestChargesNobody(t *testing.T) {
	l, _ := newTestLimiter(t, 30)
	for range 30 {
		mustAllow(l, "ip:1.2.3.4")
	}
	for range 5 {
		if mustAllow(l, "profile:a", "ip:1.2.3.4") {
			t.Fatal("a request over the address limit was allowed")
		}
	}
	for i := range 30 {
		if !mustAllow(l, "profile:a", "ip:5.6.7.8") {
			t.Fatalf("the profile was charged for refused requests (failed at %d)", i+1)
		}
	}
}

// A request carrying its whole config inline has no profile, and a caller
// behind something that hides the address has no address. Neither is refused
// by an empty string it would share with every other such caller.
func TestAnUnidentifiedCallerIsNotRefused(t *testing.T) {
	l, _ := newTestLimiter(t, 30)
	for i := range 100 {
		if !mustAllow(l, "", "") {
			t.Fatalf("a caller with no keys was refused at request %d", i+1)
		}
	}
	// And it did not spend anyone else's allowance on the way.
	if !mustAllow(l, "profile:a") {
		t.Error("an unidentified caller charged a real key")
	}
}

// An empty key alongside a real one is ignored rather than counted.
func TestAnEmptyKeyIsIgnoredBesideARealOne(t *testing.T) {
	l, _ := newTestLimiter(t, 30)
	for range 30 {
		if !mustAllow(l, "profile:a", "") {
			t.Fatal("a request inside the allowance was refused")
		}
	}
	if mustAllow(l, "profile:a", "") {
		t.Error("the real key was not counted")
	}
	if !mustAllow(l, "profile:b", "") {
		t.Error("the empty key was shared between callers")
	}
}

// A crawler walking a catalogue presents a new key per title in the worst case,
// so idle keys have to be dropped or the map is the leak.
func TestIdleKeysAreDropped(t *testing.T) {
	l, clock := newTestLimiter(t, 30)
	for i := range 500 {
		mustAllow(l, string(rune('a'+i%26))+":"+time.Duration(i).String())
	}
	if l.tracked() == 0 {
		t.Fatal("nothing was tracked")
	}
	clock.advance(10 * time.Minute)
	mustAllow(l, "profile:a")
	if got := l.tracked(); got > 1 {
		t.Errorf("%d keys survived a ten-minute idle period, want the one just used", got)
	}
}

// A page loading many posters at once is one caller arriving in a bunch. The
// burst is held above the rate so its shape does not cost it posters, while its
// sustained rate is still held to the limit.
func TestABurstIsAllowedAboveTheSustainedRate(t *testing.T) {
	clock := &testClock{t: time.Date(2026, 8, 8, 12, 0, 0, 0, time.UTC)}
	l := newCallerLimiter(30) // burst defaults above the rate
	l.now = clock.now

	allowed := 0
	for range 100 {
		if mustAllow(l, "ip:1.2.3.4") {
			allowed++
		}
	}
	if allowed <= 30 {
		t.Errorf("a burst of 100 got %d through, want more than the per-minute rate", allowed)
	}
	if allowed >= 100 {
		t.Errorf("a burst of 100 got %d through, want the burst bounded", allowed)
	}

	// The sustained rate is still the rate: a minute buys 30, not the burst.
	clock.advance(time.Minute)
	refilled := 0
	for range 100 {
		if mustAllow(l, "ip:1.2.3.4") {
			refilled++
		}
	}
	if refilled != 30 {
		t.Errorf("a minute of refill bought %d requests, want 30", refilled)
	}
}

// A burst below the rate is nonsense and must not shrink the allowance.
func TestABurstBelowTheRateIsRaisedToIt(t *testing.T) {
	l := newCallerLimiterWithBurst(30, 5)
	if l == nil {
		t.Fatal("nil limiter")
	}
	allowed := 0
	for range 30 {
		if mustAllow(l, "ip:1.2.3.4") {
			allowed++
		}
	}
	if allowed != 30 {
		t.Errorf("a burst under the rate cut the allowance to %d, want 30", allowed)
	}
}

// Zero disables the cap, and a disabled limiter refuses nothing.
func TestADisabledLimiterAllowsEverything(t *testing.T) {
	if l := newCallerLimiter(0); l != nil {
		t.Error("zero per minute built a limiter")
	}
	if l := newCallerLimiterWithBurst(0, 100); l != nil {
		t.Error("zero per minute with a burst built a limiter")
	}
	var l *callerLimiter
	for range 1000 {
		if !mustAllow(l, "profile:a", "ip:1.2.3.4") {
			t.Fatal("a disabled limiter refused a request")
		}
	}
	if l.tracked() != 0 {
		t.Error("a disabled limiter tracked a key")
	}
}

func TestConcurrentCallersGetExactlyTheAllowance(t *testing.T) {
	l, _ := newTestLimiter(t, 30)
	var wg sync.WaitGroup
	var mu sync.Mutex
	allowed := 0
	for range 100 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if mustAllow(l, "profile:a", "ip:1.2.3.4") {
				mu.Lock()
				allowed++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if allowed != 30 {
		t.Errorf("100 concurrent requests got %d through, want exactly 30", allowed)
	}
}

// The key that refused has to be named, or a refusal cannot say whether it
// landed on a crawl or on somebody's library.
func TestARefusalNamesTheKeyThatTripped(t *testing.T) {
	l, _ := newTestLimiter(t, 2)
	for range 2 {
		l.allow("profile:a", "ip:1.2.3.4")
	}
	ok, over := l.allow("profile:a", "ip:1.2.3.4")
	if ok {
		t.Fatal("a request past the allowance was allowed")
	}
	if over != "profile:a" {
		t.Errorf("refused on %q, want the profile that ran out", over)
	}

	// And when only the address is exhausted, it is the address that is named.
	l2, _ := newTestLimiter(t, 2)
	for range 2 {
		l2.allow("ip:5.6.7.8")
	}
	if ok, over := l2.allow("profile:fresh", "ip:5.6.7.8"); ok || over != "ip:5.6.7.8" {
		t.Errorf("refused on %q (allowed=%v), want the address", over, ok)
	}
}

// An allowed request names nothing, so an empty value in the log means allowed
// rather than "we could not tell".
func TestAnAllowedRequestNamesNoKey(t *testing.T) {
	l, _ := newTestLimiter(t, 30)
	if ok, over := l.allow("profile:a", "ip:1.2.3.4"); !ok || over != "" {
		t.Errorf("allowed=%v over=%q, want true and empty", ok, over)
	}
}
