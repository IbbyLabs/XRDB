package server

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// proxyTrust decides whether the forwarded headers on a request may be
// believed. Anything derived from X-Forwarded-* or CF-Connecting-IP is client
// input: a peer that is not a known proxy can put whatever it likes there.
type proxyTrust struct {
	// all trusts every peer. It is what the deployment needs when the proxy
	// address is not predictable, and it is opt-in for exactly that reason.
	all  bool
	nets []netip.Prefix
}

// defaultTrustedProxyCIDRs is the trust set when nothing is configured:
// loopback plus the private ranges. It covers the ordinary topology, where a
// reverse proxy shares a Docker network or the host with XRDB, while a request
// arriving straight off the internet still cannot claim to be someone else.
var defaultTrustedProxyCIDRs = []string{
	"127.0.0.0/8",
	"::1/128",
	"10.0.0.0/8",
	"172.16.0.0/12",
	"192.168.0.0/16",
	"fc00::/7",
}

// newProxyTrust builds the trust set.
//
// trustAll comes from XRDB_TRUST_PROXY_HEADERS and wins outright. Otherwise
// list is XRDB_TRUSTED_PROXIES: a comma-separated set of CIDRs or bare
// addresses replacing the defaults. Unparseable entries are skipped rather
// than fatal, so one typo cannot take the service down; if every entry is bad
// the result trusts nothing, which fails closed.
func newProxyTrust(list string, trustAll bool) proxyTrust {
	if trustAll {
		return proxyTrust{all: true}
	}
	entries := splitList(list)
	explicit := len(entries) > 0
	if !explicit {
		entries = defaultTrustedProxyCIDRs
	}
	t := proxyTrust{}
	for _, e := range entries {
		if p, err := netip.ParsePrefix(e); err == nil {
			t.nets = append(t.nets, p)
			continue
		}
		if addr, err := netip.ParseAddr(e); err == nil {
			t.nets = append(t.nets, netip.PrefixFrom(addr, addr.BitLen()))
		}
	}
	return t
}

func splitList(v string) []string {
	var out []string
	for _, part := range strings.Split(v, ",") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// trusts reports whether headers from this peer may be believed.
func (t proxyTrust) trusts(remoteAddr string) bool {
	if t.all {
		return true
	}
	addr, ok := parseHostAddr(remoteAddr)
	if !ok {
		return false
	}
	for _, n := range t.nets {
		if n.Contains(addr) {
			return true
		}
	}
	return false
}

// parseHostAddr pulls the IP out of a RemoteAddr, which normally carries a
// port. An IPv4-mapped IPv6 address is unmapped so it matches an IPv4 prefix.
func parseHostAddr(remoteAddr string) (netip.Addr, bool) {
	host := remoteAddr
	if h, _, err := net.SplitHostPort(remoteAddr); err == nil {
		host = h
	}
	// A zone suffix (fe80::1%eth0) is not part of the address for matching.
	if i := strings.IndexByte(host, '%'); i >= 0 {
		host = host[:i]
	}
	addr, err := netip.ParseAddr(host)
	if err != nil {
		return netip.Addr{}, false
	}
	return addr.Unmap(), true
}

// clientIP returns the originating client address. Forwarded headers are only
// consulted when the immediate peer is a trusted proxy; otherwise the peer
// address is the truth, because anything else is caller-supplied.
func clientIP(r *http.Request, trust proxyTrust) string {
	if !trust.trusts(r.RemoteAddr) {
		return r.RemoteAddr
	}
	if cf := r.Header.Get("CF-Connecting-Ip"); cf != "" {
		return cf
	}
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		// The left-most entry is the original client; the rest are the proxies
		// it passed through.
		if i := strings.IndexByte(fwd, ','); i >= 0 {
			return strings.TrimSpace(fwd[:i])
		}
		return strings.TrimSpace(fwd)
	}
	return r.RemoteAddr
}

// forwardedScheme returns the scheme the client actually used, falling back to
// the connection's own when the hint cannot be trusted.
func forwardedScheme(r *http.Request, trust proxyTrust) string {
	if trust.trusts(r.RemoteAddr) {
		if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
			if i := strings.IndexByte(proto, ','); i >= 0 {
				proto = proto[:i]
			}
			if proto = strings.TrimSpace(proto); proto == "https" || proto == "http" {
				return proto
			}
		}
	}
	if r.TLS != nil {
		return "https"
	}
	return "http"
}

// forwardedHost returns the host the client addressed, falling back to the
// request's own Host header.
func forwardedHost(r *http.Request, trust proxyTrust) string {
	if trust.trusts(r.RemoteAddr) {
		if h := r.Header.Get("X-Forwarded-Host"); h != "" {
			if i := strings.IndexByte(h, ','); i >= 0 {
				h = h[:i]
			}
			if h = strings.TrimSpace(h); h != "" {
				return h
			}
		}
	}
	return r.Host
}
