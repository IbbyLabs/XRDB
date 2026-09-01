package provider

import (
	"net/http"
	"net/url"
	"testing"
	"time"
)

// A proxy is worth the latency for a source that is blocked or limited by
// address and not for the rest, so it is named per source (FR-190).
func TestASourceWithAProxyGetsItsOwnTransport(t *testing.T) {
	u, err := url.Parse("http://proxy.internal:3128")
	if err != nil {
		t.Fatal(err)
	}
	prev := proxyOverrides
	proxyOverrides = map[string]*url.URL{"tmdb": u}
	t.Cleanup(func() { proxyOverrides = prev })

	proxied, ok := newHTTPClient("tmdb", time.Second).Transport.(*throttledTransport)
	if !ok {
		t.Fatal("the client does not use the throttled transport")
	}
	base, ok := proxied.base.(*http.Transport)
	if !ok {
		t.Fatalf("a proxied source got base %T, want its own *http.Transport", proxied.base)
	}
	got, err := base.Proxy(&http.Request{URL: &url.URL{Scheme: "https", Host: "api.themoviedb.org"}})
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || got.Host != "proxy.internal:3128" {
		t.Errorf("proxy = %v, want proxy.internal:3128", got)
	}

	// The control: a source with no setting keeps the shared default, so this
	// is not "every source gets a transport".
	direct, _ := newHTTPClient("omdb", time.Second).Transport.(*throttledTransport)
	if direct.base != nil {
		t.Errorf("an unproxied source got its own base %T", direct.base)
	}
}

func TestProxyOverridesAreReadFromTheEnvironment(t *testing.T) {
	t.Setenv("XRDB_MDBLIST_PROXY", "http://user:secret@proxy.internal:3128")
	t.Setenv("XRDB_TMDB_PROXY", "   ")
	t.Setenv("XRDB_OMDB_PROXY", "://not a url")

	got := readProxyOverrides()

	if u := got["mdblist"]; u == nil || u.Host != "proxy.internal:3128" {
		t.Errorf("mdblist = %v, want proxy.internal:3128", got["mdblist"])
	}
	if _, set := got["tmdb"]; set {
		t.Error("a blank value was taken as a proxy")
	}
	if _, set := got["omdb"]; set {
		t.Error("an unparseable value was taken as a proxy")
	}
	if red := got["mdblist"].Redacted(); red != "http://user:xxxxx@proxy.internal:3128" {
		t.Errorf("Redacted() = %q; the password must not reach a log", red)
	}
}
