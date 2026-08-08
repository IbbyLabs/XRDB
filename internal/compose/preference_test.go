package compose

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// fixedSource answers with a set value for the sources it declares, so a test
// can tell which provider's copy of a shared source reached the render.
type fixedSource struct {
	name    string
	sources []string
	value   float64
	fail    bool
	calls   int
}

func (f *fixedSource) Name() string            { return f.name }
func (f *fixedSource) RatingSources() []string { return f.sources }

func (f *fixedSource) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	f.calls++
	if f.fail {
		return nil, &provider.RateLimitError{Source: f.name, Status: 429}
	}
	out := make([]provider.Rating, 0, len(f.sources))
	for _, s := range f.sources {
		out = append(out, provider.Rating{Source: s, Value: f.value, Label: f.name})
	}
	return &provider.MediaMeta{Ratings: out}, nil
}

func registryOf(provs ...provider.Provider) *provider.Registry {
	reg := provider.NewRegistry()
	for _, p := range provs {
		reg.Register(p)
	}
	return reg
}

func ratingLabel(ratings []provider.Rating, source string) string {
	for _, r := range ratings {
		if r.Source == source {
			return r.Label
		}
	}
	return ""
}

func collectFor(t *testing.T, reg *provider.Registry, sources ...string) []provider.Rating {
	t.Helper()
	p := &Pipeline{providers: reg, fetcher: &stubImageFetcher{}}
	cfg := imageconfig.Default()
	cfg.Ratings = sources
	req := Request{MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg}
	all, _, _, _, _, _ := p.collectRatingsWithProviders(context.Background(), req, &provider.MediaMeta{})
	return all
}

// The reported defect. Four providers supply imdb and the alphabet decided,
// so cinemeta won on its C and the local dataset was called and discarded.
func TestTheLocalDatasetSuppliesIMDbRatherThanTheAlphabet(t *testing.T) {
	reg := registryOf(
		&fixedSource{name: "cinemeta", sources: []string{"imdb"}, value: 7.0},
		&fixedSource{name: "imdb_local", sources: []string{"imdb"}, value: 8.0},
		&fixedSource{name: "mdblist", sources: []string{"imdb", "rt", "trakt"}, value: 6.0},
		&fixedSource{name: "omdb", sources: []string{"imdb", "rt", "metacritic"}, value: 5.0},
	)

	if got := ratingLabel(collectFor(t, reg, "imdb"), "imdb"); got != "imdb_local" {
		t.Errorf("imdb came from %q, want imdb_local", got)
	}
}

// Dedication decides everywhere it can, so the aggregator loses each source it
// shares with a provider that declares fewer.
func TestADedicatedSourceBeatsTheAggregator(t *testing.T) {
	mdblist := &fixedSource{
		name:    "mdblist",
		sources: []string{"imdb", "rt", "metacritic", "trakt", "tmdb", "mal", "anilist"},
		value:   6.0,
	}
	reg := registryOf(mdblist,
		&fixedSource{name: "trakt", sources: []string{"trakt"}, value: 7.1},
		&fixedSource{name: "tmdb", sources: []string{"tmdb"}, value: 7.2},
		&fixedSource{name: "mal", sources: []string{"mal"}, value: 7.3},
		&fixedSource{name: "anilist", sources: []string{"anilist"}, value: 7.4},
		&fixedSource{name: "omdb", sources: []string{"imdb", "rt", "metacritic"}, value: 7.5},
	)

	all := collectFor(t, reg, "trakt", "tmdb", "mal", "anilist", "rt", "metacritic")
	for source, want := range map[string]string{
		"trakt": "trakt", "tmdb": "tmdb", "mal": "mal", "anilist": "anilist",
		"rt": "omdb", "metacritic": "omdb",
	} {
		if got := ratingLabel(all, source); got != want {
			t.Errorf("%s came from %q, want %q", source, got, want)
		}
	}
}

// The control: most sources have exactly one supplier and none of them move.
func TestASourceWithOneSupplierIsUnchanged(t *testing.T) {
	reg := registryOf(
		&fixedSource{name: "simkl", sources: []string{"simkl"}, value: 7.7},
		&fixedSource{name: "kitsu", sources: []string{"kitsu"}, value: 7.8},
		&fixedSource{name: "letterboxd_only", sources: []string{"letterboxd"}, value: 7.9},
	)

	all := collectFor(t, reg, "simkl", "kitsu", "letterboxd")
	for source, want := range map[string]string{
		"simkl": "simkl", "kitsu": "kitsu", "letterboxd": "letterboxd_only",
	} {
		if got := ratingLabel(all, source); got != want {
			t.Errorf("%s came from %q, want %q", source, got, want)
		}
	}
}

// A preferred supplier that did not answer must not take the badge down with
// it: a lower-preference copy that was fetched anyway is drawn instead.
func TestAFailedPreferredSupplierFallsBackToALowerOne(t *testing.T) {
	reg := registryOf(
		&fixedSource{name: "trakt", sources: []string{"trakt"}, fail: true},
		&fixedSource{name: "mdblist", sources: []string{"trakt", "imdb"}, value: 6.4},
	)

	// imdb is also wanted, so the aggregator is called for its own reason and
	// its copy of trakt is there to fall back to.
	all := collectFor(t, reg, "trakt", "imdb")
	if got := ratingLabel(all, "trakt"); got != "mdblist" {
		t.Errorf("trakt came from %q, want the aggregator's copy", got)
	}
}

// A preferred supplier that costs a request does not displace the others: a
// miss would then mean two serialised round trips on one badge, which is worse
// than today on exactly the slow path.
func TestANonFreePreferredSupplierDoesNotDropTheOthers(t *testing.T) {
	spare := &fixedSource{name: "mdblist", sources: []string{"trakt", "imdb"}, value: 6.4}
	reg := registryOf(
		&fixedSource{name: "trakt", sources: []string{"trakt"}, fail: true},
		spare,
	)

	if got := ratingLabel(collectFor(t, reg, "trakt"), "trakt"); got != "mdblist" {
		t.Errorf("trakt came from %q, want the aggregator that was called anyway", got)
	}
}

// freeSource costs nothing to consult, like a dataset held in memory.
type freeSource struct {
	fixedSource
	has bool
}

func (f *freeSource) FreeToAsk() bool { return true }

func (f *freeSource) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	if !f.has {
		return &provider.MediaMeta{}, nil
	}
	return &provider.MediaMeta{Ratings: []provider.Rating{
		{Source: f.sources[0], Value: f.value, Label: f.name},
	}}, nil
}

// The saving. A free supplier that has the title answers first and the network
// supplier it would have beaten is never called.
func TestAFreeSupplierWithTheTitleSpendsNoRequestOnTheOthers(t *testing.T) {
	local := &freeSource{fixedSource: fixedSource{name: "imdb_local", sources: []string{"imdb"}, value: 8.0}, has: true}
	cinemeta := &fixedSource{name: "cinemeta", sources: []string{"imdb"}, value: 7.0}
	reg := registryOf(local, cinemeta)

	all := collectFor(t, reg, "imdb")
	if got := ratingLabel(all, "imdb"); got != "imdb_local" {
		t.Errorf("imdb came from %q, want imdb_local", got)
	}
	if cinemeta.calls != 0 {
		t.Errorf("cinemeta was called %d times for a title the local source had", cinemeta.calls)
	}
}

// And the coverage half: a free supplier without the title covers nothing, so
// the supplier it would have replaced still runs and the badge survives.
func TestAFreeSupplierWithoutTheTitleStillLetsTheOthersRun(t *testing.T) {
	local := &freeSource{fixedSource: fixedSource{name: "imdb_local", sources: []string{"imdb"}, value: 8.0}}
	cinemeta := &fixedSource{name: "cinemeta", sources: []string{"imdb"}, value: 7.0}
	reg := registryOf(local, cinemeta)

	if got := ratingLabel(collectFor(t, reg, "imdb"), "imdb"); got != "cinemeta" {
		t.Errorf("imdb came from %q, want cinemeta covering the gap", got)
	}
	if cinemeta.calls == 0 {
		t.Error("cinemeta was skipped for a title the local source did not have")
	}
}

// Which supplier wins must not depend on the user's artwork setting. The
// artwork provider is skipped in the ratings pass, so before this the IMDb
// value changed when Cinemeta was chosen for artwork.
func TestTheArtworkSettingDoesNotChangeWhichSupplierWins(t *testing.T) {
	build := func() *provider.Registry {
		return registryOf(
			&fixedSource{name: "cinemeta", sources: []string{"imdb"}, value: 7.0},
			&fixedSource{name: "imdb_local", sources: []string{"imdb"}, value: 8.0},
			&fixedSource{name: "omdb", sources: []string{"imdb"}, value: 5.0},
		)
	}
	p := &Pipeline{providers: build(), fetcher: &stubImageFetcher{}}
	cfg := imageconfig.Default()
	cfg.Ratings = []string{"imdb"}

	plain := Request{MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg}
	withArtwork := plain
	withArtwork.artworkFrom = "cinemeta"

	a, _, _, _, _, _ := p.collectRatingsWithProviders(context.Background(), plain, &provider.MediaMeta{})
	b, _, _, _, _, _ := p.collectRatingsWithProviders(context.Background(), withArtwork, &provider.MediaMeta{})

	if ratingLabel(a, "imdb") != ratingLabel(b, "imdb") {
		t.Errorf("imdb came from %q normally and %q with cinemeta as artwork",
			ratingLabel(a, "imdb"), ratingLabel(b, "imdb"))
	}
	if got := ratingLabel(a, "imdb"); got != "imdb_local" {
		t.Errorf("imdb came from %q, want imdb_local", got)
	}
}

// A source set for movies only is still called for a series today, and its
// answer binned after the fact. Movie versus series is known before the fan-out
// so it costs nothing to narrow on.
func TestASourceSetForMoviesOnlyIsNotCalledForASeries(t *testing.T) {
	movieOnly := &fixedSource{name: "letterboxd_only", sources: []string{"letterboxd"}, value: 7.9}
	both := &fixedSource{name: "simkl", sources: []string{"simkl"}, value: 7.1}
	p := &Pipeline{providers: registryOf(movieOnly, both), fetcher: &stubImageFetcher{}}

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"simkl"}
	cfg.RatingsMovie = []string{"simkl", "letterboxd"}

	series := Request{MediaType: "poster", ContentType: "series", MediaID: "tt1", Config: cfg}
	all, _, _, _, _, _ := p.collectRatingsWithProviders(context.Background(), series, &provider.MediaMeta{})
	if got := ratingLabel(all, "letterboxd"); got != "" {
		t.Errorf("a movie-only source answered on a series, from %q", got)
	}

	movie := series
	movie.ContentType = "movie"
	all, _, _, _, _, _ = p.collectRatingsWithProviders(context.Background(), movie, &provider.MediaMeta{})
	if got := ratingLabel(all, "letterboxd"); got != "letterboxd_only" {
		t.Errorf("the movie-only source did not answer on a movie, got %q", got)
	}
}

// The anime override stays in the candidate set: whether a title is an anime is
// not known until after the ratings are fetched, and narrowing it away here
// would drop a source the render then asks for.
func TestTheAnimeOverrideIsStillCalledOnASeries(t *testing.T) {
	anime := &fixedSource{name: "mal", sources: []string{"mal"}, value: 8.2}
	p := &Pipeline{providers: registryOf(anime), fetcher: &stubImageFetcher{}}

	cfg := imageconfig.Default()
	cfg.Ratings = []string{}
	cfg.RatingsSeries = []string{}
	cfg.RatingsAnime = []string{"mal"}

	req := Request{MediaType: "poster", ContentType: "series", MediaID: "tt1", Config: cfg}
	all, _, _, _, _, _ := p.collectRatingsWithProviders(context.Background(), req, &provider.MediaMeta{})
	if got := ratingLabel(all, "mal"); got != "mal" {
		t.Errorf("the anime override was narrowed away, got %q", got)
	}
}

// A caller that does not know the content type must not silently get fewer
// sources than it asked for.
func TestAnUnknownContentTypeNarrowsNothing(t *testing.T) {
	movieOnly := &fixedSource{name: "letterboxd_only", sources: []string{"letterboxd"}, value: 7.9}
	p := &Pipeline{providers: registryOf(movieOnly), fetcher: &stubImageFetcher{}}

	cfg := imageconfig.Default()
	cfg.Ratings = []string{}
	cfg.RatingsMovie = []string{"letterboxd"}

	req := Request{MediaType: "poster", ContentType: "", MediaID: "tt1", Config: cfg}
	all, _, _, _, _, _ := p.collectRatingsWithProviders(context.Background(), req, &provider.MediaMeta{})
	if got := ratingLabel(all, "letterboxd"); got != "letterboxd_only" {
		t.Errorf("an unknown content type dropped a source, got %q", got)
	}
}

// The call reduction drops Cinemeta because the local dataset is the better
// supplier of imdb. A dataset that cannot load would then take the badge with
// it — an invisible inefficiency turned into an invisible outage, on an
// instance whose dataset is broken rather than on anyone's dev box.
func TestABrokenLocalDatasetDoesNotTakeTheIMDbBadgeDown(t *testing.T) {
	// A fresh but unparseable file: recent enough that no download is attempted,
	// corrupt enough that the load fails. Pointing at a missing directory would
	// trigger a real download instead of testing anything.
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "imdb_ratings.tsv.gz"), []byte("not gzip"), 0o644); err != nil {
		t.Fatal(err)
	}
	dataset := provider.NewIMDbDataset(dir)
	cinemeta := &fixedSource{name: "cinemeta", sources: []string{"imdb"}, value: 7.0}
	p := &Pipeline{providers: registryOf(dataset, cinemeta), fetcher: &stubImageFetcher{}}

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"imdb"}
	req := Request{MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg}

	// The first render is what discovers the dataset is broken.
	p.collectRatingsWithProviders(context.Background(), req, &provider.MediaMeta{})

	all, _, _, _, _, _ := p.collectRatingsWithProviders(context.Background(), req, &provider.MediaMeta{})
	if got := ratingLabel(all, "imdb"); got != "cinemeta" {
		t.Errorf("imdb came from %q, want cinemeta covering for the broken dataset", got)
	}
}

// Before it has loaded, the dataset must still be asked, or it never loads and
// never becomes the preferred supplier it is registered to be.
func TestAnUnloadedDatasetIsStillConsideredReady(t *testing.T) {
	dataset := provider.NewIMDbDataset(t.TempDir())
	if !providerReady(dataset) {
		t.Error("a dataset that has not been asked for anything reported itself unready")
	}
}
