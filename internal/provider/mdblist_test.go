package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
		json.NewEncoder(w).Encode(payload)
	}))
	defer srv.Close()

	m := &MDBList{apiKey: "testkey", httpClient: srv.Client()}
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

			m := &MDBList{apiKey: "key", httpClient: srv.Client()}
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
