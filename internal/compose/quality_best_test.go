package compose

import (
	"slices"
	"testing"
)

func TestBestQualityTierKeepsOneResolutionAndTheRest(t *testing.T) {
	tests := []struct {
		name     string
		badges   []string
		mode     string
		verified bool
		want     []string
	}{
		{"best keeps the top tier in its place", []string{"hdr", "720p", "4k", "atmos", "1080p"}, "best", true, []string{"hdr", "4k", "atmos"}},
		{"1080p outranks HD", []string{"hd", "1080p"}, "best", true, []string{"1080p"}},
		{"HD outranks 720p", []string{"720p", "hd", "dv"}, "best", true, []string{"hd", "dv"}},
		{"CAM stands when nothing better exists", []string{"cam", "atmos"}, "best", true, []string{"cam", "atmos"}},
		{"unverified best draws no resolution", []string{"4k", "hdr", "cam"}, "best", false, []string{"hdr"}},
		{"all mode keeps every tier", []string{"4k", "1080p", "hdr"}, "", true, []string{"4k", "1080p", "hdr"}},
		{"all mode never draws CAM on trust", []string{"4k", "cam"}, "", false, []string{"4k"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := applyQualityMode(tc.badges, tc.mode, tc.verified)
			if !slices.Equal(got, tc.want) {
				t.Errorf("applyQualityMode(%v, %q, %v) = %v, want %v", tc.badges, tc.mode, tc.verified, got, tc.want)
			}
		})
	}
}

func TestNewTierTokensHaveLabels(t *testing.T) {
	for token, want := range map[string]string{"1080p": "1080p", "720p": "720p", "cam": "CAM"} {
		if got := qualityBadgeLabel(token); got != want {
			t.Errorf("qualityBadgeLabel(%q) = %q, want %q", token, got, want)
		}
	}
}
