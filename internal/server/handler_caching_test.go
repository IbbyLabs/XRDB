package server

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/provider"
)

// fixedFetcher satisfies compose's image fetcher with a canned PNG.
type fixedFetcher struct{ data []byte }

func (f fixedFetcher) Fetch(context.Context, string) ([]byte, error) { return f.data, nil }

func testSourcePNG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			v := uint32(x*2654435761) ^ uint32(y*2246822519)
			img.SetNRGBA(x, y, color.NRGBA{uint8(v >> 3), uint8(v >> 11), uint8(v >> 19), 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode source: %v", err)
	}
	return buf.Bytes()
}

// renderingHandler builds a handler whose pipeline always produces real artwork,
// backed by a real on-disk cache.
func renderingHandler(t *testing.T) http.Handler {
	t.Helper()
	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{
			Title:       "Test",
			PosterURL:   "http://fake/poster.jpg",
			BackdropURL: "http://fake/backdrop.jpg",
			LogoURL:     "http://fake/logo.png",
		},
	})
	pipeline := compose.NewWithFetcher(reg, fixedFetcher{data: testSourcePNG(t, 1000, 1500)})

	c, err := cache.New(filepath.Join(t.TempDir(), "cache"), time.Hour, 100, 8<<20)
	if err != nil {
		t.Fatalf("cache.New: %v", err)
	}
	t.Cleanup(c.Close)
	return NewHandler("test", nil, nil, pipeline, c, config.Config{})
}

func TestRenderSetsCachingHeaders(t *testing.T) {
	h := renderingHandler(t)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/poster/tt0816692", nil))

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	etag := rr.Header().Get("ETag")
	if etag == "" {
		t.Error("no ETag on a successful render — downstream caches cannot revalidate")
	}
	if key := rr.Header().Get("X-Cache-Key"); etag != `"`+key+`"` {
		t.Errorf("ETag %q does not match X-Cache-Key %q", etag, key)
	}
	cc := rr.Header().Get("Cache-Control")
	if cc == "" {
		t.Fatal("no Cache-Control on a successful render")
	}
	maxAge, err := strconv.Atoi(cc[len("public, max-age="):])
	if err != nil {
		t.Fatalf("unexpected Cache-Control %q: %v", cc, err)
	}
	// It should track the server-side TTL rather than being an arbitrary constant.
	if maxAge <= 0 || maxAge > int(time.Hour.Seconds()) {
		t.Errorf("max-age %d is outside the cache TTL", maxAge)
	}
}

func TestPosterIsServedAsJPEG(t *testing.T) {
	h := renderingHandler(t)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/poster/tt0816692", nil))

	if got := rr.Header().Get("Content-Type"); got != "image/jpeg" {
		t.Errorf("Content-Type = %q, want image/jpeg", got)
	}
	if _, format, err := image.Decode(bytes.NewReader(rr.Body.Bytes())); err != nil || format != "jpeg" {
		t.Errorf("body format = %q (err %v), want jpeg", format, err)
	}
	if n := rr.Body.Len(); n >= 100*1024 {
		t.Errorf("poster is %d bytes, over Stremio's 100 KB limit", n)
	}
}

// A cache hit must report the format of the stored bytes, not the format the
// live config would produce.
func TestCachedRenderKeepsItsContentType(t *testing.T) {
	h := renderingHandler(t)
	first := httptest.NewRecorder()
	h.ServeHTTP(first, httptest.NewRequest(http.MethodGet, "/poster/tt0816692", nil))

	second := httptest.NewRecorder()
	h.ServeHTTP(second, httptest.NewRequest(http.MethodGet, "/poster/tt0816692", nil))

	if second.Header().Get("X-Cache") != "HIT" {
		t.Fatal("expected the second request to hit the cache")
	}
	if got := second.Header().Get("Content-Type"); got != first.Header().Get("Content-Type") {
		t.Errorf("cached Content-Type %q differs from the fresh one %q", got, first.Header().Get("Content-Type"))
	}
	if !bytes.Equal(first.Body.Bytes(), second.Body.Bytes()) {
		t.Error("cached bytes differ from the freshly rendered ones")
	}
}

func TestIfNoneMatchReturns304(t *testing.T) {
	h := renderingHandler(t)
	first := httptest.NewRecorder()
	h.ServeHTTP(first, httptest.NewRequest(http.MethodGet, "/poster/tt0816692", nil))
	etag := first.Header().Get("ETag")

	for _, header := range []string{etag, "W/" + etag, "*", `"other", ` + etag} {
		req := httptest.NewRequest(http.MethodGet, "/poster/tt0816692", nil)
		req.Header.Set("If-None-Match", header)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotModified {
			t.Errorf("If-None-Match %q: got %d, want 304", header, rr.Code)
		}
		if rr.Body.Len() != 0 {
			t.Errorf("If-None-Match %q: 304 carried a %d-byte body", header, rr.Body.Len())
		}
	}
}

func TestStaleIfNoneMatchStillReturnsTheImage(t *testing.T) {
	h := renderingHandler(t)
	req := httptest.NewRequest(http.MethodGet, "/poster/tt0816692", nil)
	req.Header.Set("If-None-Match", `"stale-etag-from-an-earlier-config"`)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 for a non-matching ETag, got %d", rr.Code)
	}
	if rr.Body.Len() == 0 {
		t.Error("expected the image body")
	}
}

// The placeholder is deliberately non-cacheable, so it must carry neither an
// ETag nor a max-age that would let a CDN pin the failure.
func TestPlaceholderStaysUncacheable(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/poster/tt0816692", nil))

	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected the 404 placeholder, got %d", rr.Code)
	}
	if cc := rr.Header().Get("Cache-Control"); cc != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", cc)
	}
	if etag := rr.Header().Get("ETag"); etag != "" {
		t.Errorf("placeholder carried ETag %q; it must not be revalidatable", etag)
	}
}

// The profile-version token exists to change the URL for downstream caches. It
// must not reach the server-side cache key, or every profile edit would orphan
// the whole cache instead of reusing renders whose config did not change.
func TestVersionTokenDoesNotFragmentTheServerCache(t *testing.T) {
	h := renderingHandler(t)

	keyFor := func(url string) string {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, url, nil))
		if rr.Code != http.StatusOK {
			t.Fatalf("%s: got %d, want 200", url, rr.Code)
		}
		return rr.Header().Get("X-Cache-Key")
	}

	plain := keyFor("/poster/tt0816692")
	v1 := keyFor("/poster/tt0816692?v=aaaa1111")
	v2 := keyFor("/poster/tt0816692?v=bbbb2222")

	if plain != v1 || v1 != v2 {
		t.Errorf("cache keys differ by version token: %q / %q / %q", plain, v1, v2)
	}
}

// The cache-buster is the opposite case: it is explicitly a way to force a
// fresh render, so it must change the key.
func TestCacheBusterChangesTheCacheKey(t *testing.T) {
	h := renderingHandler(t)

	keyFor := func(url string) string {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, url, nil))
		return rr.Header().Get("X-Cache-Key")
	}
	if keyFor("/poster/tt0816692") == keyFor("/poster/tt0816692?cb=1") {
		t.Error("cb= did not change the cache key")
	}
}

func TestEtagMatches(t *testing.T) {
	const etag = `"abc123"`
	for _, tc := range []struct {
		header string
		want   bool
	}{
		{etag, true},
		{"W/" + etag, true},
		{"*", true},
		{`"x", ` + etag, true},
		{` ` + etag + ` `, true},
		{`"nope"`, false},
		{"", false},
		{`"abc12"`, false},
	} {
		if got := etagMatches(tc.header, etag); got != tc.want {
			t.Errorf("etagMatches(%q) = %v, want %v", tc.header, got, tc.want)
		}
	}
}
