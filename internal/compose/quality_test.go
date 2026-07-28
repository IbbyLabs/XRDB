package compose

import (
	"context"
	"errors"
	"reflect"
	"sync/atomic"
	"testing"
	"time"
)

type stubDetector struct {
	tokens map[string]bool
	err    error
	calls  atomic.Int32
}

func (s *stubDetector) Detect(_ context.Context, _, _ string) (map[string]bool, error) {
	s.calls.Add(1)
	return s.tokens, s.err
}

func pipelineWithDetector(d qualityDetector) *Pipeline {
	p := &Pipeline{}
	p.SetQualityDetector(d, time.Hour)
	return p
}

func TestDetectKeepsOnlyThePickedBadgesThatExist(t *testing.T) {
	det := &stubDetector{tokens: map[string]bool{"4k": true, "hdr": true, "atmos": true}}
	p := pipelineWithDetector(det)

	resolve := p.startQualityDetect(context.Background(), imageconfigBadges{
		badges: []string{"4k", "remux", "hdr"},
	}, "movie", "tt0111161")
	if resolve == nil {
		t.Fatal("no resolver returned")
	}
	got, verified := resolve()
	if !verified {
		t.Error("verified = false, want true")
	}
	if want := []string{"4k", "hdr"}; !reflect.DeepEqual(got, want) {
		t.Errorf("badges = %v, want %v (remux is not available)", got, want)
	}
}

// A title with no releases at all draws no quality row rather than every badge
// the user picked.
func TestATitleWithNothingAvailableDrawsNoQualityBadges(t *testing.T) {
	p := pipelineWithDetector(&stubDetector{tokens: map[string]bool{}})
	got, verified := p.startQualityDetect(context.Background(), imageconfigBadges{
		badges: []string{"4k", "hdr"},
	}, "movie", "tt0111161")()
	if !verified {
		t.Error("verified = false, want true: an empty answer is still an answer")
	}
	if len(got) != 0 {
		t.Errorf("badges = %v, want none", got)
	}
}

// An addon that is down must not blank the badge row: the picked badges are
// drawn as before, and the render is marked so it is not cached for long.
func TestAFailingAddonDrawsThePickedBadgesUnverified(t *testing.T) {
	p := pipelineWithDetector(&stubDetector{err: errors.New("connection refused")})
	picked := []string{"4k", "hdr"}
	got, verified := p.startQualityDetect(context.Background(), imageconfigBadges{
		badges: picked,
	}, "movie", "tt0111161")()
	if verified {
		t.Error("verified = true, want false")
	}
	if !reflect.DeepEqual(got, picked) {
		t.Errorf("badges = %v, want the picked set %v", got, picked)
	}
}

func TestDetectIsSkippedWhenItCannotChangeTheOutcome(t *testing.T) {
	cases := []struct {
		name string
		cfg  imageconfigBadges
		id   string
	}{
		{"no badges were picked", imageconfigBadges{}, "tt1"},
		{"the row is hidden", imageconfigBadges{badges: []string{"4k"}, hidden: true}, "tt1"},
		{"the title has no IMDb id", imageconfigBadges{badges: []string{"4k"}}, "12345"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			det := &stubDetector{tokens: map[string]bool{"4k": true}}
			p := pipelineWithDetector(det)
			if r := p.startQualityDetect(context.Background(), tc.cfg, "movie", tc.id); r != nil {
				t.Error("a resolver was returned; the addon should not be asked")
			}
			if n := det.calls.Load(); n != 0 {
				t.Errorf("addon called %d times, want 0", n)
			}
		})
	}
}

// Without a configured addon the switch does nothing rather than erroring.
func TestNoAddonMeansNoDetection(t *testing.T) {
	p := &Pipeline{}
	if r := p.startQualityDetect(context.Background(), imageconfigBadges{
		badges: []string{"4k"},
	}, "movie", "tt1"); r != nil {
		t.Error("a resolver was returned with no addon configured")
	}
}

// The same title under twenty different render configs is one addon call.
func TestATitleIsOnlyAskedAboutOnce(t *testing.T) {
	det := &stubDetector{tokens: map[string]bool{"4k": true}}
	p := pipelineWithDetector(det)
	for range 20 {
		p.startQualityDetect(context.Background(), imageconfigBadges{
			badges: []string{"4k"},
		}, "movie", "tt0111161")()
	}
	if n := det.calls.Load(); n != 1 {
		t.Errorf("addon called %d times, want 1", n)
	}
}

// A failure is not remembered, or an addon restart would not be noticed until
// the cache TTL ran out.
func TestAFailureIsNotCached(t *testing.T) {
	det := &stubDetector{err: errors.New("down")}
	p := pipelineWithDetector(det)
	for range 3 {
		p.startQualityDetect(context.Background(), imageconfigBadges{
			badges: []string{"4k"},
		}, "movie", "tt0111161")()
	}
	if n := det.calls.Load(); n != 3 {
		t.Errorf("addon called %d times, want 3", n)
	}
}

func TestStreamContentTypeReadsTheID(t *testing.T) {
	for _, tc := range []struct{ contentType, id, want string }{
		{"movie", "tt0111161", "movie"},
		{"series", "tt0944947", "series"},
		{"tv", "tt0944947", "series"},
		{"", "tt0944947:1:2", "series"},
		{"movie", "tt0944947:1:2", "series"},
		{"", "tt0111161", "movie"},
	} {
		if got := streamContentType(tc.contentType, tc.id); got != tc.want {
			t.Errorf("streamContentType(%q, %q) = %q, want %q", tc.contentType, tc.id, got, tc.want)
		}
	}
}

func TestFilterAvailableBadgesKeepsThePickedOrder(t *testing.T) {
	got := filterAvailableBadges(
		[]string{"remux", "4K", " hdr ", "atmos"},
		map[string]bool{"4k": true, "hdr": true},
	)
	if want := []string{"4K", " hdr "}; !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}
