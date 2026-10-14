package compose

import (
	"context"
	"image/color"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func newArtServer(t *testing.T, body []byte, ctype string, status int) (*httptest.Server, *atomic.Int64) {
	t.Helper()
	var calls atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		time.Sleep(20 * time.Millisecond)
		w.Header().Set("Content-Type", ctype)
		w.WriteHeader(status)
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)
	return srv, &calls
}

func cachedFetcher(t *testing.T, dir string, maxBytes int64, ttl time.Duration) (*httpFetcher, *sourceArtCache) {
	t.Helper()
	store, err := newSourceArtCache(dir, maxBytes, ttl, nil)
	if err != nil || store == nil {
		t.Fatalf("store: %v %v", store, err)
	}
	return &httpFetcher{client: &http.Client{Timeout: 5 * time.Second}, store: store}, store
}

func storedFiles(t *testing.T, store *sourceArtCache) []string {
	t.Helper()
	des, _ := os.ReadDir(store.dir)
	var names []string
	for _, d := range des {
		names = append(names, d.Name())
	}
	return names
}

func TestSourceArtCacheOffCreatesNothing(t *testing.T) {
	dir := t.TempDir()
	store, err := newSourceArtCache(dir, 0, time.Hour, nil)
	if store != nil || err != nil {
		t.Fatalf("want nil store, got %v %v", store, err)
	}
	p := New(nil)
	p.SetSourceArtCache(dir, 0, time.Hour, nil)
	if p.fetcher.(*httpFetcher).store != nil {
		t.Fatal("store set while off")
	}
	if ents, _ := os.ReadDir(dir); len(ents) != 0 {
		t.Fatalf("off cache created %v", ents)
	}
}

func TestSourceArtCacheHitSkipsNetworkAndHashesURL(t *testing.T) {
	png := makeTestPNG(20, 30, color.NRGBA{1, 2, 3, 255})
	srv, calls := newArtServer(t, png, "image/png", 200)
	f, store := cachedFetcher(t, t.TempDir(), 1<<20, time.Hour)
	url := srv.URL + "/a.png?api_key=SECRET"
	for i := 0; i < 3; i++ {
		got, err := f.Fetch(context.Background(), url)
		if err != nil || len(got) != len(png) {
			t.Fatalf("fetch %d: %v", i, err)
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("network calls = %d, want 1", calls.Load())
	}
	for _, n := range storedFiles(t, store) {
		if strings.Contains(n, "SECRET") || strings.Contains(n, "api_key") || strings.Contains(n, "127.0.0.1") {
			t.Fatalf("raw url leaked into filename %q", n)
		}
	}
	if len(storedFiles(t, store)) != 1 {
		t.Fatalf("files = %v", storedFiles(t, store))
	}
}

func TestSourceArtCacheSingleFlight(t *testing.T) {
	png := makeTestPNG(20, 30, color.NRGBA{1, 2, 3, 255})
	srv, calls := newArtServer(t, png, "image/png", 200)
	f, _ := cachedFetcher(t, t.TempDir(), 1<<20, time.Hour)
	var wg sync.WaitGroup
	for i := 0; i < 16; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := f.Fetch(context.Background(), srv.URL+"/x.png"); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatalf("network calls = %d, want 1", calls.Load())
	}
}

func TestSourceArtCacheEvictionKeepsUnderCap(t *testing.T) {
	png := makeNoisyPNG(60, 60)
	srv, _ := newArtServer(t, png, "image/png", 200)
	limit := int64(len(png))*3 + 100
	f, store := cachedFetcher(t, t.TempDir(), limit, time.Hour)
	for i := 0; i < 10; i++ {
		if _, err := f.Fetch(context.Background(), srv.URL+"/"+string(rune('a'+i))+".png"); err != nil {
			t.Fatal(err)
		}
		time.Sleep(5 * time.Millisecond)
	}
	deadline := time.Now().Add(2 * time.Second)
	for {
		var sum int64
		for _, e := range store.entries() {
			sum += e.size
		}
		if sum <= limit && !store.sweeping.Load() {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("size %d still over cap %d", sum, limit)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestSourceArtCacheTTLExpiryRefetches(t *testing.T) {
	png := makeTestPNG(20, 30, color.NRGBA{1, 2, 3, 255})
	srv, calls := newArtServer(t, png, "image/png", 200)
	f, store := cachedFetcher(t, t.TempDir(), 1<<20, time.Hour)
	now := time.Now()
	store.now = func() time.Time { return now }
	url := srv.URL + "/t.png"
	_, _ = f.Fetch(context.Background(), url)
	_, _ = f.Fetch(context.Background(), url)
	if calls.Load() != 1 {
		t.Fatalf("calls = %d", calls.Load())
	}
	now = now.Add(2 * time.Hour)
	if _, err := f.Fetch(context.Background(), url); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 2 {
		t.Fatalf("calls after expiry = %d, want 2", calls.Load())
	}
}

func TestSourceArtCacheSkipsNonImageAndErrors(t *testing.T) {
	f, store := cachedFetcher(t, t.TempDir(), 1<<20, time.Hour)
	html, hcalls := newArtServer(t, []byte("<html>not an image</html>"), "text/html", 200)
	for i := 0; i < 2; i++ {
		got, err := f.Fetch(context.Background(), html.URL+"/h")
		if err != nil || len(got) == 0 {
			t.Fatalf("non-image body should pass through: %v", err)
		}
	}
	if hcalls.Load() != 2 {
		t.Fatalf("non-image was cached (calls %d)", hcalls.Load())
	}
	bad, bcalls := newArtServer(t, makeTestPNG(10, 10, color.NRGBA{9, 9, 9, 255}), "image/png", 404)
	for i := 0; i < 2; i++ {
		if _, err := f.Fetch(context.Background(), bad.URL+"/b.png"); err == nil {
			t.Fatal("want error for 404")
		}
	}
	if bcalls.Load() != 2 {
		t.Fatalf("404 was cached (calls %d)", bcalls.Load())
	}
	if n := storedFiles(t, store); len(n) != 0 {
		t.Fatalf("stored %v", n)
	}
}

func TestSourceArtCacheCorruptFileRefetches(t *testing.T) {
	png := makeTestPNG(20, 30, color.NRGBA{1, 2, 3, 255})
	srv, calls := newArtServer(t, png, "image/png", 200)
	f, store := cachedFetcher(t, t.TempDir(), 1<<20, time.Hour)
	url := srv.URL + "/c.png"
	_, _ = f.Fetch(context.Background(), url)
	if err := os.WriteFile(store.path(url), []byte("garbage garbage garbage"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := f.Fetch(context.Background(), url)
	if err != nil || len(got) != len(png) {
		t.Fatalf("recovery failed: %v", err)
	}
	if calls.Load() != 2 {
		t.Fatalf("calls = %d, want 2", calls.Load())
	}
	if _, ok := store.get(context.Background(), url); !ok {
		t.Fatal("entry not restored")
	}
	if filepath.Dir(store.path(url)) != store.dir {
		t.Fatal("path outside store dir")
	}
}

func TestSourceArtCacheNeverStoresMediuxAssets(t *testing.T) {
	png := makeTestPNG(20, 30, color.NRGBA{1, 2, 3, 255})
	srv, calls := newArtServer(t, png, "image/png", 200)
	f, store := cachedFetcher(t, t.TempDir(), 1<<20, time.Hour)
	url := srv.URL + "/images.mediux.io/assets/a.png"
	for i := 0; i < 2; i++ {
		if _, err := f.Fetch(context.Background(), url); err != nil {
			t.Fatal(err)
		}
	}
	if calls.Load() != 2 || len(storedFiles(t, store)) != 0 {
		t.Fatalf("calls=%d files=%v", calls.Load(), storedFiles(t, store))
	}
}
