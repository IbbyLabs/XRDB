package imageconfig

import "testing"

func TestBadgeFontParsesAndNormalises(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"sans", "sans"},
		{"serif", "serif"},
		{"mono", "mono"},
		{"display", "display"},
		{" Display ", "display"},
		{"SERIF", "serif"},
		{"default", ""},
		{"", ""},
		{"comic-sans", ""},
		{"bebas", ""},
	} {
		cfg := Parse([]byte(`{"genreBadgeFont":"` + tc.in + `","ratingBadgeFont":"` + tc.in + `"}`))
		if cfg.GenreBadgeFont != tc.want {
			t.Errorf("genreBadgeFont %q parsed to %q, want %q", tc.in, cfg.GenreBadgeFont, tc.want)
		}
		if cfg.RatingBadgeFont != tc.want {
			t.Errorf("ratingBadgeFont %q parsed to %q, want %q", tc.in, cfg.RatingBadgeFont, tc.want)
		}
	}
}

func TestBadgeFontUnsetKeepsTheBuiltInFace(t *testing.T) {
	cfg := Parse([]byte(`{}`))
	if cfg.GenreBadgeFont != "" || cfg.RatingBadgeFont != "" {
		t.Errorf("unset fonts parsed to %q / %q, want both empty", cfg.GenreBadgeFont, cfg.RatingBadgeFont)
	}
}

func TestBadgeFontMovesTheCacheKeyPerFamily(t *testing.T) {
	seen := map[string]string{CacheKey(Default()): "default"}
	for _, fam := range []string{"sans", "serif", "mono", "display"} {
		for _, field := range []string{"genre", "rating"} {
			cfg := Default()
			if field == "genre" {
				cfg.GenreBadgeFont = fam
			} else {
				cfg.RatingBadgeFont = fam
			}
			key := CacheKey(cfg)
			if prev, dup := seen[key]; dup {
				t.Errorf("%s font %q shares a cache key with %s", field, fam, prev)
			}
			seen[key] = field + " " + fam
		}
	}
}

func TestBadgeFontDefaultLeavesTheCacheKeyAlone(t *testing.T) {
	plain := CacheKey(Default())
	cfg := Parse([]byte(`{"genreBadgeFont":"default","ratingBadgeFont":"default"}`))
	explicit := Default()
	explicit.GenreBadgeFont, explicit.RatingBadgeFont = cfg.GenreBadgeFont, cfg.RatingBadgeFont
	if CacheKey(explicit) != plain {
		t.Error("choosing the default font moved the cache key, which would re-render every cached image")
	}
}
