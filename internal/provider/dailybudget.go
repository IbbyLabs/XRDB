package provider

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"math"
	"net/url"
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
	// mdblistDefaultBulkReservePct is the share of MDBList's daily allowance a
	// catalogue sweep may not spend. A percentage rather than a count because
	// the allowance goes by plan and is learned from the responses.
	//
	// Larger than mdblistDefaultReservePct, which governs the rate every caller
	// is paced at, so the two defences engage in cost order: sweeps stop at 40%
	// remaining and cost a catalogue refresh a minute, and the rate floor at 25%
	// costs a person waiting on a poster. Equal defaults fire them together and
	// waste the cheaper one. The same 40% Simkl reserves.
	mdblistDefaultBulkReservePct float64 = 40
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
	// observedLimits is what each credential reported, and ringSize how many
	// there are. spent counts every key together, so the limit it is compared
	// against has to be the whole ring's, not whichever key answered last.
	observedLimits map[string]int
	ringSize       int
	// reservePct scales the reserve with the limit for a source whose limit is
	// discovered rather than known. Zero keeps reserve as given.
	reservePct float64
	// inReserve holds the gear the last log line described.
	inReserve bool
	// cutOffHour and limitHour are the UTC hours the day crossed the bulk
	// cut-off and reached the limit. A day that crossed at midnight and a day
	// that never crossed must not read the same, so nil is "never" and 0 is a
	// real hour rather than both meaning nothing.
	cutOffHour *int
	limitHour  *int
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

// setLimit records a limit the source reported. A limit that arrives from the
// service is the only one worth holding a reserve against: the allowance goes by
// plan, so a number compiled in is right for one plan and wrong for the rest.
func (b *dailyBudget) setLimit(key string, limit int) {
	if b == nil || limit <= 0 {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if key != "" {
		if b.observedLimits == nil {
			b.observedLimits = map[string]int{}
		}
		b.observedLimits[key] = limit
	}
	total := b.ringLimitLocked(limit)
	if b.limit == total {
		return
	}
	was := b.limit
	b.limit = total
	if b.reservePct > 0 {
		b.reserve = int(float64(total) * b.reservePct / 100)
	}
	b.log().Info("A source reported its daily allowance",
		"source", b.source, "limit", total, "previous_limit", was, "reserve", b.reserve,
		"keys_observed", len(b.observedLimits), "ring_size", b.ringSize)
}

// ringLimitLocked is what the whole ring may spend. A key that has not answered
// yet is projected at the smallest limit seen, because the ring only reaches it
// once the keys before it are spent, which the reserve itself can prevent for
// the life of the process. Projecting low can only stop sweeps early; projecting
// high overruns the reserve on the last key, which is the one case where an
// interactive caller loses the source with nothing behind it.
func (b *dailyBudget) ringLimitLocked(latest int) int {
	if len(b.observedLimits) == 0 {
		return latest
	}
	total, smallest := 0, 0
	for _, l := range b.observedLimits {
		total += l
		if smallest == 0 || l < smallest {
			smallest = l
		}
	}
	if unseen := b.ringSize - len(b.observedLimits); unseen > 0 {
		total += unseen * smallest
	}
	return total
}

// setRingSize tells the budget how many credentials exist. Pushed in by the
// provider that owns the ring, which the budget cannot see from here.
func (b *dailyBudget) setRingSize(n int) {
	if b == nil || n <= 0 {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.ringSize = n
}

// noteObservedDailyLimit hands a limit read from a response to the source's
// budget. Called from the governor, which sees the headers.
func noteObservedDailyLimit(source, key string, limit int) {
	dailyBudgetFor(source).setLimit(keyFingerprint(key), limit)
}

// credentialParam names the query parameter each metered source carries its
// credential in. The budget counts every key together, so it has to know which
// one answered, and the two sources spell it differently.
var credentialParam = map[string]string{
	"mdblist": "apikey",
	"simkl":   "client_id",
}

// credentialFromRequest reads the credential a request used, empty when the
// source does not carry one in the URL. An unnamed source records no key, which
// leaves the budget on a single limit rather than guessing.
func credentialFromRequest(source string, u *url.URL) string {
	if u == nil {
		return ""
	}
	param, ok := credentialParam[strings.ToLower(source)]
	if !ok {
		return ""
	}
	return u.Query().Get(param)
}

// keyFingerprint identifies a credential without holding it. The budget only
// needs to tell two keys apart, and a map keyed on the secret itself puts it
// somewhere a dump or a stray log line could reach.
func keyFingerprint(key string) string {
	if key == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(key))
	return hex.EncodeToString(sum[:6])
}

// noteKeyRingSize records how many credentials a source rotates through.
func noteKeyRingSize(source string, n int) {
	dailyBudgetFor(source).setRingSize(n)
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
		b.cutOffHour = nil
		b.limitHour = nil
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
	b.markLocked(b.now())
	b.reportLocked()
}

// markLocked notes the hour a threshold was first passed. When a day spends its
// allowance decides whether a reserve that shrinks with the clock helps or
// hurts, and a daily total is silent on it.
func (b *dailyBudget) markLocked(now time.Time) {
	hour := now.UTC().Hour()
	// Only the spend that takes the count past a threshold writes the mark. A
	// process that starts already over never saw the crossing, and recording
	// the hour it noticed would put a late-looking day in the history that
	// nobody could tell from a real one. Absent is the honest answer.
	if b.cutOffHour == nil && crossed(b.spent, b.limit-b.reserve) {
		b.cutOffHour = &hour
	}
	if b.limitHour == nil && crossed(b.spent, b.limit) {
		h := hour
		b.limitHour = &h
	}
}

// crossed reports whether this spend is the one that passed the threshold,
// rather than merely one taken while past it.
func crossed(spent, threshold int) bool {
	return spent >= threshold && spent-1 < threshold
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
	// MDBList reports its own allowance on every response, so the limit here is
	// a placeholder until one arrives and the reserve is a percentage of it.
	// XRDB_MDBLIST_DAILY_LIMIT pins it for an instance whose responses carry no
	// headers.
	mdbLimit := envInt("XRDB_MDBLIST_DAILY_LIMIT", mdblistAssumedDailyLimit, 1, 10_000_000)
	mdbReservePct := envFloat("XRDB_MDBLIST_SWEEP_RESERVE_PCT", mdblistDefaultBulkReservePct, 0, 100)
	mdb := newDailyBudget("mdblist", mdbLimit, int(float64(mdbLimit)*mdbReservePct/100))
	mdb.reservePct = mdbReservePct
	return map[string]*dailyBudget{
		"simkl":   newDailyBudget("simkl", limit, reserve),
		"mdblist": mdb,
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
	// Marks is today's crossings per source, so a restart mid-day does not
	// forget when the cut-off went.
	Marks map[string]dailyBudgetMarks `json:"marks,omitempty"`
}

// dailyBudgetMarks is when a day passed its thresholds, in UTC hours. Both are
// absent rather than zero when the day never reached them: an hour of 0 is
// midnight, and a day that crossed at midnight is not a day that never crossed.
type dailyBudgetMarks struct {
	CutOffHour *int `json:"cut_off_hour,omitempty"`
	LimitHour  *int `json:"limit_hour,omitempty"`
}

// dailyBudgetDay is one finished day's total. Kept as a date string because it
// is read by a person deciding what a typical day looks like.
type dailyBudgetDay struct {
	Day   string                      `json:"day"`
	Spent map[string]int              `json:"spent"`
	Marks map[string]dailyBudgetMarks `json:"marks,omitempty"`
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
		if m, ok := snap.Marks[source]; ok {
			b.cutOffHour = m.CutOffHour
			b.limitHour = m.LimitHour
		}
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
	marks := make(map[string]dailyBudgetMarks)
	for source, b := range dailyBudgets() {
		b.mu.Lock()
		b.rollLocked(b.now())
		spent[source] = b.spent
		if b.cutOffHour != nil || b.limitHour != nil {
			marks[source] = dailyBudgetMarks{CutOffHour: b.cutOffHour, LimitHour: b.limitHour}
		}
		b.mu.Unlock()
	}
	if len(marks) == 0 {
		marks = nil
	}

	data, err := json.Marshal(dailyBudgetSnapshot{
		Shape: dailyBudgetShape, Day: now, Spent: spent, Marks: marks,
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
			history = append(history, dailyBudgetDay{Day: day, Spent: snap.Spent, Marks: snap.Marks})
		}
	}
	if len(history) > dailyBudgetHistoryDays {
		history = history[len(history)-dailyBudgetHistoryDays:]
	}
	return history
}
