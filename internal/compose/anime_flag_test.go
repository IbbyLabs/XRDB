package compose

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// Resolving the flag costs a mapper lookup, so it has to be tied to the things
// that actually read it.
func TestAnimeFlagIsResolvedOnlyWhenSomethingReadsIt(t *testing.T) {
	base := imageconfig.Default()
	base.Genre = false
	base.AggregateBar = false
	base.RatingPresentation = ""

	if needsAnimeFlag(base) {
		t.Error("a config that draws neither the genre badge nor an anime-aware rating asked for the lookup")
	}

	genre := base
	genre.Genre = true
	if !needsAnimeFlag(genre) {
		t.Error("the genre badge separates anime from animation and needs the flag")
	}

	bar := base
	bar.AggregateBar = true
	if !needsAnimeFlag(bar) {
		t.Error("the aggregate bar reads the flag")
	}

	for _, mode := range []string{"minimal", "dual", "dual-minimal", "average", "scorebar"} {
		c := base
		c.RatingPresentation = mode
		if !needsAnimeFlag(c) {
			t.Errorf("presentation %q reads the flag", mode)
		}
	}

	for _, mode := range []string{"", "none", "editorial"} {
		c := base
		c.RatingPresentation = mode
		if needsAnimeFlag(c) {
			t.Errorf("presentation %q does not read the flag", mode)
		}
	}
}
