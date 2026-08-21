package compose

import (
	"bytes"
	"context"
	"image"
	"sync"

	"xrdb_rewrite/internal/logging"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/render"
)

// A source can publish two files for one poster and be wrong about which is
// better. Kitsu's "original" is often smaller than its "large", sometimes
// landscape, and its API reports no dimensions for either, so the choice can
// only be made from the bytes.
//
// The preferred file is kept outright when it is portrait and at least as large
// as the delivered image. Otherwise the alternate is fetched and the better of
// the two is kept, which is not the same as preferring the alternate: at the
// larger tiers both files can be under the delivered size and the preferred one
// is still the bigger.
type posterVerdict struct {
	bounds image.Point
	usable bool
}

// badPosters remembers preferred files that lost, so a title costs one extra
// fetch once rather than on every render. Bounded, because a catalogue sweep
// would otherwise grow it without limit.
type badPosters struct {
	mu   sync.Mutex
	urls map[string]struct{}
}

const badPosterLimit = 4096

func (b *badPosters) has(url string) bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	_, ok := b.urls[url]
	return ok
}

func (b *badPosters) remember(url string) {
	if url == "" {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.urls == nil {
		b.urls = make(map[string]struct{})
	}
	if len(b.urls) >= badPosterLimit {
		for k := range b.urls {
			delete(b.urls, k)
			break
		}
	}
	b.urls[url] = struct{}{}
}

// imageBounds reads an image's dimensions from its header. DecodeConfig reads
// far less than a full decode, which matters because this runs on the artwork
// of every render that has an alternate.
func imageBounds(data []byte) (image.Point, bool) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 {
		return image.Point{}, false
	}
	return image.Point{X: cfg.Width, Y: cfg.Height}, true
}

// judgePoster measures the bytes against the delivered size. Portrait is the
// whole of the shape rule: a poster wider than it is tall is unusable, and one
// that is taller than it is wide is fine at any ratio. Anything narrow enough to
// call principled also throws away posters that look perfectly good.
func judgePoster(data []byte, want image.Point) posterVerdict {
	size, ok := imageBounds(data)
	if !ok {
		return posterVerdict{}
	}
	portrait := size.Y > size.X
	return posterVerdict{
		bounds: size,
		usable: portrait && size.X >= want.X && size.Y >= want.Y,
	}
}

// posterURLFor swaps in the alternate when the preferred file has already lost
// once for this title, so a known-bad file is not fetched again.
func (p *Pipeline) posterURLFor(ctx context.Context, meta *provider.MediaMeta, url string) string {
	if meta == nil || meta.PosterAltURL == "" || url != meta.PosterURL {
		return url
	}
	if !p.badPosters.has(url) {
		return url
	}
	// Logged as well as the swap that first made the decision. Without this the
	// choice announces itself once per process and is silent for the rest of it,
	// so a render cannot be told from one where the alternate was never used.
	p.log().DebugContext(ctx, "Went straight to the alternate poster file, the preferred one lost before",
		"id", logging.RequestID(ctx), "url", meta.PosterAltURL)
	return meta.PosterAltURL
}

// betterPoster returns the artwork to use, fetching the alternate only when the
// preferred file is not already good enough.
func (p *Pipeline) betterPoster(ctx context.Context, req Request, meta *provider.MediaMeta, url string, data []byte) ([]byte, string) {
	// Tied to the poster: the alternate describes PosterURL, and another
	// surface, or a poster merged in from a different provider, is not it.
	if meta == nil || meta.PosterAltURL == "" || url != meta.PosterURL {
		return data, url
	}

	want := render.DeliveryFor(req.MediaType, string(req.Config.Size))
	target := image.Point{X: want.Width, Y: want.Height}

	preferred := judgePoster(data, target)
	if preferred.usable {
		return data, url
	}

	alt, err := p.fetcher.Fetch(ctx, meta.PosterAltURL)
	if err != nil || len(alt) == 0 {
		return data, url
	}
	altVerdict := judgePoster(alt, target)
	if !preferPoster(preferred, altVerdict) {
		return data, url
	}
	p.badPosters.remember(url)
	p.log().DebugContext(ctx, "Took the alternate poster file, the preferred one was worse",
		"id", logging.RequestID(ctx), "media_id", req.MediaID,
		"preferred_w", preferred.bounds.X, "preferred_h", preferred.bounds.Y,
		"alt_w", altVerdict.bounds.X, "alt_h", altVerdict.bounds.Y)
	return alt, meta.PosterAltURL
}

// preferPoster reports whether the alternate should displace the preferred file.
// Shape decides first, so a landscape file loses to a portrait one whatever
// their sizes; between two portrait files the larger area wins.
func preferPoster(preferred, alt posterVerdict) bool {
	if alt.bounds == (image.Point{}) {
		return false
	}
	preferredPortrait := preferred.bounds.Y > preferred.bounds.X
	altPortrait := alt.bounds.Y > alt.bounds.X
	if preferredPortrait != altPortrait {
		return altPortrait
	}
	return alt.bounds.X*alt.bounds.Y > preferred.bounds.X*preferred.bounds.Y
}
