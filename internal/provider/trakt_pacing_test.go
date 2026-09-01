package provider

import (
	"testing"
	"time"
)

// The rate that earned a 429 on 2026-08-22: 351 calls inside five minutes from
// a standing start, and roughly 85 inside one. The pacing has to sit under the
// lower of the two, so the test carries the measurement rather than the number
// it produced — a bare "must be >= 1s" stops meaning anything the moment
// somebody has a reason to lower it.
const (
	traktObservedRefusalPerMin = 70.0 // 351 / 5
	traktBurstRefusalPerMin    = 85.0
)

func TestTraktIsPacedUnderTheRateThatEarnedARefusal(t *testing.T) {
	interval := rateLimitFor("trakt").MinInterval
	if interval <= 0 {
		t.Fatal("trakt is unpaced, so nothing stops a sweep reaching the refusal rate")
	}
	perMin := float64(time.Minute) / float64(interval)
	if perMin >= traktObservedRefusalPerMin {
		t.Errorf("trakt paced at %.0f calls/min, which reaches the %.0f that earned a 429",
			perMin, traktObservedRefusalPerMin)
	}
	if traktObservedRefusalPerMin >= traktBurstRefusalPerMin {
		t.Fatal("the two observations are the wrong way round; the sustained figure must be the lower bound")
	}
}

// The number came from one refusal, so it has to be movable without a release.
func TestTraktPacingIsTunableWithoutARelease(t *testing.T) {
	t.Setenv("XRDB_TRAKT_MIN_INTERVAL_SECONDS", "2.5")
	if got := readMinIntervalOverrides()["trakt"]; got != 2500*time.Millisecond {
		t.Errorf("env override ignored: got %v", got)
	}
	// Out of range keeps the table's interval rather than the unpaced case.
	t.Setenv("XRDB_TRAKT_MIN_INTERVAL_SECONDS", "0")
	prev := minIntervalOverrides
	minIntervalOverrides = readMinIntervalOverrides()
	t.Cleanup(func() { minIntervalOverrides = prev })
	if got := rateLimitFor("trakt").MinInterval; got < time.Second {
		t.Errorf("an out-of-range override left trakt paced at %v, looser than the default", got)
	}
}
