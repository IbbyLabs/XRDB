package compose

import "testing"

func specsOfWidth(widths ...int) []badgeSpec {
	out := make([]badgeSpec, len(widths))
	for i, w := range widths {
		out[i] = badgeSpec{w: w}
	}
	return out
}

// The reported defect: each badge is as wide as its own contents, so a column of
// them shows a different right edge per source. Matching the value scale cannot
// fix it, because the marks differ in width before the value is drawn.
func TestUniformWidthGivesEveryBadgeTheWidest(t *testing.T) {
	specs := specsOfWidth(115, 148, 105)
	applyUniformWidth(specs)
	for i, sp := range specs {
		if sp.w != 148 {
			t.Errorf("badge %d is %d wide, want 148 (the widest)", i, sp.w)
		}
	}
}

// The natural width has to survive, or the contents cannot be centred in the
// space and the padding all lands on one side.
func TestUniformWidthRemembersWhatEachBadgeNeeded(t *testing.T) {
	specs := specsOfWidth(115, 148, 105)
	applyUniformWidth(specs)
	for i, want := range []int{115, 148, 105} {
		if specs[i].natW != want {
			t.Errorf("badge %d recorded natural width %d, want %d", i, specs[i].natW, want)
		}
	}
}

// It pads to the widest and no further: the widest badge must not grow, or the
// strip gets wider than anything in it needs.
func TestUniformWidthDoesNotGrowTheWidest(t *testing.T) {
	specs := specsOfWidth(115, 148, 105)
	applyUniformWidth(specs)
	if specs[1].w != specs[1].natW {
		t.Errorf("the widest badge grew from %d to %d", specs[1].natW, specs[1].w)
	}
}

// Already-equal badges must come out unchanged, so the pass cannot be credited
// with an alignment that was there anyway.
func TestUniformWidthLeavesEqualBadgesAlone(t *testing.T) {
	specs := specsOfWidth(120, 120)
	applyUniformWidth(specs)
	for i, sp := range specs {
		if sp.w != 120 || sp.natW != 120 {
			t.Errorf("badge %d became %d (natural %d), want 120", i, sp.w, sp.natW)
		}
	}
}

// An empty strip must not panic on the max of nothing.
func TestUniformWidthHandlesAnEmptyStrip(t *testing.T) {
	applyUniformWidth(nil)
	applyUniformWidth([]badgeSpec{})
}
