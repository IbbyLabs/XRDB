// Package netguard builds HTTP clients for fetching URLs a profile supplies,
// refusing any dial to an address that is not on the public internet.
package netguard

import (
	"errors"
	"net"
	"net/http"
	"net/netip"
	"syscall"
	"time"
)

// ErrBlockedAddress is returned for a dial to a non-public address.
var ErrBlockedAddress = errors.New("address is not a public internet address")

// blockedPrefixes are special-purpose ranges netip's predicates do not cover.
var blockedPrefixes = []netip.Prefix{
	netip.MustParsePrefix("100.64.0.0/10"), // carrier-grade NAT
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("64:ff9b::/96"), // NAT64 can reach IPv4 private space
	netip.MustParsePrefix("64:ff9b:1::/48"),
}

// PublicAddress reports whether ip is a public unicast address.
func PublicAddress(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsValid() || !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() ||
		ip.IsLinkLocalUnicast() || ip.IsUnspecified() || ip.IsMulticast() {
		return false
	}
	for _, p := range blockedPrefixes {
		if p.Contains(ip) {
			return false
		}
	}
	return true
}

// PublicDial allows a dial only to a public address.
func PublicDial(ap netip.AddrPort) bool { return PublicAddress(ap.Addr()) }

// Options shape a guarded client.
type Options struct {
	Timeout      time.Duration
	MaxRedirects int
	// HTTPSOnly refuses plain http on redirects as well as on the first request.
	HTTPSOnly bool
}

// NewClient returns a client whose dialler checks the address actually dialled,
// after DNS and on every redirect, against allow.
func NewClient(allow func(netip.AddrPort) bool, opts Options) *http.Client {
	dialer := &net.Dialer{
		Timeout: opts.Timeout,
		Control: func(_, address string, _ syscall.RawConn) error {
			ap, err := netip.ParseAddrPort(address)
			if err != nil || !allow(ap) {
				return ErrBlockedAddress
			}
			return nil
		},
	}
	transport := &http.Transport{
		Proxy:                 nil,
		DialContext:           dialer.DialContext,
		TLSHandshakeTimeout:   opts.Timeout,
		ResponseHeaderTimeout: opts.Timeout,
		MaxIdleConns:          16,
		IdleConnTimeout:       90 * time.Second,
	}
	return &http.Client{
		Timeout:   opts.Timeout,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= opts.MaxRedirects {
				return errors.New("too many redirects")
			}
			if req.URL.Scheme == "https" || (!opts.HTTPSOnly && req.URL.Scheme == "http") {
				return nil
			}
			return errors.New("redirect to a disallowed scheme")
		},
	}
}
