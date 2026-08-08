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

func newTestLimiter(t *testing.T, perMinute int) (*callerLimiter, *testClock) {
	t.Helper()
	clock := &testClock{t: time.Date(2026, 8, 8, 12, 0, 0, 0, time.UTC)}
	l := newCallerLimiter(perMinute)
	if l == nil {
		t.Fatal("newCallerLimiter returned nil for a positive rate")
	}
	l.now = clock.now
	return l, clock
}

func TestACallerGetsItsAllowanceAndNoMore(t *testing.T) {
	l, _ := newTestLimiter(t, 30)
	for i := range 30 {
		if !l.allow("profile:a") {
			t.Fatalf("request %d of the allowance was refused", i+1)
		}
	}
	if l.allow("profile:a") {
		t.Error("a request past the allowance was allowed")
	}
}

func TestTheAllowanceRefillsOverTheMinute(t *testing.T) {
	l, clock := newTestLimiter(t, 30)
	for range 30 {
		l.allow("profile:a")
	}
	if l.allow("profile:a") {
		t.Fatal("the allowance was not spent")
	}

	clock.advance(2 * time.Second) // one token at 30/min
	if !l.allow("profile:a") {
		t.Error("two seconds bought no allowance back")
	}
	if l.allow("profile:a") {
		t.Error("two seconds bought more than one request back")
	}

	clock.advance(time.Minute)
	for i := range 30 {
		if !l.allow("profile:a") {
			t.Fatalf("a full minute did not restore the allowance (failed at %d)", i+1)
		}
	}
}

// The point of two keys: a caller who mints a new profile still meets the limit
// on the address the answer has to reach.
func TestEitherKeyCanRefuseARequest(t *testing.T) {
	l, _ := newTestLimiter(t, 30)
	for range 30 {
		l.allow("profile:a", "ip:1.2.3.4")
	}

	if l.allow("profile:b", "ip:1.2.3.4") {
		t.Error("a fresh profile from an exhausted address was allowed")
	}
	if l.allow("profile:a", "ip:5.6.7.8") {
		t.Error("an exhausted profile from a fresh address was allowed")
	}
	if !l.allow("profile:b", "ip:5.6.7.8") {
		t.Error("a caller sharing neither key was refused")
	}
}

// A refused request must not spend the allowance of the key that was still
// under its limit, or one exhausted key drains every key beside it.
func TestARefusedRequestChargesNobody(t *testing.T) {
	l, _ := newTestLimiter(t, 30)
	for range 30 {
		l.allow("ip:1.2.3.4")
	}
	for range 5 {
		if l.allow("profile:a", "ip:1.2.3.4") {
			t.Fatal("a request over the address limit was allowed")
		}
	}
	for i := range 30 {
		if !l.allow("profile:a", "ip:5.6.7.8") {
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
		if !l.allow("", "") {
			t.Fatalf("a caller with no keys was refused at request %d", i+1)
		}
	}
	// And it did not spend anyone else's allowance on the way.
	if !l.allow("profile:a") {
		t.Error("an unidentified caller charged a real key")
	}
}

// An empty key alongside a real one is ignored rather than counted.
func TestAnEmptyKeyIsIgnoredBesideARealOne(t *testing.T) {
	l, _ := newTestLimiter(t, 30)
	for range 30 {
		if !l.allow("profile:a", "") {
			t.Fatal("a request inside the allowance was refused")
		}
	}
	if l.allow("profile:a", "") {
		t.Error("the real key was not counted")
	}
	if !l.allow("profile:b", "") {
		t.Error("the empty key was shared between callers")
	}
}

// A crawler walking a catalogue presents a new key per title in the worst case,
// so idle keys have to be dropped or the map is the leak.
func TestIdleKeysAreDropped(t *testing.T) {
	l, clock := newTestLimiter(t, 30)
	for i := range 500 {
		l.allow(string(rune('a'+i%26)) + ":" + time.Duration(i).String())
	}
	if l.tracked() == 0 {
		t.Fatal("nothing was tracked")
	}
	clock.advance(10 * time.Minute)
	l.allow("profile:a")
	if got := l.tracked(); got > 1 {
		t.Errorf("%d keys survived a ten-minute idle period, want the one just used", got)
	}
}

// Zero disables the cap, and a disabled limiter refuses nothing.
func TestADisabledLimiterAllowsEverything(t *testing.T) {
	if l := newCallerLimiter(0); l != nil {
		t.Error("zero per minute built a limiter")
	}
	var l *callerLimiter
	for range 1000 {
		if !l.allow("profile:a", "ip:1.2.3.4") {
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
			if l.allow("profile:a", "ip:1.2.3.4") {
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
