package provider

import (
	"testing"
	"time"
)

func at(s string) string { return s + "T00:00:00.000Z" }

// A date is region-scoped where the status is not, so the badge names the one
// the viewer will experience (FR-189).
func TestNextReleaseTakesTheSoonestAhead(t *testing.T) {
	now := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	entries := []releaseEntry{
		{kind: releaseTypeDigital, date: at("2026-06-10")},
		{kind: releaseTypeTheatrical, date: at("2026-04-20")},
	}

	got := nextRelease(entries, now, allBadgeReleaseKinds...)
	if got.Kind != "cinemas" {
		t.Errorf("kind = %q, want cinemas", got.Kind)
	}
	if want := time.Date(2026, 4, 20, 0, 0, 0, 0, time.UTC); !got.Date.Equal(want) {
		t.Errorf("date = %v, want %v", got.Date, want)
	}
}

// Only one of the two dates is the common case for anything far out.
func TestNextReleaseAnswersWithOneDate(t *testing.T) {
	now := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)

	got := nextRelease([]releaseEntry{{kind: releaseTypeDigital, date: at("2026-06-10")}}, now, allBadgeReleaseKinds...)
	if got.Kind != "digital" || got.Date.IsZero() {
		t.Errorf("got %+v, want the digital date", got)
	}
}

// An undated entry counts as landed for the status, and the date badge inherits
// that rather than contradicting the badge it shares.
func TestNextReleaseIgnoresPastAndUndatedEntries(t *testing.T) {
	now := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	entries := []releaseEntry{
		{kind: releaseTypeTheatrical, date: at("2020-01-01")},
		{kind: releaseTypeDigital, date: ""},
	}

	if got := nextRelease(entries, now, allBadgeReleaseKinds...); got.Kind != "" || !got.Date.IsZero() {
		t.Errorf("got %+v, want nothing ahead", got)
	}
}

// Physical and TV releases are not states the badge names.
func TestNextReleaseIgnoresKindsTheBadgeCannotName(t *testing.T) {
	now := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)

	if got := nextRelease([]releaseEntry{{kind: 5, date: at("2026-09-09")}}, now, allBadgeReleaseKinds...); got.Kind != "" {
		t.Errorf("got %+v, want nothing for a physical release", got)
	}
}

func TestReleaseRegionDefaultsToUS(t *testing.T) {
	for in, want := range map[string]string{"": "US", "  ": "US", "gb": "GB", " de ": "DE"} {
		if got := releaseRegion(in); got != want {
			t.Errorf("releaseRegion(%q) = %q, want %q", in, got, want)
		}
	}
}

// A film already in cinemas has one question left, and a theatrical date still
// ahead in the region is not the answer to it (FR-189).
func TestNextReleaseCanBeNarrowedToDigital(t *testing.T) {
	now := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	entries := []releaseEntry{
		{kind: releaseTypeTheatrical, date: at("2026-05-20")},
		{kind: releaseTypeDigital, date: at("2026-07-01")},
	}

	got := nextRelease(entries, now, releaseTypeDigital)
	if got.Kind != "digital" {
		t.Fatalf("kind = %q, want digital", got.Kind)
	}
	if want := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC); !got.Date.Equal(want) {
		t.Errorf("date = %v, want %v", got.Date, want)
	}
	if all := nextRelease(entries, now, allBadgeReleaseKinds...); all.Kind != "cinemas" {
		t.Errorf("unnarrowed kind = %q, want cinemas; the narrowing is doing nothing", all.Kind)
	}
}
