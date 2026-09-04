package server

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/provider"
)

type panelStub struct {
	name    string
	ratings []string
}

func (p *panelStub) Name() string            { return p.name }
func (p *panelStub) RatingSources() []string { return p.ratings }
func (p *panelStub) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	return &provider.MediaMeta{}, nil
}

// panelCalls records what the webhook was asked to do.
type panelCalls struct {
	mu      sync.Mutex
	posts   int
	patches int
	last    map[string]any
	// patchStatus is returned by the next PATCH when non-zero.
	patchStatus int
}

func (c *panelCalls) counts() (int, int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.posts, c.patches
}

func (c *panelCalls) payload() map[string]any {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.last
}

func panelServer(t *testing.T, calls *panelCalls) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var payload map[string]any
		_ = json.Unmarshal(body, &payload)

		calls.mu.Lock()
		calls.last = payload
		switch r.Method {
		case http.MethodPost:
			calls.posts++
		case http.MethodPatch:
			calls.patches++
		}
		status := calls.patchStatus
		calls.mu.Unlock()

		if r.URL.Query().Get("with_components") != "true" {
			t.Errorf("%s went out without with_components=true: %s", r.Method, r.URL)
		}
		if r.Method == http.MethodPatch && status != 0 {
			w.WriteHeader(status)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"999"}`))
	}))
	t.Cleanup(srv.Close)
	return srv
}

func panelPipeline(t *testing.T, names ...string) (*compose.Pipeline, *provider.HealthTracker) {
	t.Helper()
	reg := provider.NewRegistry()
	for _, n := range names {
		reg.Register(&panelStub{name: n, ratings: []string{n}})
	}
	p := compose.New(reg)
	health := provider.NewHealthTracker(10, time.Hour)
	p.SetHealthTracker(health)
	return p, health
}

func holdOut(t *testing.T, health *provider.HealthTracker, name string) {
	t.Helper()
	health.Failure(name, &provider.RateLimitError{
		Source: name, RetryAfter: time.Minute, Status: 429,
	}, provider.CallerInteractive)
	if !health.CoolingOff(name, provider.CallerInteractive) {
		t.Fatalf("setup: %s was never held out", name)
	}
}

func panelConfig(t *testing.T, url string) config.StatusPanel {
	t.Helper()
	return config.StatusPanel{
		WebhookURL:       url,
		Interval:         time.Minute,
		StatePath:        filepath.Join(t.TempDir(), "status-panel.json"),
		TrackerChannelID: "1486228870511464468",
	}
}

func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// The panel is edited when the state moves and left alone when it does not.
// A panel edited on a timer would say the same thing on every pass and give a
// reader no way to tell a fresh answer from a stale one.
func TestThePanelIsEditedOnlyWhenTheStateMoves(t *testing.T) {
	calls := &panelCalls{}
	srv := panelServer(t, calls)
	cfg := panelConfig(t, srv.URL)
	pipeline, health := panelPipeline(t, "mdblist", "omdb", "tmdb")
	poster := panelPoster{URL: srv.URL, Client: srv.Client()}
	ctx := context.Background()

	syncPanel(ctx, cfg, poster, pipeline, time.Now(), quietLogger())
	if posts, patches := calls.counts(); posts != 1 || patches != 0 {
		t.Fatalf("first pass posted %d and edited %d, want 1 and 0", posts, patches)
	}

	syncPanel(ctx, cfg, poster, pipeline, time.Now(), quietLogger())
	syncPanel(ctx, cfg, poster, pipeline, time.Now(), quietLogger())
	if posts, patches := calls.counts(); posts != 1 || patches != 0 {
		t.Fatalf("an unchanged state posted %d and edited %d, want 1 and 0", posts, patches)
	}

	holdOut(t, health, "mdblist")
	syncPanel(ctx, cfg, poster, pipeline, time.Now(), quietLogger())
	if posts, patches := calls.counts(); posts != 1 || patches != 1 {
		t.Fatalf("a moved state posted %d and edited %d, want 1 and 1", posts, patches)
	}
}

// A restart edits the panel already in the channel. Reposting would leave the
// old one there saying whatever it said when the process died.
func TestARestartEditsThePanelItAlreadyPosted(t *testing.T) {
	calls := &panelCalls{}
	srv := panelServer(t, calls)
	cfg := panelConfig(t, srv.URL)
	poster := panelPoster{URL: srv.URL, Client: srv.Client()}
	ctx := context.Background()

	first, _ := panelPipeline(t, "mdblist", "tmdb")
	syncPanel(ctx, cfg, poster, first, time.Now(), quietLogger())

	// A second pipeline with a different state stands in for the process
	// restarting: only the record on disk survives.
	second, secondHealth := panelPipeline(t, "mdblist", "tmdb")
	holdOut(t, secondHealth, "mdblist")
	syncPanel(ctx, cfg, poster, second, time.Now(), quietLogger())

	if posts, patches := calls.counts(); posts != 1 || patches != 1 {
		t.Fatalf("a restart posted %d and edited %d, want 1 and 1", posts, patches)
	}
}

// Someone deleting the panel by hand is a real state, not an error to log and
// give up on: without this the channel stays empty until the next restart.
func TestADeletedPanelIsPostedAgain(t *testing.T) {
	calls := &panelCalls{}
	srv := panelServer(t, calls)
	cfg := panelConfig(t, srv.URL)
	pipeline, health := panelPipeline(t, "mdblist", "tmdb")
	poster := panelPoster{URL: srv.URL, Client: srv.Client()}
	ctx := context.Background()

	syncPanel(ctx, cfg, poster, pipeline, time.Now(), quietLogger())

	calls.mu.Lock()
	calls.patchStatus = http.StatusNotFound
	calls.mu.Unlock()

	holdOut(t, health, "mdblist")
	syncPanel(ctx, cfg, poster, pipeline, time.Now(), quietLogger())

	posts, patches := calls.counts()
	if posts != 2 || patches != 1 {
		t.Fatalf("a deleted panel posted %d and edited %d, want 2 and 1", posts, patches)
	}
}

// The payload has to be Components V2 or Discord rejects it as empty, and the
// accent is the only part of a panel a reader takes in without reading.
func TestThePanelPayloadIsComponentsV2AndChangesAccent(t *testing.T) {
	calls := &panelCalls{}
	srv := panelServer(t, calls)
	cfg := panelConfig(t, srv.URL)
	pipeline, health := panelPipeline(t, "mdblist", "tmdb")
	poster := panelPoster{URL: srv.URL, Client: srv.Client()}
	ctx := context.Background()

	syncPanel(ctx, cfg, poster, pipeline, time.Now(), quietLogger())
	payload := calls.payload()
	if got := payload["flags"]; got != float64(discordComponentsV2) {
		t.Errorf("flags = %v, want %d", got, discordComponentsV2)
	}
	container := payload["components"].([]any)[0].(map[string]any)
	if got := container["type"]; got != float64(componentContainer) {
		t.Errorf("outer component type = %v, want %d", got, componentContainer)
	}
	if got := container["accent_color"]; got != float64(accentWorking) {
		t.Errorf("a working panel used accent %v, want %d", got, accentWorking)
	}

	holdOut(t, health, "mdblist")
	syncPanel(ctx, cfg, poster, pipeline, time.Now(), quietLogger())
	container = calls.payload()["components"].([]any)[0].(map[string]any)
	if got := container["accent_color"]; got != float64(accentDegraded) {
		t.Errorf("a degraded panel used accent %v, want %d", got, accentDegraded)
	}
}

// The panel names a badge the way the configurator names it. Two spellings of
// one badge is the reader's problem, not ours, and the labels drift silently
// because nothing else reads both files.
func TestThePanelNamesRatingsLikeTheConfigurator(t *testing.T) {
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatalf("cannot resolve the repository root: %v", err)
	}
	src, err := os.ReadFile(filepath.Join(root, "web", "components", "configurator-types.ts"))
	if err != nil {
		t.Fatalf("cannot read the configurator's options: %v", err)
	}
	block := string(src)
	start := strings.Index(block, "export const RATING_OPTIONS")
	if start < 0 {
		t.Fatal("RATING_OPTIONS is no longer declared where this test looks for it")
	}
	end := strings.Index(block[start:], "];")
	if end < 0 {
		t.Fatal("RATING_OPTIONS is not terminated where this test looks for it")
	}
	block = block[start : start+end]

	pattern := regexp.MustCompile(`id:\s*'([^']+)',\s*label:\s*'([^']+)'`)
	matches := pattern.FindAllStringSubmatch(block, -1)
	if len(matches) == 0 {
		t.Fatal("no rating options were parsed, the declaration's shape has changed")
	}
	if len(matches) != len(ratingLabels) {
		t.Fatalf("the configurator lists %d ratings and the panel names %d",
			len(matches), len(ratingLabels))
	}
	for i, m := range matches {
		if ratingLabels[i].ID != m[1] || ratingLabels[i].Label != m[2] {
			t.Errorf("rating %d is %s/%s in the configurator and %s/%s in the panel",
				i, m[1], m[2], ratingLabels[i].ID, ratingLabels[i].Label)
		}
	}
}

// Names read in the configurator's order so related badges stay adjacent, not
// in the alphabetical order the health snapshot hands them over in.
func TestUnavailableRatingsAreNamedInConfiguratorOrder(t *testing.T) {
	got := labelRatings([]string{"rtaudience", "imdb", "letterboxd", "rt"})
	want := []string{"IMDb", "RT Critics", "RT Audience", "Letterboxd"}
	if !slicesEqual(got, want) {
		t.Errorf("labelRatings() = %v, want %v", got, want)
	}
}

// A badge a provider declares before the label table knows it appears as its
// id. Dropping it would report fewer outages than there are.
func TestAnUnknownRatingIsNamedRatherThanDropped(t *testing.T) {
	got := labelRatings([]string{"imdb", "somethingnew"})
	want := []string{"IMDb", "somethingnew"}
	if !slicesEqual(got, want) {
		t.Errorf("labelRatings() = %v, want %v", got, want)
	}
}

// A panel that never posts because nothing configured it reads exactly like one
// that is working. The first release shipped it off for six hours and no line
// anywhere said so.
func TestAPanelThatIsOffSaysSo(t *testing.T) {
	// The configured panel logs from its own goroutine, so the buffer is written
	// while the test reads it.
	buf := &lockedBuffer{}
	logger := slog.New(slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelInfo}))
	pipeline, _ := panelPipeline(t, "tmdb")

	// The control: configured, so the "on" line is what appears. Without it an
	// implementation that logged nothing at all would satisfy the rest.
	srv := panelServer(t, &panelCalls{})
	cfg := config.Config{StatusPanel: panelConfig(t, srv.URL)}
	StartStatusPanel(context.Background(), cfg, pipeline, logger)
	deadline := time.Now().Add(5 * time.Second)
	for !strings.Contains(buf.String(), "The public status panel is on") {
		if time.Now().After(deadline) {
			t.Fatalf("setup: a configured panel did not report itself on: %s", buf.String())
		}
		time.Sleep(10 * time.Millisecond)
	}

	buf.Reset()
	StartStatusPanel(context.Background(), config.Config{}, pipeline, logger)
	line := buf.String()
	if !strings.Contains(line, "The public status panel is off") {
		t.Errorf("an unconfigured panel returned in silence: %q", line)
	}
	if !strings.Contains(line, "no webhook is configured") {
		t.Errorf("the off line did not name the reason: %q", line)
	}
}

// lockedBuffer is a bytes.Buffer safe to read while a goroutine writes to it.
type lockedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func (b *lockedBuffer) Reset() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.buf.Reset()
}
