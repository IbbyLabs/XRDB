package compose

import (
	"context"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

// A fetch that panics fails its own call and leaves nothing in flight, so the
// next render of the title asks again.
func TestRatingsFetchPanicBecomesAnError(t *testing.T) {
	c := newRatingsCache(24*time.Hour, nil)
	key := provider.GoodKey("mdblist", "movie", "tt1")
	boom := func(context.Context) (*provider.MediaMeta, bool, error) { panic("malformed upstream") }

	if _, err := c.do(context.Background(), key, titleAge{}, boom); err == nil {
		t.Fatal("a panicking fetch reported success")
	}
	c.mu.Lock()
	_, stuck := c.inflight[key]
	c.mu.Unlock()
	if stuck {
		t.Fatal("the panicked call is still in flight")
	}
	asked := false
	_, _ = c.do(context.Background(), key, titleAge{}, func(context.Context) (*provider.MediaMeta, bool, error) {
		asked = true
		return noRatings(), true, nil
	})
	if !asked {
		t.Error("the next call did not reach the source")
	}
}
