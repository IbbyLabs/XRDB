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
