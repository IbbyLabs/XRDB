package provider

import "testing"

// The alternative path skips the top-voted candidate to reach visibly different
// art, which walks further into community uploads than the canonical pick does.
// A wrong or vandalised image is downvoted rather than removed, so the vote
// floor is the only thing standing between that and a render.
func TestAlternativeHonoursTheQualityFloor(t *testing.T) {
	en := "en"
	images := []tmdbImage{
		{FilePath: "/canonical.jpg", Iso639: &en, VoteAverage: 8, VoteCount: 200, Width: 2000, Height: 3000},
		{FilePath: "/good-alternate.jpg", Iso639: &en, VoteAverage: 6, VoteCount: 40, Width: 2000, Height: 3000},
		{FilePath: "/unvetted.jpg", Iso639: &en, VoteAverage: 0, VoteCount: 0, Width: 2000, Height: 3000},
	}

	// Without a floor the arm skips the top candidate and takes the next one
	// down, which is the second-best alternate.
	got := selectImagePath(images, "/canonical.jpg", "en", ArtworkOptions{TextPreference: "alternative"})
	if got != "/unvetted.jpg" {
		t.Fatalf("with no floor, want the skipped-to candidate /unvetted.jpg, got %q", got)
	}

	// A vote-count floor removes the unvetted upload from the pool entirely, so
	// the only remaining candidate is returned rather than skipped past.
	got = selectImagePath(images, "/canonical.jpg", "en", ArtworkOptions{
		TextPreference:     "alternative",
		RandomMinVoteCount: 10,
	})
	if got != "/good-alternate.jpg" {
		t.Fatalf("a vote-count floor should exclude the zero-vote upload, got %q", got)
	}

	// A vote-average floor does the same on the other axis.
	got = selectImagePath(images, "/canonical.jpg", "en", ArtworkOptions{
		TextPreference:   "alternative",
		RandomMinVoteAvg: 5,
	})
	if got != "/good-alternate.jpg" {
		t.Fatalf("a vote-average floor should exclude the zero-score upload, got %q", got)
	}
}

func TestQualityFloorRejectsUndersizedArt(t *testing.T) {
	en := "en"
	images := []tmdbImage{
		{FilePath: "/canonical.jpg", Iso639: &en, VoteAverage: 8, VoteCount: 200, Width: 2000, Height: 3000},
		{FilePath: "/thumbnail.jpg", Iso639: &en, VoteAverage: 7, VoteCount: 50, Width: 300, Height: 450},
		{FilePath: "/full-size.jpg", Iso639: &en, VoteAverage: 6, VoteCount: 50, Width: 2000, Height: 3000},
	}
	got := selectImagePath(images, "/canonical.jpg", "en", ArtworkOptions{
		TextPreference: "alternative",
		RandomMinWidth: 1000,
	})
	if got != "/full-size.jpg" {
		t.Fatalf("a width floor should exclude the undersized upload, got %q", got)
	}
}
