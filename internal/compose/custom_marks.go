package compose

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	_ "image/gif" // register GIF decoding for custom rating marks
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"sync"
	"syscall"
	"time"

	xdraw "golang.org/x/image/draw"
	"golang.org/x/sync/singleflight"
	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// Custom rating marks are fetched from URLs a profile supplies, so the fetch
// refuses non-public addresses, caps size and type, and caches the decoded mark.
const (
	customMarkMaxBytes   = 1 << 20
	customMarkMaxPixels  = 1024 * 1024
	customMarkMaxSide    = 256
	customMarkTimeout    = 4 * time.Second
	customMarkTTL        = 24 * time.Hour
	customMarkFailTTL    = 10 * time.Minute
	customMarkMaxEntries = 512
)

// decodeSlots bounds how many marks decode at once across all renders.
var decodeSlots = make(chan struct{}, 3)

var errBlockedAddress = errors.New("address is not a public internet address")

// blockedPrefixes are special-purpose ranges netip's predicates do not cover.
var blockedPrefixes = []netip.Prefix{
	netip.MustParsePrefix("100.64.0.0/10"), // carrier-grade NAT
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("64:ff9b::/96"), // NAT64 can reach IPv4 private space
	netip.MustParsePrefix("64:ff9b:1::/48"),
}

// PublicAddress reports whether ip is a public unicast address.
func PublicAddress(ip netip.Addr) bool { return publicAddress(ip) }

// publicDial allows a dial only to a public address.
func publicDial(ap netip.AddrPort) bool { return publicAddress(ap.Addr()) }

// publicAddress reports whether ip is a public unicast address.
func publicAddress(ip netip.Addr) bool {
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

type customMark struct {
	img     image.Image
	colored bool
}

type customMarkEntry struct {
	mark    customMark
	expires time.Time
}

// customMarkStore fetches and remembers the marks profiles point at.
type customMarkStore struct {
	client *http.Client
	logger *slog.Logger
	now    func() time.Time
	group  singleflight.Group

	mu      sync.Mutex
	entries map[string]customMarkEntry
}

func newCustomMarkStore(logger *slog.Logger, allow func(netip.AddrPort) bool) *customMarkStore {
	if logger == nil {
		logger = slog.Default()
	}
	dialer := &net.Dialer{
		Timeout: customMarkTimeout,
		// Control sees the address actually dialled, after DNS and on every
		// redirect, so a hostname cannot resolve its way past the check.
		Control: func(_, address string, _ syscall.RawConn) error {
			ap, err := netip.ParseAddrPort(address)
			if err != nil || !allow(ap) {
				return errBlockedAddress
			}
			return nil
		},
	}
	transport := &http.Transport{
		Proxy:                 nil,
		DialContext:           dialer.DialContext,
		TLSHandshakeTimeout:   customMarkTimeout,
		ResponseHeaderTimeout: customMarkTimeout,
		MaxIdleConns:          16,
		IdleConnTimeout:       90 * time.Second,
	}
	return &customMarkStore{
		client: &http.Client{
			Timeout:   customMarkTimeout,
			Transport: transport,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 3 {
					return errors.New("too many redirects")
				}
				if req.URL.Scheme != "https" && req.URL.Scheme != "http" {
					return errors.New("redirect to a non-http scheme")
				}
				return nil
			},
		},
		logger:  logger,
		now:     time.Now,
		entries: make(map[string]customMarkEntry),
	}
}

// resolve fetches every mark in urls (source -> URL) in parallel and returns
// the ones that loaded. A source whose mark failed is left out, and failed
// reports that any did.
func (s *customMarkStore) resolve(ctx context.Context, urls map[string]string) (marks map[string]customMark, failed bool) {
	if s == nil || len(urls) == 0 {
		return nil, false
	}
	var (
		mu  sync.Mutex
		out = make(map[string]customMark, len(urls))
		wg  sync.WaitGroup
	)
	for source, raw := range urls {
		wg.Add(1)
		go func(source, raw string) {
			defer wg.Done()
			defer func() {
				if v := recover(); v != nil {
					logRenderPanic(ctx, "custom mark", v)
				}
			}()
			m := s.get(ctx, raw)
			if m.img == nil {
				return
			}
			mu.Lock()
			out[source] = m
			mu.Unlock()
		}(source, raw)
	}
	wg.Wait()
	return out, len(out) < len(urls)
}

func (s *customMarkStore) get(ctx context.Context, raw string) customMark {
	s.mu.Lock()
	e, ok := s.entries[raw]
	s.mu.Unlock()
	if ok && s.now().Before(e.expires) {
		return e.mark
	}
	v, _, _ := s.group.Do(raw, func() (any, error) {
		// Detached from the render so one cancelled request does not fail the
		// fetch for every render waiting on it.
		fctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), customMarkTimeout)
		defer cancel()
		img, err := s.fetch(fctx, raw)
		e := customMarkEntry{expires: s.now().Add(customMarkTTL)}
		if err != nil {
			e.expires = s.now().Add(customMarkFailTTL)
			s.logger.WarnContext(ctx, "Failed to load a custom rating icon; drawing the bundled one",
				"host", hostOf(raw), "error", err)
		} else {
			e.mark = customMark{img: img, colored: isBrandColored(img)}
		}
		s.put(raw, e)
		return e.mark, nil
	})
	return v.(customMark)
}

func (s *customMarkStore) put(raw string, e customMarkEntry) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.entries[raw]; !exists && len(s.entries) >= customMarkMaxEntries {
		var oldest string
		var oldestAt time.Time
		for k, v := range s.entries {
			if oldest == "" || v.expires.Before(oldestAt) {
				oldest, oldestAt = k, v.expires
			}
		}
		delete(s.entries, oldest)
	}
	s.entries[raw] = e
}

func (s *customMarkStore) fetch(ctx context.Context, raw string) (image.Image, error) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		return nil, errors.New("not an http(s) URL")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "image/png,image/webp,image/jpeg,image/gif")
	req.Header.Set("User-Agent", provider.ContactUserAgent())
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("http %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, customMarkMaxBytes+1))
	if err != nil {
		return nil, err
	}
	if len(body) > customMarkMaxBytes {
		return nil, fmt.Errorf("larger than %d bytes", customMarkMaxBytes)
	}
	return decodeCustomMark(body)
}

// decodeCustomMark accepts PNG, JPEG, WebP and GIF by their bytes rather than
// the server's Content-Type, and scales the mark down to badge size.
func decodeCustomMark(body []byte) (image.Image, error) {
	switch ct := http.DetectContentType(body); ct {
	case "image/png", "image/jpeg", "image/webp", "image/gif":
	default:
		return nil, fmt.Errorf("unsupported type %s", ct)
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width*cfg.Height > customMarkMaxPixels {
		return nil, fmt.Errorf("dimensions %dx%d out of range", cfg.Width, cfg.Height)
	}
	decodeSlots <- struct{}{}
	defer func() { <-decodeSlots }()
	img, _, err := image.Decode(bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	return shrinkMark(img), nil
}

func shrinkMark(img image.Image) image.Image {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= customMarkMaxSide && h <= customMarkMaxSide {
		return toNRGBA(img)
	}
	if w >= h {
		w, h = customMarkMaxSide, maxInt(1, h*customMarkMaxSide/w)
	} else {
		w, h = maxInt(1, w*customMarkMaxSide/h), customMarkMaxSide
	}
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), img, b, xdraw.Over, nil)
	return dst
}

// selectedMarkURLs returns the custom mark URLs for the sources cfg draws.
func selectedMarkURLs(cfg imageconfig.Config) map[string]string {
	if len(cfg.RatingProviderIconURL) == 0 {
		return nil
	}
	out := make(map[string]string, len(cfg.Ratings))
	for _, src := range cfg.Ratings {
		if u := cfg.RatingProviderIconURL[src]; u != "" {
			out[src] = u
		}
	}
	return out
}

func hostOf(raw string) string {
	if u, err := url.Parse(raw); err == nil {
		return u.Hostname()
	}
	return ""
}
