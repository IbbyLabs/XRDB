package compose

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

// delayedDetector answers after a delay, standing in for an addon that has to
// go and scrape rather than serving from its own cache.
type delayedDetector struct {
	delay  time.Duration
	tokens map[string]bool
	calls  atomic.Int32
	done   chan struct{}
}

func (d *delayedDetector) Detect(ctx context.Context, _, _ string) (map[string]bool, error) {
	d.calls.Add(1)
	select {
	case <-time.After(d.delay):
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	if d.done != nil {
		close(d.done)
	}
	return d.tokens, nil
}

func newBudgetPipeline(det qualityDetector, budget, warm time.Duration) *Pipeline {
	p := &Pipeline{}
	p.SetQualityDetector(det, time.Hour)
	p.SetStreamBudgets(budget, warm)
	return p
}

// A render waits its budget and no longer. The addon here takes far longer than
// the budget, which is what a scrape does, and the render still has to come back
// promptly with the picked badges.
func TestASlowAddonDoesNotHoldTheRender(t *testing.T) {
	det := &delayedDetector{delay: 3 * time.Second, tokens: map[string]bool{"4k": true}}
	p := newBudgetPipeline(det, 100*time.Millisecond, 10*time.Second)

	resolve := p.startQualityDetect(context.Background(),
		imageconfigBadges{badges: []string{"4k", "remux"}}, "movie", "tt0111161")
	if resolve == nil {
		t.Fatal("no resolver was returned")
	}

	start := time.Now()
	badges, verified := resolve()
	elapsed := time.Since(start)

	if elapsed > time.Second {
		t.Fatalf("the render waited %v for the addon, budget was 100ms", elapsed)
	}
	if verified {
		t.Fatal("reported as verified when the addon had not answered")
	}
	if len(badges) != 2 {
		t.Fatalf("picked badges should be drawn as they are, got %v", badges)
	}
}

// The point of not waiting is that the answer is ready next time. The lookup
// carries on after the render gives up, and the following render is both
// verified and immediate.
func TestTheLookupCarriesOnAndWarmsTheNextRender(t *testing.T) {
	det := &delayedDetector{
		delay:  250 * time.Millisecond,
		tokens: map[string]bool{"4k": true},
		done:   make(chan struct{}),
	}
	p := newBudgetPipeline(det, 20*time.Millisecond, 10*time.Second)

	// Cancelled the moment the render is done with it, which is what a finished
	// request does. A lookup still tied to it dies here instead of finishing.
	renderCtx, endRender := context.WithCancel(context.Background())
	resolve := p.startQualityDetect(renderCtx,
		imageconfigBadges{badges: []string{"4k", "remux"}}, "movie", "tt0111161")
	if _, verified := resolve(); verified {
		t.Fatal("the first render should not have waited for the answer")
	}
	endRender()

	select {
	case <-det.done:
	case <-time.After(5 * time.Second):
		t.Fatal("the lookup did not finish after the render stopped waiting")
	}
	// The cache is written after Detect returns.
	time.Sleep(50 * time.Millisecond)

	start := time.Now()
	second := p.startQualityDetect(context.Background(),
		imageconfigBadges{badges: []string{"4k", "remux"}}, "movie", "tt0111161")
	badges, verified := second()
	elapsed := time.Since(start)

	if !verified {
		t.Fatal("the second render was not verified, so the lookup did not warm the cache")
	}
	if elapsed > 100*time.Millisecond {
		t.Fatalf("the second render waited %v; a warm answer should be immediate", elapsed)
	}
	if len(badges) != 1 || badges[0] != "4k" {
		t.Fatalf("the verified answer should drop the badge the title has no release in, got %v", badges)
	}
	if got := det.calls.Load(); got != 1 {
		t.Fatalf("the addon was asked %d times for one title", got)
	}
}

// A render that finds every background slot taken draws its picks rather than
// queueing. Without this a catalogue of unseen titles opens one upstream request
// per poster.
func TestBackgroundLookupsAreBounded(t *testing.T) {
	det := &delayedDetector{delay: 2 * time.Second, tokens: map[string]bool{"4k": true}}
	p := newBudgetPipeline(det, 10*time.Millisecond, 10*time.Second)

	started := 0
	for i := 0; i < DefaultStreamWarmSlots+3; i++ {
		id := "tt" + string(rune('a'+i))
		if r := p.startQualityDetect(context.Background(),
			imageconfigBadges{badges: []string{"4k"}}, "movie", id); r != nil {
			started++
			go r()
		}
	}
	if started > DefaultStreamWarmSlots {
		t.Fatalf("%d lookups started against %d slots", started, DefaultStreamWarmSlots)
	}
	if started == 0 {
		t.Fatal("no lookup started at all, so the bound is not what this measured")
	}
}
