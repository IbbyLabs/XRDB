package compose

import (
	"bytes"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// BUG-271. drawMetaLine was called inside the age rating badge's guard, so the
// info line drew only when that badge was on and the title had a rating. The
// line's own toggle is metaLine and the age rating is one of its three parts,
// the others being the year and the genre.
//
// The draw function was always correct; only the call site was wrong, so this
// has to go through the pipeline rather than call drawMetaLine directly.
func TestTheInfoLineDrawsWithTheAgeRatingBadgeOff(t *testing.T) {
	p := effectPipeline()

	off := imageconfig.Default()
	off.AgeRating = false
	off.MetaLine = false

	on := off
	on.MetaLine = true

	var differed bool
	for _, surface := range effectSurfaces {
		a := renderOne(t, p, off, "movie", surface)
		b := renderOne(t, p, on, "movie", surface)
		if a == nil || b == nil {
			continue
		}
		if !bytes.Equal(a, b) {
			differed = true
			break
		}
	}
	if !differed {
		t.Error("switching the info line on changed nothing while the age rating badge was off")
	}
}
