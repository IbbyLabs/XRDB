package imageconfig

import "testing"

func TestThumbnailSafeInsetParsesAndClamps(t *testing.T) {
	for in, want := range map[string]int{`{"thumbnailSafeInset":8}`: 8, `{"thumbnailSafeInset":99}`: 25, `{"thumbnailSafeInset":-4}`: 0, `{}`: 0} {
		if got := Parse([]byte(in)).ThumbnailSafeInset; got != want {
			t.Errorf("%s parsed to %d, want %d", in, got, want)
		}
	}
}

func TestThumbnailSafeInsetMovesTheCacheKeyOnlyWhenSet(t *testing.T) {
	base := CacheKey(Default())
	if CacheKey(Parse([]byte(`{"thumbnailSafeInset":0}`))) != base {
		t.Error("an inset of 0 moved the cache key")
	}
	if CacheKey(Parse([]byte(`{"thumbnailSafeInset":5}`))) == base {
		t.Error("an inset of 5 left the cache key alone")
	}
}
