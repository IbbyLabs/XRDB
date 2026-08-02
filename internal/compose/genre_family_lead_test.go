package compose

import (
	"reflect"
	"testing"
)

// The family glyph is chosen from the whole list, but the words are trimmed from
// the source order, so a family genre late in the list was dropped and the plate
// showed a glyph the words no longer named. leadWithFamily moves it to the front
// so a cap of one still keeps it.
func TestTheFamilyGenreLeadsSoTheTrimCannotDropIt(t *testing.T) {
	// Comedy has a higher family priority than the action Adventure maps to, so
	// the glyph is Comedy while Comedy sits last in source order.
	genres := []string{"Action", "Adventure", "Thriller", "Comedy"}
	fam := resolveGenreFamilyGrouped(genres, false, "")
	if fam == nil || fam.id != "comedy" {
		t.Fatalf("fixture assumption wrong: family resolved to %v", fam)
	}

	led := leadWithFamily(genres, false, "")
	if led[0] != "Comedy" {
		t.Errorf("the family genre did not lead: %v", led)
	}
	// A cap of one keeps exactly the family genre.
	if led[0] != "Comedy" {
		t.Errorf("a one-genre cap would drop the family genre: kept %q", led[0])
	}

	// Reordering must not change which family the glyph draws.
	if after := resolveGenreFamilyGrouped(led, false, ""); after == nil || after.id != fam.id {
		t.Errorf("reordering changed the resolved family from %s to %v", fam.id, after)
	}
}

// A genre already leading, or a list where every genre shares the family, is
// left exactly as it was.
func TestLeadWithFamilyLeavesAnAlreadyLedListAlone(t *testing.T) {
	genres := []string{"Horror", "Thriller", "Mystery"}
	if got := leadWithFamily(genres, false, ""); !reflect.DeepEqual(got, genres) {
		t.Errorf("an already-led list was reordered: %v", got)
	}
}

// An anime-family title resolves from the isAnime flag, not a genre word, so
// there is nothing to promote and the order stands.
func TestLeadWithFamilyLeavesAnimeOrderAlone(t *testing.T) {
	genres := []string{"Action", "Comedy", "Drama"}
	if got := leadWithFamily(genres, true, ""); !reflect.DeepEqual(got, genres) {
		t.Errorf("an anime title had its genre order changed: %v", got)
	}
}
