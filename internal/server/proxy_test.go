package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func reqFrom(remoteAddr string, headers map[string]string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/poster/tt1", nil)
	r.RemoteAddr = remoteAddr
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	return r
}

// The point of the gate: a client that is not a known proxy cannot dictate the
// address we record for it.
func TestUntrustedPeerCannotSpoofItsAddress(t *testing.T) {
	trust := newProxyTrust("", false)
	r := reqFrom("203.0.113.7:5555", map[string]string{
		"X-Forwarded-For":  "1.2.3.4",
		"CF-Connecting-Ip": "5.6.7.8",
	})
	if got := clientIP(r, trust); got != "203.0.113.7:5555" {
		t.Errorf("client_ip = %q; a public peer must not be able to claim another address", got)
	}
}

// The ordinary topology must keep working: a proxy on the private network is
// trusted by default, so real client addresses still reach the log.
func TestPrivatePeerIsTrustedByDefault(t *testing.T) {
	trust := newProxyTrust("", false)
	for _, peer := range []string{"127.0.0.1:1", "10.1.2.3:1", "172.16.0.9:1", "192.168.1.5:1", "[::1]:1"} {
		r := reqFrom(peer, map[string]string{"X-Forwarded-For": "1.2.3.4"})
		if got := clientIP(r, trust); got != "1.2.3.4" {
			t.Errorf("peer %s: client_ip = %q, want 1.2.3.4", peer, got)
		}
	}
}

func TestCloudflareHeaderWinsOverForwardedFor(t *testing.T) {
	trust := newProxyTrust("", false)
	r := reqFrom("10.0.0.1:1", map[string]string{
		"CF-Connecting-Ip": "5.6.7.8",
		"X-Forwarded-For":  "1.2.3.4",
	})
	if got := clientIP(r, trust); got != "5.6.7.8" {
		t.Errorf("client_ip = %q, want the Cloudflare header to win", got)
	}
}

func TestForwardedForTakesTheLeftmostEntry(t *testing.T) {
	trust := newProxyTrust("", false)
	r := reqFrom("10.0.0.1:1", map[string]string{"X-Forwarded-For": "1.2.3.4, 10.0.0.9, 10.0.0.1"})
	if got := clientIP(r, trust); got != "1.2.3.4" {
		t.Errorf("client_ip = %q, want the original client", got)
	}
}

func TestExplicitListReplacesTheDefaults(t *testing.T) {
	trust := newProxyTrust("198.51.100.0/24", false)
	if got := clientIP(reqFrom("198.51.100.5:1", map[string]string{"X-Forwarded-For": "1.2.3.4"}), trust); got != "1.2.3.4" {
		t.Errorf("listed peer: client_ip = %q, want 1.2.3.4", got)
	}
	// A private peer is no longer trusted once an explicit list is given.
	if got := clientIP(reqFrom("10.0.0.1:1", map[string]string{"X-Forwarded-For": "1.2.3.4"}), trust); got != "10.0.0.1:1" {
		t.Errorf("unlisted private peer: client_ip = %q, want the peer address", got)
	}
}

func TestBareAddressInTheListIsAccepted(t *testing.T) {
	trust := newProxyTrust("198.51.100.5", false)
	if got := clientIP(reqFrom("198.51.100.5:1", map[string]string{"X-Forwarded-For": "1.2.3.4"}), trust); got != "1.2.3.4" {
		t.Errorf("client_ip = %q, want 1.2.3.4", got)
	}
	if got := clientIP(reqFrom("198.51.100.6:1", map[string]string{"X-Forwarded-For": "1.2.3.4"}), trust); got != "198.51.100.6:1" {
		t.Errorf("a neighbouring address must not be trusted, got %q", got)
	}
}

func TestTrustAllBelievesEveryPeer(t *testing.T) {
	trust := newProxyTrust("", true)
	if got := clientIP(reqFrom("203.0.113.7:1", map[string]string{"X-Forwarded-For": "1.2.3.4"}), trust); got != "1.2.3.4" {
		t.Errorf("client_ip = %q, want 1.2.3.4 with trust-all enabled", got)
	}
}

// One typo must not silently widen trust; it should narrow it.
func TestUnparseableEntriesAreSkippedAndFailClosed(t *testing.T) {
	trust := newProxyTrust("not-an-ip, also/bad", false)
	if got := clientIP(reqFrom("10.0.0.1:1", map[string]string{"X-Forwarded-For": "1.2.3.4"}), trust); got != "10.0.0.1:1" {
		t.Errorf("client_ip = %q; an all-garbage list must trust nothing", got)
	}
	trust = newProxyTrust("garbage, 10.0.0.0/8", false)
	if got := clientIP(reqFrom("10.0.0.1:1", map[string]string{"X-Forwarded-For": "1.2.3.4"}), trust); got != "1.2.3.4" {
		t.Errorf("client_ip = %q; the valid entry should still apply", got)
	}
}

func TestForwardedSchemeIsGated(t *testing.T) {
	trust := newProxyTrust("", false)
	if got := forwardedScheme(reqFrom("10.0.0.1:1", map[string]string{"X-Forwarded-Proto": "https"}), trust); got != "https" {
		t.Errorf("trusted peer: scheme = %q, want https", got)
	}
	if got := forwardedScheme(reqFrom("203.0.113.7:1", map[string]string{"X-Forwarded-Proto": "https"}), trust); got != "http" {
		t.Errorf("untrusted peer: scheme = %q, want http", got)
	}
	// A nonsense value is ignored rather than echoed into a URL.
	if got := forwardedScheme(reqFrom("10.0.0.1:1", map[string]string{"X-Forwarded-Proto": "gopher"}), trust); got != "http" {
		t.Errorf("scheme = %q, want http for an unrecognised value", got)
	}
}

func TestForwardedHostIsGated(t *testing.T) {
	trust := newProxyTrust("", false)
	if got := forwardedHost(reqFrom("10.0.0.1:1", map[string]string{"X-Forwarded-Host": "art.example.com"}), trust); got != "art.example.com" {
		t.Errorf("trusted peer: host = %q", got)
	}
	got := forwardedHost(reqFrom("203.0.113.7:1", map[string]string{"X-Forwarded-Host": "evil.example.com"}), trust)
	if got == "evil.example.com" {
		t.Error("an untrusted peer set the host used to build artwork URLs")
	}
}

func TestForwardedListsTakeTheFirstEntry(t *testing.T) {
	trust := newProxyTrust("", false)
	r := reqFrom("10.0.0.1:1", map[string]string{
		"X-Forwarded-Proto": "https, http",
		"X-Forwarded-Host":  "art.example.com, inner.local",
	})
	if got := forwardedScheme(r, trust); got != "https" {
		t.Errorf("scheme = %q, want https", got)
	}
	if got := forwardedHost(r, trust); got != "art.example.com" {
		t.Errorf("host = %q, want art.example.com", got)
	}
}

func TestParseHostAddrHandlesTheAwkwardForms(t *testing.T) {
	for _, tc := range []struct{ in, want string }{
		{"10.0.0.1:80", "10.0.0.1"},
		{"10.0.0.1", "10.0.0.1"},
		{"[::1]:80", "::1"},
		{"[fe80::1%eth0]:80", "fe80::1"},
		{"::ffff:10.0.0.1", "10.0.0.1"},
	} {
		addr, ok := parseHostAddr(tc.in)
		if !ok || addr.String() != tc.want {
			t.Errorf("parseHostAddr(%q) = %v/%v, want %s", tc.in, addr, ok, tc.want)
		}
	}
	if _, ok := parseHostAddr("not-an-address"); ok {
		t.Error("expected a parse failure for a non-address")
	}
}

// An IPv4-mapped IPv6 peer must match an IPv4 prefix, which is how it arrives
// on a dual-stack listener.
func TestMappedIPv4PeerMatchesIPv4Prefix(t *testing.T) {
	trust := newProxyTrust("", false)
	r := reqFrom("[::ffff:10.0.0.1]:1", map[string]string{"X-Forwarded-For": "1.2.3.4"})
	if got := clientIP(r, trust); got != "1.2.3.4" {
		t.Errorf("client_ip = %q, want the mapped peer to be trusted", got)
	}
}
