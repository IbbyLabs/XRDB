package render

import "testing"

func BenchmarkCacheKey(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_ = CacheKey(
			"poster",
			"tt0816692",
			"imdb",
			"mode=compact;year=1;genre=1;rating=imdb",
			"uuid=abc123",
		)
	}
}

func TestCacheKeyDeterministic(t *testing.T) {
	a := CacheKey("poster", "tt0816692", "config")
	b := CacheKey("poster", "tt0816692", "config")
	if a != b {
		t.Fatalf("expected deterministic cache key")
	}
}
