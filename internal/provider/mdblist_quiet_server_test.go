package provider_test

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/server"
)

type staticArt struct{ data []byte }

func (f staticArt) Fetch(context.Context, string) ([]byte, error) { return f.data, nil }

func quietArtPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, 300, 450))
	for y := range 450 {
		for x := range 300 {
			img.SetNRGBA(x, y, color.NRGBA{uint8(x), uint8(y), uint8(x ^ y), 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

type quietRig struct {
	handler  http.Handler
	cache    *cache.Cache
	pipeline *compose.Pipeline
	health   *provider.HealthTracker
	calls    *atomic.Int32
	clock    *atomic.Int64
}

const (
	quietRenderTTL    = 72 * time.Hour
	quietQueueHeldTTL = 15 * time.Minute
)

// newQuietRig is a server whose only rating source is a real MDBList on a
// local stand-in, with a two-minute quiet window read from a settable clock.
func newQuietRig(t *testing.T, now time.Time) *quietRig {
	t.Helper()
	// Other tests in this package spend the shared daily budget.
	mayReach := provider.BulkCallerMayReach
	provider.BulkCallerMayReach = func(string) bool { return true }
	t.Cleanup(func() { provider.BulkCallerMayReach = mayReach })
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		answer := map[string]any{
			"score":   79,
			"ratings": []map[string]any{{"source": "imdb", "value": 7.9, "votes": 250000}},
		}
		if r.Method != http.MethodPost {
			_ = json.NewEncoder(w).Encode(answer)
			return
		}
		var body struct {
			IDs []string `json:"ids"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		out := make([]map[string]any, 0, len(body.IDs))
		for _, id := range body.IDs {
			item := map[string]any{"type": "movie", "ids": map[string]any{"imdb": id}}
			for k, v := range answer {
				item[k] = v
			}
			out = append(out, item)
		}
		_ = json.NewEncoder(w).Encode(out)
	}))
	t.Cleanup(upstream.Close)

	clock := &atomic.Int64{}
	clock.Store(now.UnixNano())
	mdb := provider.NewMDBListForTest("serverkey", upstream.URL, 2,
		func() time.Time { return time.Unix(0, clock.Load()).UTC() })

	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{Title: "Test", PosterURL: "http://fake/poster.jpg",
			IMDbID: "tt0111161", Year: 1994},
	})
	reg.Register(mdb)
	pipeline := compose.NewWithFetcher(reg, staticArt{data: quietArtPNG(t)})
	health := provider.NewHealthTracker(0, 0)
	pipeline.SetHealthTracker(health)
	pipeline.SetRatingsCacheTTL(24 * time.Hour)

	store, err := profile.Open(filepath.Join(t.TempDir(), "profiles.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	p := &profile.Profile{ID: "quiet-cfg", Type: "poster", Config: json.RawMessage(`{"ratings":["imdb"]}`)}
	if err := store.Save(p); err != nil {
		t.Fatal(err)
	}
	c, err := cache.New(t.TempDir(), quietRenderTTL, 100, 8<<20)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.Close)
	h := server.NewHandler("test", store, nil, pipeline, c, config.Config{
		DegradedCacheTTL:  20 * time.Minute,
		HeldOutCacheTTL:   3 * time.Hour,
		QueueHeldCacheTTL: quietQueueHeldTTL,
		CacheTTL:          quietRenderTTL,
	})
	return &quietRig{handler: h, cache: c, pipeline: pipeline, health: health, calls: &calls, clock: clock}
}

func (r *quietRig) render(t *testing.T, userAgent string) *httptest.ResponseRecorder {
	t.Helper()
	rq := httptest.NewRequest(http.MethodGet, "/poster/tt0111161?config=quiet-cfg", nil)
	rq.Header.Set("User-Agent", userAgent)
	rr := httptest.NewRecorder()
	r.handler.ServeHTTP(rr, rq)
	if rr.Code != http.StatusOK {
		t.Fatalf("got %d, want 200: %s", rr.Code, rr.Body.String())
	}
	return rr
}

func maxAge(t *testing.T, cc string) time.Duration {
	t.Helper()
	_, v, ok := strings.Cut(cc, "max-age=")
	if !ok {
		return 0
	}
	n, err := strconv.Atoi(strings.TrimSpace(strings.Split(v, ",")[0]))
	if err != nil {
		t.Fatalf("Cache-Control %q: %v", cc, err)
	}
	return time.Duration(n) * time.Second
}

func (r *quietRig) assertHealthUntouched(t *testing.T) {
	t.Helper()
	for _, class := range []provider.CallerClass{provider.CallerBulk, provider.CallerUnknown, provider.CallerInteractive} {
		if r.health.CoolingOff("mdblist", class) {
			t.Errorf("mdblist is cooling off for %s callers", class)
		}
	}
	for _, s := range r.health.Snapshot() {
		if s.Source == "mdblist" && (s.Failures != 0 || s.ConsecutiveFail != 0 || s.BreakerTrips != 0) {
			t.Errorf("mdblist health moved: %+v", s)
		}
	}
}

var quietMoment = time.Date(2026, 11, 28, 3, 0, 30, 0, time.UTC)

// The interactive render at the same moment is the reference: MDBList answers,
// the badge is drawn, and the render is held for the normal term.
func interactiveReference(t *testing.T) (etag string) {
	t.Helper()
	rig := newQuietRig(t, quietMoment)
	rr := rig.render(t, "okhttp/4.12.0")
	if rig.calls.Load() == 0 {
		t.Fatal("an interactive render at :00:30 did not reach MDBList")
	}
	cc := rr.Header().Get("Cache-Control")
	if got := maxAge(t, cc); got <= quietQueueHeldTTL {
		t.Errorf("interactive Cache-Control = %q, want the normal term", cc)
	}
	e, ok := rig.cache.Get(rr.Header().Get("X-Cache-Key"))
	if !ok {
		t.Fatal("the interactive render was not stored")
	}
	if time.Until(e.ExpiresAt) <= quietQueueHeldTTL {
		t.Errorf("interactive render stored until %s, want the normal term", e.ExpiresAt)
	}
	if rig.pipeline.CachedRatings() != 1 {
		t.Errorf("ratings cache holds %d answers after an interactive render, want 1", rig.pipeline.CachedRatings())
	}
	rig.assertHealthUntouched(t)
	return rr.Header().Get("ETag")
}

// A sweep's render inside the quiet window goes out without the MDBList badge,
// and nothing holds it for long: not the render cache, not a downstream cache,
// and not the ratings cache. Once the window ends the next render has the badge.
func TestASweepRenderInTheQuietWindowIsShortLivedAndInteractiveIsUnaffected(t *testing.T) {
	full := interactiveReference(t)

	for _, tc := range []struct {
		name   string
		agent  string
		stored bool
	}{
		{"named sweep", "AIOMetadata/1.0", false},
		{"no user agent", "", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rig := newQuietRig(t, quietMoment)
			rr := rig.render(t, tc.agent)

			if n := rig.calls.Load(); n != 0 {
				t.Fatalf("MDBList was called %d times for a sweep at :00:30", n)
			}
			if rr.Header().Get("ETag") == full {
				t.Fatal("the held-out render is identical to the one with the MDBList badge")
			}
			cc := rr.Header().Get("Cache-Control")
			if !strings.Contains(cc, "no-store") {
				if got := maxAge(t, cc); got <= 0 || got > quietQueueHeldTTL {
					t.Errorf("Cache-Control = %q, want no-store or at most %s", cc, quietQueueHeldTTL)
				}
			}
			e, ok := rig.cache.Get(rr.Header().Get("X-Cache-Key"))
			if ok != tc.stored {
				t.Errorf("stored = %v, want %v", ok, tc.stored)
			}
			if ok && time.Until(e.ExpiresAt) > quietQueueHeldTTL+time.Minute {
				t.Errorf("held-out render stored until %s, want at most %s", e.ExpiresAt, quietQueueHeldTTL)
			}
			if n := rig.pipeline.CachedRatings(); n != 0 {
				t.Errorf("ratings cache holds %d answers for a held-out lookup, want 0", n)
			}
			rig.assertHealthUntouched(t)

			// After the window the sweep reaches MDBList and gets the badge.
			rig.cache.Purge()
			rig.clock.Store(time.Date(2026, 11, 28, 3, 2, 0, 0, time.UTC).UnixNano())
			after := rig.render(t, tc.agent)
			if rig.calls.Load() == 0 {
				t.Fatal("a sweep at :02:00 did not reach MDBList")
			}
			if after.Header().Get("ETag") != full {
				t.Error("the render after the window does not match the one with the badge")
			}
			rig.assertHealthUntouched(t)
		})
	}
}
