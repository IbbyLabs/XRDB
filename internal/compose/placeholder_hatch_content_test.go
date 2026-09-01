package compose

import (
	"bytes"
	"image"
	"image/color"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// renderBadges draws one badge onto a flat background and returns the pixels.
func renderBadges(draw func(*image.NRGBA, *occupancy)) []byte {
	base := image.NewNRGBA(image.Rect(0, 0, 400, 300))
	bg := color.NRGBA{R: 90, G: 120, B: 150, A: 255}
	for y := range 300 {
		for x := range 400 {
			base.SetNRGBA(x, y, bg)
		}
	}
	draw(base, newOccupancy(base.Bounds()))
	return base.Pix
}

// The ruling means "there is nothing here", so a badge holding real content
// must draw the same under either placeholder style. Marker is compared against
// value rather than against a fixed image: the two differ only in the ruling,
// so an equal result is the ruling being absent rather than the badge being
// unchanged for some other reason (FR-204, FR-205).
func TestAPopulatedBadgeIsNotHatched(t *testing.T) {
	value := imageconfig.Default()
	value.GenrePlaceholder = true
	value.AgeRatingPlaceholder = true
	marker := value
	marker.PlaceholderStyle = "marker"

	genres := []string{"Crime", "Drama"}
	valueGenre := renderBadges(func(b *image.NRGBA, occ *occupancy) {
		drawGenreBadge(b, genres, "tl", 2, occ, genreOptsFromConfig(value, false, "movie"))
	})
	markerGenre := renderBadges(func(b *image.NRGBA, occ *occupancy) {
		drawGenreBadge(b, genres, "tl", 2, occ, genreOptsFromConfig(marker, false, "movie"))
	})
	if !bytes.Equal(valueGenre, markerGenre) {
		t.Error("a genre badge holding genres is ruled through under the marker style")
	}

	valueAge := renderBadges(func(b *image.NRGBA, occ *occupancy) {
		drawAgeRatingBadge(b, "R", "tl", 2, occ, ageOptsFromConfig(value))
	})
	markerAge := renderBadges(func(b *image.NRGBA, occ *occupancy) {
		drawAgeRatingBadge(b, "R", "tl", 2, occ, ageOptsFromConfig(marker))
	})
	if !bytes.Equal(valueAge, markerAge) {
		t.Error("an age badge holding a rating is ruled through under the marker style")
	}

	// The control. Both must still differ on an empty badge, or the comparison
	// above would pass on a marker style that had stopped ruling anything.
	emptyValue := renderBadges(func(b *image.NRGBA, occ *occupancy) {
		drawGenreBadge(b, nil, "tl", 2, occ, genreOptsFromConfig(value, false, "movie"))
	})
	emptyMarker := renderBadges(func(b *image.NRGBA, occ *occupancy) {
		drawGenreBadge(b, nil, "tl", 2, occ, genreOptsFromConfig(marker, false, "movie"))
	})
	if bytes.Equal(emptyValue, emptyMarker) {
		t.Error("an empty genre badge draws the same under both styles, so the ruling is not being applied at all")
	}
}
