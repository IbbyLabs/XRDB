package compose

import (
	"context"
	"testing"

	"xrdb_rewrite/internal/provider"
)

type episodeStub struct {
	provider.StubProvider
	series          string
	season, episode int
	tconst          string
}

func (e *episodeStub) FetchEpisodeRating(_ context.Context, series string, season, episode int, tconst string) (*provider.MediaMeta, error) {
	e.series, e.season, e.episode, e.tconst = series, season, episode, tconst
	return &provider.MediaMeta{Ratings: []provider.Rating{{Source: "trakt", Value: 8.4}}}, nil
}

// A source that answers per episode is asked by series and numbers, with the
// episode's own IMDb id, instead of by the episode id it cannot look up.
func TestAnEpisodeSourceIsAskedBySeriesAndNumbers(t *testing.T) {
	stub := &episodeStub{StubProvider: provider.StubProvider{ProviderName: "trakt"}}
	p := &Pipeline{}
	req := Request{ContentType: "series", MediaID: "tt0959621", episode: &episodeRef{series: "tt0903747", season: 1, number: 1}}
	if _, err := p.fetchRatings(context.Background(), stub, req, &provider.MediaMeta{}); err != nil {
		t.Fatal(err)
	}
	if stub.series != "tt0903747" || stub.season != 1 || stub.episode != 1 || stub.tconst != "tt0959621" {
		t.Errorf("asked %q %d %d %q", stub.series, stub.season, stub.episode, stub.tconst)
	}
	if stub.Calls != 0 {
		t.Error("the plain id lookup ran as well")
	}
}

func TestAMovieStillGoesThroughFetch(t *testing.T) {
	stub := &episodeStub{StubProvider: provider.StubProvider{ProviderName: "trakt", Meta: &provider.MediaMeta{}}}
	p := &Pipeline{}
	if _, err := p.fetchRatings(context.Background(), stub, Request{ContentType: "movie", MediaID: "tt0468569"}, &provider.MediaMeta{}); err != nil {
		t.Fatal(err)
	}
	if stub.series != "" || stub.Calls != 1 {
		t.Errorf("episode path %q, fetch calls %d", stub.series, stub.Calls)
	}
}
