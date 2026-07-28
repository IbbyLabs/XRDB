package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestDetectQualityReadsRealReleaseNames(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		want   []string
		absent []string
	}{
		{
			name:  "a 4K remux carries its whole stack",
			input: "Citizen.Kane.1941.2160p.UHD.Bluray.REMUX.DV.HDR.HEVC.DTS-HD.MA.2.0-ONLY.mkv",
			want:  []string{"4k", "bluray", "remux", "bdremux", "dv", "hdr", "dts"},
		},
		{
			name:   "a plain 1080p web release is only HD",
			input:  "Some.Show.S01E01.1080p.WEB-DL.H264-GROUP.mkv",
			want:   []string{"hd"},
			absent: []string{"4k", "hdr", "dv", "remux", "bluray", "atmos"},
		},
		{
			name:   "DVDRip is not Dolby Vision",
			input:  "Old.Film.1994.DVDRip.XviD-GROUP.avi",
			absent: []string{"dv", "4k", "hd"},
		},
		{
			name:  "DoVi and Atmos spellings are picked up",
			input: "Movie.2023.2160p.UHD.BDRemux.DoVi.P8.TrueHD.7.1.Atmos-GRP.mkv",
			want:  []string{"4k", "dv", "atmos", "remux", "bluray", "bdremux"},
		},
		{
			name:  "spaced Dolby Vision is picked up",
			input: "Movie (1941) Criterion 2160p 10bit DOLBY VISION BluRay DTS-HD MA 2.0 x265.mkv",
			want:  []string{"4k", "dv", "bluray", "dts"},
		},
		{
			name:  "HDR10+ implies HDR10 and HDR",
			input: "Movie.2022.2160p.WEB-DL.HDR10+.HEVC-GRP.mkv",
			want:  []string{"4k", "hdr10plus", "hdr10", "hdr"},
		},
		{
			name:  "IMAX is detected",
			input: "Movie.2023.IMAX.1080p.BluRay.x264-GRP.mkv",
			want:  []string{"imax", "hd", "bluray"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := DetectQuality([]string{tc.input})
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

// bdremux is drawn as one tile, so it must not appear for a Blu-ray that is
// not a remux, nor for a remux that came from somewhere else.
func TestBDRemuxNeedsBothHalves(t *testing.T) {
	blurayOnly := DetectQuality([]string{"Movie.2020.1080p.BluRay.x264-GRP.mkv"})
	if blurayOnly["bdremux"] {
		t.Error("bdremux set for a Blu-ray that is not a remux")
	}
	webRemux := DetectQuality([]string{"Movie.2020.2160p.WEB.REMUX.HEVC-GRP.mkv"})
	if webRemux["bdremux"] {
		t.Error("bdremux set for a remux that is not from a disc")
	}
	both := DetectQuality([]string{"Movie.2020.2160p.BluRay.REMUX.HEVC-GRP.mkv"})
	if !both["bdremux"] {
		t.Error("bdremux missing when both halves are present")
	}
}

func TestDetectQualityMergesAcrossStreams(t *testing.T) {
	got := DetectQuality([]string{
		"Movie.2020.1080p.WEB-DL.x264-GRP.mkv",
		"Movie.2020.2160p.BluRay.REMUX.TrueHD.Atmos-GRP.mkv",
	})
	for _, token := range []string{"hd", "4k", "bluray", "remux", "atmos"} {
		if !got[token] {
			t.Errorf("token %q missing after merging streams: %v", token, got)
		}
	}
}

func TestNormalizeStreamBaseURLAcceptsAnInstallLink(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"http://comet:2020", "http://comet:2020"},
		{"http://comet:2020/", "http://comet:2020"},
		{"http://comet:2020/manifest.json", "http://comet:2020"},
		{"stremio://torrentio.stremio.ru/manifest.json", "torrentio.stremio.ru"},
		{"https://comet.example/AbC123/manifest.json", "https://comet.example/AbC123"},
		{"  http://comet:2020  ", "http://comet:2020"},
	} {
		if got := NormalizeStreamBaseURL(tc.in); got != tc.want {
			t.Errorf("NormalizeStreamBaseURL(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestStreamIDQualifiesAnEpisode(t *testing.T) {
	if got := StreamID("tt0944947", 0, 0); got != "tt0944947" {
		t.Errorf("movie id = %q", got)
	}
	if got := StreamID("tt0944947", 1, 2); got != "tt0944947:1:2" {
		t.Errorf("episode id = %q", got)
	}
}

func TestDetectReadsAnAddonResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/stream/movie/tt0111161.json" {
			t.Errorf("unexpected path %q", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"streams":[
			{"name":"Torrentio\n4k","title":"Movie.2160p.BluRay.REMUX.DV-GRP.mkv\n👤 30"},
			{"name":"x","behaviorHints":{"filename":"Movie.1080p.WEB.Atmos.mkv"}}
		]}`))
	}))
	defer srv.Close()

	sq := NewStreamQuality(srv.URL, 5*time.Second)
	got, err := sq.Detect(context.Background(), "movie", "tt0111161")
	if err != nil {
		t.Fatalf("Detect: %v", err)
	}
	for _, token := range []string{"4k", "bluray", "remux", "bdremux", "dv", "hd", "atmos"} {
		if !got[token] {
			t.Errorf("token %q missing: %v", token, got)
		}
	}
}

// A title the addon carries nothing for is a fact, not an outage: it answers
// with the empty set so the render is not held back waiting for a retry.
func TestDetectReturnsEmptyForATitleWithNoStreams(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"streams":[]}`))
	}))
	defer srv.Close()

	got, err := NewStreamQuality(srv.URL, 5*time.Second).Detect(context.Background(), "movie", "tt0111161")
	if err != nil {
		t.Fatalf("Detect: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("got %v, want no tokens", got)
	}
}

func TestDetectRejectsANonIMDbID(t *testing.T) {
	if _, err := NewStreamQuality("http://x", time.Second).Detect(context.Background(), "movie", "12345"); err == nil {
		t.Error("want an error for a TMDB id")
	}
}

// The addon URL is where a debrid token lives, so nothing past the host may
// reach an error string.
func TestDetectDoesNotLeakTheAddonPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	_, err := NewStreamQuality(srv.URL+"/s3cr3ttoken", time.Second).Detect(context.Background(), "movie", "tt1")
	if err == nil {
		t.Fatal("want an error")
	}
	if got := err.Error(); strings.Contains(got, "s3cr3ttoken") {
		t.Errorf("error leaked the addon path: %q", got)
	}
}

// net/http builds a transport error around the whole request URL, so the path
// reaches the log through a different route than a bad status does.
func TestAnUnreachableAddonDoesNotLeakItsPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	addr := srv.URL
	srv.Close() // nothing is listening now, so the connection is refused

	_, err := NewStreamQuality(addr+"/s3cr3ttoken", time.Second).Detect(context.Background(), "movie", "tt1")
	if err == nil {
		t.Fatal("want an error")
	}
	if got := err.Error(); strings.Contains(got, "s3cr3ttoken") {
		t.Errorf("error leaked the addon path: %q", got)
	}
}

// Comet writes its own parse into description and leaves title empty, so a
// reader that only looks at title and filename throws half the answer away.
func TestDetectReadsTheDescriptionLine(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"streams":[{
			"name":"[TORRENT] Comet 2160p",
			"description":"Citizen Kane\n hevc • DV • HDR | DTS Lossless • 2.0\n BluRay REMUX | ONLY\n 74.0 GB",
			"behaviorHints":{"filename":"Citizen Kane"}
		}]}`))
	}))
	defer srv.Close()

	got, err := NewStreamQuality(srv.URL, 5*time.Second).Detect(context.Background(), "movie", "tt0033467")
	if err != nil {
		t.Fatalf("Detect: %v", err)
	}
	for _, token := range []string{"4k", "dv", "hdr", "dts", "bluray", "remux", "bdremux"} {
		if !got[token] {
			t.Errorf("token %q missing; the description line was not read: %v", token, got)
		}
	}
}
