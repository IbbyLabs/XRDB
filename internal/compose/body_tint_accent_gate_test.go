package compose

import (
	"bytes"
	"testing"
)

// The score-pill body tint blends the resolved accent into the dark body. With
// no accent the accent is zero-value black, so an ungated tint would only darken
// the pill as the control is raised. The tint must be inert until an accent
// resolves, which this guards by rendering the same pill at tint 0 and 100 with
// no accent mode set and requiring an identical image.
func TestBodyTintIsInertWithoutAResolvedAccent(t *testing.T) {
	p := effectPipeline()

	base := maximalConfig()
	base.RatingPresentation = "minimal" // draws the single-score pill
	base.AggregateAccentMode = ""       // nothing resolves an accent
	base.AggregatePillBodyTint = 0

	tinted := base
	tinted.AggregatePillBodyTint = 100

	a := renderOne(t, p, base, "movie", "poster")
	b := renderOne(t, p, tinted, "movie", "poster")
	if a == nil || b == nil {
		return
	}
	if !bytes.Equal(a, b) {
		t.Error("body tint changed the pill with no accent resolved; it must apply only when an accent is set, else it darkens the body toward black")
	}
}

// With an accent resolved the tint must take effect, so the gate above does not
// simply disable the control.
func TestBodyTintAppliesWithAnAccent(t *testing.T) {
	p := effectPipeline()

	base := maximalConfig()
	base.RatingPresentation = "minimal"
	base.AggregateAccentMode = "custom"
	base.AggregateAccentColor = "#22c55e"
	base.AggregatePillBodyTint = 0

	tinted := base
	tinted.AggregatePillBodyTint = 100

	a := renderOne(t, p, base, "movie", "poster")
	b := renderOne(t, p, tinted, "movie", "poster")
	if a == nil || b == nil {
		return
	}
	if bytes.Equal(a, b) {
		t.Error("body tint had no effect with an accent set; the control is inert")
	}
}
