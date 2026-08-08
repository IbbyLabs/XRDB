package provider

import (
	"container/list"
	"context"
	"errors"
	"strings"
	"sync"
	"time"
)

// Five of the rating sources have no API and are read off a public page. A
// markup change on any of them turns into an empty result rather than an error,
// which used to erase that badge from every render with nothing to show an
// operator why. HealthTracker keeps the last good answer per source and title so
// a degraded source falls back to it, and records enough per-source state for
// the admin API to say which sources are currently unhealthy.
type HealthTracker struct {
	mu      sync.Mutex
	sources map[string]*sourceState
	entries map[string]*list.Element // key -> element holding *goodEntry
	lru     *list.List               // front = least recently used
	max     int
	ttl     time.Duration
}

type sourceState struct {
	healthy         bool
	lastSuccess     time.Time
	lastFailure     time.Time
	lastError       string
	consecutiveFail int
	successes       int64
	failures        int64
	staleServes     int64
	// cooldownUntil is set when a source refuses for rate-limit reasons. Live
	// renders skip it until then and serve the remembered value instead.
	//
	// Held per caller class. A catalogue sweep can drive a source into refusing
	// it while the source still answers a person perfectly well, and one shared
	// timer let the sweep take the source off everyone's poster. Remember()
	// already keeps one caller's success from speaking for another's health;
	// this is the same rule for failure. Indexed by CallerClass.
	cooldownUntil [2]time.Time
	// cooldownReason names what set the timer in force, per caller class. The
	// two causes want opposite responses: one is throttling, the other is a
	// source erroring.
	cooldownReason [2]string
	cooldowns      int64
	// breakerTrips counts how many times in a row the failure breaker has held
	// this source out without a success in between. It lengthens the next hold.
	breakerTrips int
}

type goodEntry struct {
	key       string
	meta      *MediaMeta
	storedAt  time.Time
	expiresAt time.Time
}

// SourceHealth is a point-in-time view of one source, for the admin API.
type SourceHealth struct {
	Source string `json:"source"`
	// Healthy is false once a source has failed more recently than it has
	// succeeded. It is the field worth alerting on.
	Healthy         bool   `json:"healthy"`
	LastSuccess     string `json:"lastSuccess,omitempty"`
	LastFailure     string `json:"lastFailure,omitempty"`
	LastError       string `json:"lastError,omitempty"`
	ConsecutiveFail int    `json:"consecutiveFailures"`
	Successes       int64  `json:"successes"`
	Failures        int64  `json:"failures"`
	// StaleServes counts how often a render fell back to a remembered value
	// because the live fetch failed. A rising number means a source is broken
	// even while renders still look right.
	StaleServes int64 `json:"staleServes"`
	// CoolingOff is true while the source is held out of live renders after
	// refusing on rate-limit grounds. Cooldowns counts how often that started.
	CoolingOff bool  `json:"coolingOff"`
	Cooldowns  int64 `json:"cooldowns"`
	// CoolingOffBulk is the hold a catalogue sweep is under. It can be set while
	// the source still answers people normally, which is the whole point.
	CoolingOffBulk bool `json:"coolingOffBulk"`
}

const (
	defaultHealthEntries = 5000
	defaultHealthTTL     = 24 * time.Hour
)

// NewHealthTracker creates a tracker bounded to maxEntries remembered results,
// each held for ttl. Zero values take the defaults.
func NewHealthTracker(maxEntries int, ttl time.Duration) *HealthTracker {
	if maxEntries <= 0 {
		maxEntries = defaultHealthEntries
	}
	if ttl <= 0 {
		ttl = defaultHealthTTL
	}
	return &HealthTracker{
		sources: make(map[string]*sourceState),
		entries: make(map[string]*list.Element),
		lru:     list.New(),
		max:     maxEntries,
		ttl:     ttl,
	}
}

// GoodKey builds the key a remembered result is stored under.
func GoodKey(source, mediaType, id string) string {
	return source + "|" + mediaType + "|" + id
}

// Success records a healthy fetch and remembers its result. A result carrying
// no ratings is not remembered: it is exactly what a broken scrape produces,
// and storing it would overwrite the good answer we still want to fall back to.
// Success records a successful fetch and reports whether it recovered a source
// that was previously held out, so the caller can log the recovery once.
func (h *HealthTracker) Success(source, key string, meta *MediaMeta) (recovered bool) {
	if h == nil {
		return false
	}
	h.mu.Lock()
	defer h.mu.Unlock()

	st := h.stateLocked(source)
	recovered = !st.healthy || time.Now().Before(st.cooldownUntil[CallerInteractive]) ||
		time.Now().Before(st.cooldownUntil[CallerBulk])
	st.healthy = true
	st.cooldownUntil = [2]time.Time{}
	st.cooldownReason = [2]string{}
	st.lastSuccess = time.Now()
	st.consecutiveFail = 0
	st.breakerTrips = 0
	st.successes++

	h.rememberLocked(key, meta)
	return recovered
}

// Remember caches a good result without touching the source's health. It is the
// path for an owner-keyed render: the rating is a property of the title, so it
// is worth remembering, but the owner's key succeeding says nothing about the
// shared key's health and must not clear its cooldown.
func (h *HealthTracker) Remember(key string, meta *MediaMeta) {
	if h == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.rememberLocked(key, meta)
}

func (h *HealthTracker) rememberLocked(key string, meta *MediaMeta) {
	if meta == nil || len(meta.Ratings) == 0 {
		return
	}
	if el, ok := h.entries[key]; ok {
		h.lru.Remove(el)
		delete(h.entries, key)
	}
	h.entries[key] = h.lru.PushBack(&goodEntry{
		key:       key,
		meta:      meta,
		storedAt:  time.Now(),
		expiresAt: time.Now().Add(h.ttl),
	})
	for len(h.entries) > h.max {
		front := h.lru.Front()
		if front == nil {
			break
		}
		ge := front.Value.(*goodEntry)
		h.lru.Remove(front)
		delete(h.entries, ge.key)
	}
}

// Failure records a failed fetch and reports whether this call newly put the
// source into a rate-limit cooldown, so the caller can log that transition once
// rather than on every refused render. A plain not-found is not a health
// problem: the source answered, the title simply is not there.
func (h *HealthTracker) Failure(source string, err error, class CallerClass) (enteredCooldown bool) {
	if h == nil || errors.Is(err, errNotFound) || errors.Is(err, ErrNotApplicable) {
		return false
	}
	// A source whose own upstream refused it for one title is answering
	// perfectly well for every other title.
	if errors.Is(err, ErrUpstreamUnavailable) {
		return false
	}
	// A cancelled request says nothing about the source. The caller walked away
	// — the viewer closed the tab, or the render gave up — and the source may
	// have been about to answer. Counting it holds the source out for every
	// other render, so one abandoned request takes a working source off every
	// poster until it recovers.
	if errors.Is(err, context.Canceled) {
		return false
	}
	// Our own queues refusing a request says nothing about the source, which
	// never saw it. Counting them trips the failure breaker on our own load
	// shedding and holds a healthy source off every poster.
	if errors.Is(err, ErrPacerBacklog) || errors.Is(err, ErrGovernorBacklog) {
		return false
	}
	h.mu.Lock()
	defer h.mu.Unlock()

	st := h.stateLocked(source)
	wasCooling := time.Now().Before(st.cooldownUntil[class])
	// A refusal a sweep provoked holds the sweep off. A refusal a person hit
	// holds everyone off: if the source will not answer an ordinary render it
	// will not answer a crawl either.
	hold := func(until time.Time, reason string) bool {
		classes := []CallerClass{class}
		if class == CallerInteractive {
			classes = []CallerClass{CallerInteractive, CallerBulk}
		}
		set := false
		for _, c := range classes {
			if until.After(st.cooldownUntil[c]) {
				st.cooldownUntil[c] = until
				st.cooldownReason[c] = reason
				set = true
			}
		}
		return set
	}
	st.healthy = false
	st.lastFailure = time.Now()
	st.consecutiveFail++
	st.failures++
	if err != nil {
		st.lastError = truncateError(err.Error())
	}

	// A source that is refusing on rate-limit grounds will refuse the next
	// render too, so hold it out for as long as it asked rather than paying
	// the same wait again on every request.
	var rl *RateLimitError
	if errors.As(err, &rl) {
		wait := rl.RetryAfter
		if wait <= 0 {
			wait = defaultCooldown
		}
		if wait > maxCooldown {
			wait = maxCooldown
		}
		// A spent allowance lasts until the source's window rolls over, which it
		// does not tell us. Probing hourly costs a handful of requests a day
		// instead of one per render, and picks the source back up soon after it
		// resets whenever that happens to be.
		if rl.QuotaExhausted {
			wait = quotaCooldown
		}
		if hold(time.Now().Add(wait), CooldownRateLimit) {
			st.cooldowns++
		}
		enteredCooldown = !wasCooling && time.Now().Before(st.cooldownUntil[class])
	}

	// A source can fail without ever refusing on rate-limit grounds: a timeout
	// answers nothing and carries no Retry-After, so the branch above never fires
	// and the next render pays the same wait again. Hold a repeatedly failing
	// source out the same way, whatever it failed with.
	if st.consecutiveFail >= failureBreakerThreshold {
		// Each hold that ends in another round of failures doubles the next one, so
		// a source that cannot serve the current demand settles instead of being
		// probed every cooldown. A success resets it, so one that genuinely comes
		// back is picked up at full speed.
		wait := failureCooldown << min(st.breakerTrips, failureBackoffShifts)
		if wait > maxCooldown {
			wait = maxCooldown
		}
		if hold(time.Now().Add(wait), CooldownFailureBreaker) {
			st.cooldowns++
			st.breakerTrips++
		}
		enteredCooldown = !wasCooling && time.Now().Before(st.cooldownUntil[class])
	}
	return enteredCooldown
}

// Cooldown durations bound how long a rate-limited source is held out. The
// floor keeps a source that refuses without a Retry-After from being retried
// on the very next render; the ceiling keeps one asking for an hour from
// disappearing for an hour.
const (
	defaultCooldown = 30 * time.Second
	maxCooldown     = 5 * time.Minute
	// quotaCooldown applies when the allowance itself is spent rather than the
	// moment being busy. The window it waits on is usually a day.
	quotaCooldown = time.Hour
	// failureBreakerThreshold is how many consecutive failures of any kind hold a
	// source out, and failureCooldown is for how long. A source answering nothing
	// still costs every render its timeout until it is held out.
	failureBreakerThreshold = 5
	failureCooldown         = 30 * time.Second
	// failureBackoffShifts caps the doubling at 30s<<3 = 4 minutes, under the
	// five-minute ceiling every other cooldown answers to.
	failureBackoffShifts = 3
)

// Why a source is being held out. A rate-limit cooldown means the source
// refused; the failure breaker means it failed five times in a row for any
// reason, most often a timeout, and never refused at all.
const (
	CooldownRateLimit      = "rate_limit"
	CooldownFailureBreaker = "failure_breaker"
)

// CooldownReason names what put a source in cooldown, or "" if it is not in
// one.
func (h *HealthTracker) CooldownReason(source string, class CallerClass) string {
	if h == nil {
		return ""
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	st, ok := h.sources[source]
	if !ok || !time.Now().Before(st.cooldownUntil[class]) {
		return ""
	}
	return st.cooldownReason[class]
}

// CoolingOff reports whether a source is being held out after refusing on
// rate-limit grounds, and must not be called by a live render.
func (h *HealthTracker) CoolingOff(source string, class CallerClass) bool {
	if h == nil {
		return false
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	st, ok := h.sources[source]
	return ok && time.Now().Before(st.cooldownUntil[class])
}

// LastGood returns a remembered result for key, if one is still valid. It
// counts the fallback against the source so an operator can see that renders
// are only still correct because they are being served from memory.
func (h *HealthTracker) LastGood(source, key string) (*MediaMeta, bool) {
	meta, _, ok := h.LastGoodAge(source, key)
	return meta, ok
}

// LastGoodAge is LastGood with how long ago the result was remembered. A render
// served from memory is only as correct as that age.
func (h *HealthTracker) LastGoodAge(source, key string) (*MediaMeta, time.Duration, bool) {
	if h == nil {
		return nil, 0, false
	}
	h.mu.Lock()
	defer h.mu.Unlock()

	el, ok := h.entries[key]
	if !ok {
		return nil, 0, false
	}
	ge := el.Value.(*goodEntry)
	now := time.Now()
	if now.After(ge.expiresAt) {
		h.lru.Remove(el)
		delete(h.entries, key)
		return nil, 0, false
	}
	h.lru.MoveToBack(el)
	h.stateLocked(source).staleServes++
	return ge.meta, now.Sub(ge.storedAt), true
}

// Snapshot returns per-source health, sources with the most recent trouble
// first so a degraded one is not buried.
func (h *HealthTracker) Snapshot() []SourceHealth {
	if h == nil {
		return nil
	}
	h.mu.Lock()
	defer h.mu.Unlock()

	out := make([]SourceHealth, 0, len(h.sources))
	for name, st := range h.sources {
		sh := SourceHealth{
			Source:          name,
			Healthy:         st.healthy,
			LastError:       st.lastError,
			ConsecutiveFail: st.consecutiveFail,
			Successes:       st.successes,
			Failures:        st.failures,
			StaleServes:     st.staleServes,
			// The admin view reports the interactive hold: it is the one that
			// means a person's render is losing the source.
			CoolingOff:     time.Now().Before(st.cooldownUntil[CallerInteractive]),
			CoolingOffBulk: time.Now().Before(st.cooldownUntil[CallerBulk]),
			Cooldowns:      st.cooldowns,
		}
		if !st.lastSuccess.IsZero() {
			sh.LastSuccess = st.lastSuccess.UTC().Format(time.RFC3339)
		}
		if !st.lastFailure.IsZero() {
			sh.LastFailure = st.lastFailure.UTC().Format(time.RFC3339)
		}
		out = append(out, sh)
	}
	sortSourceHealth(out)
	return out
}

// RememberedResults reports how many last-known-good entries are held, so the
// admin surface can show the fallback is actually populated.
func (h *HealthTracker) RememberedResults() int {
	if h == nil {
		return 0
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.entries)
}

func (h *HealthTracker) stateLocked(source string) *sourceState {
	st, ok := h.sources[source]
	if !ok {
		st = &sourceState{healthy: true}
		h.sources[source] = st
	}
	return st
}

// sortSourceHealth puts unhealthy sources first, then orders by name so the
// output is stable between calls.
func sortSourceHealth(in []SourceHealth) {
	for i := 1; i < len(in); i++ {
		for j := i; j > 0; j-- {
			a, b := in[j-1], in[j]
			if (a.Healthy == b.Healthy && a.Source <= b.Source) || (!a.Healthy && b.Healthy) {
				break
			}
			in[j-1], in[j] = in[j], in[j-1]
		}
	}
}

// truncateError keeps a stored message short enough to be safe to expose and to
// keep the admin payload small.
func truncateError(msg string) string {
	msg = strings.TrimSpace(msg)
	const max = 200
	if len(msg) > max {
		return msg[:max] + "…"
	}
	return msg
}
