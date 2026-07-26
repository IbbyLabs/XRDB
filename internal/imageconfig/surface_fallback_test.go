package imageconfig

import (
	"encoding/json"
	"testing"
)

// A surface the envelope never named belongs to the same profile, so it takes
// the poster's look rather than reverting to settings the user never chose.
func TestParseSurfaceFallsBackToPoster(t *testing.T) {
	blob := json.RawMessage(`{"surfaces":{"poster":{"language":"fr","genre":true}}}`)

	got := ParseSurface(blob, "logo")
	if got.Language != "fr" || !got.Genre {
		t.Errorf("logo surface = %+v, want the poster's language and genre", got)
	}

	if poster := ParseSurface(blob, "poster"); poster.Language != "fr" {
		t.Errorf("poster surface = %q, want fr", poster.Language)
	}
}

func TestParseSurfaceWithoutPosterUsesDefaults(t *testing.T) {
	blob := json.RawMessage(`{"surfaces":{"backdrop":{"language":"fr"}}}`)
	got := ParseSurface(blob, "logo")
	if got.Language != Default().Language {
		t.Errorf("logo language = %q, want the default", got.Language)
	}
}
