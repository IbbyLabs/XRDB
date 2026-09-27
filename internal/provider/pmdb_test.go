package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakeTMDBIDs struct{ id, kind string }

func (f fakeTMDBIDs) IdentifyID(context.Context, string, string) (string, string, error) {
	return f.id, f.kind, nil
}

func pmdbServer(t *testing.T, seen *[]string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer pm-test" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		q := r.URL.Query()
		*seen = append(*seen, q.Get("tmdb_id")+"/"+q.Get("media_type")+"/"+q.Get("label"))
		var body pmdbResponse
		switch q.Get("label") {
		case "Overall":
			body = pmdbResponse{Total: 3, Average: 80}
		case "overall":
			body = pmdbResponse{Total: 1, Average: 100}
		default:
			body = pmdbResponse{Items: []pmdbItem{
				{Label: "RT", Score: 80, Created: "2026-09-01 00:00:00.000Z"},
				{Label: "RT", Score: 86, Created: "2026-09-20 00:00:00.000Z"},
				{Label: "IM", Score: 88, Created: "2026-09-20 00:00:00.000Z"},
				{Label: "LB", Score: 84, Created: "2026-09-20 00:00:00.000Z"},
				{Label: "RE", Score: 100, Created: "2026-09-20 00:00:00.000Z"},
				{Label: "TM", Score: 83.7, Created: "2026-09-20 00:00:00.000Z"},
				{Label: "Overall", Score: 90, Created: "2026-09-20 00:00:00.000Z"},
				{Label: "ZZ", Score: 50, Created: "2026-09-20 00:00:00.000Z"},
			}}
		}
		_ = json.NewEncoder(w).Encode(body)
	}))
}

func TestPMDBReadsSiteLabelsAndTheCommunityScore(t *testing.T) {
	var seen []string
	srv := pmdbServer(t, &seen)
	defer srv.Close()
	p := NewPMDB("pm-test", fakeTMDBIDs{"27205", "movie"})
	p.baseURL, p.httpClient = srv.URL, srv.Client()

	meta, err := p.Fetch(context.Background(), "movie", "tt1375666")
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	got := map[string]string{}
	for _, r := range meta.Ratings {
		got[r.Source] = r.Label
	}
	want := map[string]string{
		"rt": "86%", "imdb": "8.8", "letterboxd": "4.2", "rogerebert": "4.0", "tmdb": "8.4", "pmdb": "85",
	}
	for source, label := range want {
		if got[source] != label {
			t.Errorf("%s = %q, want %q (all: %v)", source, got[source], label, got)
		}
	}
	if len(got) != len(want) {
		t.Errorf("ratings = %v, want exactly %v", got, want)
	}
	if len(seen) != 3 || seen[0] != "27205/movie/" {
		t.Errorf("requests = %v", seen)
	}
}

func TestPMDBAsksForATVShowAsTV(t *testing.T) {
	var seen []string
	srv := pmdbServer(t, &seen)
	defer srv.Close()
	p := NewPMDB("pm-test", fakeTMDBIDs{"1396", "series"})
	p.baseURL, p.httpClient = srv.URL, srv.Client()
	if _, err := p.Fetch(context.Background(), "series", "tt0903747"); err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if seen[0] != "1396/tv/" {
		t.Errorf("first request = %q, want 1396/tv/", seen[0])
	}
}

func TestPMDBOwnerKeyStandsInForTheServers(t *testing.T) {
	p := NewPMDB("", nil)
	if p.HasCredentials() {
		t.Fatal("a provider with no key reports credentials")
	}
	ctx := WithKeys(context.Background(), map[string]string{KeyPMDB: "pm-owner"})
	if got := p.cred(ctx); got != "pm-owner" {
		t.Errorf("cred = %q, want the owner's key", got)
	}
}

func TestPMDBLabelsCanBeRemappedAndRemoved(t *testing.T) {
	m := parsePMDBLabels("RT=rtaudience, RE=, XX=metacritic, YY=nowhere, junk")
	if m["RT"] != "rtaudience" || m["XX"] != "metacritic" {
		t.Errorf("overrides not applied: %v", m)
	}
	if _, ok := m["RE"]; ok {
		t.Error("an empty mapping left the label in place")
	}
	if _, ok := m["YY"]; ok {
		t.Error("a label mapped to a source PMDB cannot fill was kept")
	}
	if m["IM"] != "imdb" {
		t.Error("a default was lost")
	}
}

func TestPMDBRanksLastForASharedSource(t *testing.T) {
	got := PreferredSupplier("rt", []Supplier{{Name: "pmdb", Declares: 1}, {Name: "mdblist", Declares: 13}})
	if got != "mdblist" {
		t.Errorf("preferred = %q, want mdblist", got)
	}
	if got := PreferredSupplier("imdb", []Supplier{{Name: "pmdb", Declares: 1}, {Name: "cinemeta", Declares: 1}}); got != "cinemeta" {
		t.Errorf("imdb preferred = %q, want cinemeta", got)
	}
}
