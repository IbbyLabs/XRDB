package compose

import (
	"image"
	"testing"

	"xrdb_rewrite/internal/provider"
)

func awardInk(img *image.NRGBA) int {
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

// A win and a nomination must both draw, and a win must not look like a
// nomination — they use different accents, so the pixels differ.
func TestAwardsBadgeDrawsWinAndNominationDistinctly(t *testing.T) {
	ensureFaces()

	win := image.NewNRGBA(image.Rect(0, 0, 400, 200))
	drawAwardsBadge(win, provider.AwardSummary{Kind: "oscar", Won: true}, "tr", 1.0, newOccupancy(image.Rect(0, 0, 400, 200)))
	nom := image.NewNRGBA(image.Rect(0, 0, 400, 200))
	drawAwardsBadge(nom, provider.AwardSummary{Kind: "oscar", Won: false}, "tr", 1.0, newOccupancy(image.Rect(0, 0, 400, 200)))

	if awardInk(win) == 0 {
		t.Fatal("the winner badge drew nothing")
	}
	if awardInk(nom) == 0 {
		t.Fatal("the nominee badge drew nothing")
	}
	// "WINNER" is longer than "NOMINEE"? No — both differ in accent colour, so
	// compare the actual pixels rather than ink count.
	same := true
	for y := 0; y < 200 && same; y++ {
		for x := 0; x < 400; x++ {
			if win.NRGBAAt(x, y) != nom.NRGBAAt(x, y) {
				same = false
				break
			}
		}
	}
	if same {
		t.Error("winner and nominee badges are pixel-identical")
	}
}

// An empty summary draws nothing.
func TestAwardsBadgeEmptyDrawsNothing(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 400, 200))
	drawAwardsBadge(img, provider.AwardSummary{}, "tr", 1.0, newOccupancy(image.Rect(0, 0, 400, 200)))
	if awardInk(img) != 0 {
		t.Error("an empty award summary drew a badge")
	}
}
