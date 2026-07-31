package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMediUXPicksMostPopularSet(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"data":{"movies_by_id":{"movie_sets":[
			{"popularity":3,"movie_poster":[{"id":"low"}],"movie_backdrop":[]},
			{"popularity":9,"movie_poster":[{"id":"high"}],"movie_backdrop":[{"id":"bd"}]}
		]}}}`))
	}))
	defer srv.Close()

	m := &MediUX{apiKey: "tok", baseURL: srv.URL, httpClient: srv.Client()}
	meta, err := m.FetchArtwork(context.Background(), "movie", "1726", ArtworkOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(meta.PosterURL, "/high") {
		t.Errorf("poster = %q, want the most popular set's asset", meta.PosterURL)
	}
	if !strings.HasSuffix(meta.BackdropURL, "/bd") {
		t.Errorf("backdrop = %q", meta.BackdropURL)
	}
}

func TestMediUXNeedsANumericIDAndToken(t *testing.T) {
	m := &MediUX{apiKey: "", httpClient: http.DefaultClient}
	if _, err := m.FetchArtwork(context.Background(), "movie", "1726", ArtworkOptions{}); err == nil {
		t.Error("no token should error")
	}
	m2 := &MediUX{apiKey: "tok", httpClient: http.DefaultClient}
	if _, err := m2.FetchArtwork(context.Background(), "movie", "tt0111161", ArtworkOptions{}); err == nil {
		t.Error("a tt-id (non-numeric) should not reach MediUX")
	}
}

func TestMediUXOwnerKeyOverrides(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		_, _ = w.Write([]byte(`{"data":{"movies_by_id":{"movie_sets":[{"popularity":1,"movie_poster":[{"id":"p"}]}]}}}`))
	}))
	defer srv.Close()
	m := &MediUX{apiKey: "instance", baseURL: srv.URL, httpClient: srv.Client()}
	ctx := WithKeys(context.Background(), map[string]string{KeyMediux: "owner"})
	if _, err := m.FetchArtwork(ctx, "movie", "1726", ArtworkOptions{}); err != nil {
		t.Fatal(err)
	}
	if gotAuth != "Bearer owner" {
		t.Errorf("auth = %q, want the owner key", gotAuth)
	}
}

var _ = json.Marshal
