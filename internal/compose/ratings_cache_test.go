package compose

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func oneRating(source string) *provider.MediaMeta {
	return &provider.MediaMeta{Ratings: []provider.Rating{{Source: source, Value: 8, Label: "8.0"}}}
}

// A render is keyed on its whole config but ratings depend only on the title,
// so the second config must not pay for the same fetch again.
func TestTheSameTitleIsFetchedOnce(t *testing.T) {
	c := newRatingsCache(time.Hour, nil)
	var calls atomic.Int32
	fetch := func(context.Context) (*provider.MediaMeta, bool, error) {
		calls.Add(1)
		return oneRating("simkl"), true, nil
	}
	for i := 0; i < 5; i++ {
		if _, err := c.do(context.Background(), "simkl:movie:tt1", fetch); err != nil {
			t.Fatal(err)
		}
	}
	if calls.Load() != 1 {
		t.Errorf("the source was asked %d times for one title", calls.Load())
	}
}

// Different titles are different answers.
func TestDifferentTitlesAreNotConflated(t *testing.T) {
	c := newRatingsCache(time.Hour, nil)
	var calls atomic.Int32
	fetch := func(context.Context) (*provider.MediaMeta, bool, error) {
		calls.Add(1)
		return oneRating("simkl"), true, nil
	}
	_, _ = c.do(context.Background(), "simkl:movie:tt1", fetch)
	_, _ = c.do(context.Background(), "simkl:movie:tt2", fetch)
	if calls.Load() != 2 {
		t.Errorf("calls = %d, want one per title", calls.Load())
	}
}

// A catalogue opening on many copies of one title must still ask once.
func TestConcurrentMissesShareOneFetch(t *testing.T) {
	c := newRatingsCache(time.Hour, nil)
	var calls atomic.Int32
	release := make(chan struct{})
	fetch := func(context.Context) (*provider.MediaMeta, bool, error) {
		calls.Add(1)
		<-release
		return oneRating("simkl"), true, nil
	}
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = c.do(context.Background(), "simkl:movie:tt1", fetch)
		}()
	}
	time.Sleep(50 * time.Millisecond)
	close(release)
	wg.Wait()
	if calls.Load() != 1 {
		t.Errorf("20 concurrent renders caused %d fetches", calls.Load())
	}
}

// Caching a failure would hold a source's outage past its end, and the health
// tracker's fallback already covers that case.
func TestFailuresAreNotRemembered(t *testing.T) {
	c := newRatingsCache(time.Hour, nil)
	var calls atomic.Int32
	fetch := func(context.Context) (*provider.MediaMeta, bool, error) {
		calls.Add(1)
		return nil, true, errors.New("refused")
	}
	for i := 0; i < 3; i++ {
		_, _ = c.do(context.Background(), "simkl:movie:tt1", fetch)
	}
	if calls.Load() != 3 {
		t.Errorf("a failure was cached: calls = %d, want 3", calls.Load())
	}
}

// An answer carrying no ratings is the shape a scraped source takes when its
// markup changes; remembering it would freeze the gap in place.
func TestEmptyAnswersAreNotRemembered(t *testing.T) {
	c := newRatingsCache(time.Hour, nil)
	var calls atomic.Int32
	fetch := func(context.Context) (*provider.MediaMeta, bool, error) {
		calls.Add(1)
		return &provider.MediaMeta{}, true, nil
	}
	for i := 0; i < 3; i++ {
		_, _ = c.do(context.Background(), "simkl:movie:tt1", fetch)
	}
	if calls.Load() != 3 {
		t.Errorf("an empty answer was cached: calls = %d, want 3", calls.Load())
	}
}

func TestEntriesExpire(t *testing.T) {
	c := newRatingsCache(10*time.Millisecond, nil)
	var calls atomic.Int32
	fetch := func(context.Context) (*provider.MediaMeta, bool, error) {
		calls.Add(1)
		return oneRating("simkl"), true, nil
	}
	_, _ = c.do(context.Background(), "simkl:movie:tt1", fetch)
	time.Sleep(40 * time.Millisecond)
	_, _ = c.do(context.Background(), "simkl:movie:tt1", fetch)
	if calls.Load() != 2 {
		t.Errorf("the entry did not expire: calls = %d, want 2", calls.Load())
	}
}

// A nil cache is the disabled case and must not swallow the fetch.
func TestNilCacheStillFetches(t *testing.T) {
	var c *ratingsCache
	got, err := c.do(context.Background(), "k", func(context.Context) (*provider.MediaMeta, bool, error) {
		return oneRating("simkl"), true, nil
	})
	if err != nil || got == nil || len(got.Ratings) != 1 {
		t.Errorf("a disabled cache changed the result: %+v %v", got, err)
	}
}

// End to end through the pipeline: two configs, one title, one fetch.
func TestPipelineDoesNotRefetchAcrossConfigs(t *testing.T) {
	src := &countingLimiter{name: "simkl"}
	p := &Pipeline{providers: testRegistry(src), fetcher: &stubImageFetcher{},
		ratings: newRatingsCache(time.Hour, nil)}

	for _, ratings := range [][]string{{"simkl"}, {"simkl", "imdb"}, {"simkl", "tmdb"}} {
		cfg := imageconfig.Default()
		cfg.Ratings = ratings
		ratingsFor(t, p, Request{MediaType: "poster", ContentType: "movie", MediaID: "tt1", Config: cfg})
	}
	if got := src.calls.Load(); got != 1 {
		t.Errorf("three configs of one title caused %d fetches", got)
	}
}
