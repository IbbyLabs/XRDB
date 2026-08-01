package server

import (
	"testing"
	"time"
)

func TestARememberedGapIsServedUntilItExpires(t *testing.T) {
	c := newNotFoundCache(time.Minute)
	if c.Has("k") {
		t.Fatal("nothing has been remembered yet")
	}
	c.Remember("k")
	if !c.Has("k") {
		t.Fatal("want the gap remembered")
	}
	if c.Has("other") {
		t.Fatal("want only the key that was remembered")
	}
}

// The term is what keeps a missing poster from being frozen: once it lapses the
// render is attempted again.
func TestARememberedGapLapses(t *testing.T) {
	c := newNotFoundCache(time.Millisecond)
	c.Remember("k")
	time.Sleep(5 * time.Millisecond)
	if c.Has("k") {
		t.Fatal("want the gap to lapse so the render is retried")
	}
	if c.Len() != 0 {
		t.Fatalf("want the lapsed key dropped, %d held", c.Len())
	}
}

// Artwork appearing upstream must show at once rather than waiting out the term.
func TestArtworkAppearingClearsTheGap(t *testing.T) {
	c := newNotFoundCache(time.Hour)
	c.Remember("k")
	c.Forget("k")
	if c.Has("k") {
		t.Fatal("want the gap cleared once artwork rendered")
	}
}

// Zero disables it, and every method has to stay safe on the nil that produces.
func TestZeroDisablesTheCache(t *testing.T) {
	c := newNotFoundCache(0)
	if c != nil {
		t.Fatal("want no cache when the term is zero")
	}
	c.Remember("k")
	c.Forget("k")
	if c.Has("k") || c.Len() != 0 {
		t.Fatal("want a disabled cache to remember nothing")
	}
}

func TestTheCacheStaysBounded(t *testing.T) {
	c := newNotFoundCache(time.Hour)
	for i := 0; i < notFoundCacheMax+500; i++ {
		c.Remember(string(rune(i%1000)) + "-" + time.Duration(i).String())
	}
	if c.Len() > notFoundCacheMax {
		t.Fatalf("want at most %d held, got %d", notFoundCacheMax, c.Len())
	}
}
