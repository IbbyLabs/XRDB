package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestTMDBSeriesMetadataCarriesItsAirDates(t *testing.T) {
	for _, tc := range []struct {
		name     string
		body     string
		wantLast string
		wantNext bool
	}{
		{"airing", `{"id":1,"name":"S","first_air_date":"2010-01-17","last_air_date":"2026-11-20","next_episode_to_air":{"air_date":"2026-12-01"}}`, "2026-11-20", true},
		{"ended", `{"id":1,"name":"S","first_air_date":"2010-01-17","last_air_date":"2015-05-01","next_episode_to_air":null}`, "2015-05-01", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if strings.HasPrefix(r.URL.Path, "/movie/") {
					w.WriteHeader(http.StatusNotFound)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(tc.body))
			}))
			defer srv.Close()

			tm := &TMDB{apiKey: "k", baseURL: srv.URL, httpClient: srv.Client()}
			meta, err := tm.FetchArtwork(context.Background(), "poster", "tmdb:1", ArtworkOptions{})
			if err != nil || meta == nil {
				t.Fatalf("fetch: %v", err)
			}
			if meta.LastAirDate != tc.wantLast || meta.NextEpisode != tc.wantNext {
				t.Errorf("last %q next %v, want %q %v", meta.LastAirDate, meta.NextEpisode, tc.wantLast, tc.wantNext)
			}
		})
	}
}
