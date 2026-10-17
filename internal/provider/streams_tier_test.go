package provider

import "testing"

func TestDetectQualityReadsResolutionAndCamTiers(t *testing.T) {
	tests := []struct {
		name   string
		inputs []string
		want   []string
		absent []string
	}{
		{
			name:   "1080p is its own tier and still HD",
			inputs: []string{"Some.Show.S01E01.1080p.WEB-DL.H264-GROUP.mkv"},
			want:   []string{"1080p", "hd"},
			absent: []string{"720p", "cam"},
		},
		{
			name:   "720p is its own tier and still HD",
			inputs: []string{"Some.Show.S01E01.720p.HDTV.x264-GROUP.mkv"},
			want:   []string{"720p", "hd"},
			absent: []string{"1080p", "cam"},
		},
		{
			name:   "a camcorder copy is CAM only, whatever resolution it claims",
			inputs: []string{"New.Film.2026.1080p.HDCAM.x264-GRP.mkv"},
			want:   []string{"cam"},
			absent: []string{"1080p", "hd"},
		},
		{
			name:   "telesync spellings are CAM",
			inputs: []string{"New.Film.2026.TELESYNC.x264-GRP.mkv", "New.Film.2026.HDTS.x264-GRP.mkv"},
			want:   []string{"cam"},
		},
		{
			name:   "a trailing .ts extension is not telesync",
			inputs: []string{"Broadcast.Recording.2026.ts"},
			absent: []string{"cam"},
		},
		{
			name:   "CAM is dropped once a real release exists",
			inputs: []string{"New.Film.2026.HDCAM.x264-GRP.mkv", "New.Film.2026.720p.WEB-DL.x264-GRP.mkv"},
			want:   []string{"720p", "hd"},
			absent: []string{"cam"},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := DetectQuality(tc.inputs)
			for _, token := range tc.want {
				if !got[token] {
					t.Errorf("token %q missing from %v", token, got)
				}
			}
			for _, token := range tc.absent {
				if got[token] {
					t.Errorf("token %q wrongly detected in %v", token, got)
				}
			}
		})
	}
}
