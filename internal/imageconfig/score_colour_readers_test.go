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
