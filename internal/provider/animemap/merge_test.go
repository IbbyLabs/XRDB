package animemap

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// A partial primary hit — a Kitsu id but no MAL or AniList — must not shadow the
// complete mapping. The supplement's MAL and AniList fill the gaps rather than
// being skipped. This is BUG-206: anime rating sources returned nothing for
// popular titles because Resolve stopped at the first source that reported a hit.
func TestPartialPrimaryIsFilledFromSupplement(t *testing.T) {
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[
  {"type":"TV","kitsu_id":41370,"imdb_id":["tt9335498"],"themoviedb_id":{"tv":85937}}
]`))
	}))
	defer primary.Close()
	supplement := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[
  {"title":"Demon Slayer","imdb":"tt9335498","themoviedb":85937,"themoviedb_type":"tv","myanimelist":38000,"anilist":101922,"kitsu":41370}
]`))
	}))
	defer supplement.Close()

	m := New(Options{
		CacheDir:      t.TempDir(),
		DatasetURL:    primary.URL,
		MirrorURL:     primary.URL,
		SupplementURL: supplement.URL,
		FallbackURL:   "off",
	})

	want := IDs{MAL: 38000, AniList: 101922, Kitsu: 41370}
	if !eventually(func() bool {
		got, ok := m.Resolve(context.Background(), "poster", "tt9335498")
		return ok && got == want
	}) {
		got, ok := m.Resolve(context.Background(), "poster", "tt9335498")
		t.Fatalf("partial primary should be filled from supplement: got (%+v,%v), want (%+v,true)", got, ok, want)
	}
}

// The live fallback returns an array whose elements can be different seasons; the
// first non-empty one may be only partially populated. Resolve must take the most
// complete element rather than the first non-empty. BUG-206 second half.
func TestFallbackPrefersTheMostCompleteElement(t *testing.T) {
	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// First non-empty element carries only a MAL id; a later element is
		// complete. The old code returned the first and lost AniList and Kitsu.
		_, _ = w.Write([]byte(`[
  {"myanimelist":16498,"anilist":0,"kitsu":0},
  {"myanimelist":16498,"anilist":16498,"kitsu":7442}
]`))
	}))
	defer fallback.Close()
	// A primary that resolves nothing, so the fallback is what answers.
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[]`))
	}))
	defer primary.Close()

	m := New(Options{
		CacheDir:      t.TempDir(),
		DatasetURL:    primary.URL,
		MirrorURL:     primary.URL,
		SupplementURL: "off",
		FallbackURL:   fallback.URL,
	})

	want := IDs{MAL: 16498, AniList: 16498, Kitsu: 7442}
	if got, ok := m.Resolve(context.Background(), "poster", "tt2560140"); !ok || got != want {
		t.Fatalf("fallback should pick the most complete element: got (%+v,%v), want (%+v,true)", got, ok, want)
	}
}
