package imageconfig

import "testing"

func TestBadgeFrostParsesAndClamps(t *testing.T) {
	for _, tc := range []struct {
		in   string
		want int
	}{
		{`{}`, 0},
		{`{"badgeFrost":0}`, 0},
		{`{"badgeFrost":1}`, 1},
		{`{"badgeFrost":55}`, 55},
		{`{"badgeFrost":100}`, 100},
		{`{"badgeFrost":250}`, 100},
		{`{"badgeFrost":-20}`, 0},
	} {
		if got := Parse([]byte(tc.in)).BadgeFrost; got != tc.want {
			t.Errorf("%s parsed badgeFrost %d, want %d", tc.in, got, tc.want)
		}
	}
}

func TestLogoFrostParses(t *testing.T) {
	if Parse([]byte(`{}`)).LogoFrost {
		t.Error("logoFrost defaults on, want off")
	}
	if !Parse([]byte(`{"logoFrost":true}`)).LogoFrost {
		t.Error("logoFrost true did not parse")
	}
	if Parse([]byte(`{"logoFrost":false}`)).LogoFrost {
		t.Error("logoFrost false parsed as on")
	}
}

// Defaults must hash exactly as they did before the keys existed, or every
// cached render is invalidated. The digests were taken from the tree before
// badgeFrost and logoFrost were added.
func TestFrostDefaultsKeepTheCacheKeyByteIdentical(t *testing.T) {
	if renderVersion != "r23" {
		t.Skip("renderVersion moved; the pinned digests no longer apply")
	}
	if got, want := CacheKey(Default()), "0d19e88fbeae1ffbfe0951d69abe9f8b6f2bc1194b46bc0fd62536e6e44eec37"; got != want {
		t.Errorf("default cache key = %s, want %s", got, want)
	}
	c := Default()
	c.BadgeStyle = BadgePill
	c.LogoWidth = 50
	if got, want := CacheKey(c), "9a116e547ed598ac06014f7516bf62d4ba70d382165ee209981095819376e8f3"; got != want {
		t.Errorf("customised cache key = %s, want %s", got, want)
	}
}

func TestFrostMovesTheCacheKeyWhenSet(t *testing.T) {
	base := CacheKey(Default())
	seen := map[string]string{base: "default"}
	for name, mut := range map[string]func(*Config){
		"badgeFrost 1":   func(c *Config) { c.BadgeFrost = 1 },
		"badgeFrost 60":  func(c *Config) { c.BadgeFrost = 60 },
		"badgeFrost 100": func(c *Config) { c.BadgeFrost = 100 },
		"logoFrost":      func(c *Config) { c.LogoFrost = true },
		"both":           func(c *Config) { c.BadgeFrost, c.LogoFrost = 60, true },
	} {
		c := Default()
		mut(&c)
		key := CacheKey(c)
		if prev, dup := seen[key]; dup {
			t.Errorf("%s shares a cache key with %s", name, prev)
		}
		seen[key] = name
	}
}
