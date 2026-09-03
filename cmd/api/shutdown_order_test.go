package main

import (
	"os"
	"strings"
	"testing"
)

// The HTTP drain and the container's stop grace are both ten seconds, so a
// snapshot written after the drain is reachable only in the time the drain does
// not use. A drain is slowest when a sweep is in flight, which is when the
// snapshot is worth most.
func TestTheRatingsSnapshotIsWrittenBeforeTheDrain(t *testing.T) {
	src, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("cannot read main.go: %v", err)
	}
	body := string(src)

	save := strings.Index(body, "pipeline.SaveRatingsCache()")
	drain := strings.Index(body, "srv.Shutdown(ctx)")
	if save < 0 || drain < 0 {
		t.Fatalf("shutdown no longer calls both: save=%d drain=%d", save, drain)
	}
	if save > drain {
		t.Error("the ratings snapshot is written after the drain, so a slow drain loses it")
	}
}
