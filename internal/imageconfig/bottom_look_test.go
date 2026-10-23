package imageconfig

import "testing"

// Keys recorded before the bottom look existed: a config without the new keys
// must keep hashing to them so existing cached renders stay valid.
func TestCacheKeyIsUnchangedWithoutTheBottomLookKeys(t *testing.T) {
	if got, want := CacheKey(Default()), "0d19e88fbeae1ffbfe0951d69abe9f8b6f2bc1194b46bc0fd62536e6e44eec37"; got != want {
		t.Errorf("default cache key moved: %s", got)
	}
	c := Parse([]byte(`{"logoWidth":70,"logoHeight":22,"logoPos":40,"logoAnchor":"bottom","textPreference":"clean","logoFrost":true}`))
	if got, want := CacheKey(c), "ff448bbe2c4dc87d59def385cb96fb487a0359d9e8f55ea6f475d2985aa2032a"; got != want {
		t.Errorf("logo config cache key moved: %s", got)
	}
}

func TestEachBottomLookKeyMovesTheCacheKey(t *testing.T) {
	base := CacheKey(Default())
	for name, set := range map[string]string{
		"logoBottomMargin":   `{"logoBottomMargin":5}`,
		"bottomFadeHeight":   `{"bottomFadeHeight":30}`,
		"bottomFadeOpacity":  `{"bottomFadeOpacity":30}`,
		"bottomFadeColor":    `{"bottomFadeColor":"#112233"}`,
		"bottomBlurHeight":   `{"bottomBlurHeight":30}`,
		"bottomBlurStrength": `{"bottomBlurStrength":30}`,
	} {
		if CacheKey(Parse([]byte(set))) == base {
			t.Errorf("%s does not move the cache key", name)
		}
	}
}

func TestBottomLookKeysParseAndClamp(t *testing.T) {
	c := Parse([]byte(`{"logoBottomMargin":500,"bottomFadeHeight":40,"bottomFadeOpacity":150,"bottomFadeColor":"#102030","bottomBlurHeight":-3,"bottomBlurStrength":60}`))
	if c.LogoBottomMargin != 40 || c.BottomFadeHeight != 40 || c.BottomFadeOpacity != 100 || c.BottomFadeColor != "#102030" || c.BottomBlurHeight != 0 || c.BottomBlurStrength != 60 {
		t.Errorf("unexpected parse: %+v", c)
	}
	if d := Parse([]byte(`{"bottomFadeColor":"red"}`)); d.BottomFadeColor != "" {
		t.Errorf("a non-hex colour survived as %q", d.BottomFadeColor)
	}
	z := Parse([]byte(`{}`))
	if z.LogoBottomMargin != 0 || z.BottomFadeHeight != 0 || z.BottomBlurHeight != 0 {
		t.Error("the bottom look is not off by default")
	}
}
