package compose

import (
	"fmt"
	"math"
	"strings"
	"testing"
)

// The new family has to win before the fantasy/sci-fi tie-break, which would
// otherwise claim anything mentioning either word (FR-163).
func TestSciFantasyResolvesToItsOwnFamily(t *testing.T) {
	fam := resolveGenreFamily([]string{"Sci-Fantasy"})
	if fam == nil {
		t.Fatal("no family resolved for Sci-Fantasy")
	}
	if fam.id != "scifantasy" {
		t.Errorf("Sci-Fantasy resolved to %q, want scifantasy", fam.id)
	}
	if fam.accent != "#2bd3c4" {
		t.Errorf("accent = %q, want #2bd3c4", fam.accent)
	}
}

// The split still has to discriminate: these must not be swallowed by the new
// family now that the compound always resolves.
func TestTheSplitStillSeparatesFantasyFromSciFi(t *testing.T) {
	for _, tc := range []struct{ genre, want string }{
		{"Fantasy", "fantasy"},
		{"Science Fiction", "scifi"},
	} {
		fam := resolveGenreFamily([]string{tc.genre})
		if fam == nil || fam.id != tc.want {
			got := "nil"
			if fam != nil {
				got = fam.id
			}
			t.Errorf("%s resolved to %s, want %s", tc.genre, got, tc.want)
		}
	}
}

// Exact-equality is the wrong test here: SOAP's old #2dd4bf and the new family's
// #2bd3c4 are different strings and were 3.4 apart perceptually, which is the
// defect FR-163 moved SOAP to fix. This measures the thing that was wrong.
func deltaE76(hexA, hexB string) float64 {
	toLab := func(h string) (float64, float64, float64) {
		var r8, g8, b8 int
		_, _ = fmt.Sscanf(strings.TrimPrefix(h, "#"), "%02x%02x%02x", &r8, &g8, &b8)
		lin := func(c int) float64 {
			v := float64(c) / 255
			if v <= 0.04045 {
				return v / 12.92
			}
			return math.Pow((v+0.055)/1.055, 2.4)
		}
		r, g, b := lin(r8), lin(g8), lin(b8)
		x := (0.4124*r + 0.3576*g + 0.1805*b) / 0.95047
		y := 0.2126*r + 0.7152*g + 0.0722*b
		z := (0.0193*r + 0.1192*g + 0.9505*b) / 1.08883
		f := func(t float64) float64 {
			if t > 0.008856 {
				return math.Cbrt(t)
			}
			return 7.787*t + 16.0/116
		}
		fx, fy, fz := f(x), f(y), f(z)
		return 116*fy - 16, 500 * (fx - fy), 200 * (fy - fz)
	}
	l1, a1, b1 := toLab(hexA)
	l2, a2, b2 := toLab(hexB)
	return math.Sqrt((l1-l2)*(l1-l2) + (a1-a2)*(a1-a2) + (b1-b2)*(b1-b2))
}

func TestSciFantasyIsPerceptuallySeparatedFromItsNeighbours(t *testing.T) {
	// The floor the palette already meets; SOAP at #2dd4bf was 3.4 from the new
	// family, which is why it moved rather than the new colour being rechosen.
	const floor = 10.0
	for _, other := range []genreFamily{familySoap, familyFantasy, familySciFi} {
		d := deltaE76(familySciFantasy.accent, other.accent)
		if d < floor {
			t.Errorf("Sci-Fantasy %s is %.1f from %s %s, under the %.0f floor",
				familySciFantasy.accent, d, other.id, other.accent, floor)
		}
	}
}

// The old value must not come back: it is the one colour the new family cannot
// coexist with.
func TestSoapDidNotRevertToTheColourItVacated(t *testing.T) {
	if familySoap.accent == "#2dd4bf" {
		t.Error("SOAP is back on #2dd4bf, which sits 3.4 from Sci-Fantasy")
	}
}
