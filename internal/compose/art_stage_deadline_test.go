package compose

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// The fetch timeout bounds one HTTP request and the artwork stage tries one per
// provider, so several dead sources used to hold a render slot for the sum of
// their timeouts (BUG-242).
func TestTheArtworkStageIsBoundedByItsOwnDeadline(t *testing.T) {
	if testing.Short() {
		t.Skip("times a real deadline")
	}
	// A source that accepts the connection and never answers. Held until the
	// caller gives up, so the only thing that ends a fetch is a timeout.
	hang := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer hang.Close()

	reg := provider.NewRegistry()
	for _, name := range []string{"tmdb", "fanart", "mediux", "cinemeta"} {
		reg.Register(&provider.StubProvider{
			ProviderName: name,
			Meta:         &provider.MediaMeta{Title: "T", PosterURL: hang.URL + "/poster.jpg"},
		})
	}

	const perFetch = 150 * time.Millisecond
	p := New(reg)
	p.SetArtFetchTimeout(perFetch)

	if got, want := p.artStageTimeout(), 2*perFetch; got != want {
		t.Fatalf("stage budget %v, want %v — the rest of this test measures the wrong thing otherwise", got, want)
	}

	start := time.Now()
	_, _, _, _, err := p.fetchSourceImageAndMeta(context.Background(), Request{
		MediaType: "poster", MediaID: "tt0111161", Config: imageconfig.Default(),
	})
	elapsed := time.Since(start)

	if err == nil {
		t.Error("a stage of dead sources reported success")
	}
	// It has to have actually tried, or a stage that refuses instantly would
	// pass this without bounding anything.
	if elapsed < perFetch {
		t.Errorf("gave up in %v, before even one fetch could time out", elapsed)
	}
	// Four dead providers unbounded is four timeouts. The stage caps it at two.
	if limit := 3 * perFetch; elapsed > limit {
		t.Errorf("the stage took %v against a %v cap, so nothing bounded it", elapsed, limit)
	}
}

// One knob: raising the per-fetch budget has to raise the stage's, or an
// operator who allows a slow source still has it cut off by the stage.
func TestTheStageBudgetFollowsTheFetchBudget(t *testing.T) {
	p := New(provider.NewRegistry())
	base := p.artStageTimeout()
	if base <= 0 {
		t.Fatal("no stage budget by default, so nothing is bounded")
	}
	p.SetArtFetchTimeout(20 * time.Second)
	if raised := p.artStageTimeout(); raised <= base {
		t.Errorf("stage budget %v after raising the fetch budget, was %v", raised, base)
	}
}
