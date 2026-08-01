package compose

import (
	"testing"
	"time"
)

func TestTheBreakerShutsAfterRepeatedFailures(t *testing.T) {
	var b streamBreaker
	for i := 0; i < streamBreakerThreshold-1; i++ {
		b.failed()
		if b.shut() {
			t.Fatalf("shut after %d failures, want it to tolerate up to %d", i+1, streamBreakerThreshold)
		}
	}
	b.failed()
	if !b.shut() {
		t.Fatalf("want the breaker shut after %d consecutive failures", streamBreakerThreshold)
	}
}

// One answer means the addon is back, so the count starts again rather than
// creeping to the threshold across unrelated failures hours apart.
func TestAnAnswerResetsTheCount(t *testing.T) {
	var b streamBreaker
	for i := 0; i < streamBreakerThreshold-1; i++ {
		b.failed()
	}
	b.answered()
	b.failed()
	if b.shut() {
		t.Fatal("want the failure count reset by an answer")
	}
}

func TestTheBreakerReopensAfterTheCooldown(t *testing.T) {
	var b streamBreaker
	for i := 0; i < streamBreakerThreshold; i++ {
		b.failed()
	}
	if !b.shut() {
		t.Fatal("want it shut")
	}
	// Reaching back in time is how the cooldown is exercised without waiting it out.
	b.mu.Lock()
	b.openUntil = time.Now().Add(-time.Second)
	b.mu.Unlock()
	if b.shut() {
		t.Fatal("want it open again once the cooldown has lapsed")
	}
}

// A nil breaker is the disabled case and every method has to tolerate it.
func TestANilBreakerNeverShuts(t *testing.T) {
	var b *streamBreaker
	b.failed()
	b.answered()
	if b.shut() {
		t.Fatal("want a nil breaker to stay out of the way")
	}
}
