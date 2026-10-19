package provider

import (
	"context"
	"testing"

	"xrdb_rewrite/internal/provider/animemap"
)

// BUG-300. An unanchored entry past season 1 is taken only on matching titles.
func TestAnUnanchoredEntryPastSeasonOneNeedsMatchingTitles(t *testing.T) {
	m := &MALEpisodes{}
	e := animemap.EpisodeEntry{MALID: 11061, Episode: 63, Unanchored: true}
	jk := &jikanEpisode{Title: "A x Hard x Master?"}
	cases := []struct {
		name, tmdb string
		season     int
		jk         *jikanEpisode
		want       bool
	}{
		{"titles match", "A x Hard x Master?", 2, jk, true},
		{"titles differ", "Strengthen x And x Threaten", 2, jk, false},
		{"no TMDB title", "", 2, jk, false},
		{"no MAL episode", "A x Hard x Master?", 2, nil, false},
		{"season 1 without titles", "", 1, nil, true},
	}
	for _, tc := range cases {
		ctx := WithEpisodeName(context.Background(), tc.tmdb)
		got, err := m.placed(ctx, "tt2098220", tc.season, e, tc.jk)
		if err != nil || got != tc.want {
			t.Errorf("%s: placed = %v, %v; want %v", tc.name, got, err, tc.want)
		}
	}
}
