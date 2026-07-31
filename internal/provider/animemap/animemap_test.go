package animemap

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// sampleDataset mirrors the Fribb/anime-lists mini-list shape (synthetic IDs).
// imdb_id is an array as of the 2026-06 dataset format change.
const sampleDataset = `[
  {"type":"TV","mal_id":21,"anilist_id":21,"kitsu_id":12,"imdb_id":["tt0388629"],"themoviedb_id":{"tv":37854},"tvdb_id":81797},
  {"type":"MOVIE","mal_id":199,"anilist_id":199,"kitsu_id":176,"imdb_id":["tt0245429"],"themoviedb_id":{"movie":129},"season":{"tvdb":1,"tmdb":1}},
  {"type":"TV","mal_id":50000,"anilist_id":60000,"kitsu_id":70000,"imdb_id":["tt9999999"],"themoviedb_id":{"tv":4242},"season":{"tvdb":2,"tmdb":2}},
  {"type":"TV","mal_id":51,"anilist_id":61,"kitsu_id":71,"imdb_id":["tt9999999"],"themoviedb_id":{"tv":4242},"season":{"tvdb":1,"tmdb":1}},
  {"type":"TV","mal_id":300,"anilist_id":300,"kitsu_id":300,"imdb_id":["tt3333333","tt4444444"],"themoviedb_id":{"tv":9999}},
  {"type":"TV","anime-planet_id":"slug-only"}
]`

// sampleSupplement mirrors the nattadasu/animeApi row shape (synthetic IDs).
// The last two rows exercise primary precedence and a row with no target IDs.
const sampleSupplement = `[
  {"title":"Gap Movie","imdb":"tt5550000","themoviedb":555000,"themoviedb_type":"movie","myanimelist":5551,"anilist":5552,"kitsu":5553},
  {"title":"Gap TV","imdb":"tt5560000","themoviedb":556000,"themoviedb_type":"tv","myanimelist":5561,"anilist":5562,"kitsu":5563},
  {"title":"Overlap must not override primary","imdb":"tt0388629","themoviedb":37854,"themoviedb_type":"tv","myanimelist":999999,"anilist":999999,"kitsu":999999},
  {"title":"no usable ids","imdb":"tt0000000"}
]`

func newTestMapper(t *testing.T, datasetURL, fallbackURL string) *Mapper {
	t.Helper()
	if fallbackURL == "" {
		fallbackURL = "off"
	}
	return New(Options{
		CacheDir:      t.TempDir(),
		DatasetURL:    datasetURL,
		MirrorURL:     datasetURL,
		FallbackURL:   fallbackURL,
		SupplementURL: "off", // exercise the primary path in isolation
	})
}

// eventually polls cond until it returns true or the deadline passes. The
// supplement loads in the background, so gap lookups become available only
// after its first download completes.
func eventually(cond func() bool) bool {
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return cond()
}

// roundTripperFunc adapts a function to http.RoundTripper for instrumenting
// outbound requests in tests.
type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func mustHost(t *testing.T, rawURL string) string {
	t.Helper()
	u, err := url.Parse(rawURL)
	if err != nil {
		t.Fatalf("parse %q: %v", rawURL, err)
	}
	return u.Host
}

func TestResolveFromDataset(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(sampleDataset))
	}))
	defer srv.Close()

	m := newTestMapper(t, srv.URL, "")

	tests := []struct {
		name, mediaType, id string
		want                IDs
		ok                  bool
	}{
		{"imdb tv", "poster", "tt0388629", IDs{MAL: 21, AniList: 21, Kitsu: 12}, true},
		{"imdb movie", "poster", "tt0245429", IDs{MAL: 199, AniList: 199, Kitsu: 176}, true},
		{"tmdb movie numeric", "poster", "129", IDs{MAL: 199, AniList: 199, Kitsu: 176}, true},
		{"tmdb tv numeric via backdrop", "backdrop", "37854", IDs{MAL: 21, AniList: 21, Kitsu: 12}, true},
		{"tmdb tv numeric via poster falls through", "poster", "37854", IDs{MAL: 21, AniList: 21, Kitsu: 12}, true},
		{"season 1 preferred over season 2", "poster", "tt9999999", IDs{MAL: 51, AniList: 61, Kitsu: 71}, true},
		{"multi-imdb first id", "poster", "tt3333333", IDs{MAL: 300, AniList: 300, Kitsu: 300}, true},
		{"multi-imdb second id", "poster", "tt4444444", IDs{MAL: 300, AniList: 300, Kitsu: 300}, true},
		{"non-anime", "poster", "tt0468569", IDs{}, false},
		{"garbage", "poster", "not-an-id", IDs{}, false},
		{"empty", "poster", "", IDs{}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := m.Resolve(context.Background(), tt.mediaType, tt.id)
			if ok != tt.ok || got != tt.want {
				t.Errorf("Resolve(%q, %q) = (%+v, %v), want (%+v, %v)",
					tt.mediaType, tt.id, got, ok, tt.want, tt.ok)
			}
		})
	}
}

func TestDatasetPersistedToDiskAndReused(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		_, _ = w.Write([]byte(sampleDataset))
	}))
	defer srv.Close()

	dir := t.TempDir()
	m1 := New(Options{CacheDir: dir, DatasetURL: srv.URL, MirrorURL: srv.URL, FallbackURL: "off", SupplementURL: "off"})
	if _, ok := m1.Resolve(context.Background(), "poster", "tt0388629"); !ok {
		t.Fatal("first mapper: expected mapping")
	}
	if hits.Load() != 1 {
		t.Fatalf("expected 1 dataset download, got %d", hits.Load())
	}
	if _, err := os.Stat(filepath.Join(dir, datasetFileName)); err != nil {
		t.Fatalf("expected dataset file on disk: %v", err)
	}

	// A fresh mapper over the same cache dir must not re-download.
	m2 := New(Options{CacheDir: dir, DatasetURL: srv.URL, MirrorURL: srv.URL, FallbackURL: "off", SupplementURL: "off"})
	if _, ok := m2.Resolve(context.Background(), "poster", "tt0388629"); !ok {
		t.Fatal("second mapper: expected mapping from disk cache")
	}
	if hits.Load() != 1 {
		t.Fatalf("expected disk reuse (1 download), got %d", hits.Load())
	}
}

func TestMirrorUsedWhenPrimaryFails(t *testing.T) {
	mirror := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(sampleDataset))
	}))
	defer mirror.Close()
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer primary.Close()

	m := New(Options{
		CacheDir:      t.TempDir(),
		DatasetURL:    primary.URL,
		MirrorURL:     mirror.URL,
		FallbackURL:   "off",
		SupplementURL: "off",
	})
	if _, ok := m.Resolve(context.Background(), "poster", "tt0388629"); !ok {
		t.Fatal("expected mapping via mirror")
	}
}

func TestBadDatasetDoesNotReplaceGoodCache(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, datasetFileName)
	if err := os.WriteFile(path, []byte(sampleDataset), 0o644); err != nil {
		t.Fatal(err)
	}
	// Make the cache stale so a refresh is attempted.
	old := time.Now().Add(-30 * 24 * time.Hour)
	if err := os.Chtimes(path, old, old); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"not":"an array"}`))
	}))
	defer srv.Close()

	m := New(Options{CacheDir: dir, DatasetURL: srv.URL, MirrorURL: srv.URL, FallbackURL: "off", SupplementURL: "off"})
	if _, ok := m.Resolve(context.Background(), "poster", "tt0388629"); !ok {
		t.Fatal("expected mapping from existing cache despite bad refresh body")
	}
	// Give the async refresh a moment, then confirm the good cache survived.
	time.Sleep(100 * time.Millisecond)
	data, err := os.ReadFile(path)
	if err != nil || string(data) != sampleDataset {
		t.Fatalf("good cache was replaced or unreadable: err=%v", err)
	}
}

func TestFallbackResolvesAndCaches(t *testing.T) {
	dataset := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(sampleDataset))
	}))
	defer dataset.Close()

	var fbHits atomic.Int32
	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fbHits.Add(1)
		if r.URL.Query().Get("id") == "tt7654321" {
			_ = json.NewEncoder(w).Encode([]map[string]any{
				{"myanimelist": 777, "anilist": 888, "kitsu": 999},
			})
			return
		}
		_ = json.NewEncoder(w).Encode([]map[string]any{})
	}))
	defer fallback.Close()

	m := New(Options{
		CacheDir:      t.TempDir(),
		DatasetURL:    dataset.URL,
		MirrorURL:     dataset.URL,
		FallbackURL:   fallback.URL,
		SupplementURL: "off",
	})

	got, ok := m.Resolve(context.Background(), "poster", "tt7654321")
	want := IDs{MAL: 777, AniList: 888, Kitsu: 999}
	if !ok || got != want {
		t.Fatalf("fallback resolve = (%+v, %v), want (%+v, true)", got, ok, want)
	}

	// Second hit must come from the fallback cache.
	if _, ok := m.Resolve(context.Background(), "poster", "tt7654321"); !ok {
		t.Fatal("expected cached fallback mapping")
	}
	if fbHits.Load() != 1 {
		t.Fatalf("expected 1 fallback call, got %d", fbHits.Load())
	}

	// Misses are negative-cached too.
	if _, ok := m.Resolve(context.Background(), "poster", "tt1111111"); ok {
		t.Fatal("expected fallback miss")
	}
	if _, ok := m.Resolve(context.Background(), "poster", "tt1111111"); ok {
		t.Fatal("expected cached fallback miss")
	}
	if fbHits.Load() != 2 {
		t.Fatalf("expected 2 fallback calls total, got %d", fbHits.Load())
	}
}

func TestNoDatasetNoFallbackResolvesNothing(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	m := newTestMapper(t, srv.URL, "")
	if _, ok := m.Resolve(context.Background(), "poster", "tt0388629"); ok {
		t.Fatal("expected no mapping when dataset and fallback are unavailable")
	}
}

// TestSupplementFillsGapAndPrimaryWins verifies the supplement resolves IMDb/
// TMDB ids the primary lacks, while the primary still wins on shared ids.
func TestSupplementFillsGapAndPrimaryWins(t *testing.T) {
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(sampleDataset))
	}))
	defer primary.Close()
	supplement := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(sampleSupplement))
	}))
	defer supplement.Close()

	m := New(Options{
		CacheDir:      t.TempDir(),
		DatasetURL:    primary.URL,
		MirrorURL:     primary.URL,
		SupplementURL: supplement.URL,
		FallbackURL:   "off",
	})

	// Primary wins where both carry the id (supplement must not override it).
	if got, ok := m.Resolve(context.Background(), "poster", "tt0388629"); !ok || got != (IDs{MAL: 21, AniList: 21, Kitsu: 12}) {
		t.Fatalf("primary precedence: got (%+v,%v), want ({21 21 12}, true)", got, ok)
	}

	cases := []struct {
		name, mediaType, id string
		want                IDs
	}{
		{"supplement imdb movie", "poster", "tt5550000", IDs{MAL: 5551, AniList: 5552, Kitsu: 5553}},
		{"supplement tmdb movie", "poster", "555000", IDs{MAL: 5551, AniList: 5552, Kitsu: 5553}},
		{"supplement imdb tv", "poster", "tt5560000", IDs{MAL: 5561, AniList: 5562, Kitsu: 5563}},
		{"supplement tmdb tv via backdrop", "backdrop", "556000", IDs{MAL: 5561, AniList: 5562, Kitsu: 5563}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if !eventually(func() bool {
				got, ok := m.Resolve(context.Background(), tc.mediaType, tc.id)
				return ok && got == tc.want
			}) {
				got, ok := m.Resolve(context.Background(), tc.mediaType, tc.id)
				t.Fatalf("supplement resolve %q: got (%+v,%v), want (%+v,true)", tc.id, got, ok, tc.want)
			}
		})
	}

	// A supplement row with no usable target IDs is not indexed.
	if _, ok := m.Resolve(context.Background(), "poster", "tt0000000"); ok {
		t.Error("expected no mapping for supplement row without target ids")
	}
}

// TestSupplementDisabledWhenOff verifies SupplementURL:"off" never fetches the
// supplement and never resolves supplement-only ids.
func TestSupplementDisabledWhenOff(t *testing.T) {
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(sampleDataset))
	}))
	defer primary.Close()

	// Instrument the client to prove no request reaches anything but the
	// primary while the supplement is disabled.
	primaryHost := mustHost(t, primary.URL)
	var nonPrimary atomic.Int32
	client := &http.Client{Transport: roundTripperFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != primaryHost {
			nonPrimary.Add(1)
		}
		return http.DefaultTransport.RoundTrip(r)
	})}

	m := New(Options{
		CacheDir:      t.TempDir(),
		DatasetURL:    primary.URL,
		MirrorURL:     primary.URL,
		SupplementURL: "off",
		FallbackURL:   "off",
		HTTPClient:    client,
	})

	if _, ok := m.Resolve(context.Background(), "poster", "tt0388629"); !ok {
		t.Fatal("expected primary mapping with supplement off")
	}
	// A supplement-only id never resolves while the supplement is disabled.
	for i := 0; i < 5; i++ {
		if _, ok := m.Resolve(context.Background(), "poster", "tt5550000"); ok {
			t.Fatal("supplement-only id resolved while supplement disabled")
		}
		time.Sleep(20 * time.Millisecond)
	}
	if n := nonPrimary.Load(); n != 0 {
		t.Fatalf("unexpected non-primary outbound requests while supplement disabled: %d", n)
	}
}

// TestPrimaryColdLoadIsSingleFlight verifies that concurrent first callers wait
// for the primary's blocking cold-load instead of falling through, and that the
// dataset is downloaded only once.
func TestPrimaryColdLoadIsSingleFlight(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		time.Sleep(150 * time.Millisecond) // simulate a slow cold download
		_, _ = w.Write([]byte(sampleDataset))
	}))
	defer srv.Close()

	m := New(Options{
		CacheDir:      t.TempDir(),
		DatasetURL:    srv.URL,
		MirrorURL:     srv.URL,
		FallbackURL:   "off",
		SupplementURL: "off",
	})

	const n = 8
	var wg sync.WaitGroup
	var resolved atomic.Int32
	wg.Add(n)
	for i := 0; i < n; i++ {
		go func() {
			defer wg.Done()
			if _, ok := m.Resolve(context.Background(), "poster", "tt0388629"); ok {
				resolved.Add(1)
			}
		}()
	}
	wg.Wait()

	if got := resolved.Load(); got != n {
		t.Fatalf("expected all %d concurrent cold-start callers to resolve, got %d", n, got)
	}
	if got := hits.Load(); got != 1 {
		t.Fatalf("expected single-flight download (1 hit), got %d", got)
	}
}

func TestBuildIndexesRejectsInvalid(t *testing.T) {
	for _, bad := range []string{"", "{}", "[]", "not json"} {
		if _, err := buildIndexes([]byte(bad)); err == nil {
			t.Errorf("buildIndexes(%q): expected error", bad)
		}
	}
}

func TestBuildSupplementIndexesRejectsInvalid(t *testing.T) {
	// Last case parses but yields no usable mappings (no target ids).
	for _, bad := range []string{"", "{}", "[]", "not json", `[{"title":"x","imdb":"tt0000000"}]`} {
		if _, err := buildSupplementIndexes([]byte(bad)); err == nil {
			t.Errorf("buildSupplementIndexes(%q): expected error", bad)
		}
	}
}

func TestParseAnimeID(t *testing.T) {
	tests := []struct {
		in      string
		service string
		num     int
		ok      bool
	}{
		{"kitsu:12", "kitsu", 12, true},
		{"mal:21", "mal", 21, true},
		{"myanimelist:21", "mal", 21, true},
		{"anilist:21", "anilist", 21, true},
		{"KITSU:12", "kitsu", 12, true},
		{"kitsu:12:1:5", "kitsu", 12, true},
		{"tt0388629", "", 0, false},
		{"tmdb:37854", "", 0, false},
		{"kitsu:0", "", 0, false},
		{"kitsu:abc", "", 0, false},
		{"", "", 0, false},
	}
	for _, tc := range tests {
		service, num, ok := ParseAnimeID(tc.in)
		if ok != tc.ok || service != tc.service || num != tc.num {
			t.Errorf("ParseAnimeID(%q) = (%q, %d, %v), want (%q, %d, %v)",
				tc.in, service, num, ok, tc.service, tc.num, tc.ok)
		}
	}
}

// Catalogues sourced from MAL or Kitsu hand out ids no artwork or rating
// source understands, so they have to resolve back to IMDb or TMDB.
func TestResolveTargetFromDataset(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(sampleDataset))
	}))
	defer srv.Close()

	m := newTestMapper(t, srv.URL, "")

	tests := []struct {
		name, id string
		wantIMDb string
		ok       bool
	}{
		{"kitsu tv", "kitsu:12", "tt0388629", true},
		{"mal tv", "mal:21", "tt0388629", true},
		{"anilist tv", "anilist:21", "tt0388629", true},
		{"kitsu movie", "kitsu:176", "tt0245429", true},
		{"episode id keeps resolving", "kitsu:12:1:5", "tt0388629", true},
		{"unknown anime id", "kitsu:99999999", "", false},
		{"not an anime id", "tt0388629", "", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := m.ResolveTarget(context.Background(), tc.id)
			if ok != tc.ok {
				t.Fatalf("ResolveTarget(%q) ok = %v, want %v", tc.id, ok, tc.ok)
			}
			if ok && got.IMDb != tc.wantIMDb {
				t.Errorf("ResolveTarget(%q) IMDb = %q, want %q", tc.id, got.IMDb, tc.wantIMDb)
			}
		})
	}
}

// AIOMetadata emits anidb ids for some titles. Every other namespace it can hand
// out resolves, so an unrecognised one leaves those requests with no artwork at
// all rather than the wrong artwork.
func TestParseAnimeIDAcceptsAniDB(t *testing.T) {
	for _, id := range []string{"anidb:23", "series:anidb:23", "AniDB:23"} {
		service, num, ok := ParseAnimeID(id)
		if !ok || service != "anidb" || num != 23 {
			t.Errorf("ParseAnimeID(%q) = (%q, %d, %v), want (anidb, 23, true)", id, service, num, ok)
		}
	}
}
