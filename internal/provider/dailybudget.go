package provider

import (
	"encoding/json"
	"log/slog"
	"math"
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
	// dailyBudgetDefaultReportSeconds is how often the remaining allowance is
	// written to the log. Crossing into the reserve is reported as it happens;
	// this covers the stretch either side of it.
	dailyBudgetDefaultReportSeconds float64 = 300
)

type dailyBudget struct {
	source  string
	limit   int
	reserve int

	// now is swapped in tests so no test waits on a real clock.
	now func() time.Time

	// reportEvery is how often the headroom is written to the log; reported is
	// when it last was.
	reportEvery time.Duration

	mu       sync.Mutex
	logger   *slog.Logger
	day      time.Time
	reported time.Time
	spent    int
	// inReserve holds the gear the last log line described.
	inReserve bool
}

func newDailyBudget(source string, limit, reserve int) *dailyBudget {
	every := envFloat("XRDB_DAILY_BUDGET_REPORT_SECONDS", dailyBudgetDefaultReportSeconds, 10, 3600)
	return &dailyBudget{
		source:      source,
		limit:       limit,
		reserve:     reserve,
		reportEvery: time.Duration(every * float64(time.Second)),
		now:         time.Now,
	}
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
		// The finished total is named on the way past. Without it the only
		// record of what a day spent is whichever periodic line happened to be
		// last, and that is lost with the container.
		if !b.day.IsZero() && b.spent > 0 {
			b.log().Info("A source's daily allowance rolled over to a new day",
				"source", b.source, "finished_day", b.day.Format("2006-01-02"),
				"spent", b.spent, "limit", b.limit)
		}
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
	b.reportLocked()
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
				b.fieldsLocked()...)
		}
	}
	b.reportLocked()
	return ok
}

// fieldsLocked builds the figures a reader needs to tell pacing from exhaustion.
// bulk_cut_off is the number a hold-out is about, not the limit.
func (b *dailyBudget) fieldsLocked() []any {
	return []any{
		"source", b.source,
		"spent", b.spent,
		"limit", b.limit,
		"reserve", b.reserve,
		"bulk_cut_off", b.limit - b.reserve,
		"remaining", b.limit - b.spent,
		"remaining_pct", math.Round(float64(b.limit-b.spent)/float64(b.limit)*1000) / 10,
	}
}

// reportLocked writes the headroom no more than once per interval. Called from
// every spend rather than only where bulk callers are gated: a day of purely
// interactive traffic spends the same allowance and would otherwise report none
// of it. The fields are built inside the interval check, so the cost follows the
// logging rather than the traffic.
//
// The wording stays distinct from the rate governor's own allowance line: they
// are separate mechanisms and a reader matching on the message must not
// conflate them.
func (b *dailyBudget) reportLocked() {
	if now := b.now(); now.Sub(b.reported) >= b.reportEvery {
		b.reported = now
		b.log().Info("Reporting a source's daily call budget and its bulk cut-off", b.fieldsLocked()...)
	}
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
	// History is the finished days, oldest first. It is additive rather than a
	// shape change so a file written before it existed still loads, and a file
	// carrying it still loads in a build that ignores it.
	History []dailyBudgetDay `json:"history,omitempty"`
}

// dailyBudgetDay is one finished day's total. Kept as a date string because it
// is read by a person deciding what a typical day looks like.
type dailyBudgetDay struct {
	Day   string         `json:"day"`
	Spent map[string]int `json:"spent"`
}

// dailyBudgetHistoryDays bounds the file. Two weeks answers what a typical day
// spends without the snapshot growing without limit.
const dailyBudgetHistoryDays = 14

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

	data, err := json.Marshal(dailyBudgetSnapshot{
		Shape: dailyBudgetShape, Day: now, Spent: spent,
		History: rollHistory(path, now),
	})
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

// rollHistory carries the stored history forward, moving the stored day into it
// once that day is over. The figure is whatever the last save before midnight
// recorded, which is the finest the ticker offers; a day already present is not
// added twice.
//
// It reads the file rather than tracking the boundary in memory, so a restart
// across midnight still files the finished day instead of losing it.
func rollHistory(path string, today time.Time) []dailyBudgetDay {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var snap dailyBudgetSnapshot
	if err := json.Unmarshal(data, &snap); err != nil {
		return nil
	}

	history := snap.History
	stored := snap.Day.UTC().Truncate(dailyWindow)
	if !stored.IsZero() && stored.Before(today) && len(snap.Spent) > 0 {
		day := stored.Format("2006-01-02")
		seen := false
		for _, h := range history {
			if h.Day == day {
				seen = true
				break
			}
		}
		if !seen {
			history = append(history, dailyBudgetDay{Day: day, Spent: snap.Spent})
		}
	}
	if len(history) > dailyBudgetHistoryDays {
		history = history[len(history)-dailyBudgetHistoryDays:]
	}
	return history
}
