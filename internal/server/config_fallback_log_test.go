package server

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"xrdb_rewrite/internal/config"
)

// An unrecognised config renders the default, which is deliberate: a poster URL
// carrying a deleted profile is pasted into a media app, and breaking the artwork
// is worse than showing something. Saying nothing about it is not deliberate — it
// made a working feature look broken, because every unrecognised value renders
// byte-identically and reads as "the setting does nothing".
func TestAnUnresolvableConfigIsLogged(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/poster/tt0111161?config=no-such-profile", nil))

	out := buf.String()
	if !strings.Contains(out, "could not be resolved") {
		t.Errorf("an unresolvable config rendered silently; log was: %q", out)
	}
	if !strings.Contains(out, "no-such-profile") {
		t.Errorf("the log did not name the config that failed; log was: %q", out)
	}
}

// The ordinary case must stay quiet: "default" is the absence of a config, not a
// broken one, and warning on every default render would bury the real signal.
func TestTheDefaultConfigIsNotLoggedAsAFailure(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/poster/tt0111161", nil))

	if strings.Contains(buf.String(), "could not be resolved") {
		t.Error("a render with no config logged a resolution failure")
	}
}
