package compose

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/provider/animemap"
)

// seriesMAL stands in for the series-level MAL source.
type seriesMAL struct{ provider.StubProvider }

func (s *seriesMAL) RatingSources() []string { return []string{"mal"} }

func seriesMALProvider() *seriesMAL {
	return &seriesMAL{provider.StubProvider{ProviderName: "mal", Meta: &provider.MediaMeta{
		Ratings: []provider.Rating{{Source: "mal", Value: 8.4, Label: "8.4", Votes: 100000}},
	}}}
}

type episodeMap map[string]animemap.EpisodeEntry

func (m episodeMap) EpisodeEntry(key string, season, episode int) (animemap.EpisodeEntry, animemap.EpisodeRefusal) {
	if e, ok := m[fmt.Sprintf("%s/%d/%d", key, season, episode)]; ok {
		return e, animemap.EpisodeResolved
	}
	return animemap.EpisodeEntry{}, animemap.EpisodeNoRows
}

// episodePipeline serves Jikan episode lists scoring every episode 4.35.
func episodePipeline(t *testing.T, mapper provider.EpisodeMapper, requests *atomic.Int32) *Pipeline {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		var rows []string
		for i := 1; i <= 12; i++ {
			rows = append(rows, fmt.Sprintf(`{"mal_id":%d,"title":"Smoke Signal %d","aired":"2019-07-07T00:00:00+00:00","score":4.35}`, i, i))
		}
		_, _ = w.Write([]byte(`{"data":[` + strings.Join(rows, ",") + `]}`))
	}))
	t.Cleanup(srv.Close)
	mal := provider.NewMALWithURL(srv.URL + "/v4")
	reg := provider.NewRegistry()
	reg.Register(seriesMALProvider())
	reg.Register(provider.NewMALEpisodes(mal, mapper))
	p := New(reg)
	p.SetRatingsCacheTTL(0)
	return p
}

func episodeRequest(malID, malEpisode int) Request {
	cfg := imageconfig.Default()
	cfg.Ratings = []string{"mal"}
	return Request{
		MediaType: "poster", ContentType: "series", MediaID: "tt2560140:3:13", Config: cfg,
		episode: &episodeRef{series: "tt2560140", season: 3, number: 13},
		malID:   malID, malEpisode: malEpisode,
	}
}

func interactiveCtx() context.Context {
	return provider.WithCallerClass(context.Background(), provider.CallerInteractive)
}

func malRatings(all []provider.Rating) []provider.Rating {
	var out []provider.Rating
	for _, r := range all {
		if r.Source == "mal" || r.Source == "malep" {
			out = append(out, r)
		}
	}
	return out
}

func TestEpisodeScoreReplacesTheSeriesMALScore(t *testing.T) {
	var requests atomic.Int32
	p := episodePipeline(t, episodeMap{"tt2560140/3/13": {MALID: 38524, Episode: 1}}, &requests)
	all, contributors, degraded, _, _, _ := p.collectRatingsWithProviders(interactiveCtx(), episodeRequest(0, 0), &provider.MediaMeta{})
	got := malRatings(all)
	if len(got) != 1 {
		t.Fatalf("MAL ratings = %+v, want exactly one", got)
	}
	if got[0].Label != "4.35" || got[0].NativeSuffix != "/5" || got[0].Votes != 0 {
		t.Errorf("rating = %+v, want the episode's 4.35/5", got[0])
	}
	if degraded {
		t.Error("the render was marked degraded")
	}
	if !strings.Contains(strings.Join(contributors, ","), "mal") {
		t.Errorf("contributors = %v, want mal among them", contributors)
	}
}

func TestEpisodeScoreNamedByMALIDNeedsNoMapping(t *testing.T) {
	var requests atomic.Int32
	p := episodePipeline(t, episodeMap{}, &requests)
	all, _, _, _, _, _ := p.collectRatingsWithProviders(interactiveCtx(), episodeRequest(38524, 1), &provider.MediaMeta{})
	got := malRatings(all)
	if len(got) != 1 || got[0].Label != "4.35" {
		t.Fatalf("MAL ratings = %+v, want the episode's score", got)
	}
	if requests.Load() != 1 {
		t.Errorf("%d Jikan requests, want 1", requests.Load())
	}
}

func TestUnmappedEpisodeKeepsTheSeriesScoreAndSpendsNoRequest(t *testing.T) {
	var requests atomic.Int32
	p := episodePipeline(t, episodeMap{}, &requests)
	all, _, degraded, _, _, _ := p.collectRatingsWithProviders(interactiveCtx(), episodeRequest(0, 0), &provider.MediaMeta{})
	got := malRatings(all)
	if len(got) != 1 || got[0].Label != "8.4" {
		t.Fatalf("MAL ratings = %+v, want the series score", got)
	}
	if degraded || requests.Load() != 0 {
		t.Errorf("degraded=%v requests=%d, want a quiet fallback", degraded, requests.Load())
	}
}

func TestWithEpisodeMALFallbackBothWays(t *testing.T) {
	series := []provider.Rating{{Source: "imdb", Label: "9.0"}, {Source: "mal", Label: "8.4"}}
	for _, tc := range []struct {
		name     string
		fallback bool
		wantMAL  int
	}{{"fallback on keeps the series score", true, 1}, {"fallback off leaves MAL off", false, 0}} {
		t.Run(tc.name, func(t *testing.T) {
			out, _ := withEpisodeMAL(series, nil, true, tc.fallback)
			if n := len(malRatings(out)); n != tc.wantMAL {
				t.Errorf("%d MAL ratings, want %d", n, tc.wantMAL)
			}
			if len(out) != tc.wantMAL+1 {
				t.Errorf("other sources changed: %+v", out)
			}
		})
	}
	t.Run("a non-episode render keeps its score either way", func(t *testing.T) {
		out, _ := withEpisodeMAL(series, nil, false, false)
		if len(malRatings(out)) != 1 {
			t.Errorf("ratings = %+v", out)
		}
	})
	t.Run("an episode score is kept when the series one is absent", func(t *testing.T) {
		out, contributors := withEpisodeMAL([]provider.Rating{{Source: "malep", Label: "4.35"}}, nil, true, false)
		if got := malRatings(out); len(got) != 1 || got[0].Source != "mal" || got[0].Label != "4.35" {
			t.Errorf("ratings = %+v", out)
		}
		if len(contributors) != 1 || contributors[0] != "mal" {
			t.Errorf("contributors = %v", contributors)
		}
	})
}

func TestBulkCallerGetsNoEpisodeFetchAndIsHeldOut(t *testing.T) {
	var requests atomic.Int32
	p := episodePipeline(t, episodeMap{"tt2560140/3/13": {MALID: 38524, Episode: 1}}, &requests)
	ctx := provider.WithCallerClass(context.Background(), provider.CallerBulk)
	all, _, degraded, _, _, _ := p.collectRatingsWithProviders(ctx, episodeRequest(0, 0), &provider.MediaMeta{})
	if requests.Load() != 0 {
		t.Errorf("a bulk caller made %d Jikan requests", requests.Load())
	}
	if got := malRatings(all); len(got) != 1 || got[0].Label != "8.4" {
		t.Errorf("MAL ratings = %+v, want the series score", got)
	}
	if !degraded {
		t.Error("the held-out episode source did not mark the render degraded")
	}
}

func TestAnimeIDCapturesTheMALEntryBeforeTheRewrite(t *testing.T) {
	p := &Pipeline{anime: malCaptureResolver{}}
	tests := []struct {
		name, in        string
		wantMAL, wantEp int
		wantMediaID     string
	}{
		{"direct mal id", "mal:38524:3", 38524, 3, "tt2560140:3:15"},
		{"alias and type token", "series:myanimelist:38524:3", 38524, 3, "tt2560140:3:15"},
		{"kitsu id uses the row's MAL id", "kitsu:41982:2", 38524, 2, "tt2560140:3:14"},
		{"anilist id uses the row's MAL id", "anilist:99:2", 38524, 2, "tt2560140:3:14"},
		{"a season and episode tail names no entry episode", "mal:38524:3:15", 0, 0, "tt2560140:3:15"},
		{"no episode", "mal:38524", 0, 0, "tt2560140"},
		{"kitsu id with no MAL row", "kitsu:5:2", 0, 0, "tt2560140:3:14"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := p.resolveAnimeID(context.Background(), Request{MediaID: tc.in})
			if got.malID != tc.wantMAL || got.malEpisode != tc.wantEp {
				t.Errorf("captured MAL %d episode %d, want %d and %d", got.malID, got.malEpisode, tc.wantMAL, tc.wantEp)
			}
			if got.MediaID != tc.wantMediaID {
				t.Errorf("MediaID = %q, want %q", got.MediaID, tc.wantMediaID)
			}
		})
	}
}

// malCaptureResolver maps every anime id to one series and lets season 3 start
// 12 episodes into the TMDB numbering.
type malCaptureResolver struct{}

func (malCaptureResolver) Resolve(context.Context, string, string) (animemap.IDs, bool) {
	return animemap.IDs{}, false
}

func (malCaptureResolver) ResolveTarget(context.Context, string) (animemap.Target, bool) {
	return animemap.Target{IMDb: "tt2560140"}, true
}

func (malCaptureResolver) SeasonForAnimeID(string, string) (animemap.SeasonMapping, animemap.SeasonRefusal) {
	return animemap.NewSeasonMapping(3, 12), animemap.SeasonResolved
}

func (malCaptureResolver) KnowsTMDBSeason(string, int) bool { return true }

func (malCaptureResolver) MALIDFor(id string) (int, bool) {
	switch id {
	case "kitsu:41982", "anilist:99":
		return 38524, true
	}
	return 0, false
}

func TestEpisodeMALDisplay(t *testing.T) {
	r := provider.Rating{Source: "mal", Value: 8.7, Label: "4.35", NativeSuffix: "/5"}
	series := provider.Rating{Source: "mal", Value: 8.4, Label: "8.4"}
	tests := []struct {
		name   string
		r      provider.Rating
		mode   string
		hide   bool
		expect string
	}{
		{"native shows the scale", r, "native", false, "4.35/5"},
		{"native with the scale hidden", r, "native", true, "4.35"},
		{"normalised shows the ten-point value", r, "normalized", false, "8.7"},
		{"normalised to a hundred", r, "normalized100", false, "87"},
		{"the series score keeps no suffix", series, "native", false, "8.4"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := ratingBadgeValue(tc.r, tc.mode, tc.hide); got != tc.expect {
				t.Errorf("badge value = %q, want %q", got, tc.expect)
			}
		})
	}
}

func TestEpisodeMALIsNotSuppressedForHavingNoVotes(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.RatingMinVotes = true
	cfg.RatingMinVotesBySource = map[string]int{"mal": 50}
	kept, thin := splitThinRatings([]provider.Rating{{Source: "mal", Value: 8.7, Label: "4.35", NativeSuffix: "/5"}}, cfg)
	if len(kept) != 1 || len(thin) != 0 {
		t.Errorf("kept %+v thin %v", kept, thin)
	}
}

func TestEpisodeScoresAreCachedPerEpisodeAndShareOnePage(t *testing.T) {
	var requests atomic.Int32
	p := episodePipeline(t, episodeMap{}, &requests)
	p.SetRatingsCacheTTL(time.Hour)
	for _, ep := range []int{1, 2} {
		req := episodeRequest(38524, ep)
		req.MediaID = fmt.Sprintf("tt2560140:3:%d", 12+ep)
		req.episode = &episodeRef{series: "tt2560140", season: 3, number: 12 + ep}
		all, _, _, _, _, _ := p.collectRatingsWithProviders(interactiveCtx(), req, &provider.MediaMeta{})
		if got := malRatings(all); len(got) != 1 || got[0].Label != "4.35" {
			t.Fatalf("episode %d: MAL ratings = %+v", ep, got)
		}
	}
	if requests.Load() != 1 {
		t.Errorf("%d Jikan requests for two episodes of one page, want 1", requests.Load())
	}
	if n := p.CachedRatings(); n < 2 {
		t.Errorf("%d ratings cached, want an entry per episode source answer", n)
	}
}

func TestMALEpisodeOnlyDecidesTheFallbackOnARender(t *testing.T) {
	for _, only := range []bool{false, true} {
		var requests atomic.Int32
		p := episodePipeline(t, episodeMap{}, &requests)
		req := episodeRequest(0, 0)
		req.Config.MALEpisodeOnly = only
		all, _, _, _, _, _ := p.collectRatingsWithProviders(interactiveCtx(), req, &provider.MediaMeta{})
		got := malRatings(all)
		if only && len(got) != 0 {
			t.Errorf("episode-only: MAL ratings = %+v, want none", got)
		}
		if !only && (len(got) != 1 || got[0].Label != "8.4") {
			t.Errorf("default: MAL ratings = %+v, want the series score", got)
		}
	}
}

func TestTMDBEpisodeNameChecksTheMappedMALEpisode(t *testing.T) {
	for _, tc := range []struct {
		name, tmdb, label string
	}{
		{"matching name", "Smoke Signal 1", "4.35"},
		{"different name", "Something Unrelated", "8.4"},
		{"no name", "", "4.35"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var requests atomic.Int32
			p := episodePipeline(t, episodeMap{"tt2560140/3/13": {MALID: 38524, Episode: 1}}, &requests)
			req := episodeRequest(0, 0)
			req.episodeName = tc.tmdb
			all, _, _, _, _, _ := p.collectRatingsWithProviders(interactiveCtx(), req, &provider.MediaMeta{})
			if got := malRatings(all); len(got) != 1 || got[0].Label != tc.label {
				t.Errorf("MAL ratings = %+v, want label %s", got, tc.label)
			}
		})
	}
}
