package compose

import (
	"image/color"
	"os"
	"regexp"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

func TestARankTabAndAReleasePillShareTheTopRightCorner(t *testing.T) {
	cfg := imageconfig.Default()
	cfg.TrendingRank, cfg.TrendingRankPos = true, "tr"
	img := contentionImage()
	occ := newOccupancy(img.Bounds())

	drawTrendingRankTab(img, occ, 5, cfg, 2.0)
	if len(occ.rects) != 1 {
		t.Fatalf("the tab reserved %d rects, want 1", len(occ.rects))
	}
	tab := occ.rects[0]
	drawReleaseBadge(img, "Digital", color.NRGBA{R: 120, G: 200, B: 255, A: 255}, "tr", 2.0, occ, releaseStatusOpts{style: "pill"})
	if len(occ.rects) < 2 {
		t.Fatal("the release pill reserved nothing")
	}
	for _, r := range occ.rects[1:] {
		if r.Overlaps(tab) {
			t.Errorf("the release pill %v overlaps the rank tab %v", r, tab)
		}
	}
}

// The tab is pinned to the top edge and never shifted, so it reserves before
// every plate that places through the occupancy map.
func TestTheHangingRankTabReservesBeforeTheCornerPlates(t *testing.T) {
	src, err := os.ReadFile("compose.go")
	if err != nil {
		t.Fatalf("cannot read the pipeline: %v", err)
	}
	body := string(src)
	start := regexp.MustCompile(`(?m)^func \(p \*Pipeline\) Render\(`).FindStringIndex(body)
	if start == nil {
		t.Fatal("Render is no longer here; this guard cannot run")
	}
	body = body[start[0]:]
	tab := regexp.MustCompile(`\bdrawTrendingRankTab\(`).FindStringIndex(body)
	if tab == nil {
		t.Fatal("drawTrendingRankTab is no longer drawn in Render")
	}
	for _, plate := range []string{"drawQualityBadges", "drawMetaLine", "drawAgeRatingBadge", "drawReleaseBadge",
		"drawTopRatedBadge", "drawAwardsBadge", "drawStingerBadge"} {
		at := regexp.MustCompile(`\b` + plate + `\(`).FindStringIndex(body)
		if at != nil && at[0] < tab[0] {
			t.Errorf("%s is drawn before the hanging rank tab, which then covers it", plate)
		}
	}
}
