package provider

import (
	"container/list"
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
}

type goodEntry struct {
	key       string
	meta      *MediaMeta
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
func (h *HealthTracker) Success(source, key string, meta *MediaMeta) {
	if h == nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()

	st := h.stateLocked(source)
	st.healthy = true
	st.lastSuccess = time.Now()
	st.consecutiveFail = 0
	st.successes++

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

// Failure records a failed fetch. A plain not-found is not a health problem:
// the source answered, the title simply is not there.
func (h *HealthTracker) Failure(source string, err error) {
	if h == nil || errors.Is(err, errNotFound) {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()

	st := h.stateLocked(source)
	st.healthy = false
	st.lastFailure = time.Now()
	st.consecutiveFail++
	st.failures++
	if err != nil {
		st.lastError = truncateError(err.Error())
	}
}

// LastGood returns a remembered result for key, if one is still valid. It
// counts the fallback against the source so an operator can see that renders
// are only still correct because they are being served from memory.
func (h *HealthTracker) LastGood(source, key string) (*MediaMeta, bool) {
	if h == nil {
		return nil, false
	}
	h.mu.Lock()
	defer h.mu.Unlock()

	el, ok := h.entries[key]
	if !ok {
		return nil, false
	}
	ge := el.Value.(*goodEntry)
	if time.Now().After(ge.expiresAt) {
		h.lru.Remove(el)
		delete(h.entries, key)
		return nil, false
	}
	h.lru.MoveToBack(el)
	h.stateLocked(source).staleServes++
	return ge.meta, true
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
