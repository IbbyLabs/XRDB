package provider

import (
	"testing"
	"time"
)

func TestResolveReleaseStatus(t *testing.T) {
	now := time.Date(2026, 7, 21, 0, 0, 0, 0, time.UTC)
	past := "2026-01-05T00:00:00.000Z"
	future := "2027-01-05T00:00:00.000Z"

	for _, tc := range []struct {
		name    string
		entries []releaseEntry
		want    string
	}{
		{"no entries", nil, ""},
		{"only a future theatrical date", []releaseEntry{{3, future}}, ""},
		{"released in cinemas", []releaseEntry{{3, past}}, "cinemas"},
		{"limited theatrical counts", []releaseEntry{{2, past}}, "cinemas"},
		{"digital wins over theatrical", []releaseEntry{{3, past}, {4, past}}, "digital"},
		{"a future digital date stays in cinemas", []releaseEntry{{3, past}, {4, future}}, "cinemas"},
		{"an undated release counts as out", []releaseEntry{{4, ""}}, "digital"},
		{"physical alone is not a badge state", []releaseEntry{{5, past}}, ""},
		{"any region counts", []releaseEntry{{4, future}, {4, past}}, "digital"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := resolveReleaseStatus(tc.entries, now); got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestOMDBParsesPoster(t *testing.T) {
	for _, tc := range []struct {
		poster string
		want   string
	}{
		{"https://example.test/p.jpg", "https://example.test/p.jpg"},
		{"N/A", ""},
		{"", ""},
	} {
		if got := omdbPosterURL(tc.poster); got != tc.want {
			t.Errorf("omdbPosterURL(%q) = %q, want %q", tc.poster, got, tc.want)
		}
	}
}
