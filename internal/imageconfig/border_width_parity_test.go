package imageconfig

import (
	"encoding/json"
	"fmt"
	"testing"
)

// The rating, genre and age-rating badges share one border control: the same
// three-state selector and the same 1..6 number field. Their server-side bounds
// were written separately and drifted, and the configurator bounds guard cannot
// see two of them because those two are float64 and it reads clampInt.
//
// ageRatingBorderWidth had no bound at all, so a hand-written config set a
// border width of any size while its twin stopped at 8.
func TestTheThreeBorderWidthsAgreeOnTheirBounds(t *testing.T) {
	const aboveAnyCeiling = 100000

	for _, field := range []string{
		"ratingBadgeBorderWidth",
		"genreBadgeBorderWidth",
		"ageRatingBorderWidth",
	} {
		t.Run(field, func(t *testing.T) {
			if off := borderWidthOf(t, field, -1); off != -1 {
				t.Errorf("a negative width parsed to %v, want the -1 off sentinel", off)
			}
			if big := borderWidthOf(t, field, aboveAnyCeiling); big <= 0 || big > 8 {
				t.Errorf("a width of %d parsed to %v, want it bounded at or below 8",
					aboveAnyCeiling, big)
			}
			if inRange := borderWidthOf(t, field, 3); inRange != 3 {
				t.Errorf("a width of 3 parsed to %v, want it kept", inRange)
			}
		})
	}
}

func borderWidthOf(t *testing.T, field string, v int) float64 {
	t.Helper()
	cfg := Parse(json.RawMessage(fmt.Sprintf(`{%q: %d}`, field, v)))
	switch field {
	case "ratingBadgeBorderWidth":
		return float64(cfg.RatingBadgeBorderWidth)
	case "genreBadgeBorderWidth":
		return cfg.GenreBadgeBorderWidth
	case "ageRatingBorderWidth":
		return cfg.AgeRatingBorderWidth
	}
	t.Fatalf("unknown field %q", field)
	return 0
}
