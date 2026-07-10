package provider

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

// rtFunc adapts a function to http.RoundTripper.
type rtFunc func(*http.Request) (*http.Response, error)

func (f rtFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func jsonResp(body string) *http.Response {
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
	}
}

func TestResolveID_CompositeIDs(t *testing.T) {
	var lastURL string
	tmdb := NewTMDB("testkey", "")
	tmdb.SetHTTPClient(&http.Client{Transport: rtFunc(func(r *http.Request) (*http.Response, error) {
		lastURL = r.URL.String()
		switch {
		case strings.Contains(r.URL.Path, "/find/81189"):
			return jsonResp(`{"movie_results":[],"tv_results":[{"id":1396}]}`), nil
		case strings.Contains(r.URL.Path, "/find/tt0903747"):
			return jsonResp(`{"movie_results":[],"tv_results":[{"id":1396}]}`), nil
		default:
			return jsonResp(`{"movie_results":[],"tv_results":[]}`), nil
		}
	})})

	tests := []struct {
		name      string
		mediaType string
		id        string
		wantID    string
		wantType  string
		wantFind  string // substring expected in the outbound URL, "" for no network call
	}{
		{"tmdb series token", "", "tmdb:series:1396", "1396", "tv", ""},
		{"tmdb movie token", "", "tmdb:movie:603", "603", "movie", ""},
		{"tmdb scheme only, type from mediaType", "series", "tmdb:1396", "1396", "tv", ""},
		{"bare type token (episode pre-strip)", "series", "series:1396", "1396", "tv", ""},
		{"bare numeric unchanged", "movie", "603", "603", "movie", ""},
		{"tvdb resolves via find", "", "tvdb:81189", "1396", "tv", "external_source=tvdb_id"},
		{"imdb still resolves", "", "tt0903747", "1396", "tv", "external_source=imdb_id"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			lastURL = ""
			gotID, gotType, err := tmdb.resolveID(context.Background(), tc.mediaType, tc.id)
			if err != nil {
				t.Fatalf("resolveID(%q) error: %v", tc.id, err)
			}
			if gotID != tc.wantID || gotType != tc.wantType {
				t.Fatalf("resolveID(%q) = (%q, %q), want (%q, %q)", tc.id, gotID, gotType, tc.wantID, tc.wantType)
			}
			if tc.wantFind == "" {
				if lastURL != "" {
					t.Fatalf("resolveID(%q) made an unexpected network call to %s", tc.id, lastURL)
				}
			} else if !strings.Contains(lastURL, tc.wantFind) {
				t.Fatalf("resolveID(%q) called %q, want it to contain %q", tc.id, lastURL, tc.wantFind)
			}
		})
	}
}

func TestResolveID_TVDBNoMatch(t *testing.T) {
	tmdb := NewTMDB("testkey", "")
	tmdb.SetHTTPClient(&http.Client{Transport: rtFunc(func(r *http.Request) (*http.Response, error) {
		return jsonResp(`{"movie_results":[],"tv_results":[]}`), nil
	})})
	if _, _, err := tmdb.resolveID(context.Background(), "", "tvdb:999999"); err == nil {
		t.Fatal("expected error when TMDB has no TVDB match, got nil")
	}
}
