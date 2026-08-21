package compose

import (
	"context"
	"image"
	"image/color"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// urlFetcher answers per URL and records what was asked for, so a test can
// assert that the second file was never fetched as well as which one won.
type urlFetcher struct {
	files map[string][]byte
	asked []string
}

func (f *urlFetcher) Fetch(_ context.Context, url string) ([]byte, error) {
	f.asked = append(f.asked, url)
	if b, ok := f.files[url]; ok {
		return b, nil
	}
	return nil, context.Canceled
}

func (f *urlFetcher) askedFor(url string) int {
	n := 0
	for _, u := range f.asked {
		if u == url {
			n++
		}
	}
	return n
}

const (
	origURL = "https://kitsu/original.jpg"
	altURL  = "https://kitsu/large.jpg"
)

func posterPipeline(t *testing.T, original, large []byte) (*Pipeline, *urlFetcher, Request) {
	t.Helper()
	f := &urlFetcher{files: map[string][]byte{origURL: original, altURL: large}}
	stub := &provider.StubProvider{
		ProviderName: "kitsu",
		Meta: &provider.MediaMeta{
			Title:        "A title",
			PosterURL:    origURL,
			PosterAltURL: altURL,
		},
	}
	p := &Pipeline{providers: testRegistry(stub), fetcher: f}
	cfg := imageconfig.Default()
	cfg.ArtworkSource = "kitsu"
	return p, f, Request{MediaType: "poster", ContentType: "movie", MediaID: "kitsu:1", Config: cfg}
}

func fetchedPoster(t *testing.T, p *Pipeline, req Request) image.Point {
	t.Helper()
	data, _, _, _, _, err := p.fetchSourceImageAndMeta(context.Background(), req)
	if err != nil {
		t.Fatalf("fetchSourceImageAndMeta: %v", err)
	}
	size, ok := imageBounds(data)
	if !ok {
		t.Fatal("the artwork returned did not decode")
	}
	return size
}

// The reported case. Kitsu's "original" is 225x321 where its "large" is
// 550x780, and the API reports no dimensions for either, so the smaller file
// wins on preference alone unless the bytes are measured.
func TestAnUndersizedPreferredPosterLosesToTheAlternate(t *testing.T) {
	p, f, req := posterPipeline(t,
		makeTestPNG(225, 321, color.NRGBA{R: 255, A: 255}),
		makeTestPNG(550, 780, color.NRGBA{G: 255, A: 255}))

	if got := fetchedPoster(t, p, req); got != (image.Point{X: 550, Y: 780}) {
		t.Errorf("kept %v, want the 550x780 alternate", got)
	}
	if f.askedFor(altURL) != 1 {
		t.Errorf("the alternate was fetched %d times, want once", f.askedFor(altURL))
	}
}

// The one title that looked broken was the only landscape one. Shape decides
// before size: a landscape file is unusable as a poster whatever its pixels.
func TestALandscapePreferredPosterLosesToAPortraitAlternate(t *testing.T) {
	p, _, req := posterPipeline(t,
		makeTestPNG(1600, 900, color.NRGBA{R: 255, A: 255}),
		makeTestPNG(550, 780, color.NRGBA{G: 255, A: 255}))

	if got := fetchedPoster(t, p, req); got != (image.Point{X: 550, Y: 780}) {
		t.Errorf("kept %v, want the portrait alternate over a larger landscape file", got)
	}
}

// A portrait poster well off 2:3 is fine. Anything tight enough around the
// ratio to feel principled throws away posters that look perfectly good.
func TestAPortraitPosterOffTwoThirdsIsKept(t *testing.T) {
	// 0.79 wide-to-tall, the Honey and Clover shape, and comfortably delivered.
	p, f, req := posterPipeline(t,
		makeTestPNG(790, 1000, color.NRGBA{R: 255, A: 255}),
		makeTestPNG(550, 780, color.NRGBA{G: 255, A: 255}))
	req.Config.Size = "small"

	if got := fetchedPoster(t, p, req); got != (image.Point{X: 790, Y: 1000}) {
		t.Errorf("kept %v, want the off-ratio portrait original", got)
	}
	if f.askedFor(altURL) != 0 {
		t.Error("the alternate was fetched for a title whose preferred file was already good")
	}
}

// At the larger tiers both files are under the delivered size. Falling back on
// "not big enough" alone would then swap a good poster for a worse one.
func TestTheBiggerFileWinsWhenBothAreUndersized(t *testing.T) {
	p, _, req := posterPipeline(t,
		makeTestPNG(900, 1350, color.NRGBA{R: 255, A: 255}),
		makeTestPNG(550, 780, color.NRGBA{G: 255, A: 255}))
	req.Config.Size = "xlarge"

	if got := fetchedPoster(t, p, req); got != (image.Point{X: 900, Y: 1350}) {
		t.Errorf("kept %v, want the larger of two undersized files", got)
	}
}

// A file that lost once loses on every render, so the render after it must not
// pay for it again.
func TestALosingPosterIsNotFetchedTwice(t *testing.T) {
	p, f, req := posterPipeline(t,
		makeTestPNG(225, 321, color.NRGBA{R: 255, A: 255}),
		makeTestPNG(550, 780, color.NRGBA{G: 255, A: 255}))

	fetchedPoster(t, p, req)
	before := f.askedFor(origURL)
	fetchedPoster(t, p, req)

	if got := f.askedFor(origURL); got != before {
		t.Errorf("the losing file was fetched again (%d then %d)", before, got)
	}
	if got := fetchedPoster(t, p, req); got != (image.Point{X: 550, Y: 780}) {
		t.Errorf("later renders returned %v, want the alternate", got)
	}
}

// A source that publishes one poster file is untouched, and costs no second
// fetch.
func TestASinglePosterFileIsUsedAsIs(t *testing.T) {
	f := &urlFetcher{files: map[string][]byte{origURL: makeTestPNG(100, 140, color.NRGBA{A: 255})}}
	stub := &provider.StubProvider{
		ProviderName: "kitsu",
		Meta:         &provider.MediaMeta{Title: "A title", PosterURL: origURL},
	}
	p := &Pipeline{providers: testRegistry(stub), fetcher: f}
	cfg := imageconfig.Default()
	cfg.ArtworkSource = "kitsu"
	req := Request{MediaType: "poster", ContentType: "movie", MediaID: "kitsu:1", Config: cfg}

	if got := fetchedPoster(t, p, req); got != (image.Point{X: 100, Y: 140}) {
		t.Errorf("kept %v, want the only file there is", got)
	}
	if len(f.asked) != 1 {
		t.Errorf("fetched %v, want one request", f.asked)
	}
}

// The alternate describes the poster. Another surface must not pick it up.
func TestTheAlternateIsNotUsedForABackdrop(t *testing.T) {
	f := &urlFetcher{files: map[string][]byte{
		"https://kitsu/cover.jpg": makeTestPNG(1600, 900, color.NRGBA{A: 255}),
		altURL:                    makeTestPNG(550, 780, color.NRGBA{G: 255, A: 255}),
	}}
	stub := &provider.StubProvider{
		ProviderName: "kitsu",
		Meta: &provider.MediaMeta{
			Title:        "A title",
			PosterURL:    origURL,
			PosterAltURL: altURL,
			BackdropURL:  "https://kitsu/cover.jpg",
		},
	}
	p := &Pipeline{providers: testRegistry(stub), fetcher: f}
	cfg := imageconfig.Default()
	cfg.ArtworkSource = "kitsu"
	req := Request{MediaType: "backdrop", ContentType: "movie", MediaID: "kitsu:1", Config: cfg}

	if got := fetchedPoster(t, p, req); got != (image.Point{X: 1600, Y: 900}) {
		t.Errorf("kept %v, want the landscape backdrop", got)
	}
	if f.askedFor(altURL) != 0 {
		t.Error("the poster's alternate was fetched for a backdrop")
	}
}

func TestJudgePosterRejectsBytesThatAreNotAnImage(t *testing.T) {
	if v := judgePoster([]byte("not an image"), image.Point{X: 10, Y: 10}); v.usable {
		t.Error("undecodable bytes were judged usable")
	}
}

// The URL reported for a render has to be the file that was drawn, not the one
// first chosen (FR-194). betterPoster can take the alternate, and a reported URL
// naming the rejected file would send a reader to the wrong image.
func TestTheReportedArtworkURLNamesTheFileActuallyDrawn(t *testing.T) {
	// A landscape preferred file loses to a portrait alternate, so the swap runs.
	p, _, req := posterPipeline(t, makeTestPNG(1600, 900, color.NRGBA{R: 255, A: 255}), makeTestPNG(550, 780, color.NRGBA{G: 255, A: 255}))
	_, _, _, _, url, err := p.fetchSourceImageAndMeta(context.Background(), req)
	if err != nil {
		t.Fatalf("fetchSourceImageAndMeta: %v", err)
	}
	if url != altURL {
		t.Errorf("reported artwork URL = %q, want the alternate %q", url, altURL)
	}

	// And when the preferred file stands, it is the one reported.
	p2, _, req2 := posterPipeline(t, makeTestPNG(550, 780, color.NRGBA{G: 255, A: 255}), makeTestPNG(700, 1000, color.NRGBA{B: 255, A: 255}))
	_, _, _, _, url2, err := p2.fetchSourceImageAndMeta(context.Background(), req2)
	if err != nil {
		t.Fatalf("fetchSourceImageAndMeta: %v", err)
	}
	if url2 != origURL {
		t.Errorf("reported artwork URL = %q, want the preferred %q", url2, origURL)
	}
}
