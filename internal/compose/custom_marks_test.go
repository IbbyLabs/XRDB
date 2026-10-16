package compose

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

func allowAll(netip.AddrPort) bool { return true }

func markServer(t *testing.T, body []byte, status int) (*httptest.Server, *atomic.Int64) {
	t.Helper()
	var calls atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(status)
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)
	return srv, &calls
}

func serverAddr(t *testing.T, srv *httptest.Server) netip.AddrPort {
	t.Helper()
	return netip.MustParseAddrPort(strings.TrimPrefix(srv.URL, "http://"))
}

func TestPublicAddress(t *testing.T) {
	cases := map[string]bool{
		"8.8.8.8":              true,
		"2606:4700::1111":      true,
		"::ffff:93.184.216.34": true,
		"127.0.0.1":            false,
		"10.1.2.3":             false,
		"172.17.0.1":           false,
		"192.168.1.1":          false,
		"169.254.169.254":      false,
		"100.64.0.1":           false,
		"0.0.0.0":              false,
		"::1":                  false,
		"fd00::1":              false,
		"fe80::1":              false,
		"::ffff:127.0.0.1":     false,
		"::ffff:10.0.0.1":      false,
		"64:ff9b::a00:1":       false,
		"224.0.0.1":            false,
		"255.255.255.255":      false,
		"198.18.0.1":           false,
	}
	for in, want := range cases {
		if got := publicAddress(netip.MustParseAddr(in)); got != want {
			t.Errorf("publicAddress(%s) = %v, want %v", in, got, want)
		}
	}
}

func TestCustomMarkRefusesLoopback(t *testing.T) {
	srv, calls := markServer(t, makeTestPNG(32, 32, color.NRGBA{200, 0, 0, 255}), 200)
	s := newCustomMarkStore(nil, publicDial)
	if got, failed := s.resolve(context.Background(), map[string]string{"imdb": srv.URL + "/i.png"}); len(got) != 0 || !failed {
		t.Fatalf("loopback mark loaded or not reported: %v %v", got, failed)
	}
	if calls.Load() != 0 {
		t.Fatalf("loopback server was reached %d times", calls.Load())
	}
}

func TestCustomMarkRefusesRedirectInward(t *testing.T) {
	inner, calls := markServer(t, makeTestPNG(32, 32, color.NRGBA{200, 0, 0, 255}), 200)
	front := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, inner.URL+"/i.png", http.StatusFound)
	}))
	t.Cleanup(front.Close)
	frontAddr := serverAddr(t, front)
	s := newCustomMarkStore(nil, func(ap netip.AddrPort) bool { return ap == frontAddr })
	if got, _ := s.resolve(context.Background(), map[string]string{"imdb": front.URL}); len(got) != 0 {
		t.Fatal("redirected mark loaded")
	}
	if calls.Load() != 0 {
		t.Fatalf("the redirect target was reached %d times", calls.Load())
	}
}

func TestCustomMarkLoadsCachesAndShrinks(t *testing.T) {
	srv, calls := markServer(t, makeTestPNG(900, 300, color.NRGBA{200, 30, 30, 255}), 200)
	s := newCustomMarkStore(nil, allowAll)
	for i := 0; i < 3; i++ {
		got, failed := s.resolve(context.Background(), map[string]string{"imdb": srv.URL + "/i.png"})
		m, ok := got["imdb"]
		if !ok || failed {
			t.Fatalf("round %d: mark missing", i)
		}
		if b := m.img.Bounds(); b.Dx() != customMarkMaxSide || b.Dy() != 85 {
			t.Fatalf("mark is %v, want %dx85", b, customMarkMaxSide)
		}
		if !m.colored {
			t.Fatal("a red mark should draw as-is")
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("calls = %d, want 1", calls.Load())
	}
}

func TestCustomMarkRejectsBadBodies(t *testing.T) {
	big := bytes.Repeat([]byte{0}, customMarkMaxBytes+10)
	copy(big, makeTestPNG(4, 4, color.NRGBA{1, 1, 1, 255}))
	cases := map[string]struct {
		body   []byte
		status int
	}{
		"html":      {[]byte("<html><body>nope</body></html>"), 200},
		"svg":       {[]byte(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`), 200},
		"too big":   {big, 200},
		"404":       {makeTestPNG(4, 4, color.NRGBA{1, 1, 1, 255}), 404},
		"truncated": {makeTestPNG(64, 64, color.NRGBA{1, 1, 1, 255})[:40], 200},
	}
	for name, tc := range cases {
		srv, calls := markServer(t, tc.body, tc.status)
		s := newCustomMarkStore(nil, allowAll)
		for i := 0; i < 2; i++ {
			if got, _ := s.resolve(context.Background(), map[string]string{"tmdb": srv.URL}); len(got) != 0 {
				t.Errorf("%s: mark loaded", name)
			}
		}
		if calls.Load() != 1 {
			t.Errorf("%s: failure was not remembered (calls %d)", name, calls.Load())
		}
	}
}

func TestCustomMarkFailureRetriesAfterTTL(t *testing.T) {
	srv, calls := markServer(t, []byte("nope"), 500)
	s := newCustomMarkStore(nil, allowAll)
	now := time.Now()
	s.now = func() time.Time { return now }
	s.resolve(context.Background(), map[string]string{"tmdb": srv.URL})
	now = now.Add(customMarkFailTTL + time.Second)
	s.resolve(context.Background(), map[string]string{"tmdb": srv.URL})
	if calls.Load() != 2 {
		t.Fatalf("calls = %d, want 2", calls.Load())
	}
}

func TestSelectedMarkURLsOnlyDrawnSources(t *testing.T) {
	cfg := imageconfig.Config{}
	cfg.Ratings = []string{"imdb", "tmdb"}
	cfg.RatingProviderIconURL = map[string]string{"imdb": "https://a/i.png", "trakt": "https://a/t.png"}
	if got := selectedMarkURLs(cfg); len(got) != 1 || got["imdb"] == "" {
		t.Fatalf("got %v", got)
	}
}

func TestRatingMarkPrefersCustomMark(t *testing.T) {
	ensureIcons()
	custom := image.NewNRGBA(image.Rect(0, 0, 10, 10))
	facts := titleFacts{customMarks: map[string]customMark{"rt": {img: custom, colored: true}}}
	r := provider.Rating{Source: "rt", Value: 9.5}
	if ratingMark(r, facts) != image.Image(custom) {
		t.Fatal("custom mark not used over the score-dependent one")
	}
	if !ratingMarkColored(r, facts) {
		t.Fatal("custom mark colour flag ignored")
	}
	if ratingMark(provider.Rating{Source: "imdb", Value: 7}, facts) != ratingIcons["imdb"] {
		t.Fatal("a source without a custom mark lost its bundled one")
	}
}

func TestKeepRTMarksLeavesCertifiedAndRottenBundled(t *testing.T) {
	ensureIcons()
	custom := image.NewNRGBA(image.Rect(0, 0, 10, 10))
	marks := map[string]customMark{"rt": {img: custom, colored: true}}
	cases := []struct {
		name  string
		value float64
		votes int
		keep  bool
		want  image.Image
	}{
		{"certified, replace all", 9.5, 200, false, custom},
		{"certified, keep", 9.5, 200, true, ratingIcons["critics-certified-fresh"]},
		{"rotten, keep", 4.0, 200, true, ratingIcons["critics-rotten"]},
		{"fresh, keep", 6.5, 200, true, custom},
	}
	for _, tc := range cases {
		facts := titleFacts{customMarks: marks, keepRTMarks: tc.keep}
		r := provider.Rating{Source: "rt", Value: tc.value, Votes: tc.votes}
		if got := ratingMark(r, facts); got != tc.want {
			t.Errorf("%s: wrong mark", tc.name)
		}
	}
}

func TestAFailedCustomMarkMarksTheRenderDegraded(t *testing.T) {
	stub := &provider.StubProvider{
		ProviderName: "tmdb",
		Meta: &provider.MediaMeta{
			PosterURL: "http://fake/poster.jpg",
			Ratings:   []provider.Rating{{Source: "tmdb", Value: 7.5}},
		},
	}
	art := makeTestPNG(300, 450, color.NRGBA{50, 50, 80, 255})
	p := &Pipeline{providers: testRegistry(stub), fetcher: &recordingFetcher{data: art}, marks: seededMarkStore()}
	render := func(url string) *Result {
		cfg := imageconfig.Default()
		cfg.Ratings = []string{"tmdb"}
		if url != "" {
			cfg.RatingProviderIconURL = map[string]string{"tmdb": url}
		}
		res, err := p.Render(context.Background(), Request{MediaType: "poster", MediaID: "tt1", Config: cfg})
		if err != nil {
			t.Fatal(err)
		}
		return res
	}
	if res := render(""); res.Degraded {
		t.Fatal("baseline render is degraded; the fixture cannot show the effect")
	}
	if res := render(seededMarkURL); res.Degraded {
		t.Fatal("a render whose custom mark loaded was marked degraded")
	}
	if res := render("https://marks.example/missing.png"); !res.Degraded || res.DegradedByUs {
		t.Fatalf("failed custom mark: degraded=%v byUs=%v", res.Degraded, res.DegradedByUs)
	}
}
