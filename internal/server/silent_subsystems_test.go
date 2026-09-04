package server

import (
	"context"
	"log/slog"
	"strings"
	"testing"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/config"
)

// offLine runs start against a logger and returns what it wrote. The "on" paths
// of these subsystems log before their goroutine, but the control below waits
// anyway rather than assuming that stays true.
func offLine(t *testing.T, start func(context.Context, *slog.Logger)) string {
	t.Helper()
	buf := &lockedBuffer{}
	logger := slog.New(slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelInfo}))
	start(context.Background(), logger)
	return buf.String()
}

// waitFor polls a buffer so a line written from a goroutine is not read before
// it lands. A control that fails on timing looks exactly like one that fails on
// the code being wrong.
func waitFor(t *testing.T, buf *lockedBuffer, want string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !strings.Contains(buf.String(), want) {
		if time.Now().After(deadline) {
			t.Fatalf("setup: never saw %q, got: %s", want, buf.String())
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// A feature that never runs because a setting is missing reads exactly like one
// working quietly. The status panel shipped switched off for six hours that way.
func TestCacheWarmingThatIsOffSaysSo(t *testing.T) {
	cases := []struct {
		name, want string
		cfg        config.CacheWarm
	}{
		{"not enabled", "it is not enabled", config.CacheWarm{}},
		{"no surfaces", "no surfaces are selected", config.CacheWarm{Enabled: true}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			line := offLine(t, func(ctx context.Context, l *slog.Logger) {
				StartCacheWarmSchedule(ctx, config.Config{CacheWarm: tc.cfg}, nil, nil, l)
			})
			if !strings.Contains(line, "Cache warming is off") {
				t.Errorf("returned in silence: %q", line)
			}
			if !strings.Contains(line, tc.want) {
				t.Errorf("did not name the reason %q: %s", tc.want, line)
			}
		})
	}
}

// The control. Without it an implementation that logged nothing at all, or the
// same line for every state, would satisfy the cases above.
func TestCacheWarmingThatIsOnSaysSo(t *testing.T) {
	buf := &lockedBuffer{}
	logger := slog.New(slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelInfo}))
	pipeline, _ := panelPipeline(t, "tmdb")

	rc, err := cache.New(t.TempDir(), time.Hour, 100, 8<<20)
	if err != nil {
		t.Fatalf("render cache: %v", err)
	}
	t.Cleanup(func() { rc.Close() })
	cfg := config.Config{CacheWarm: config.CacheWarm{
		Enabled: true, PostersURL: "http://example.invalid/catalog", Interval: time.Hour,
	}}
	StartCacheWarmSchedule(context.Background(), cfg, pipeline, rc, logger)
	waitFor(t, buf, "Cache warming is on")
	if strings.Contains(buf.String(), "Cache warming is off") {
		t.Errorf("a configured warmer reported itself off: %s", buf.String())
	}
}

// Turning the folder writer on and forgetting the library roots produces no
// files and, before this, no explanation.
func TestTheFolderWriterThatIsOffSaysSo(t *testing.T) {
	cases := []struct {
		name, want string
		cfg        config.Config
	}{
		{"not enabled", "it is not enabled", config.Config{}},
		{"no interval", "its interval is not a positive duration",
			config.Config{FolderWriter: true, LibraryRoots: []string{"/tmp"}}},
		{"no roots", "no library roots are configured",
			config.Config{FolderWriter: true, FolderWriterInterval: time.Hour}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			line := offLine(t, func(ctx context.Context, l *slog.Logger) {
				StartFolderWriterSchedule(ctx, tc.cfg, nil, nil, l)
			})
			if !strings.Contains(line, "The folder writer is off") {
				t.Errorf("returned in silence: %q", line)
			}
			if !strings.Contains(line, tc.want) {
				t.Errorf("did not name the reason %q: %s", tc.want, line)
			}
		})
	}
}

// The control for the folder writer, same reason as the warmer's.
func TestTheFolderWriterThatIsOnSaysSo(t *testing.T) {
	buf := &lockedBuffer{}
	logger := slog.New(slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelInfo}))
	cfg := config.Config{
		FolderWriter: true, FolderWriterInterval: time.Hour, LibraryRoots: []string{t.TempDir()},
	}
	StartFolderWriterSchedule(context.Background(), cfg, nil, nil, logger)
	waitFor(t, buf, "The folder writer is on")
	if strings.Contains(buf.String(), "The folder writer is off") {
		t.Errorf("a configured folder writer reported itself off: %s", buf.String())
	}
}

// SIMKL id caching is nil when SIMKL is not in the registry, which is a
// configuration outcome rather than a failure.
func TestSIMKLIDCachingThatIsOffSaysSo(t *testing.T) {
	line := offLine(t, func(ctx context.Context, l *slog.Logger) {
		StartSIMKLIDCacheSnapshots(ctx, nil, l)
	})
	if !strings.Contains(line, "SIMKL id caching is off") {
		t.Errorf("returned in silence: %q", line)
	}
	if !strings.Contains(line, "SIMKL is not configured") {
		t.Errorf("did not name the reason: %s", line)
	}
}
