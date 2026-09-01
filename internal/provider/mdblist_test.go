package provider

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMDBListNameAndNoKey(t *testing.T) {
	m := NewMDBList("")
	if m.Name() != "mdblist" {
		t.Errorf("expected name mdblist, got %q", m.Name())
	}
	_, err := m.Fetch(context.Background(), "movie", "tt1234567")
	if err == nil {
		t.Error("expected error when api key is empty")
	}
}

func TestMDBListRejectsNonIMDbID(t *testing.T) {
	m := NewMDBList("key")
	_, err := m.Fetch(context.Background(), "movie", "12345")
	if err == nil {
		t.Error("expected error for non-tt ID")
	}
}

func TestMDBListParsesRatings(t *testing.T) {
	payload := map[string]any{
		"score": 72.0,
		"ratings": []map[string]any{
			{"source": "imdb", "value": 7.4, "votes": 1000000},
			{"source": "tomatoes", "value": 85.0, "votes": 200},
			{"source": "metacritic", "value": 78.0, "votes": 45},
			{"source": "letterboxd", "value": 3.8, "votes": 500},
		},
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(payload)
	}))
	defer srv.Close()

	m := &MDBList{keys: newKeyRing("testkey"), httpClient: srv.Client()}
	// patch base URL
	origBase := mdblistBase
	defer func() { _ = origBase }() // can't patch const; use server directly
	_ = origBase

	// Call via a test server that overrides the URL
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet,
		srv.URL+"/imdb/movie/tt1234567?apikey=testkey", nil)
	resp, err := m.httpClient.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()

	var p mdblistPayload
	if err := json.NewDecoder(resp.Body).Decode(&p); err != nil {
		t.Fatalf("decode: %v", err)
	}
	ratings := parseMDBListRatings(p)

	bySource := make(map[string]Rating)
	for _, r := range ratings {
		bySource[r.Source] = r
	}

	// imdb: value as-is
	if r, ok := bySource["imdb"]; !ok {
		t.Error("missing imdb rating")
	} else if r.Value != 7.4 {
		t.Errorf("imdb value: want 7.4, got %f", r.Value)
	}

	// rt: 85/10 = 8.5 normalized
	if r, ok := bySource["rt"]; !ok {
		t.Error("missing rt rating")
	} else if r.Value != 8.5 {
		t.Errorf("rt value: want 8.5, got %f", r.Value)
	}

	// metacritic: 78/10 = 7.8 normalized
	if r, ok := bySource["metacritic"]; !ok {
		t.Error("missing metacritic rating")
	} else if r.Value != 7.8 {
		t.Errorf("metacritic value: want 7.8, got %f", r.Value)
	}

	// letterboxd: 3.8*2 = 7.6 normalized
	if r, ok := bySource["letterboxd"]; !ok {
		t.Error("missing letterboxd rating")
	} else if r.Value != 7.6 {
		t.Errorf("letterboxd value: want 7.6, got %f", r.Value)
	}

	// mdblist aggregate from score field (72 not in ratings array)
	if r, ok := bySource["mdblist"]; !ok {
		t.Error("missing mdblist aggregate rating")
	} else if r.Value != 7.2 {
		t.Errorf("mdblist value: want 7.2, got %f", r.Value)
	}
}

func TestMDBListNormalizeMDBSource(t *testing.T) {
	cases := []struct {
		raw  string
		want string
	}{
		{"imdb", "imdb"},
		{"IMDB", "imdb"},
		{"tomatoes", "rt"},
		{"tomatoes_audience", "rtaudience"},
		{"popcorn", "rtaudience"},
		{"popcornmeter", "rtaudience"},
		{"popcorntime", "rtaudience"},
		{"Popcorn", "rtaudience"},
		{"metacritic", "metacritic"},
		{"metacritic_user", "metacriticuser"},
		{"letterboxd", "letterboxd"},
		{"mdblist", "mdblist"},
		{"trakt", "trakt"},
		{"tmdb", "tmdb"},
		{"rogerebert", "rogerebert"},
		{"commonsense", "commonsense"},
		{"myanimelist", "mal"},
		{"mal", "mal"},
		{"anilist", "anilist"},
		{"unknown_source", ""},
	}

	for _, c := range cases {
		got := normalizeMDBSource(c.raw)
		if got != c.want {
			t.Errorf("normalizeMDBSource(%q): want %q, got %q", c.raw, c.want, got)
		}
	}
}

func TestMDBListHTTPErrors(t *testing.T) {
	cases := []struct {
		status int
		name   string
	}{
		{http.StatusUnauthorized, "401"},
		{http.StatusForbidden, "403"},
		{http.StatusNotFound, "404"},
		{http.StatusTooManyRequests, "429"},
		{http.StatusInternalServerError, "500"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(c.status)
			}))
			defer srv.Close()

			m := &MDBList{keys: newKeyRing("key"), httpClient: srv.Client()}
			req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet,
				srv.URL+"/imdb/movie/tt1234567?apikey=key", nil)
			resp, err := m.httpClient.Do(req)
			if err != nil {
				t.Fatalf("request: %v", err)
			}
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				t.Errorf("expected non-200, got %d", resp.StatusCode)
			}
		})
	}
}

func TestMDBListDeduplicatesSources(t *testing.T) {
	p := mdblistPayload{
		Score: 80.0,
		Ratings: []mdblistRating{
			{Source: "imdb", Value: 7.5},
			{Source: "imdb", Value: 8.0}, // duplicate
			{Source: "mdblist", Value: 80.0},
		},
	}
	ratings := parseMDBListRatings(p)

	counts := make(map[string]int)
	for _, r := range ratings {
		counts[r.Source]++
	}
	if counts["imdb"] != 1 {
		t.Errorf("expected 1 imdb rating, got %d", counts["imdb"])
	}
	// mdblist appears in ratings array AND as aggregate; deduplicated
	if counts["mdblist"] != 1 {
		t.Errorf("expected 1 mdblist rating, got %d", counts["mdblist"])
	}
}

// TestMDBListFallsBackToShowOnMovie404 reproduces the poster/logo bug: a series
// requested with no content-type hint (as the poster/logo surfaces do) must not
// silently drop its ratings. movie is tried first, 404s, then show succeeds.
func TestMDBListFallsBackToShowOnMovie404(t *testing.T) {
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		if strings.Contains(r.URL.Path, "/imdb/movie/") {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"score":   75.0,
			"ratings": []map[string]any{{"source": "imdb", "value": 7.4, "votes": 100}},
		})
	}))
	defer srv.Close()

	m := &MDBList{keys: newKeyRing("k"), baseURL: srv.URL, httpClient: srv.Client()}
	meta, err := m.Fetch(context.Background(), "", "tt2250192")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if meta == nil || len(meta.Ratings) == 0 {
		t.Fatal("expected ratings from show fallback, got none")
	}
	if len(paths) != 2 || !strings.Contains(paths[0], "/imdb/movie/") || !strings.Contains(paths[1], "/imdb/show/") {
		t.Fatalf("expected movie then show, got %v", paths)
	}
}

// TestMDBListSeriesHintHitsShowDirectly verifies a correct content-type hint
// avoids the wasted movie request entirely.
func TestMDBListSeriesHintHitsShowDirectly(t *testing.T) {
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		if strings.Contains(r.URL.Path, "/imdb/movie/") {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"score": 80.0})
	}))
	defer srv.Close()

	m := &MDBList{keys: newKeyRing("k"), baseURL: srv.URL, httpClient: srv.Client()}
	if _, err := m.Fetch(context.Background(), "series", "tt2250192"); err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(paths) != 1 || !strings.Contains(paths[0], "/imdb/show/") {
		t.Fatalf("series hint should hit show directly, got %v", paths)
	}
}

// MDBList does not report every source on the same scale, and reading one wrong
// prints a plainly false score on the artwork: TMDB arrives as a 0-100
// percentage while its own site shows 0-10, and Metacritic's user score is out
// of 10 while its critic score is out of 100. Values are real MDBList responses
// (Iron Man, The Dark Knight, Inception).
func TestMDBListNormalizesEachSourceToItsRealScale(t *testing.T) {
	cases := []struct {
		source    string
		raw       float64
		wantValue float64
		wantLabel string
	}{
		{"imdb", 7.9, 7.9, "7.9"},
		{"tmdb", 76, 7.6, "7.6"},
		{"tmdb", 85, 8.5, "8.5"},
		{"metacritic", 79, 7.9, "79"},
		{"metacriticuser", 8.3, 8.3, "8.3"},
		{"metacriticuser", 9.1, 9.1, "9.1"},
		{"rt", 94, 9.4, "94%"},
		{"letterboxd", 3.8, 7.6, "3.8"},
		{"trakt", 82, 8.2, "82"},
	}
	for _, c := range cases {
		got, label := mdblistNormalize(c.source, c.raw)
		if math.Abs(got-c.wantValue) > 0.001 || label != c.wantLabel {
			t.Errorf("%s %v: got (%.2f, %q), want (%.2f, %q)",
				c.source, c.raw, got, label, c.wantValue, c.wantLabel)
		}
		if got > 10.001 {
			t.Errorf("%s %v normalized to %.2f, which is off the 0-10 scale", c.source, c.raw, got)
		}
	}
}

// The source keys MDBList actually sends. A key that maps to "" is dropped
// before it can reach a badge, which is how the Metacritic user score went
// missing while its icon and colour sat unused in the renderer.
func TestMDBListMapsEverySourceKeyTheAPISends(t *testing.T) {
	// Observed in live responses (Iron Man, The Dark Knight, Inception).
	live := []string{
		"imdb", "metacritic", "metacriticuser", "trakt", "tomatoes",
		"popcorn", "tmdb", "letterboxd", "rogerebert", "myanimelist",
	}
	for _, key := range live {
		if got := normalizeMDBSource(key); got == "" {
			t.Errorf("MDBList source %q maps to nothing, so its rating is silently dropped", key)
		}
	}
}

// A bare /poster/tt... request carries no content type, so MDBList guesses the
// movie endpoint first. A series must not pay that guaranteed 404 on every
// render against the one source that meters by the day.
func TestMDBListRemembersWhichEndpointHoldsATitle(t *testing.T) {
	var movieHits, showHits int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/movie/"):
			movieHits++
			w.WriteHeader(http.StatusNotFound)
		case strings.Contains(r.URL.Path, "/show/"):
			showHits++
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"title":"Breaking Bad","ratings":[{"source":"imdb","value":9.5}]}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	m := NewMDBList("k")
	m.baseURL = srv.URL
	for i := 0; i < 4; i++ {
		if _, err := m.Fetch(context.Background(), "", "tt0903747"); err != nil {
			t.Fatalf("fetch %d: %v", i, err)
		}
	}
	if movieHits != 1 {
		t.Errorf("hit the wrong endpoint %d times across 4 renders, want 1: the type is not being remembered", movieHits)
	}
	if showHits != 4 {
		t.Errorf("show endpoint hit %d times, want 4", showHits)
	}
}
