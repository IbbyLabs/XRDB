package imageconfig

import "testing"

// A two-letter region names which country's artwork to prefer, so it is kept.
// Sources tag images by the base subtag, which the providers reduce to when
// matching; anything that is not two letters reduces here instead, capping the
// values that can reach the render cache key.
func TestATwoLetterRegionSurvivesParsing(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"fr-FR", "fr-fr"},
		{"fr-CA", "fr-ca"},
		{"pt-BR", "pt-br"},
		{"zh_TW", "zh-tw"},
		{"en-US", "en-us"},
		{"us", "en"},
		{"FR", "fr"},
		{"fr", "fr"},
		{"original", "original"},
		// A region the parser cannot use reduces to the base, so the cache key
		// space stays capped.
		{"es-419", "es"},
		{"pt-BRA", "pt"},
	} {
		cfg := Parse([]byte(`{"language":"` + tc.in + `"}`))
		if cfg.Language != tc.want {
			t.Errorf("language %q parsed to %q, want %q", tc.in, cfg.Language, tc.want)
		}
	}
}
