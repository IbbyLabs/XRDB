package provider

import (
	"container/list"
	"errors"
	"log/slog"
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
	// consecutiveEmpty counts answers in a row carrying no ratings. A markup
	// change answers empty rather than erroring, so consecutiveFail never moves
	// for it.
	consecutiveEmpty int
	// lastRatedByType is when the source last answered with ratings, per content
	// type. Health is per source and a ratings cache key is per source and
	// content type, so a source can be answering for posters and broken for
	// thumbnails with one timestamp unable to say so.
	lastRatedByType map[string]time.Time
	successes       int64
	failures        int64
	staleServes     int64
	// heldOutEmpty counts renders that lost a rating: held out with nothing
	// remembered, so the badge is left empty. Keyed by the gate that refused,
	// because a source refusing us and our own pacing declining to spend do the
	// same visible damage and want opposite responses. staleServes counts the
	// rescues; these count the losses.
	//
	// Split by whose key was used. Both are real damage — a person is looking at
	// a poster with no rating either way — but only the shared one is caused by
	// how this server paces itself, so mixing them would hide a change in our own
	// behaviour behind other people's spent allowances.
	heldOutEmpty      map[string]int64
	heldOutEmptyOwner map[string]int64
	// cooldownUntil is set when a source refuses for rate-limit reasons. Live
	// renders skip it until then and serve the remembered value instead.
	//
	// Held per caller class. A catalogue sweep can drive a source into refusing
	// it while the source still answers a person perfectly well, and one shared
	// timer let the sweep take the source off everyone's poster. Remember()
	// already keeps one caller's success from speaking for another's health;
	// this is the same rule for failure. Indexed by CallerClass.
	cooldownUntil [callerClassCount]time.Time
	// cooldownReason names what set the timer in force, per caller class. The
	// two causes want opposite responses: one is throttling, the other is a
	// source erroring.
	cooldownReason [callerClassCount]string
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
	Healthy bool `json:"healthy"`
	// LastSuccess is when the source last answered with ratings. Successes
	// counts every answer including empty ones, so the two move apart on a
	// source that is reachable and scraping nothing.
	LastSuccess string `json:"lastSuccess,omitempty"`
	LastFailure string `json:"lastFailure,omitempty"`
	LastError   string `json:"lastError,omitempty"`
	// ConsecutiveEmpty is the field to read for a broken scrape. Healthy stays
	// true and ConsecutiveFail stays zero through one, because an empty answer
	// is not an error.
	ConsecutiveEmpty int   `json:"consecutiveEmpty"`
	ConsecutiveFail  int   `json:"consecutiveFailures"`
	Successes        int64 `json:"successes"`
	Failures         int64 `json:"failures"`
	// StaleServes counts how often a render fell back to a remembered value,
	// for any reason: the live fetch failed, or the source was held out and
	// never called. So it rises alongside Failures when a source is broken, and
	// on its own when pacing or a cooldown declined to spend.
	//
	// It counts rescues, not losses. A hold-out with nothing remembered leaves
	// the badge empty and never reaches here, so this number says nothing about
	// how many renders lost a rating.
	StaleServes int64 `json:"staleServes"`
	// CoolingOff is true while the source is held out of live renders after
	// refusing on rate-limit grounds. Cooldowns counts how often that started.
	CoolingOff bool  `json:"coolingOff"`
	Cooldowns  int64 `json:"cooldowns"`
	// CoolingOffBulk is the hold a catalogue sweep is under. It can be set while
	// the source still answers people normally, which is the whole point.
	CoolingOffBulk bool `json:"coolingOffBulk"`
	// HeldOutEmpty counts renders on the SHARED key that lost a rating, keyed by
	// the gate that refused. Unlike StaleServes these are the visible losses:
	// nothing was remembered, so the badge came out empty. Split by gate because
	// our own pacing and a source refusing us produce the same damage and want
	// opposite responses.
	//
	// Owner-keyed renders are not in here. They are in HeldOutEmptyOwnerKeyed,
	// and the damage is the sum of the two.
	//
	// An omitted map means none were lost, not that nothing was measured: a
	// source appears in this list at all only once it has been asked, so its
	// presence with no map here is a positive answer rather than a gap.
	HeldOutEmpty map[string]int64 `json:"heldOutEmpty,omitempty"`
	// HeldOutEmptyOwnerKeyed is the same count for renders carrying a caller's
	// own key. Kept apart so a change in how this server paces itself is visible
	// in HeldOutEmpty rather than buried under other people's spent allowances.
	HeldOutEmptyOwnerKeyed map[string]int64 `json:"heldOutEmptyOwnerKeyed,omitempty"`
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

// SplitGoodKey takes a key apart into the three fields GoodKey joined. A key
// that is not in that shape returns empty strings rather than a partial guess.
func SplitGoodKey(key string) (source, mediaType, id string) {
	parts := strings.SplitN(key, "|", 3)
	if len(parts) != 3 {
		return "", "", ""
	}
	return parts[0], parts[1], parts[2]
}

// Success records a fetch that carried ratings, remembers its result, and
// reports whether it recovered a source that was previously held out so the
// caller can log the recovery once. An answer carrying no ratings routes to
// Empty instead: a broken scrape answers exactly that way, and storing it would
// overwrite the good answer we still fall back to.
func (h *HealthTracker) Success(source, key string, meta *MediaMeta) (recovered bool) {
	if h == nil {
		return false
	}
	if meta == nil || len(meta.Ratings) == 0 {
		h.Empty(source)
		return false
	}
	h.mu.Lock()
	defer h.mu.Unlock()

	st := h.stateLocked(source)
	recovered = !st.healthy
	for _, until := range st.cooldownUntil {
		recovered = recovered || time.Now().Before(until)
	}
	st.healthy = true
	st.cooldownUntil = [callerClassCount]time.Time{}
	st.cooldownReason = [callerClassCount]string{}
	st.lastSuccess = time.Now()
	st.consecutiveFail = 0
	st.consecutiveEmpty = 0
	st.breakerTrips = 0
	st.successes++
	if _, contentType, _ := SplitGoodKey(key); contentType != "" {
		if st.lastRatedByType == nil {
			st.lastRatedByType = make(map[string]time.Time)
		}
		st.lastRatedByType[contentType] = time.Now()
	}

	h.rememberLocked(key, meta)
	return recovered
}

// Empty records that a source answered and carried no ratings. It is not a
// success: a scrape whose markup has changed answers this way, so nothing here
// marks the source healthy, clears a cooldown or resets a failure count.
// Successes still counts it, because the source was reachable.
func (h *HealthTracker) Empty(source string) {
	if h == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()

	st := h.stateLocked(source)
	st.consecutiveEmpty++
	st.successes++
}

// AnsweringFor reports whether a source has produced ratings for a content type
// within the last `within`. It is the discriminator for trusting an absence: a
// scrape whose markup has changed answers empty for everything, so a recent
// non-empty answer for the same content type says an empty one is about the
// title rather than about the source.
//
// A tracker that has not seen a non-empty answer yet reports false, so a restart
// distrusts every absence until the source answers once.
func (h *HealthTracker) AnsweringFor(source, contentType string, within time.Duration) bool {
	if h == nil || within <= 0 || contentType == "" {
		return false
	}
	h.mu.Lock()
	defer h.mu.Unlock()

	st, ok := h.sources[source]
	if !ok {
		return false
	}
	last, ok := st.lastRatedByType[contentType]
	return ok && time.Since(last) < within
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
	if h == nil {
		return false
	}
	// Only an error that says something about the source counts against it.
	// Everything else leaves its health alone: a title it does not have, a
	// request the caller abandoned, one of our own queues refusing before the
	// source ever saw it, or an error shape nobody has classified yet.
	//
	// This used to run the other way — count all but a listed few — and that
	// default is what let a per-title miss hold a healthy source off every
	// render, because any error nobody had thought about read as the source
	// being unwell. RecordsAgainstHealth says what counts, and why an
	// unrecognised error now counts for nothing.
	if !RecordsAgainstHealth(err) {
		// Declining to count is the whole of this change and it leaves no other
		// trace: the source stays healthy, nothing is held out, and no counter
		// moves. Without a line here the fix is only observable as an absence,
		// which is indistinguishable from it not running.
		if err != nil {
			slog.Default().Debug("Not counting an error against the source's health",
				"source", source, "error", err)
		}
		return false
	}
	h.mu.Lock()
	defer h.mu.Unlock()

	st := h.stateLocked(source)
	wasCooling := time.Now().Before(st.cooldownUntil[class])
	// A refusal a sweep provoked holds the sweep off. A refusal a person hit
	// holds everyone off: if the source will not answer an ordinary render it
	// will not answer a crawl either.
	//
	// Which classes count as a sweep is TreatedAsBulk's to decide.
	hold := func(until time.Time, reason string) bool {
		classes := make([]CallerClass, 0, callerClassCount)
		for c := CallerClass(0); int(c) < callerClassCount; c++ {
			if class == CallerInteractive || TreatedAsBulk(c) {
				classes = append(classes, c)
			}
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

// LastCooldownReason returns the reason a source was last held out for class,
// whether or not that hold is still in force. CooldownReason answers only while
// the hold stands, so it cannot name the gate a recovery just cleared.
func (h *HealthTracker) LastCooldownReason(source string, class CallerClass) string {
	if h == nil {
		return ""
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	st, ok := h.sources[source]
	if !ok {
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

// copyCounts returns a copy so a snapshot cannot be mutated into the tracker,
// and nil for an empty map so the field is omitted rather than serialised as {}.
func copyCounts(m map[string]int64) map[string]int64 {
	if len(m) == 0 {
		return nil
	}
	out := make(map[string]int64, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// NoteHeldOutEmpty records a render that lost a rating because the source was
// held out and nothing was remembered. gate names which constraint refused.
//
// ownerKeyed separates the two rather than discarding one: an owner-keyed render
// with an empty badge is a person looking at a poster with no rating, so it is
// real damage and belongs in the total. It is kept in its own tally because only
// the shared count answers "did our own pacing get better".
func (h *HealthTracker) NoteHeldOutEmpty(source, gate string, ownerKeyed bool) {
	if h == nil || gate == "" {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	st := h.stateLocked(source)
	target := &st.heldOutEmpty
	if ownerKeyed {
		target = &st.heldOutEmptyOwner
	}
	if *target == nil {
		*target = make(map[string]int64, 4)
	}
	(*target)[gate]++
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
			Source:           name,
			Healthy:          st.healthy,
			LastError:        st.lastError,
			ConsecutiveEmpty: st.consecutiveEmpty,
			ConsecutiveFail:  st.consecutiveFail,
			Successes:        st.successes,
			Failures:         st.failures,
			StaleServes:      st.staleServes,
			// The admin view reports the non-sweep hold: it is the one that
			// means a person's render is losing the source.
			CoolingOff: time.Now().Before(st.cooldownUntil[CallerInteractive]) ||
				time.Now().Before(st.cooldownUntil[CallerUnknown]),
			CoolingOffBulk:         time.Now().Before(st.cooldownUntil[CallerBulk]),
			Cooldowns:              st.cooldowns,
			HeldOutEmpty:           copyCounts(st.heldOutEmpty),
			HeldOutEmptyOwnerKeyed: copyCounts(st.heldOutEmptyOwner),
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
