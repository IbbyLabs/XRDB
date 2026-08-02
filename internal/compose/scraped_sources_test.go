package compose

import (
	"context"
	"sync/atomic"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// titleStub stands in for a source with no id lookup of its own: it declares
// which sources it serves and answers by title.
type titleStub struct {
	name    string
	sources []string
	calls   atomic.Int32
	gotName string
	gotYear int
}

func (s *titleStub) Name() string            { return s.name }
func (s *titleStub) RatingSources() []string { return s.sources }

func (s *titleStub) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	return nil, context.Canceled // must never be reached: this one needs a title
}

func (s *titleStub) FetchByTitle(_ context.Context, _, title, _ string, year int) (*provider.MediaMeta, error) {
	s.calls.Add(1)
	s.gotName, s.gotYear = title, year
	return &provider.MediaMeta{Ratings: []provider.Rating{
		{Source: s.sources[0], Value: 8.8, Label: "4.4"},
	}}, nil
}

func artworkMeta() *provider.MediaMeta {
	return &provider.MediaMeta{Title: "The Dark Knight", OriginalTitle: "The Dark Knight", Year: 2008}
}

func TestScrapedSourceIsSkippedWhenNotSelected(t *testing.T) {
	// These sources cost a lookup on someone else's site. Calling one on every
	// render just to throw the answer away is the thing to avoid.
	stub := &titleStub{name: "allocine", sources: []string{"allocine", "allocinepress"}}
	reg := provider.NewRegistry()
	reg.Register(stub)

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"imdb", "tmdb"}
	p := &Pipeline{providers: reg, fetcher: &stubImageFetcher{}}
	req := Request{MediaType: "poster", MediaID: "tt0468569", Config: cfg}

	all, _, _, _ := p.collectRatingsWithProviders(context.Background(), req, artworkMeta())
	if got := stub.calls.Load(); got != 0 {
		t.Errorf("provider called %d times, want 0 when none of its sources are selected", got)
	}
	if len(all) != 0 {
		t.Errorf("ratings = %v, want none", all)
	}
}

func TestScrapedSourceIsCalledByTitleWhenSelected(t *testing.T) {
	stub := &titleStub{name: "allocine", sources: []string{"allocine", "allocinepress"}}
	reg := provider.NewRegistry()
	reg.Register(stub)

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"imdb", "allocinepress"}
	p := &Pipeline{providers: reg, fetcher: &stubImageFetcher{}}
	req := Request{MediaType: "poster", MediaID: "tt0468569", Config: cfg}

	all, contributors, _, _ := p.collectRatingsWithProviders(context.Background(), req, artworkMeta())
	if got := stub.calls.Load(); got != 1 {
		t.Fatalf("provider called %d times, want 1", got)
	}
	// Selecting either of its sources is enough to make the lookup worth doing.
	if stub.gotName != "The Dark Knight" || stub.gotYear != 2008 {
		t.Errorf("looked up %q (%d), want the artwork title and year", stub.gotName, stub.gotYear)
	}
	if len(all) != 1 || len(contributors) != 1 {
		t.Errorf("ratings = %v, contributors = %v, want one of each", all, contributors)
	}
}

func TestProvidersWithoutDeclaredSourcesStillRunAlways(t *testing.T) {
	// Everything that was here before declares nothing and must keep being
	// called regardless of what the config selected.
	stub := &provider.StubProvider{
		ProviderName: "mdblist",
		Meta:         &provider.MediaMeta{Ratings: []provider.Rating{{Source: "letterboxd", Value: 7.0}}},
	}
	reg := provider.NewRegistry()
	reg.Register(stub)

	cfg := imageconfig.Default()
	cfg.Ratings = []string{"imdb"}
	p := &Pipeline{providers: reg, fetcher: &stubImageFetcher{}}
	req := Request{MediaType: "poster", MediaID: "tt0468569", Config: cfg}

	all, _, _, _ := p.collectRatingsWithProviders(context.Background(), req, artworkMeta())
	if len(all) != 1 {
		t.Errorf("ratings = %v, want the undeclared provider still consulted", all)
	}
}
