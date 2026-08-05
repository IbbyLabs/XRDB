package compose

import "testing"

// The age badge took a style and a tile colour and nothing else, so its glass
// plate could not be tuned and its border could not be aimed. Each control has
// to reach the render on its own (FR-164).
func TestEachAgeRatingStyleControlChangesTheRender(t *testing.T) {
	controls := []struct {
		name string
		with func(*ageRatingOpts)
	}{
		{"background opacity", func(o *ageRatingOpts) { o.bgOpacity = 30 }},
		{"border width", func(o *ageRatingOpts) { o.borderWidth = 4 }},
		{"border colour", func(o *ageRatingOpts) { o.borderColor = "#C81E1E" }},
		{"border opacity", func(o *ageRatingOpts) { o.borderOpacity = 40 }},
		{"label colour", func(o *ageRatingOpts) { o.labelColor = "#22D3EE" }},
	}

	// Every style that draws a plate, so a control cannot reach one and miss the
	// rest. "plain" has no plate and answers the outline controls instead.
	for _, style := range []string{"glass", "square", "silver", "tile", "media"} {
		base := drawAgeRating(ageRatingOpts{style: style})
		for _, c := range controls {
			t.Run(style+"/"+c.name, func(t *testing.T) {
				opts := ageRatingOpts{style: style}
				c.with(&opts)
				if identical(base, drawAgeRating(opts)) {
					t.Errorf("%s does not change the %s badge", c.name, style)
				}
			})
		}
	}
}

// A negative width is how a border is turned off, which is not the same as
// leaving it unset.
func TestANegativeAgeRatingBorderWidthRemovesTheBorder(t *testing.T) {
	withBorder := drawAgeRating(ageRatingOpts{style: "glass"})
	none := drawAgeRating(ageRatingOpts{style: "glass", borderWidth: -1})
	if identical(withBorder, none) {
		t.Error("a negative border width left the border drawn")
	}
	// The control: it is the border that went, not the whole badge.
	if identical(none, drawAgeRating(ageRatingOpts{style: "glass", bgOpacity: 1})) {
		t.Error("removing the border produced the same image as an all-but-invisible fill")
	}
}

// An unset control must leave the style exactly as it was, or every existing
// render moves the day this ships.
func TestUnsetAgeRatingControlsChangeNothing(t *testing.T) {
	for _, style := range []string{"glass", "square", "silver", "tile", "media", "plain"} {
		before := drawAgeRating(ageRatingOpts{style: style})
		after := drawAgeRating(ageRatingOpts{
			style: style, bgOpacity: 0, borderWidth: 0,
			borderColor: "", borderOpacity: 0, labelColor: "",
		})
		if !identical(before, after) {
			t.Errorf("the %s badge moved with every control left unset", style)
		}
	}
}

// A colour that does not parse is ignored rather than drawn as black.
func TestAnUnreadableAgeRatingColourIsIgnored(t *testing.T) {
	base := drawAgeRating(ageRatingOpts{style: "glass"})
	for _, bad := range []string{"not-a-colour", "#12", "rgb(1,2,3)"} {
		if !identical(base, drawAgeRating(ageRatingOpts{style: "glass", borderColor: bad})) {
			t.Errorf("border colour %q was not ignored", bad)
		}
		if !identical(base, drawAgeRating(ageRatingOpts{style: "glass", labelColor: bad})) {
			t.Errorf("label colour %q was not ignored", bad)
		}
	}
}
