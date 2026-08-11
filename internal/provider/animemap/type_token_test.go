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
