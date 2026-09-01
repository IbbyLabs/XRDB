package server

import (
	"sync"
	"time"
)

// callerLimiter caps how many renders one caller may ask for per minute.
//
// A caller is identified by more than one key — a stored profile and the
// address the reply has to reach — and every key it presents is checked. A
// profile id can be minted freely, so a limit on it alone is a speed bump; an
// address cannot be minted by anyone who needs the answer back, so it is the
// one that holds. Together they cost an evader the thing they came for.
//
// It holds no policy about which keys a caller has. Deciding that a shared
// alias contributes no profile key, or that a request carrying its whole config
// inline has no profile at all, belongs to the caller of allow: this only counts.
type callerLimiter struct {
	perMinute float64
	// burst is how many a caller may ask for at once. Held above perMinute
	// deliberately: a page loading fifty posters is one caller arriving in a
	// bunch, not a caller exceeding a sustained rate, and tying the two
	// together would clip it for the shape of its traffic rather than its
	// volume.
	burst float64
	// idle is how long a key with no requests is kept before it is dropped, so
	// a crawler walking a catalogue does not grow the map without bound.
	idle time.Duration
	now  func() time.Time

	mu      sync.Mutex
	buckets map[string]*callerBucket
}

type callerBucket struct {
	tokens float64
	last   time.Time
}

// newCallerLimiter returns a limiter allowing perMinute renders per key, or nil
// when perMinute is zero or less, which disables the cap.
func newCallerLimiter(perMinute int) *callerLimiter {
	if perMinute <= 0 {
		return nil
	}
	return newCallerLimiterWithBurst(perMinute, perMinute*2)
}

// newCallerLimiterWithBurst is newCallerLimiter with the burst named, for a
// caller that wants them different or a test that wants them equal.
func newCallerLimiterWithBurst(perMinute, burst int) *callerLimiter {
	if perMinute <= 0 {
		return nil
	}
	if burst < perMinute {
		burst = perMinute
	}
	return &callerLimiter{
		perMinute: float64(perMinute),
		burst:     float64(burst),
		idle:      5 * time.Minute,
		now:       time.Now,
		buckets:   make(map[string]*callerBucket),
	}
}

// allow reports whether a request presenting these keys may proceed, and
// charges each key that does the given cost. A caller over its limit on any one key is
// refused, and no key is charged when one refuses: a request that was turned
// away has not spent anyone's allowance.
//
// The second result names the key that refused, so a refusal can say whether it
// landed on a profile or an address. It is empty when the request is allowed.
//
// Empty keys are ignored, so a caller with nothing to identify it is not
// refused by an empty string it shares with every other such caller. A nil
// limiter allows everything.
func (l *callerLimiter) allow(cost int64, keys ...string) (bool, string) {
	if l == nil {
		return true, ""
	}
	if cost < 1 {
		cost = 1
	}
	present := make([]string, 0, len(keys))
	for _, k := range keys {
		if k != "" {
			present = append(present, k)
		}
	}
	if len(present) == 0 {
		return true, ""
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	l.sweepLocked(now)

	for _, k := range present {
		if l.tokensLocked(k, now) < float64(cost) {
			return false, k
		}
	}
	for _, k := range present {
		b := l.buckets[k]
		b.tokens -= float64(cost)
	}
	return true, ""
}

// tokensLocked refills a key's bucket to the present moment and returns what it
// holds, creating it full on first sight.
func (l *callerLimiter) tokensLocked(key string, now time.Time) float64 {
	b, ok := l.buckets[key]
	if !ok {
		b = &callerBucket{tokens: l.burst, last: now}
		l.buckets[key] = b
		return b.tokens
	}
	if elapsed := now.Sub(b.last); elapsed > 0 {
		b.tokens += elapsed.Seconds() * l.perMinute / 60
		b.last = now
	}
	if b.tokens > l.burst {
		b.tokens = l.burst
	}
	return b.tokens
}

// sweepLocked drops keys that have been idle long enough to have refilled
// completely, since a full bucket is indistinguishable from an absent one.
func (l *callerLimiter) sweepLocked(now time.Time) {
	for k, b := range l.buckets {
		if now.Sub(b.last) > l.idle {
			delete(l.buckets, k)
		}
	}
}

// tracked reports how many keys the limiter is holding, for a check that it
// does not grow without bound.
func (l *callerLimiter) tracked() int {
	if l == nil {
		return 0
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.buckets)
}
