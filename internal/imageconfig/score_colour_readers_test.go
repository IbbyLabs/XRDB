package imageconfig

import (
	"os"
	"strings"
	"testing"
)

const configuratorFine = "../../web/components/configurator-fine.tsx"

// Every config field that makes something read the score colours. The control
// group is gated on this set, and gating it on one consumer is what hid the
// colours from a ring with no badges — and from the pill presentations before
// that, when the gate named only the aggregate bar.
var scoreColourReaders = []string{
	"ratingsLayout",      // the badge strip
	"ratingPresentation", // the pill presentations
	"aggregateBar",       // the aggregate bar
	"ratingRing",         // the average ring
}

// A source-shape check rather than a behavioural one: the web package has no
// unit runner, and what is countable here is whether the predicate names every
// reader. It cannot know about a reader nobody added, so it holds the list
// honest rather than proving the gate correct.
func TestScoreColourGateNamesEveryReader(t *testing.T) {
	src, err := os.ReadFile(configuratorFine)
	if err != nil {
		t.Fatalf("reading the fine-tuning panel: %v", err)
	}
	start := strings.Index(string(src), "export function scoreColoursHaveAReader")
	if start < 0 {
		t.Fatal("scoreColoursHaveAReader not found; the gate moved or was inlined again")
	}
	end := strings.Index(string(src)[start:], "\n}")
	if end < 0 {
		t.Fatal("could not find the end of the predicate")
	}
	body := string(src)[start : start+end]

	for _, reader := range scoreColourReaders {
		if !strings.Contains(body, reader) {
			t.Errorf("the score-colour gate does not name %s, so that reader cannot reach the controls", reader)
		}
	}
	if len(scoreColourReaders) < 4 {
		t.Fatal("the reader list is shorter than the readers we know about")
	}
}

// The stops field inside the group asks a narrower question than the group does:
// which elements read the stop values themselves. The ring reads them whatever
// the accent mode says — ratingRingFillColor takes AggregateDynamicStops and
// never looks at the mode — so gating the field on the mode alone left a
// ring-only user setting an aggregate control to reach a ring one (BUG-280).
var scoreStopReaders = []string{
	"ratingRing", // the average ring, via ratingRingFillColor
}

func TestTheStopsFieldNamesEveryReaderOfTheStops(t *testing.T) {
	src, err := os.ReadFile(configuratorFine)
	if err != nil {
		t.Fatalf("reading the fine-tuning panel: %v", err)
	}
	text := string(src)
	start := strings.Index(text, "export function scoreStopsHaveAReader")
	if start < 0 {
		t.Fatal("scoreStopsHaveAReader not found; the gate moved or was inlined")
	}
	end := strings.Index(text[start:], "\n}")
	if end < 0 {
		t.Fatal("could not find the end of the predicate")
	}
	body := text[start : start+end]
	for _, reader := range scoreStopReaders {
		if !strings.Contains(body, reader) {
			t.Errorf("the stops gate does not name %s, so that reader cannot reach the field", reader)
		}
	}

	// And the field has to consult it. A predicate nothing calls is the shape
	// this whole guard exists to catch.
	if !strings.Contains(text, "scoreStopsHaveAReader(config)") {
		t.Error("scoreStopsHaveAReader is defined and never called, so the field is still gated on the accent mode alone")
	}
}
