package provider

import (
	"encoding/json"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writeSnapshot(t *testing.T, path string, body string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func readSnapshot(t *testing.T, path string) dailyBudgetSnapshot {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var snap dailyBudgetSnapshot
	if err := json.Unmarshal(data, &snap); err != nil {
		t.Fatal(err)
	}
	return snap
}

// A file written before the history field existed must still resume today's
// count. Losing it is the exact failure the escalation behind this was opened
// for, and a format change is how it would happen for real.
func TestAFileWithoutHistoryStillCarriesTodaysCount(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, dailyBudgetFile)
	today := time.Now().UTC().Truncate(dailyWindow).Format(time.RFC3339)
	writeSnapshot(t, path, `{"shape":1,"day":"`+today+`","spent":{"simkl":9049}}`)

	var snap dailyBudgetSnapshot
	data, _ := os.ReadFile(path)
	if err := json.Unmarshal(data, &snap); err != nil {
		t.Fatalf("a shape-1 file no longer parses: %v", err)
	}
	if snap.Shape != dailyBudgetShape {
		t.Fatalf("shape %d is no longer accepted, so an existing file would be discarded", snap.Shape)
	}
	if snap.Spent["simkl"] != 9049 {
		t.Errorf("spent = %d, want 9049 carried through", snap.Spent["simkl"])
	}
	if len(snap.History) != 0 {
		t.Errorf("history = %v, want empty rather than a reason to reject the file", snap.History)
	}
}

// The point of the whole change: a finished day is kept rather than reset away.
func TestAFinishedDayMovesIntoTheHistory(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, dailyBudgetFile)
	writeSnapshot(t, path, `{"shape":1,"day":"2026-08-11T00:00:00Z","spent":{"simkl":11500}}`)

	today := time.Date(2026, 8, 12, 0, 0, 0, 0, time.UTC)
	history := rollHistory(path, today)
	if len(history) != 1 {
		t.Fatalf("history = %v, want the finished day filed", history)
	}
	if history[0].Day != "2026-08-11" || history[0].Spent["simkl"] != 11500 {
		t.Errorf("filed %+v, want 2026-08-11 at 11500", history[0])
	}
}

// Saving repeatedly through one day must not file the same day again and again.
func TestTheStoredDayIsFiledOnlyOnce(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, dailyBudgetFile)
	writeSnapshot(t, path, `{"shape":1,"day":"2026-08-12T00:00:00Z","spent":{"simkl":10},`+
		`"history":[{"day":"2026-08-11","spent":{"simkl":11500}}]}`)

	today := time.Date(2026, 8, 12, 0, 0, 0, 0, time.UTC)
	if got := rollHistory(path, today); len(got) != 1 {
		t.Errorf("history = %v, want the one day it already had", got)
	}
}

// The file is bounded, or a long-lived instance grows it without limit.
func TestTheHistoryIsCapped(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, dailyBudgetFile)
	days := make([]dailyBudgetDay, 0, dailyBudgetHistoryDays+3)
	for i := 1; i <= dailyBudgetHistoryDays+3; i++ {
		days = append(days, dailyBudgetDay{
			Day:   time.Date(2026, 7, i, 0, 0, 0, 0, time.UTC).Format("2006-01-02"),
			Spent: map[string]int{"simkl": i},
		})
	}
	snap := dailyBudgetSnapshot{
		Shape:   dailyBudgetShape,
		Day:     time.Date(2026, 8, 11, 0, 0, 0, 0, time.UTC),
		Spent:   map[string]int{"simkl": 1},
		History: days,
	}
	data, _ := json.Marshal(snap)
	writeSnapshot(t, path, string(data))

	got := rollHistory(path, time.Date(2026, 8, 12, 0, 0, 0, 0, time.UTC))
	if len(got) != dailyBudgetHistoryDays {
		t.Fatalf("history kept %d days, want the cap of %d", len(got), dailyBudgetHistoryDays)
	}
	if got[len(got)-1].Day != "2026-08-11" {
		t.Errorf("newest kept is %s, want the day just finished", got[len(got)-1].Day)
	}
}

// A save writes the history through rather than dropping it, which is what makes
// it survive the restart the log cannot.
func TestSavingCarriesTheHistoryForward(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, dailyBudgetFile)
	writeSnapshot(t, path, `{"shape":1,"day":"2026-08-11T00:00:00Z","spent":{"simkl":11500}}`)

	SetDailyBudgetPath(dir, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err := SaveDailyBudgets(); err != nil {
		t.Fatal(err)
	}

	snap := readSnapshot(t, path)
	if len(snap.History) != 1 || snap.History[0].Day != "2026-08-11" {
		t.Fatalf("history after a save = %+v, want the finished day", snap.History)
	}
	if snap.History[0].Spent["simkl"] != 11500 {
		t.Errorf("filed %d, want 11500", snap.History[0].Spent["simkl"])
	}
}

// The collision the whole design turns on: a day that crossed at midnight and a
// day that never crossed must not read the same. An empty value doing double
// duty as "unset" and "none" is the defect BUG-247 was opened for, one layer
// over.
func TestCrossingAtMidnightIsNotTheSameAsNeverCrossing(t *testing.T) {
	midnight := 0
	crossed := dailyBudgetMarks{CutOffHour: &midnight}
	never := dailyBudgetMarks{}

	a, err := json.Marshal(crossed)
	if err != nil {
		t.Fatal(err)
	}
	b, err := json.Marshal(never)
	if err != nil {
		t.Fatal(err)
	}
	if string(a) == string(b) {
		t.Fatalf("both serialise to %s, so a midnight crossing is indistinguishable from none", a)
	}

	var back dailyBudgetMarks
	if err := json.Unmarshal(a, &back); err != nil {
		t.Fatal(err)
	}
	if back.CutOffHour == nil || *back.CutOffHour != 0 {
		t.Errorf("a midnight crossing came back as %v, want hour 0", back.CutOffHour)
	}
	var none dailyBudgetMarks
	if err := json.Unmarshal(b, &none); err != nil {
		t.Fatal(err)
	}
	if none.CutOffHour != nil {
		t.Errorf("a day that never crossed came back as %v, want absent", none.CutOffHour)
	}
}

// The hour is recorded when the count first passes the cut-off, and not moved
// by later spending — the question is when a day crossed, not when it last was
// over.
func TestTheCutOffHourIsTheFirstCrossing(t *testing.T) {
	clock := &fakeClock{t: time.Date(2026, 8, 12, 9, 0, 0, 0, time.UTC)}
	b := &dailyBudget{source: "simkl", limit: 100, reserve: 40, reportEvery: time.Hour, now: clock.now}

	for range 60 {
		b.spend()
	}
	if b.cutOffHour == nil || *b.cutOffHour != 9 {
		t.Fatalf("cut-off hour = %v, want 9", b.cutOffHour)
	}
	if b.limitHour != nil {
		t.Errorf("limit hour = %v, want absent — the limit was not reached", b.limitHour)
	}

	clock.advance(3 * time.Hour)
	for range 40 {
		b.spend()
	}
	if *b.cutOffHour != 9 {
		t.Errorf("cut-off hour moved to %d, want the first crossing at 9", *b.cutOffHour)
	}
	if b.limitHour == nil || *b.limitHour != 12 {
		t.Fatalf("limit hour = %v, want 12", b.limitHour)
	}
}

// A finished day carries its marks into the history, or the fortnight records
// totals again and answers the wrong question.
func TestTheFiledDayKeepsItsMarks(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, dailyBudgetFile)
	writeSnapshot(t, path, `{"shape":1,"day":"2026-08-11T00:00:00Z","spent":{"simkl":11500},`+
		`"marks":{"simkl":{"cut_off_hour":9}}}`)

	got := rollHistory(path, time.Date(2026, 8, 12, 0, 0, 0, 0, time.UTC))
	if len(got) != 1 {
		t.Fatalf("history = %v, want the finished day", got)
	}
	m, ok := got[0].Marks["simkl"]
	if !ok || m.CutOffHour == nil || *m.CutOffHour != 9 {
		t.Errorf("filed marks = %+v, want the cut-off at hour 9", got[0].Marks)
	}
}

// Today's exact case: the feature shipped after the day had already crossed, so
// the crossing happened under a binary that could not see it. Recording the hour
// the new process noticed would put a late-looking day in the fortnight that
// nobody could tell from a real one.
func TestABudgetStartingPastTheCutOffRecordsNoHour(t *testing.T) {
	clock := &fakeClock{t: time.Date(2026, 8, 12, 16, 0, 0, 0, time.UTC)}
	b := &dailyBudget{source: "simkl", limit: 15000, reserve: 6000, reportEvery: time.Hour, now: clock.now}
	b.day = clock.now().UTC().Truncate(dailyWindow)
	b.spent = 9089 // resumed from a file written before the field existed

	b.spend()

	if b.cutOffHour != nil {
		t.Errorf("cut-off hour = %d, want absent — this process never saw the crossing", *b.cutOffHour)
	}
}

// And the ordinary path still records, or the change would buy honesty by
// recording nothing ever.
func TestTheCrossingSpendStillRecordsTheHour(t *testing.T) {
	clock := &fakeClock{t: time.Date(2026, 8, 12, 9, 0, 0, 0, time.UTC)}
	b := &dailyBudget{source: "simkl", limit: 100, reserve: 40, reportEvery: time.Hour, now: clock.now}

	for range 59 {
		b.spend()
	}
	if b.cutOffHour != nil {
		t.Fatalf("control: marked at %d before the threshold, so the rest of this test would be vacuous", *b.cutOffHour)
	}
	b.spend() // the 60th takes it to the cut-off
	if b.cutOffHour == nil || *b.cutOffHour != 9 {
		t.Errorf("cut-off hour = %v, want 9 recorded by the crossing spend", b.cutOffHour)
	}
}
