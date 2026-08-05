package provider

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// SIMKL meters by the day against the application's allowance rather than per
// key, so every caller draws on one pool and the badge disappears for all of
// them once it is spent. dailyBudget counts a source's calls over the day and
// holds back a reserve only interactive callers may spend.
const (
	simklDefaultDailyLimit  = 10000
	simklDefaultBulkReserve = 3000
)

type dailyBudget struct {
	source  string
	limit   int
	reserve int

	// now is swapped in tests so no test waits on a real clock.
	now func() time.Time

	mu     sync.Mutex
	logger *slog.Logger
	day    time.Time
	spent  int
	// inReserve holds the gear the last log line described.
	inReserve bool
}

func newDailyBudget(source string, limit, reserve int) *dailyBudget {
	return &dailyBudget{source: source, limit: limit, reserve: reserve, now: time.Now}
}

func (b *dailyBudget) log() *slog.Logger {
	if b.logger == nil {
		return slog.Default()
	}
	return b.logger
}

// rollLocked starts a fresh count when the day turns.
func (b *dailyBudget) rollLocked(now time.Time) {
	day := now.UTC().Truncate(dailyWindow)
	if !day.Equal(b.day) {
		b.day = day
		b.spent = 0
		b.inReserve = false
	}
}

// spend records one call against the day's allowance.
func (b *dailyBudget) spend() {
	if b == nil {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.rollLocked(b.now())
	b.spent++
}

// allowsBulk reports whether a bulk caller may still spend. Interactive callers
// are never held back; the reserve exists for them.
func (b *dailyBudget) allowsBulk() bool {
	if b == nil {
		return true
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.rollLocked(b.now())

	ok := b.spent < b.limit-b.reserve
	if !ok != b.inReserve {
		b.inReserve = !ok
		if !ok {
			b.log().Warn("A source's daily allowance has reached its reserve; bulk callers are held out until it refills",
				"source", b.source, "spent", b.spent, "limit", b.limit, "reserve", b.reserve)
		}
	}
	return ok
}

// dailyBudgets holds the sources metered by a daily application allowance.
// Built once, because the limits come from the environment.
var dailyBudgets = sync.OnceValue(func() map[string]*dailyBudget {
	limit := envInt("XRDB_SIMKL_DAILY_LIMIT", simklDefaultDailyLimit, 1, 10_000_000)
	// A reserve equal to the limit holds bulk callers off the source entirely.
	reserve := envInt("XRDB_SIMKL_BULK_RESERVE", simklDefaultBulkReserve, 0, limit)
	return map[string]*dailyBudget{
		"simkl": newDailyBudget("simkl", limit, reserve),
	}
})

func dailyBudgetFor(source string) *dailyBudget {
	return dailyBudgets()[strings.ToLower(source)]
}

// BulkCallerMayReach reports whether a bulk caller may still spend a source's
// daily allowance. A source with no daily allowance is always reachable. It is
// a var so a test can drive the gate without spending a real allowance.
var BulkCallerMayReach = func(source string) bool { return dailyBudgetFor(source).allowsBulk() }

func envInt(name string, fallback, low, high int) int {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v < low || v > high {
		slog.Default().Warn("Ignoring an out-of-range or unreadable setting and keeping the default",
			"variable", name, "value", raw, "min", low, "max", high, "default", fallback)
		return fallback
	}
	return v
}
