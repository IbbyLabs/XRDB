package provider

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// The user agents below are real ones taken from an hour of production traffic
// on /poster. They are the reason classification cannot use the profile key:
// Stremio sends keyless poster requests routinely, so keyless traffic is mostly
// people waiting on a render.
func TestClassifyUserAgentKeepsRealClientsInteractive(t *testing.T) {
	tests := []struct {
		name string
		ua   string
		want CallerClass
	}{
		{"the catalogue sweeper names itself", "AIOMetadata/2.10.0", CallerBulk},
		{"and does so whatever its version", "AIOMetadata/3.0.1-beta", CallerBulk},
		{"case is not a way past it", "aiometadata/2.10.0", CallerBulk},
		{"Stremio on Android", "okhttp/5.3.2", CallerInteractive},
		{"Stremio on an Android TV", "Dalvik/2.1.0 (Linux; U; Android 11; Smart TV Build/QT)", CallerInteractive},
		{"Stremio on a MiTV box", "Dalvik/2.1.0 (Linux; U; Android 9; MiTV-MSSP0 Build/PI)", CallerInteractive},
		{"another Stremio client", "ktor-client", CallerInteractive},
		{"a browser", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", CallerInteractive},
		{"an unidentified CDN, which must not be guessed at", "Netlify ImageCDN/0e4cb37", CallerInteractive},
		{"no user agent at all", "", CallerInteractive},
		{"a name that merely contains the sweeper's", "MyProxy (via AIOMetadata/2.10.0)", CallerInteractive},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ClassifyUserAgent(tt.ua); got != tt.want {
				t.Errorf("%q classified as %s; want %s", tt.ua, got, tt.want)
			}
		})
	}
}

func TestCallerClassDefaultsToInteractive(t *testing.T) {
	if got := CallerClassFrom(context.Background()); got != CallerInteractive {
		t.Errorf("a context carrying no class reported %s; an unclassified caller must be interactive", got)
	}
	ctx := WithCallerClass(context.Background(), CallerBulk)
	if got := CallerClassFrom(ctx); got != CallerBulk {
		t.Errorf("the class did not survive the context: got %s", got)
	}
}

// The reserve is what interactive callers spend after bulk traffic is held off,
// so the boundary is the whole behaviour.
func TestDailyBudgetHoldsBackTheReserve(t *testing.T) {
	b := newDailyBudget("simkl", 100, 30)

	if !b.allowsBulk() {
		t.Fatal("a bulk caller was refused on an untouched allowance")
	}
	for i := 0; i < 69; i++ {
		b.spend()
	}
	if !b.allowsBulk() {
		t.Errorf("a bulk caller was refused with %d of 100 spent; the reserve starts at 70", b.spent)
	}
	b.spend()
	if b.allowsBulk() {
		t.Errorf("a bulk caller reached the source with %d of 100 spent; the last 30 are reserved", b.spent)
	}

	// Interactive callers keep spending past the reserve. That is what it is for.
	for i := 0; i < 25; i++ {
		b.spend()
	}
	if b.spent != 95 {
		t.Errorf("the count is %d; interactive spending must still be counted", b.spent)
	}
}

func TestDailyBudgetRefillsWhenTheDayTurns(t *testing.T) {
	now := time.Date(2026, 8, 5, 23, 0, 0, 0, time.UTC)
	b := newDailyBudget("simkl", 10, 5)
	b.now = func() time.Time { return now }

	for i := 0; i < 6; i++ {
		b.spend()
	}
	if b.allowsBulk() {
		t.Fatal("a bulk caller reached the source inside the reserve")
	}

	now = now.Add(2 * time.Hour)
	if !b.allowsBulk() {
		t.Error("the allowance did not refill when the day turned")
	}
	if b.spent != 0 {
		t.Errorf("the count carried %d calls into the new day", b.spent)
	}
}

// A reserve as large as the limit is the lever for holding bulk traffic off a
// source entirely.
func TestDailyBudgetCanHoldBulkOffEntirely(t *testing.T) {
	b := newDailyBudget("simkl", 10, 10)
	if b.allowsBulk() {
		t.Error("a bulk caller reached a source whose whole allowance is reserved")
	}
}

// A source with no daily allowance is not metered here, and a nil budget must
// not refuse it.
func TestSourceWithoutADailyAllowanceIsReachable(t *testing.T) {
	if !dailyBudgetFor("tmdb").allowsBulk() {
		t.Error("a source with no daily allowance refused a bulk caller")
	}
	dailyBudgetFor("tmdb").spend() // must not panic
}

// The reserve is only protection if the day's count survives a deploy. SIMKL
// meters per application, so its pool does not reset when we restart and ours
// must not either.
//
// The assertion is the refusal, not the number: a test that only checks the
// count reloads passes even if the reserve is never consulted afterwards.
func TestABulkCallerIsStillRefusedAfterARestart(t *testing.T) {
	dir := t.TempDir()
	SetDailyBudgetPath(dir, quietProviderLogger())

	b := dailyBudgetFor("simkl")
	if b == nil {
		t.Fatal("simkl has no daily budget")
	}
	t.Cleanup(func() {
		b.mu.Lock()
		b.spent, b.inReserve = 0, false
		b.mu.Unlock()
	})

	// Spend past the reserve, so a bulk caller is refused.
	b.mu.Lock()
	b.rollLocked(b.now())
	b.spent = b.limit - b.reserve + 1
	spentBefore := b.spent
	b.mu.Unlock()
	if b.allowsBulk() {
		t.Fatal("a bulk caller was allowed past the reserve, so the test proves nothing")
	}
	if err := SaveDailyBudgets(); err != nil {
		t.Fatalf("save: %v", err)
	}

	// The restart: the count goes back to zero exactly as a new process starts.
	b.mu.Lock()
	b.spent, b.inReserve, b.day = 0, false, time.Time{}
	b.mu.Unlock()
	if !b.allowsBulk() {
		t.Fatal("a fresh counter refuses bulk callers, so reloading cannot be what does it")
	}

	SetDailyBudgetPath(dir, quietProviderLogger())
	if b.allowsBulk() {
		t.Errorf("a bulk caller was allowed after a restart; the day's count did not resume (was %d)", spentBefore)
	}
}

// A count from an earlier day is not resumed, or a quiet night would carry
// yesterday's spend into a fresh allowance.
func TestYesterdaysCountIsNotResumed(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, dailyBudgetFile)
	stale := dailyBudgetSnapshot{
		Shape: dailyBudgetShape,
		Day:   time.Now().UTC().Add(-48 * time.Hour).Truncate(dailyWindow),
		Spent: map[string]int{"simkl": 9000},
	}
	data, _ := json.Marshal(stale)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	b := dailyBudgetFor("simkl")
	b.mu.Lock()
	b.spent, b.inReserve = 0, false
	b.mu.Unlock()
	t.Cleanup(func() {
		b.mu.Lock()
		b.spent, b.inReserve = 0, false
		b.mu.Unlock()
	})

	SetDailyBudgetPath(dir, quietProviderLogger())
	if !b.allowsBulk() {
		t.Error("yesterday's count was resumed into today's allowance")
	}
}

func quietProviderLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }
