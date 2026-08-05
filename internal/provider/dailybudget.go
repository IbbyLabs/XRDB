package provider

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
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
	// simklDefaultDailyLimit is SIMKL's number rather than ours. They raised it
	// from 10000 to 15000 and nothing announced it, so it can move again without
	// warning; XRDB_SIMKL_DAILY_LIMIT is how an operator corrects it without a
	// release. A stale value here silently narrows the reserve, because the
	// bulk cut-off is limit minus reserve.
	simklDefaultDailyLimit  = 15000
	simklDefaultBulkReserve = 6000
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

// SIMKL meters per application, so its pool survives our restarts and our count
// of it must too. Holding spent in memory handed bulk callers a fresh allowance
// on every deploy, against a pool that had not refilled — so the reserve
// protected less the more often the service shipped.
const (
	dailyBudgetFile  = "daily-budgets.json"
	dailyBudgetShape = 1
)

type dailyBudgetSnapshot struct {
	Shape int `json:"shape"`
	// Day is the UTC day the counts belong to. A count from an earlier day is
	// discarded rather than resumed.
	Day   time.Time      `json:"day"`
	Spent map[string]int `json:"spent"`
}

var dailyBudgetPath struct {
	mu   sync.Mutex
	path string
}

// SetDailyBudgetPath points the daily counters at a file and resumes today's
// count from it. A count stored under an earlier day is dropped.
func SetDailyBudgetPath(dir string, logger *slog.Logger) {
	if dir == "" {
		return
	}
	if logger == nil {
		logger = slog.Default()
	}
	path := filepath.Join(dir, dailyBudgetFile)
	dailyBudgetPath.mu.Lock()
	dailyBudgetPath.path = path
	dailyBudgetPath.mu.Unlock()

	data, err := os.ReadFile(path)
	if err != nil {
		if !os.IsNotExist(err) {
			logger.Warn("Could not read the stored daily allowance counts; they restart from zero",
				"path", path, "error", err)
		}
		return
	}
	var snap dailyBudgetSnapshot
	if err := json.Unmarshal(data, &snap); err != nil || snap.Shape != dailyBudgetShape {
		logger.Warn("Could not use the stored daily allowance counts; they restart from zero",
			"path", path, "stored_shape", snap.Shape, "error", err)
		return
	}

	today := time.Now().UTC().Truncate(dailyWindow)
	if !snap.Day.UTC().Truncate(dailyWindow).Equal(today) {
		logger.Info("Discarded daily allowance counts from an earlier day",
			"stored_day", snap.Day.UTC().Format("2006-01-02"))
		return
	}
	for source, spent := range snap.Spent {
		b := dailyBudgetFor(source)
		if b == nil || spent <= 0 {
			continue
		}
		b.mu.Lock()
		b.rollLocked(b.now())
		b.spent = spent
		b.mu.Unlock()
		logger.Info("Resumed a source's daily allowance count", "source", source, "spent", spent)
	}
}

// SaveDailyBudgets writes the counts so a restart resumes the day rather than
// starting it again.
func SaveDailyBudgets() error {
	dailyBudgetPath.mu.Lock()
	path := dailyBudgetPath.path
	dailyBudgetPath.mu.Unlock()
	if path == "" {
		return nil
	}

	now := time.Now().UTC().Truncate(dailyWindow)
	spent := make(map[string]int)
	for source, b := range dailyBudgets() {
		b.mu.Lock()
		b.rollLocked(b.now())
		spent[source] = b.spent
		b.mu.Unlock()
	}

	data, err := json.Marshal(dailyBudgetSnapshot{Shape: dailyBudgetShape, Day: now, Spent: spent})
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
