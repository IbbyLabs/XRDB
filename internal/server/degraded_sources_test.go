package server

import (
	"testing"

	"xrdb_rewrite/internal/provider"
)

// The count answers "how many sources can a render not reach". Healthy answers
// "was the last event a failure", and the two disagree in both directions: a
// source that failed once hours ago and has answered since reads unhealthy, and
// one that has never produced a rating reads healthy.
//
// Failing rather than the hold on its own, because a source refusing every call
// spends part of each cycle outside its hold.
func TestDegradedCountsHoldsRatherThanTheHealthyFlag(t *testing.T) {
	cases := []struct {
		name     string
		snapshot []provider.SourceHealth
		want     int
	}{
		{
			name: "a held-out source counts",
			snapshot: []provider.SourceHealth{
				{Source: "mdblist", Healthy: false, CoolingOff: true, Failing: true},
			},
			want: 1,
		},
		{
			// cinemeta on 2026-09-04: one 504, then 198 empty answers, no hold.
			name: "a stale unhealthy flag does not count",
			snapshot: []provider.SourceHealth{
				{Source: "cinemeta", Healthy: false, CoolingOff: false},
			},
			want: 0,
		},
		{
			// mediux on the same reading: four answers, none carrying a rating,
			// never a failure, so Healthy stayed true.
			name: "a source that has never answered does not count either",
			snapshot: []provider.SourceHealth{
				{Source: "mediux", Healthy: true, CoolingOff: false},
			},
			want: 0,
		},
		{
			// mdblist on 2026-09-04 at 05:50Z: ten consecutive 502s with the
			// hold expired between calls. Counting the hold alone reports a
			// source that is refusing everything as reachable.
			name: "a source failing every call between holds counts",
			snapshot: []provider.SourceHealth{
				{Source: "mdblist", Healthy: false, CoolingOff: false,
					ConsecutiveFail: 10, Failing: true},
			},
			want: 1,
		},
		{
			// The bulk hold is a catalogue sweep waiting its turn, not a source
			// a live render cannot reach.
			name: "a bulk-only hold does not count",
			snapshot: []provider.SourceHealth{
				{Source: "wikidata", Healthy: true, CoolingOff: false, CoolingOffBulk: true},
			},
			want: 0,
		},
		{
			name: "the reading that produced this change",
			snapshot: []provider.SourceHealth{
				{Source: "mdblist", Healthy: false, CoolingOff: true, Failing: true},
				{Source: "cinemeta", Healthy: false, CoolingOff: false},
				{Source: "mediux", Healthy: true, CoolingOff: false},
				{Source: "imdb_local", Healthy: true, CoolingOff: false},
			},
			want: 1,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := degradedSources(tc.snapshot); got != tc.want {
				t.Errorf("degradedSources() = %d, want %d", got, tc.want)
			}
		})
	}
}
