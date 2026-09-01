package server

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// An episode grid is more tiles per screen than a row of posters, so a
// thumbnail surface reaches the cap while asking for less (FR-179).
func TestAThumbnailCostsLessOfTheCapThanAPoster(t *testing.T) {
	if got := capCost("poster"); got != weightUnit {
		t.Errorf("poster costs %d, want weightUnit %d", got, weightUnit)
	}
	if got := capCost("thumbnail"); got >= capCost("poster") {
		t.Errorf("thumbnail costs %d and poster %d; the cheaper surface gains nothing", got, capCost("poster"))
	}
	if got := capCost("logo"); got >= capCost("poster") {
		t.Errorf("logo costs %d, want less than a poster", got)
	}
}

// Charging by size as well was rejected: it refuses a 4K caller more than the
// flat count already does. The cap prices the surface alone.
func TestTheCapDoesNotChargeMoreForALargerRender(t *testing.T) {
	for _, mediaType := range []string{"poster", "backdrop", "thumbnail", "logo"} {
		want := capCost(mediaType)
		for _, size := range []imageconfig.MediaSize{
			imageconfig.SizeSmall, imageconfig.SizeNormal, imageconfig.SizeLarge, imageconfig.Size4K,
		} {
			if got := capCost(mediaType); got != want {
				t.Errorf("%s costs %d at %s and %d elsewhere; the cap is reading the size",
					mediaType, got, size, want)
			}
		}
	}
	// The control: the render weight does vary with size, so a cap that ignored
	// it is a choice rather than a property of every weight function.
	if renderWeight("poster", imageconfig.Size4K) <= renderWeight("poster", imageconfig.SizeNormal) {
		t.Fatal("render weight does not rise with size, so this proves nothing about the cap")
	}
	if capCost("poster") == renderWeight("poster", imageconfig.Size4K) {
		t.Error("the cap charges a 4K poster its render weight; that is the rejected shape")
	}
}

// A configured cap has a documented meaning and the rescaling has to preserve
// it: 30 a minute stays 30 posters a minute.
func TestTheConfiguredCapStillMeansThatManyPosters(t *testing.T) {
	const perMinute = 30
	l := newCallerLimiter(perMinute * weightUnit)

	for i := range perMinute {
		if ok, _ := l.allow(capCost("poster"), "ip:203.0.113.7"); !ok {
			t.Fatalf("a poster was refused after %d of %d", i, perMinute)
		}
	}
	// The burst is twice the rate, so the allowance is not spent yet; what
	// matters is that thumbnails outlast posters on the same budget.
	thumbs := 0
	for {
		ok, _ := l.allow(capCost("thumbnail"), "ip:203.0.113.7")
		if !ok {
			break
		}
		thumbs++
		if thumbs > 10_000 {
			t.Fatal("the thumbnail cost is zero; the cap cannot refuse")
		}
	}
	// Equal to the poster count is what a flat cost gives, so the assertion has
	// to be strictly more or it passes against no discount at all.
	if thumbs <= perMinute {
		t.Errorf("only %d thumbnails fitted after %d posters; the cheap surface gained nothing", thumbs, perMinute)
	}
}
