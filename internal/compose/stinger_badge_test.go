package compose

import (
	"image"
	"testing"

	"xrdb_rewrite/internal/provider"
)

func stingerInk(img *image.NRGBA) int {
	n := 0
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if img.NRGBAAt(x, y).A > 0 {
				n++
			}
		}
	}
	return n
}

func TestStingerLabel(t *testing.T) {
	cases := map[provider.StingerInfo]string{
		{PostCredits: true}:              "POST-CREDITS",
		{MidCredits: true}:               "MID-CREDITS",
		{MidCredits: true, PostCredits: true}: "STINGER",
		{}:                               "",
	}
	for s, want := range cases {
		if got := stingerLabel(s); got != want {
			t.Errorf("%+v -> %q, want %q", s, got, want)
		}
	}
}

func TestStingerBadgeDrawsAndEmptyDoesNot(t *testing.T) {
	ensureFaces()
	drawn := image.NewNRGBA(image.Rect(0, 0, 400, 200))
	drawStingerBadge(drawn, provider.StingerInfo{PostCredits: true}, "bl", 1.0, newOccupancy(image.Rect(0, 0, 400, 200)))
	if stingerInk(drawn) == 0 {
		t.Error("a post-credits stinger drew no badge")
	}
	empty := image.NewNRGBA(image.Rect(0, 0, 400, 200))
	drawStingerBadge(empty, provider.StingerInfo{}, "bl", 1.0, newOccupancy(image.Rect(0, 0, 400, 200)))
	if stingerInk(empty) != 0 {
		t.Error("an empty stinger drew a badge")
	}
}
