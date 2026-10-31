package provider

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"xrdb_rewrite/internal/netguard"
)

func TestValidateCustomRatingTemplate(t *testing.T) {
	cases := map[string]bool{
		"": true,
		"https://example.com/r?id={imdb}&key=abc":                     true,
		"https://example.com/{type}/{imdb}.json":                      true,
		"http://example.com/r?id={imdb}":                              false,
		"https://example.com/r":                                       false,
		"https://user:pw@example.com/r?id={imdb}":                     false,
		"https://127.0.0.1/r?id={imdb}":                               false,
		"https://[::1]/r?id={imdb}":                                   false,
		"ftp://example.com/{imdb}":                                    false,
		"https://example.com/" + strings.Repeat("a", 1100) + "{imdb}": false,
	}
	for tmpl, ok := range cases {
		if err := ValidateCustomRatingTemplate(tmpl); (err == nil) != ok {
			t.Errorf("ValidateCustomRatingTemplate(%.60q) error = %v, want ok=%v", tmpl, err, ok)
		}
	}
}

func TestParseCustomRating(t *testing.T) {
	cases := []struct {
		body   string
		ok     bool
		value  float64
		label  string
		suffix string
	}{
		{`{"score": 8.1, "max": 10}`, true, 8.1, "8.1", ""},
		{`{"score": 8.14}`, true, 8.14, "8.1", ""},
		{`{"score": 4, "max": 5}`, true, 8, "4", "/5"},
		{`{"score": 9999, "max": 10}`, true, 10, "10", ""},
		{`{"score": -3}`, true, 0, "0", ""},
		{`{"score": "NaN"}`, false, 0, "", ""},
		{`{"score": "8.1"}`, false, 0, "", ""},
		{`{"score": null}`, false, 0, "", ""},
		{`{"score": 5, "max": 0}`, false, 0, "", ""},
		{`{"score": 5, "max": "10"}`, false, 0, "", ""},
		{`{"score": 5, "max": 1e9}`, false, 0, "", ""},
		{`[8]`, false, 0, "", ""},
		{`not json`, false, 0, "", ""},
	}
	for _, c := range cases {
		r, ok := parseCustomRating([]byte(c.body))
		if ok != c.ok {
			t.Errorf("%s: ok = %v, want %v", c.body, ok, c.ok)
			continue
		}
		if !ok {
			continue
		}
		diff := r.Value - c.value
		if r.Source != CustomRatingSource || r.Label != c.label || r.NativeSuffix != c.suffix || diff > 1e-9 || diff < -1e-9 {
			t.Errorf("%s: got %+v", c.body, r)
		}
	}
}

// testCustomRating points the provider's TLS client at srv whatever host the template names.
func testCustomRating(t *testing.T, srv *httptest.Server) *CustomRating {
	t.Helper()
	c := newCustomRating(func(netip.AddrPort) bool { return true })
	tr := c.client.Transport.(*http.Transport)
	tr.TLSClientConfig = srv.Client().Transport.(*http.Transport).TLSClientConfig
	addr := srv.Listener.Addr().String()
	tr.DialContext = func(ctx context.Context, network, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, network, addr)
	}
	c.sleep = func(context.Context, time.Duration) error { return nil }
	return c
}

func withTemplate(tmpl string) context.Context {
	return WithKeys(context.Background(), map[string]string{KeyCustomRating: tmpl})
}

func TestCustomRatingFetch(t *testing.T) {
	var gotPath atomic.Value
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath.Store(r.URL.RequestURI())
		_, _ = w.Write([]byte(`{"score": 7.5, "max": 10}`))
	}))
	defer srv.Close()
	c := testCustomRating(t, srv)

	meta, err := c.Fetch(withTemplate("https://example.com/r/{type}?id={imdb}&key=s3cret"), "series", "tt0903747")
	if err != nil || len(meta.Ratings) != 1 || meta.Ratings[0].Label != "7.5" {
		t.Fatalf("Fetch = %+v, %v", meta, err)
	}
	if p := gotPath.Load(); p != "/r/series?id=tt0903747&key=s3cret" {
		t.Errorf("requested %v", p)
	}

	for _, tc := range []struct {
		ctx context.Context
		id  string
	}{
		{context.Background(), "tt0903747"},
		{withTemplate("https://example.com/r?id={imdb}"), "1396"},
		{withTemplate("https://example.com/r?id={imdb}"), "tt0903747:1:1"},
	} {
		meta, err := c.Fetch(tc.ctx, "series", tc.id)
		if err != nil || len(meta.Ratings) != 0 {
			t.Errorf("Fetch(%q) = %+v, %v, want an empty answer", tc.id, meta, err)
		}
	}
}

func TestCustomRatingNotFoundIsNoRating(t *testing.T) {
	srv := httptest.NewTLSServer(http.NotFoundHandler())
	defer srv.Close()
	meta, err := testCustomRating(t, srv).Fetch(withTemplate("https://example.com/r?id={imdb}"), "movie", "tt0111161")
	if err != nil || len(meta.Ratings) != 0 {
		t.Fatalf("Fetch = %+v, %v", meta, err)
	}
}

func TestCustomRatingErrorsNeverCarryTheTemplate(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()
	_, err := testCustomRating(t, srv).Fetch(withTemplate("https://example.com/r?id={imdb}&key=s3cret"), "movie", "tt0111161")
	if err == nil {
		t.Fatal("want an error for a 500")
	}
	if strings.Contains(err.Error(), "s3cret") || strings.Contains(err.Error(), "/r?") {
		t.Errorf("error leaks the template: %v", err)
	}
}

func TestCustomRatingBreakerHoldsAFailingHost(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()
	c := testCustomRating(t, srv)
	now := time.Unix(1_700_000_000, 0)
	c.now = func() time.Time { return now }
	ctx := withTemplate("https://example.com/r?id={imdb}")
	for i := 0; i < customRatingFailLimit; i++ {
		now = now.Add(time.Second)
		if _, err := c.Fetch(ctx, "movie", "tt0111161"); err == nil {
			t.Fatal("want an error")
		}
	}
	now = now.Add(time.Second)
	if _, err := c.Fetch(ctx, "movie", "tt0111161"); err == nil || !strings.Contains(err.Error(), "held out") {
		t.Fatalf("after %d failures: %v", customRatingFailLimit, err)
	}
	if n := calls.Load(); n != customRatingFailLimit {
		t.Errorf("endpoint called %d times, want %d", n, customRatingFailLimit)
	}
	now = now.Add(customRatingCooloff + time.Second)
	_, _ = c.Fetch(ctx, "movie", "tt0111161")
	if n := calls.Load(); n != customRatingFailLimit+1 {
		t.Errorf("after the cool-off the endpoint was called %d times, want %d", n, customRatingFailLimit+1)
	}
}

func TestCustomRatingPacesAHost(t *testing.T) {
	c := newCustomRating(func(netip.AddrPort) bool { return true })
	now := time.Unix(1_700_000_000, 0)
	c.now = func() time.Time { return now }
	var waited time.Duration
	c.sleep = func(_ context.Context, d time.Duration) error { waited += d; return nil }
	turns := int(customRatingMaxWait/customRatingMinGap) + 1
	for i := 0; i < turns; i++ {
		if err := c.admit(context.Background(), "example.com"); err != nil {
			t.Fatalf("turn %d refused: %v", i, err)
		}
	}
	if err := c.admit(context.Background(), "example.com"); err != errCustomRatingPaced {
		t.Fatalf("over the queue limit: %v", err)
	}
	if err := c.admit(context.Background(), "other.example"); err != nil {
		t.Fatalf("another host is paced separately: %v", err)
	}
	if waited == 0 {
		t.Error("queued turns did not wait")
	}
}

func TestCustomRatingRefusesNonPublicDials(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"score": 9}`))
	}))
	defer srv.Close()
	c := newCustomRating(netguard.PublicDial)
	c.client.Transport.(*http.Transport).TLSClientConfig = srv.Client().Transport.(*http.Transport).TLSClientConfig
	port := srv.Listener.Addr().(*net.TCPAddr).Port
	tmpl := "https://localhost:" + strconv.Itoa(port) + "/r?id={imdb}"
	if _, err := c.Fetch(withTemplate(tmpl), "movie", "tt0111161"); err == nil {
		t.Fatal("a template resolving to loopback was fetched")
	}
}

func TestCustomRatingCacheScopeFollowsTheTemplate(t *testing.T) {
	c := newCustomRating(netguard.PublicDial)
	a := c.RatingsCacheScope(withTemplate("https://a.example/r?id={imdb}"))
	b := c.RatingsCacheScope(withTemplate("https://b.example/r?id={imdb}"))
	if a == "" || b == "" || a == b {
		t.Fatalf("scopes %q and %q", a, b)
	}
	if s := c.RatingsCacheScope(context.Background()); s != "" {
		t.Errorf("no template gave scope %q", s)
	}
}

func TestCustomRatingKeyKeepsCommas(t *testing.T) {
	tmpl := "https://example.com/r?ids={imdb},x&key=a,b"
	if got := keyFrom(withTemplate(tmpl), KeyCustomRating); got != tmpl {
		t.Errorf("keyFrom = %q", got)
	}
	if err := ValidateKeys(map[string]string{KeyCustomRating: tmpl}); err != nil {
		t.Errorf("ValidateKeys: %v", err)
	}
}

func TestCustomRatingSubdomainsShareOneTurn(t *testing.T) {
	cases := map[string]string{
		"a.victim.com":      "victim.com",
		"b.victim.com":      "victim.com",
		"api.example.co.uk": "example.co.uk",
		"Example.COM.":      "example.com",
		"203.0.113.9":       "203.0.113.9",
	}
	for host, want := range cases {
		if got := customRatingDomain(host); got != want {
			t.Errorf("customRatingDomain(%q) = %q, want %q", host, got, want)
		}
	}

	c := newCustomRating(func(netip.AddrPort) bool { return true })
	now := time.Unix(1_700_000_000, 0)
	c.now = func() time.Time { return now }
	c.sleep = func(context.Context, time.Duration) error { return nil }
	turns := int(customRatingMaxWait/customRatingMinGap) + 1
	for i := 0; i < turns; i++ {
		if err := c.admit(context.Background(), customRatingDomain("s"+strconv.Itoa(i)+".victim.com")); err != nil {
			t.Fatalf("turn %d refused: %v", i, err)
		}
	}
	if err := c.admit(context.Background(), customRatingDomain("another.victim.com")); err != errCustomRatingPaced {
		t.Fatalf("a fresh subdomain got its own allowance: %v", err)
	}
}
