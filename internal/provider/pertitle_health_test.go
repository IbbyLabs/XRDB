package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// A source that answers about a title it does not carry is reporting on the
// title, not on itself. Counting that as a health failure takes the source off
// every other render (BUG-214).
//
// One provider was fixed and verified while five others returned the same shape
// unwrapped, so this covers the class rather than an instance: each case drives
// the real Fetch against a server producing the real miss, then asks the health
// tracker what it recorded. Failure sets healthy=false on the first countable
// error, so a regression fails here rather than passing quietly.
func TestAPerTitleMissDoesNotMarkASourceUnhealthy(t *testing.T) {
	cases := []struct {
		source string
		// handler serves whatever the provider's miss looks like upstream.
		handler http.HandlerFunc
		fetch   func(ctx context.Context, base string, c *http.Client) error
	}{
		{
			source:  "trakt",
			handler: func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(`{"rating":0,"votes":0}`)) },
			fetch: func(ctx context.Context, base string, c *http.Client) error {
				tr := &Trakt{clientID: "test", baseURL: base, httpClient: c}
				_, err := tr.Fetch(ctx, "movie", "tt43337681")
				return err
			},
		},
		{
			source:  "cinemeta",
			handler: func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(`{"meta":{}}`)) },
			fetch: func(ctx context.Context, base string, c *http.Client) error {
				cm := &Cinemeta{baseURL: base, httpClient: c}
				_, err := cm.Fetch(ctx, "movie", "tt0000001")
				return err
			},
		},
		{
			source: "allocine",
			// The autocomplete endpoint answering with nothing is how AlloCiné
			// says it does not carry a title.
			handler: func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(`[]`)) },
			fetch: func(ctx context.Context, base string, c *http.Client) error {
				a := &AlloCine{baseURL: base, httpClient: c}
				_, err := a.FetchByTitle(ctx, "movie", "Star Wars: Visions Presents - The Ninth Jedi", "", 2025)
				return err
			},
		},
		{
			source: "filmweb",
			// Filmweb answers its search with no usable candidate the same way.
			handler: func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(`{}`)) },
			fetch: func(ctx context.Context, base string, c *http.Client) error {
				f := &Filmweb{baseURL: base, httpClient: c}
				_, err := f.FetchByTitle(ctx, "movie", "Star Wars: Visions Presents - The Ninth Jedi", "", 2025)
				return err
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.source, func(t *testing.T) {
			srv := httptest.NewServer(tc.handler)
			defer srv.Close()

			err := tc.fetch(context.Background(), srv.URL, srv.Client())
			if err == nil {
				t.Fatalf("%s: expected an error for a title it does not carry", tc.source)
			}

			h := NewHealthTracker(10, time.Hour)
			h.Failure(tc.source, err, CallerInteractive)
			for _, s := range h.Snapshot() {
				if s.Source == tc.source && !s.Healthy {
					t.Errorf("%s: a per-title miss marked the source unhealthy: %v", tc.source, err)
				}
			}
		})
	}
}
