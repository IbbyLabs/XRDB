package server

import (
	"net/http"
	"strconv"
	"time"
)

const (
	// profilePasswordChecksPerMinute caps bcrypt password checks per client
	// address, successful or not. Autosave checks the password on every write.
	profilePasswordChecksPerMinute = 30
	// profileCreatesPerHour caps new profiles per client address.
	profileCreatesPerHour = 10
)

// newWindowLimiter allows n requests per window per key, with no extra burst.
func newWindowLimiter(n int, window time.Duration) *callerLimiter {
	l := newCallerLimiterWithBurst(1, 1)
	if l == nil || n <= 0 {
		return nil
	}
	l.perMinute = float64(n) / window.Minutes()
	l.burst = float64(n)
	l.idle = window
	return l
}

// retryAfterSeconds is how long until one more request is allowed for a key.
func (l *callerLimiter) retryAfterSeconds(key string) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	missing := 1 - l.tokensLocked(key, now)
	if missing <= 0 {
		return 1
	}
	secs := int(missing*60/l.perMinute) + 1
	return secs
}

// refuseRateLimited answers 429 with Retry-After for a key the limiter refused.
func refuseRateLimited(w http.ResponseWriter, l *callerLimiter, key string) {
	w.Header().Set("Retry-After", strconv.Itoa(l.retryAfterSeconds(key)))
	http.Error(w, "too many requests, try again later", http.StatusTooManyRequests)
}
