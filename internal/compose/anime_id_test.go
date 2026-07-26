package compose

import (
	"context"
	"testing"

	"xrdb_rewrite/internal/provider/animemap"
)

// stubAnimeResolver answers from a fixed table, standing in for the dataset.
type stubAnimeResolver struct {
	targets map[string]animemap.Target
}

func (s stubAnimeResolver) Resolve(context.Context, string, string) (animemap.IDs, bool) {
	return animemap.IDs{}, false
}

func (s stubAnimeResolver) ResolveTarget(_ context.Context, id string) (animemap.Target, bool) {
	t, ok := s.targets[id]
	return t, ok
}

func TestResolveAnimeIDRewritesTheRequest(t *testing.T) {
	p := &Pipeline{anime: stubAnimeResolver{targets: map[string]animemap.Target{
		"kitsu:12":  {IMDb: "tt0388629"},
		"mal:21":    {IMDb: "tt0388629"},
		"anilist:5": {TMDB: 37854, TMDBType: "tv"},
		"kitsu:900": {TMDB: 129, TMDBType: "movie"},
	}}}

	tests := []struct {
		name, in, want string
	}{
		{"kitsu to imdb", "kitsu:12", "tt0388629"},
		{"mal to imdb", "mal:21", "tt0388629"},
		{"anilist to tmdb series", "anilist:5", "tmdb:series:37854"},
		{"kitsu to tmdb movie", "kitsu:900", "tmdb:movie:129"},
		{"episode tail is carried across", "kitsu:12:1:5", "tt0388629:1:5"},
		{"unmapped anime id is left alone", "kitsu:4242", "kitsu:4242"},
		{"imdb id is left alone", "tt0468569", "tt0468569"},
		{"tmdb id is left alone", "tmdb:series:1396", "tmdb:series:1396"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := p.resolveAnimeID(context.Background(), Request{MediaID: tc.in})
			if got.MediaID != tc.want {
				t.Errorf("resolveAnimeID(%q) = %q, want %q", tc.in, got.MediaID, tc.want)
			}
		})
	}
}

// A resolver without ResolveTarget must not break the render path.
func TestResolveAnimeIDWithoutTargetSupport(t *testing.T) {
	p := &Pipeline{}
	if got := p.resolveAnimeID(context.Background(), Request{MediaID: "kitsu:12"}); got.MediaID != "kitsu:12" {
		t.Errorf("MediaID = %q, want it unchanged", got.MediaID)
	}
}

// The service alias rebuilds to a different prefix than the caller sent, so
// the episode tail has to come off the raw id.
func TestResolveAnimeIDKeepsTailForAliases(t *testing.T) {
	p := &Pipeline{anime: stubAnimeResolver{targets: map[string]animemap.Target{
		"mal:21": {IMDb: "tt0388629"},
	}}}
	got := p.resolveAnimeID(context.Background(), Request{MediaID: "myanimelist:21:2:7"})
	if got.MediaID != "tt0388629:2:7" {
		t.Errorf("MediaID = %q, want tt0388629:2:7", got.MediaID)
	}
}
