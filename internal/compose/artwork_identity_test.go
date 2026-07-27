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
	tmdbID      string
	contentType string
	identifies  int32
	mu          sync.Mutex
	gotHint     string
}

func (s *identifyingStub) IdentifyID(_ context.Context, _, hint string) (string, string, error) {
	atomic.AddInt32(&s.identifies, 1)
	s.mu.Lock()
	s.gotHint = hint
	s.mu.Unlock()
	return s.tmdbID, s.contentType, nil
}

func (s *identifyingStub) hint() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.gotHint
}

func (s *identifyingStub) Identifies() int { return int(atomic.LoadInt32(&s.identifies)) }

// recordingArtworkStub records the content type and id it was queried with.
type recordingArtworkStub struct {
	provider.StubProvider
	mu      sync.Mutex
	gotType string
	gotID   string
}

func (s *recordingArtworkStub) FetchArtwork(_ context.Context, mediaType, _ string, opts provider.ArtworkOptions) (*provider.MediaMeta, error) {
	s.mu.Lock()
	s.gotType, s.gotID = mediaType, opts.TMDBID
	s.mu.Unlock()
	return s.Meta, s.Err
}

func (s *recordingArtworkStub) seen() (string, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.gotType, s.gotID
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
		tmdbID:      "30981",
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

	gotType, gotID := fanart.seen()
	if gotType != "series" {
		t.Errorf("content type = %q, want series", gotType)
	}
	if gotID != "30981" {
		t.Errorf("tmdb id = %q, want 30981", gotID)
	}
	if tmdb.Identifies() != 1 {
		t.Errorf("identify calls = %d, want 1", tmdb.Identifies())
	}
}

// A stub that stops satisfying the interface makes the pipeline skip the lookup
// silently rather than fail, so the mismatch has to be a build error.
var _ provider.TitleIdentifier = (*identifyingStub)(nil)

// An id TMDB holds against both a movie and a series is settled by the content
// type the request stated, so it has to reach the lookup.
func TestStatedContentTypeReachesTheIdentityLookup(t *testing.T) {
	fanart := &recordingArtworkStub{
		StubProvider: provider.StubProvider{
			ProviderName: "fanart",
			Meta:         &provider.MediaMeta{PosterURL: "http://fanart/poster.jpg"},
		},
	}
	tmdb := &identifyingStub{
		StubProvider: provider.StubProvider{
			ProviderName: "tmdb",
			Meta:         &provider.MediaMeta{Title: "The Five Star Weekend"},
		},
		tmdbID:      "283151",
		contentType: "series",
	}
	reg := provider.NewRegistry()
	reg.Register(fanart)
	reg.Register(tmdb)
	p := &Pipeline{providers: reg, fetcher: &recordingFetcher{data: makeTestPNG(600, 900, color.NRGBA{20, 20, 20, 255})}}

	cfg := imageconfig.Default()
	cfg.ArtworkSource = imageconfig.ArtworkFanart
	req := Request{MediaType: "poster", ContentType: "series", MediaID: "tt35587659", Config: cfg}
	if _, err := p.Render(context.Background(), req); err != nil {
		t.Fatalf("Render: %v", err)
	}
	if got := tmdb.hint(); got != "series" {
		t.Errorf("identity lookup got hint %q, want series", got)
	}
}

// The lookup is only worth its round-trip when Fanart answers first.
func TestIdentityLookupSkippedWhenSourceResolvesItsOwnIDs(t *testing.T) {
	tmdb := &identifyingStub{
		StubProvider: provider.StubProvider{
			ProviderName: "tmdb",
			Meta:         &provider.MediaMeta{Title: "Monster", PosterURL: "http://tmdb/poster.jpg"},
		},
		tmdbID:      "30981",
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
		tmdbID:       "30981",
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
