package compose

import (
	"context"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider/animemap"
)

type stubAnimeMap struct {
	ids animemap.IDs
	ok  bool
}

func (s stubAnimeMap) Resolve(context.Context, string, string) (animemap.IDs, bool) {
	return s.ids, s.ok
}

// Kitsu answers only to its own ids, so a mainstream id has to be translated
// before Kitsu is asked for artwork.
func TestKitsuIDTranslatesAMainstreamID(t *testing.T) {
	p := &Pipeline{anime: stubAnimeMap{ids: animemap.IDs{Kitsu: 1376}, ok: true}}

	got, ok := p.kitsuID(context.Background(), Request{MediaType: "poster", MediaID: "tt0388629"})
	if !ok || got != "kitsu:1376" {
		t.Errorf("got %q ok=%v, want kitsu:1376", got, ok)
	}
}

func TestKitsuIDPassesAKitsuIDThrough(t *testing.T) {
	// No resolver at all: an id Kitsu already understands needs no map.
	p := &Pipeline{}
	got, ok := p.kitsuID(context.Background(), Request{MediaID: "kitsu:42"})
	if !ok || got != "kitsu:42" {
		t.Errorf("got %q ok=%v, want kitsu:42", got, ok)
	}
}

// A title with no Kitsu entry must fall through to the next artwork source
// rather than asking Kitsu for an id it cannot answer.
func TestKitsuIDDeclinesWhatItCannotMap(t *testing.T) {
	cases := map[string]*Pipeline{
		"no resolver": {},
		"no match":    {anime: stubAnimeMap{ok: false}},
		"no kitsu id": {anime: stubAnimeMap{ids: animemap.IDs{MAL: 21}, ok: true}},
	}
	for name, p := range cases {
		if _, ok := p.kitsuID(context.Background(), Request{MediaID: "tt0110912"}); ok {
			t.Errorf("%s: kitsuID accepted a title it cannot map", name)
		}
	}
}

func TestKitsuIsASelectableArtworkSource(t *testing.T) {
	cfg := imageconfig.Parse([]byte(`{"artworkSourceAnime":"kitsu"}`))
	if cfg.ArtworkSourceAnime != imageconfig.ArtworkKitsu {
		t.Errorf("anime artwork source = %q, want kitsu", cfg.ArtworkSourceAnime)
	}
}
