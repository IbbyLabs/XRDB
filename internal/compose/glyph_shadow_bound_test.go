package compose

import (
	"image"
	"image/color"
	"runtime"
	"testing"
)

func TestMaxShadowPadKeepsTheMaskBounded(t *testing.T) {
	for _, sz := range [][2]int{{10, 10}, {800, 300}, {3000, 1200}, {2048, 2048}, {4000, 2000}} {
		p := maxShadowPad(sz[0], sz[1])
		if cells := (sz[0] + 2*p) * (sz[1] + 2*p); p > 0 && cells > maxShadowMaskCells {
			t.Errorf("%v: pad %d gives %d cells", sz, p, cells)
		}
		if next := (sz[0] + 2*(p+1)) * (sz[1] + 2*(p+1)); next <= maxShadowMaskCells {
			t.Errorf("%v: pad %d is not the widest that fits", sz, p)
		}
	}
}

// The widest spread and offsets on a large mark stay within the mask bound.
func TestGlyphShadowAtMaximumSpreadStaysBounded(t *testing.T) {
	logo := image.NewNRGBA(image.Rect(0, 0, 2400, 900))
	for i := range logo.Pix {
		logo.Pix[i] = 255
	}
	base := image.NewNRGBA(image.Rect(0, 0, 3840, 2160))
	const budget = 400 << 20
	for _, style := range []string{"", logoShadowExtrude, logoShadowGel} {
		var before, after runtime.MemStats
		runtime.GC()
		runtime.ReadMemStats(&before)
		drawGlyphShadow(base, logo, 700, 600, glyphShadowOpts{spread: 400, offsetX: 1200, offsetY: 1200, style: style, color: color.NRGBA{}})
		runtime.ReadMemStats(&after)
		if got := after.TotalAlloc - before.TotalAlloc; got > budget {
			t.Errorf("style %q allocated %d MiB", style, got>>20)
		}
	}
}
