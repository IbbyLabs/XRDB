package compose

import (
	"context"
	"image/color"
	"sync"
	"sync/atomic"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// identifyingStub stands in for TMDB, which can say what an external id names.
type identifyingStub struct {
	provider.StubProvider
	title       string
	contentType string
	identifies  int32
}

func (s *identifyingStub) IdentifyID(context.Context, string) (string, string, error) {
	atomic.AddInt32(&s.identifies, 1)
	return s.title, s.contentType, nil
}

func (s *identifyingStub) Identifies() int { return int(atomic.LoadInt32(&s.identifies)) }

// recordingArtworkStub records the content type and title it was queried with.
type recordingArtworkStub struct {
	provider.StubProvider
	mu       sync.Mutex
	gotType  string
	gotTitle string
}

func (s *recordingArtworkStub) FetchArtwork(_ context.Context, mediaType, _ string, opts provider.ArtworkOptions) (*provider.MediaMeta, error) {
	s.mu.Lock()
	s.gotType, s.gotTitle = mediaType, opts.Title
	s.mu.Unlock()
	return s.Meta, s.Err
}

func (s *recordingArtworkStub) seen() (string, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.gotType, s.gotTitle
}

// A bare /poster/tt... carries no content type, and with Fanart configured it
// answers before anything that could contradict it.
func TestFanartFirstIsGivenTheResolvedIdentity(t *testing.T) {
	fanart := &recordingArtworkStub{
		StubProvider: provider.StubProvider{
			ProviderName: "fanart",
			Meta:         &provider.MediaMeta{PosterURL: "http://fanart/poster.jpg"},
		},
	}
	tmdb := &identifyingStub{
		StubProvider: provider.StubProvider{
			ProviderName: "tmdb",
			Meta:         &provider.MediaMeta{Title: "Monster", PosterURL: "http://tmdb/poster.jpg"},
		},
		title:       "Monster",
		contentType: "series",
	}
	reg := provider.NewRegistry()
	reg.Register(fanart)
	reg.Register(tmdb)
	p := &Pipeline{providers: reg, fetcher: &recordingFetcher{data: makeTestPNG(600, 900, color.NRGBA{20, 20, 20, 255})}}

	cfg := imageconfig.Default()
	cfg.ArtworkSource = imageconfig.ArtworkFanart
	if _, err := p.Render(context.Background(), Request{MediaType: "poster", MediaID: "tt0434706", Config: cfg}); err != nil {
		t.Fatalf("Render: %v", err)
	}

	gotType, gotTitle := fanart.seen()
	if gotType != "series" {
		t.Errorf("content type = %q, want series", gotType)
	}
	if gotTitle != "Monster" {
		t.Errorf("title = %q, want Monster", gotTitle)
	}
	if tmdb.Identifies() != 1 {
		t.Errorf("identify calls = %d, want 1", tmdb.Identifies())
	}
}

// The lookup is only worth its round-trip when Fanart answers first.
func TestIdentityLookupSkippedWhenSourceResolvesItsOwnIDs(t *testing.T) {
	tmdb := &identifyingStub{
		StubProvider: provider.StubProvider{
			ProviderName: "tmdb",
			Meta:         &provider.MediaMeta{Title: "Monster", PosterURL: "http://tmdb/poster.jpg"},
		},
		title:       "Monster",
		contentType: "series",
	}
	reg := provider.NewRegistry()
	reg.Register(tmdb)
	reg.Register(&provider.StubProvider{ProviderName: "fanart", Meta: &provider.MediaMeta{PosterURL: "http://fanart/poster.jpg"}})
	p := &Pipeline{providers: reg, fetcher: &recordingFetcher{data: makeTestPNG(600, 900, color.NRGBA{20, 20, 20, 255})}}

	cfg := imageconfig.Default()
	cfg.ArtworkSource = imageconfig.ArtworkTMDB
	if _, err := p.Render(context.Background(), Request{MediaType: "poster", MediaID: "tt0434706", Config: cfg}); err != nil {
		t.Fatalf("Render: %v", err)
	}
	if tmdb.Identifies() != 0 {
		t.Errorf("identify calls = %d, want 0", tmdb.Identifies())
	}
}

// A caller that already stated the content type has nothing to buy.
func TestIdentityLookupSkippedForNonExternalID(t *testing.T) {
	fanart := &recordingArtworkStub{
		StubProvider: provider.StubProvider{
			ProviderName: "fanart",
			Meta:         &provider.MediaMeta{PosterURL: "http://fanart/poster.jpg"},
		},
	}
	tmdb := &identifyingStub{
		StubProvider: provider.StubProvider{ProviderName: "tmdb", Meta: &provider.MediaMeta{}},
		title:        "Monster",
		contentType:  "series",
	}
	reg := provider.NewRegistry()
	reg.Register(fanart)
	reg.Register(tmdb)
	p := &Pipeline{providers: reg, fetcher: &recordingFetcher{data: makeTestPNG(600, 900, color.NRGBA{20, 20, 20, 255})}}

	cfg := imageconfig.Default()
	cfg.ArtworkSource = imageconfig.ArtworkFanart
	if _, err := p.Render(context.Background(), Request{MediaType: "poster", MediaID: "80079", Config: cfg}); err != nil {
		t.Fatalf("Render: %v", err)
	}
	if tmdb.Identifies() != 0 {
		t.Errorf("identify calls = %d, want 0", tmdb.Identifies())
	}
}
