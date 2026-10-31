package provider

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/netip"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/publicsuffix"

	"xrdb_rewrite/internal/netguard"
)

// A profile owner can point one rating slot at their own endpoint. The URL
// template is stored with the profile's keys, so it may carry the owner's
// credential and never appears in a poster URL, a log line or an error.

// CustomRatingSource is the rating source id the custom slot answers for.
const CustomRatingSource = "custom"

const (
	customRatingTimeout     = 3 * time.Second
	customRatingMaxBytes    = 16 << 10
	customRatingMaxTemplate = 1024
	customRatingFailLimit   = 3
	customRatingCooloff     = 10 * time.Minute
	customRatingMinGap      = 250 * time.Millisecond
	customRatingMaxWait     = time.Second
	customRatingMaxHosts    = 1024
	customRatingDefaultMax  = 10
	customRatingLargestMax  = 1000
)

var (
	customRatingIDRe = regexp.MustCompile(`^tt\d{5,10}$`)

	errCustomRatingHeld  = errors.New("custom rating endpoint is held out after repeated failures")
	errCustomRatingPaced = errors.New("custom rating endpoint is being called too often")
)

// ValidateCustomRatingTemplate checks an owner's template: https, a host, no
// userinfo, an {imdb} placeholder and no literal non-public address.
func ValidateCustomRatingTemplate(raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	if len(raw) > customRatingMaxTemplate {
		return fmt.Errorf("the custom rating URL is longer than %d characters", customRatingMaxTemplate)
	}
	if !strings.Contains(raw, "{imdb}") {
		return errors.New("the custom rating URL needs an {imdb} placeholder")
	}
	u, err := url.Parse(fillCustomRatingTemplate(raw, "tt0000000", "movie"))
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil {
		return errors.New("the custom rating URL must be an https address")
	}
	if ip, err := netip.ParseAddr(u.Hostname()); err == nil && !netguard.PublicAddress(ip) {
		return errors.New("the custom rating URL must point at a public address")
	}
	return nil
}

// customRatingDomain is the registrable domain the breaker and pacer key on,
// so subdomains of one site share a turn.
func customRatingDomain(host string) string {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	if _, err := netip.ParseAddr(host); err == nil {
		return host
	}
	if d, err := publicsuffix.EffectiveTLDPlusOne(host); err == nil {
		return d
	}
	return host
}

func fillCustomRatingTemplate(tmpl, imdbID, kind string) string {
	return strings.NewReplacer("{imdb}", imdbID, "{type}", kind).Replace(tmpl)
}

type customRatingHost struct {
	fails int
	until time.Time
	next  time.Time
}

// CustomRating fetches the owner's own score for a title from their template.
type CustomRating struct {
	client *http.Client
	now    func() time.Time
	sleep  func(context.Context, time.Duration) error

	mu    sync.Mutex
	hosts map[string]*customRatingHost
}

// NewCustomRating returns the provider with a client that only dials public addresses.
func NewCustomRating() *CustomRating { return newCustomRating(netguard.PublicDial) }

func newCustomRating(allow func(netip.AddrPort) bool) *CustomRating {
	return &CustomRating{
		client: netguard.NewClient(allow, netguard.Options{Timeout: customRatingTimeout, MaxRedirects: 2, HTTPSOnly: true}),
		now:    time.Now,
		sleep:  sleepCtx,
		hosts:  make(map[string]*customRatingHost),
	}
}

func sleepCtx(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return nil
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

func (c *CustomRating) Name() string { return KeyCustomRating }

func (c *CustomRating) RatingSources() []string { return []string{"custom"} }

// RatingsCacheScope separates cached answers by template, so two profiles
// asking about one title never share a score.
func (c *CustomRating) RatingsCacheScope(ctx context.Context) string {
	tmpl := keyFrom(ctx, KeyCustomRating)
	if tmpl == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(tmpl))
	return hex.EncodeToString(sum[:8])
}

// Fetch asks the owner's endpoint for id. A render without a template, or for
// anything other than a plain IMDb id, gets an empty answer.
func (c *CustomRating) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	tmpl := keyFrom(ctx, KeyCustomRating)
	if tmpl == "" || !customRatingIDRe.MatchString(id) || ValidateCustomRatingTemplate(tmpl) != nil {
		return &MediaMeta{}, nil
	}
	kind := "series"
	if mediaType == "movie" {
		kind = "movie"
	}
	u, err := url.Parse(fillCustomRatingTemplate(tmpl, id, kind))
	if err != nil {
		return &MediaMeta{}, nil
	}
	host := u.Hostname()
	domain := customRatingDomain(host)
	if err := c.admit(ctx, domain); err != nil {
		return nil, fmt.Errorf("custom rating endpoint %s: %w", host, err)
	}
	rating, ok, err := c.get(ctx, u)
	c.record(domain, err == nil)
	if err != nil {
		return nil, fmt.Errorf("custom rating endpoint %s: %w", host, err)
	}
	if !ok {
		return &MediaMeta{}, nil
	}
	return &MediaMeta{Ratings: []Rating{rating}}, nil
}

// get calls the endpoint. A 404 or a missing score is an answer with no rating;
// errors never carry the URL, which may hold the owner's credential.
func (c *CustomRating) get(ctx context.Context, u *url.URL) (Rating, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return Rating{}, false, errors.New("the request could not be built")
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", ContactUserAgent())
	resp, err := c.client.Do(req)
	if err != nil {
		var ue *url.Error
		if errors.As(err, &ue) {
			err = ue.Err
		}
		return Rating{}, false, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return Rating{}, false, nil
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return Rating{}, false, fmt.Errorf("answered with status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, customRatingMaxBytes+1))
	if err != nil {
		return Rating{}, false, errors.New("the answer could not be read")
	}
	if len(body) > customRatingMaxBytes {
		return Rating{}, false, errors.New("the answer is too large")
	}
	r, ok := parseCustomRating(body)
	return r, ok, nil
}

// parseCustomRating reads {"score": n, "max": m}. Anything that is not a
// finite number is dropped, max defaults to 10, and the score is clamped to 0..max.
func parseCustomRating(body []byte) (Rating, bool) {
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()
	var doc map[string]any
	if dec.Decode(&doc) != nil {
		return Rating{}, false
	}
	score, ok := finiteNumber(doc["score"])
	if !ok {
		return Rating{}, false
	}
	max := float64(customRatingDefaultMax)
	if v, present := doc["max"]; present {
		m, ok := finiteNumber(v)
		if !ok || m <= 0 || m > customRatingLargestMax {
			return Rating{}, false
		}
		max = m
	}
	score = math.Min(math.Max(score, 0), max)
	r := Rating{Source: CustomRatingSource, Value: score / max * 10, Label: formatCustomScore(score)}
	if max != customRatingDefaultMax {
		r.NativeSuffix = "/" + formatCustomScore(max)
	}
	return r, true
}

func finiteNumber(v any) (float64, bool) {
	n, ok := v.(json.Number)
	if !ok {
		return 0, false
	}
	f, err := n.Float64()
	if err != nil || math.IsNaN(f) || math.IsInf(f, 0) {
		return 0, false
	}
	return f, true
}

func formatCustomScore(v float64) string {
	if v == math.Trunc(v) {
		return strconv.FormatFloat(v, 'f', 0, 64)
	}
	return strconv.FormatFloat(math.Round(v*10)/10, 'f', -1, 64)
}

// admit applies the host's breaker and paces calls to it, waiting at most
// customRatingMaxWait for a turn.
func (c *CustomRating) admit(ctx context.Context, host string) error {
	c.mu.Lock()
	now := c.now()
	h := c.hosts[host]
	if h == nil {
		c.pruneLocked(now)
		h = &customRatingHost{}
		c.hosts[host] = h
	}
	if now.Before(h.until) {
		c.mu.Unlock()
		return errCustomRatingHeld
	}
	start := h.next
	if start.Before(now) {
		start = now
	}
	if start.Sub(now) > customRatingMaxWait {
		c.mu.Unlock()
		return errCustomRatingPaced
	}
	h.next = start.Add(customRatingMinGap)
	c.mu.Unlock()
	return c.sleep(ctx, start.Sub(now))
}

func (c *CustomRating) record(host string, ok bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	h := c.hosts[host]
	if h == nil {
		return
	}
	if ok {
		h.fails = 0
		return
	}
	h.fails++
	if h.fails >= customRatingFailLimit {
		h.fails = 0
		h.until = c.now().Add(customRatingCooloff)
	}
}

// pruneLocked drops idle hosts once the table is full.
func (c *CustomRating) pruneLocked(now time.Time) {
	if len(c.hosts) < customRatingMaxHosts {
		return
	}
	for host, h := range c.hosts {
		if now.After(h.until) && now.After(h.next) && h.fails == 0 {
			delete(c.hosts, host)
		}
	}
}
