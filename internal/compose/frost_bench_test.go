package compose

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"math"
	"sync"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// sizedArtFetcher returns smooth, textured artwork at the poster size the
// benchmark asks for, so the frame is as wide as the output tier and the
// badges scale with it.
type sizedArtFetcher struct {
	w, h int
	once sync.Once
	body []byte
}

func (f *sizedArtFetcher) Fetch(_ context.Context, _ string) ([]byte, error) {
	f.once.Do(func() {
		img := image.NewNRGBA(image.Rect(0, 0, f.w, f.h))
		for y := 0; y < f.h; y++ {
			for x := 0; x < f.w; x++ {
				v := 0.5 + 0.5*math.Sin(float64(x)/37)*math.Cos(float64(y)/53)
				img.SetNRGBA(x, y, color.NRGBA{
					R: uint8(40 + 160*v),
					G: uint8(255 * float64(y) / float64(f.h)),
					B: uint8(255 * float64(x) / float64(f.w)),
					A: 255,
				})
			}
		}
		var buf bytes.Buffer
		enc := png.Encoder{CompressionLevel: png.BestSpeed}
		_ = enc.Encode(&buf, img)
		f.body = buf.Bytes()
	})
	return f.body, nil
}

// worstCaseFrostConfig turns on every badge family with a full ratings strip.
func worstCaseFrostConfig(size imageconfig.MediaSize) imageconfig.Config {
	c := maximalConfig()
	c.Size = size
	c.OutputFormat = imageconfig.OutputJPEG
	c.OutputQuality = 80
	c.Ratings = []string{"imdb", "tmdb", "rt", "metacritic", "letterboxd", "trakt"}
	return c
}

func benchmarkFrost(b *testing.B, size imageconfig.MediaSize, w, h int, frost bool) {
	p := effectPipeline()
	p.fetcher = &sizedArtFetcher{w: w, h: h}
	cfg := worstCaseFrostConfig(size)
	if frost {
		cfg.BadgeFrost = 100
		cfg.LogoFrost = true
	}
	req := Request{MediaType: "poster", ContentType: "movie", MediaID: "tt1375666", Config: cfg}
	if res, err := p.Render(context.Background(), req); err != nil || res.Placeholder {
		b.Fatalf("warm-up render failed: err=%v placeholder=%v", err, res != nil && res.Placeholder)
	}
	b.ReportAllocs()
	b.ResetTimer()
	for range b.N {
		if _, err := p.Render(context.Background(), req); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkFrostRender(b *testing.B) {
	for _, tier := range []struct {
		name string
		size imageconfig.MediaSize
		w, h int
	}{
		{"1x", imageconfig.SizeNormal, 780, 1170},
		{"4K", imageconfig.Size4K, 2340, 3510},
	} {
		b.Run(tier.name+"/off", func(b *testing.B) { benchmarkFrost(b, tier.size, tier.w, tier.h, false) })
		b.Run(tier.name+"/on", func(b *testing.B) { benchmarkFrost(b, tier.size, tier.w, tier.h, true) })
	}
}

// BenchmarkFrostPanel times one badge-sized blur and one logo-sized blur at
// each output tier, without the decode and encode around a real render.
func BenchmarkFrostPanel(b *testing.B) {
	for _, tier := range []struct {
		name    string
		w, h    int
		scale   int
		logoStr int
	}{
		{"1x", 780, 1170, 1, frostLogoStrength},
		{"4K", 2340, 3510, 3, frostLogoStrength},
	} {
		base := noiseImage(tier.w, tier.h)
		badge := image.Rect(40*tier.scale, tier.h-120*tier.scale, 240*tier.scale, tier.h-60*tier.scale)
		logo := image.Rect(tier.w/2-tier.w*65/200, tier.h*45/100, tier.w/2+tier.w*65/200, tier.h*65/100)
		b.Run(tier.name+"/badge", func(b *testing.B) {
			for range b.N {
				frostRoundedRect(base, badge, 14*tier.scale, squareNone, 100)
			}
		})
		b.Run(tier.name+"/logo", func(b *testing.B) {
			for range b.N {
				frostFeatheredRect(base, logo, 10*tier.scale, tier.logoStr)
			}
		})
	}
}

// recordFrostCalls renders the worst-case poster once with frost on and returns
// every blur the render asked for.
func recordFrostCalls(b *testing.B, size imageconfig.MediaSize, w, h int) []frostCall {
	b.Helper()
	p := effectPipeline()
	p.fetcher = &sizedArtFetcher{w: w, h: h}
	cfg := worstCaseFrostConfig(size)
	cfg.BadgeFrost = 100
	cfg.LogoFrost = true
	var calls []frostCall
	frostObserver = func(c frostCall) { calls = append(calls, c) }
	defer func() { frostObserver = nil }()
	req := Request{MediaType: "poster", ContentType: "movie", MediaID: "tt1375666", Config: cfg}
	if res, err := p.Render(context.Background(), req); err != nil || res.Placeholder {
		b.Fatalf("render failed: err=%v", err)
	}
	return calls
}

// BenchmarkFrostOverlayCost is the compositing cost frost adds to the
// worst-case poster: every blur that render requests, replayed on a frame of the
// same size. Unlike a render with frost on against one with it off, it does not
// move with the decode and encode around it.
func BenchmarkFrostOverlayCost(b *testing.B) {
	for _, tier := range []struct {
		name string
		size imageconfig.MediaSize
		w, h int
	}{
		{"1x", imageconfig.SizeNormal, 780, 1170},
		{"4K", imageconfig.Size4K, 2340, 3510},
	} {
		calls := recordFrostCalls(b, tier.size, tier.w, tier.h)
		base := noiseImage(tier.w, tier.h)
		b.Run(tier.name, func(b *testing.B) {
			b.ReportMetric(float64(len(calls)), "blurs")
			for range b.N {
				for _, c := range calls {
					if c.feathered {
						frostFeatheredRect(base, c.rect, c.feather, c.strength)
					} else {
						frostRoundedRect(base, c.rect, c.radius, c.square, c.strength)
					}
				}
			}
		})
	}
}
