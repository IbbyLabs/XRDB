package provider

import (
	"testing"

	"xrdb_rewrite/internal/imageconfig"
)

// The token lives in both packages: imageconfig accepts it from a config or a
// URL, provider acts on it when choosing artwork. imageconfig cannot import
// provider, so the two constants are pinned together here rather than left to
// agree by habit.
func TestOriginalLanguageTokenMatchesImageConfig(t *testing.T) {
	if OriginalLanguage != imageconfig.OriginalLanguage {
		t.Errorf("provider has %q, imageconfig has %q", OriginalLanguage, imageconfig.OriginalLanguage)
	}
	if !IsOriginalLanguage(imageconfig.OriginalLanguage) {
		t.Errorf("IsOriginalLanguage rejects imageconfig's own token %q", imageconfig.OriginalLanguage)
	}
}
