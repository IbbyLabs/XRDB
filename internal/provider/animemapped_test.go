package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"xrdb_rewrite/internal/provider/animemap"
)

const mappedTestDataset = `[
  {"type":"TV","mal_id":21,"anilist_id":21,"kitsu_id":12,"imdb_id":["tt0388629"],"themoviedb_id":{"tv":37854}}
]`

func newTestAnimeMapper(t *testing.T) *animemap.Mapper {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(mappedTestDataset))
	}))
	t.Cleanup(srv.Close)
	return animemap.New(animemap.Options{
		CacheDir:    t.TempDir(),
		DatasetURL:  srv.URL,
		MirrorURL:   srv.URL,
		FallbackURL: "off",
	})
}

func TestAnimeMappedTranslatesIMDbID(t *testing.T) {
	var gotPath string
	jikan := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_, _ = w.Write([]byte(`{"data":{"title":"One Piece","score":8.7,"year":1999}}`))
	}))
	defer jikan.Close()

	mal := &MAL{httpClient: jikan.Client(), baseURL: jikan.URL + "/"}
	w := NewAnimeMapped(mal, newTestAnimeMapper(t))

	meta, err := w.Fetch(context.Background(), "poster", "tt0388629")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if !strings.HasSuffix(gotPath, "/21") {
		t.Errorf("expected upstream call for MAL id 21, got path %q", gotPath)
	}
	if len(meta.Ratings) != 1 || meta.Ratings[0].Source != "mal" || meta.Ratings[0].Value != 8.7 {
		t.Errorf("unexpected ratings: %+v", meta.Ratings)
	}
}

func TestAnimeMappedPassesThroughPrefixedID(t *testing.T) {
	var gotPath string
	jikan := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_, _ = w.Write([]byte(`{"data":{"title":"Naruto","score":7.9}}`))
	}))
	defer jikan.Close()

	mal := &MAL{httpClient: jikan.Client(), baseURL: jikan.URL + "/"}
	w := NewAnimeMapped(mal, newTestAnimeMapper(t))

	if _, err := w.Fetch(context.Background(), "poster", "mal:20"); err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if !strings.HasSuffix(gotPath, "/20") {
		t.Errorf("expected pass-through to MAL id 20, got path %q", gotPath)
	}
}

func TestAnimeMappedRejectsUnmappedID(t *testing.T) {
	mal := NewMAL()
	w := NewAnimeMapped(mal, newTestAnimeMapper(t))

	if _, err := w.Fetch(context.Background(), "poster", "tt0468569"); err == nil {
		t.Fatal("expected error for non-anime id")
	}
}

func TestAnimeMappedName(t *testing.T) {
	m := newTestAnimeMapper(t)
	for _, tt := range []struct {
		inner Provider
		want  string
	}{
		{NewMAL(), "mal"},
		{NewAniList(), "anilist"},
		{NewKitsu(), "kitsu"},
	} {
		if got := NewAnimeMapped(tt.inner, m).Name(); got != tt.want {
			t.Errorf("Name() = %q, want %q", got, tt.want)
		}
	}
}

func TestAnimeMappedPanicsOnUnsupportedProvider(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("expected panic for unsupported provider")
		}
	}()
	NewAnimeMapped(NewCinemeta(), newTestAnimeMapper(t))
}

func TestAnimeMappedImplementsProvider(t *testing.T) {
	var _ Provider = NewAnimeMapped(NewMAL(), newTestAnimeMapper(t))
}
