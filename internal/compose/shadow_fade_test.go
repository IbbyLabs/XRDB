package compose

import (
	"image"
	"image/color"
	"image/draw"
	"testing"
)

// tileShadowField draws a badge-sized shadow on a flat light field and returns how far
// each sampled pixel was darkened. Light, because a shadow is only measurable
// against artwork brighter than itself.
func tileShadowField(radius int) (*image.NRGBA, image.Rectangle) {
	img := image.NewNRGBA(image.Rect(0, 0, 300, 200))
	draw.Draw(img, img.Bounds(), &image.Uniform{color.NRGBA{R: 200, G: 200, B: 200, A: 255}}, image.Point{}, draw.Src)
	r := image.Rect(60, 60, 240, 120)
	drawTileShadow(img, r, radius, color.NRGBA{A: 70})
	return img, r
}

func TestTheShadowFadesOnEverySide(t *testing.T) {
	img, r := tileShadowField(10)
	darkening := func(x, y int) int { return 200 - int(img.NRGBAAt(x, y).R) }

	// A shadow the exact width of its badge, with nothing beyond the edge,
	// reads as a ruled line rather than a shadow.
	mid := (r.Min.Y + r.Max.Y) / 2
	if d := darkening(r.Max.X+2, mid); d <= 0 {
		t.Errorf("nothing beside the right edge: darkening %d", d)
	}
	if d := darkening(r.Min.X-3, mid); d <= 0 {
		t.Errorf("nothing beside the left edge: darkening %d", d)
	}

	// And it has to stop: a shadow that never reaches the background is a wash.
	if d := darkening(r.Max.X+40, mid); d != 0 {
		t.Errorf("still darkened 40px out: darkening %d", d)
	}
}

func TestTheShadowHasNoFlatBandBelowTheBadge(t *testing.T) {
	img, r := tileShadowField(10)
	col := (r.Min.X + r.Max.X) / 2

	var profile []int
	for y := r.Max.Y; y < r.Max.Y+40 && y < 200; y++ {
		profile = append(profile, 200-int(img.NRGBAAt(col, y).R))
	}

	// Every row below the badge is lighter than the one above it until the
	// shadow is gone. Repeats mean an unblurred copy of the badge is being laid
	// down before the fade starts.
	repeats := 0
	for i := 1; i < len(profile); i++ {
		if profile[i] == 0 {
			break
		}
		if profile[i] >= profile[i-1] {
			repeats++
		}
	}
	if repeats > 1 {
		t.Errorf("the shadow holds its value for %d rows below the badge: %v", repeats, profile[:12])
	}
	if profile[len(profile)-1] != 0 {
		t.Errorf("the shadow never reaches the background: %v", profile)
	}
}
