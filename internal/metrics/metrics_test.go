package metrics

import (
	"testing"
)

func TestRecordAndSnapshot(t *testing.T) {
	s := New()
	s.Record("/poster/tt1", 200, 12.5)
	s.Record("/poster/tt2", 200, 8.0)
	s.Record("/poster/tt3", 400, 2.0)

	snap := s.Snapshot()
	if snap.TotalRequests != 3 {
		t.Errorf("expected 3 total requests, got %d", snap.TotalRequests)
	}
	if snap.ByStatus[200] != 2 {
		t.Errorf("expected 2 x 200, got %d", snap.ByStatus[200])
	}
	if snap.ByStatus[400] != 1 {
		t.Errorf("expected 1 x 400, got %d", snap.ByStatus[400])
	}
	if snap.ByRoute["/poster/tt1"] != 1 {
		t.Errorf("expected 1 request for route, got %d", snap.ByRoute["/poster/tt1"])
	}
	if snap.UptimeSeconds < 0 {
		t.Error("expected non-negative uptime")
	}
}

func TestPercentiles(t *testing.T) {
	s := New()
	for i := 1; i <= 100; i++ {
		s.Record("/r", 200, float64(i))
	}
	snap := s.Snapshot()
	if snap.P50Ms < 49 || snap.P50Ms > 51 {
		t.Errorf("p50 out of expected range: %f", snap.P50Ms)
	}
	if snap.P95Ms < 94 || snap.P95Ms > 96 {
		t.Errorf("p95 out of expected range: %f", snap.P95Ms)
	}
	if snap.P99Ms < 98 || snap.P99Ms > 100 {
		t.Errorf("p99 out of expected range: %f", snap.P99Ms)
	}
}

func TestEmptySnapshotReturnsZeroes(t *testing.T) {
	s := New()
	snap := s.Snapshot()
	if snap.TotalRequests != 0 {
		t.Errorf("expected 0 total requests, got %d", snap.TotalRequests)
	}
	if snap.P50Ms != 0 || snap.P95Ms != 0 {
		t.Error("expected zero percentiles for empty store")
	}
}

func TestRingBufferBoundedAtRingSize(t *testing.T) {
	s := New()
	for i := 0; i < ringSize+100; i++ {
		s.Record("/r", 200, 1.0)
	}
	snap := s.Snapshot()
	if snap.TotalRequests != int64(ringSize+100) {
		t.Errorf("total should be unbounded, got %d", snap.TotalRequests)
	}
	// internal ring should not exceed ringSize
	count := 0
	for _, v := range snap.ByRoute {
		count += int(v)
	}
	if count > ringSize {
		t.Errorf("ring snapshot should be bounded at %d, got %d", ringSize, count)
	}
}

// byStatus and byRoute are separate dimensions, so a reader can see the 404
// count and the poster count without being able to tell how many of one were
// the other. Both values are already in the ring.
func TestSnapshotCrossesRouteWithStatus(t *testing.T) {
	s := New()
	s.Record("/poster", 200, 10)
	s.Record("/poster", 404, 11)
	s.Record("/poster", 404, 12)
	s.Record("/thumbnail", 404, 13)

	snap := s.Snapshot()
	if got := snap.ByStatus[404]; got != 3 {
		t.Fatalf("byStatus 404 = %d, want 3 — the fixture is wrong, not the cross", got)
	}
	if got := snap.ByRouteStatus["/poster"][404]; got != 2 {
		t.Errorf("poster 404s = %d, want 2", got)
	}
	if got := snap.ByRouteStatus["/poster"][200]; got != 1 {
		t.Errorf("poster 200s = %d, want 1", got)
	}
	if got := snap.ByRouteStatus["/thumbnail"][404]; got != 1 {
		t.Errorf("thumbnail 404s = %d, want 1", got)
	}
}
