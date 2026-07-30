package imageconfig

import "testing"

// v2 stored region-qualified language tags. TMDB and Fanart tag images with the
// base subtag only, so a tag carrying a region matches nothing and the render
// silently falls back to English.
func TestRegionQualifiedLanguageReducesToTheBaseSubtag(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"fr-FR", "fr"},
		{"fr-CA", "fr"},
		{"pt-BR", "pt"},
		{"zh_TW", "zh"},
		{"en-US", "en"},
		{"us", "en"},
		{"FR", "fr"},
		{"fr", "fr"},
		{"original", "original"},
	} {
		cfg := Parse([]byte(`{"language":"` + tc.in + `"}`))
		if cfg.Language != tc.want {
			t.Errorf("language %q parsed to %q, want %q", tc.in, cfg.Language, tc.want)
		}
	}
}
