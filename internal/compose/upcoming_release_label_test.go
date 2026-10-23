package compose

import (
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

// The badge is absent on unreleased titles and present on released ones, so the
// two states share it and can never both apply (FR-189).
func TestUpcomingReleaseLabelCarriesTheDate(t *testing.T) {
	u := provider.UpcomingRelease{Kind: "cinemas", Date: time.Date(2026, 4, 20, 0, 0, 0, 0, time.UTC)}

	label, accent, ok := upcomingReleaseLabel(u)
	if !ok {
		t.Fatal("a dated upcoming release drew nothing")
	}
	if label != "CINEMAS 20 APR 2026" {
		t.Errorf("label = %q", label)
	}
	if _, want, _ := releaseStatusLabel("cinemas", ""); accent != want {
		t.Errorf("accent = %v, want the landed cinemas accent %v", accent, want)
	}
}

func TestUpcomingReleaseLabelIsEmptyWithoutADate(t *testing.T) {
	for _, u := range []provider.UpcomingRelease{
		{},
		{Kind: "cinemas"},
		{Date: time.Date(2026, 4, 20, 0, 0, 0, 0, time.UTC)},
		{Kind: "tv", Date: time.Date(2026, 4, 20, 0, 0, 0, 0, time.UTC)},
	} {
		if _, _, ok := upcomingReleaseLabel(u); ok {
			t.Errorf("%+v drew a badge", u)
		}
	}
}

func TestUpcomingReleaseLabelFormatsAndCase(t *testing.T) {
	u := provider.UpcomingRelease{Kind: "cinemas", Date: time.Date(2026, 10, 23, 0, 0, 0, 0, time.UTC)}
	cases := []struct {
		format string
		normal bool
		want   string
	}{
		{"", false, "CINEMAS 23 OCT 2026"},
		{"day-month", false, "CINEMAS 23 OCT"},
		{"month-day", true, "Cinemas Oct 23"},
		{"bogus", true, "Cinemas 23 Oct 2026"},
	}
	for _, tc := range cases {
		if got, _, _ := upcomingReleaseLabelAs(u, tc.format, tc.normal); got != tc.want {
			t.Errorf("%q normal=%v: got %q, want %q", tc.format, tc.normal, got, tc.want)
		}
	}
	if got := releaseLabelInCase("IN CINEMAS", "normal"); got != "In cinemas" {
		t.Errorf("normal case = %q", got)
	}
	if got := releaseLabelInCase("IN CINEMAS", "title"); got != "In Cinemas" {
		t.Errorf("title case = %q", got)
	}
	if got := releaseLabelInCase("IN CINEMAS", "upper"); got != "IN CINEMAS" {
		t.Errorf("upper case = %q", got)
	}
}

func TestUpcomingPhysicalReleaseNamesItsFormat(t *testing.T) {
	d := time.Date(2026, 11, 3, 0, 0, 0, 0, time.UTC)
	for format, want := range map[string]string{"": "DISC 3 NOV 2026", "Blu-ray": "BLU-RAY 3 NOV 2026", "4K": "4K 3 NOV 2026"} {
		got, accent, ok := upcomingReleaseLabel(provider.UpcomingRelease{Kind: "physical", Date: d, Format: format})
		if !ok || got != want {
			t.Errorf("format %q: got %q ok=%v, want %q", format, got, ok, want)
		}
		if accent != physicalReleaseAccent {
			t.Errorf("format %q: accent %v, want %v", format, accent, physicalReleaseAccent)
		}
	}
}

func TestDiscReleaseLabelKeepsTheFormatSpelling(t *testing.T) {
	for _, tc := range []struct{ format, mode, want string }{
		{"", "upper", "ON DISC"},
		{"", "normal", "On Disc"},
		{"Blu-ray", "upper", "ON BLU-RAY"},
		{"Blu-ray", "normal", "On Blu-ray"},
		{"DVD", "title", "On DVD"},
	} {
		got, accent, ok := discReleaseLabel(tc.format, "", tc.mode)
		if !ok || got != tc.want || accent != physicalReleaseAccent {
			t.Errorf("%q %s: got %q %v ok=%v, want %q", tc.format, tc.mode, got, accent, ok, tc.want)
		}
	}
}
