package animemap

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

// An id may arrive as {type}:{id}, which is the shape AIOMetadata emits. The
// live lookup picks its endpoint from the id's own prefix, so an IMDb id behind
// a token does not start with "tt" and went to the TMDB endpoint, where it was
// rejected — the lookup could never succeed for a title addressed that way
// (BUG-244).
func TestTheLiveLookupPicksItsEndpointFromTheIDNotTheTypeToken(t *testing.T) {
	for _, c := range []struct{ id, wantPath, wantQuery string }{
		{"tt7777777", "/imdb", "tt7777777"},
		{"movie:tt7777777", "/imdb", "tt7777777"},
		{"series:tt7777777", "/imdb", "tt7777777"},
		{"330176", "/themoviedb", "330176"},
		{"movie:330176", "/themoviedb", "330176"},
		// The service can lead as well, which is the general <service>:<type>:<id>
		// shape. Stripping one known token from the front leaves the rest in the
		// query, and no endpoint can parse it.
		{"tmdb:series:34307", "/themoviedb", "34307"},
		{"tmdb:movie:330176", "/themoviedb", "330176"},
		{"imdb:series:tt7777777", "/imdb", "tt7777777"},
		{"themoviedb:34307", "/themoviedb", "34307"},
	} {
		t.Run(c.id, func(t *testing.T) {
			var mu sync.Mutex
			var gotPath, gotID string

			dataset := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				_, _ = w.Write([]byte(sampleDataset))
			}))
			defer dataset.Close()
			fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				mu.Lock()
				gotPath, gotID = r.URL.Path, r.URL.Query().Get("id")
				mu.Unlock()
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`[]`))
			}))
			defer fallback.Close()

			m := newTestMapper(t, dataset.URL, fallback.URL)
			m.Resolve(context.Background(), "poster", "tt0388629") // warm the dataset
			m.Resolve(context.Background(), "poster", c.id)
			time.Sleep(150 * time.Millisecond) // the fallback runs detached

			mu.Lock()
			defer mu.Unlock()
			if gotPath != c.wantPath {
				t.Errorf("%s asked %s, want %s", c.id, gotPath, c.wantPath)
			}
			if gotID != c.wantQuery {
				t.Errorf("%s sent id=%q, want %q", c.id, gotID, c.wantQuery)
			}
		})
	}
}

// The live API serves IMDb and TMDB. An id naming a service it has no endpoint
// for cannot be answered, so the call is skipped rather than sent to be
// refused — a request that must fail costs a round trip and reads as the
// source being unwell.
func TestAnIDNamingAnUnservedServiceIsNotLookedUp(t *testing.T) {
	for _, c := range []struct {
		id      string
		wantHit bool
	}{
		{"mal:21", false},
		{"anilist:series:21", false},
		{"kitsu:21", false},
		// Control: a served id in the same shape does reach the API, so a miss
		// above is the skip rather than the fallback never running.
		{"tmdb:series:34307", true},
	} {
		t.Run(c.id, func(t *testing.T) {
			var mu sync.Mutex
			hit := false

			dataset := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				_, _ = w.Write([]byte(sampleDataset))
			}))
			defer dataset.Close()
			fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				mu.Lock()
				hit = true
				mu.Unlock()
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`[]`))
			}))
			defer fallback.Close()

			m := newTestMapper(t, dataset.URL, fallback.URL)
			m.Resolve(context.Background(), "poster", "tt0388629") // warm the dataset
			m.Resolve(context.Background(), "poster", c.id)
			time.Sleep(150 * time.Millisecond) // the fallback runs detached

			mu.Lock()
			defer mu.Unlock()
			if hit != c.wantHit {
				t.Errorf("%s reached the live API = %v, want %v", c.id, hit, c.wantHit)
			}
		})
	}
}
