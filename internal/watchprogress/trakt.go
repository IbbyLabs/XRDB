// Package watchprogress reads how far a profile owner is through each title
// from their own tracker account, for the progress bar drawn on their posters.
// Trakt is the only source, and movies the only kind it is asked about.
package watchprogress

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	defaultTraktAPIBase  = "https://api.trakt.tv"
	defaultTraktAuthBase = "https://auth.trakt.tv"
	// DefaultRedirectURI is the out-of-band URI Trakt apps list for device sign-in.
	DefaultRedirectURI = "urn:ietf:wg:oauth:2.0:oob"
	// maxTraktBody bounds a sync response; a watched history is a few MB at most.
	maxTraktBody = 16 << 20
)

var (
	// ErrUnauthorized is Trakt refusing the access token.
	ErrUnauthorized = errors.New("trakt refused the access token")
	// ErrInvalidGrant is Trakt refusing the refresh token, so the owner has to link again.
	ErrInvalidGrant = errors.New("trakt refused the refresh token")
)

// RateLimitedError is a 429 from Trakt.
type RateLimitedError struct{ RetryAfter time.Duration }

func (e *RateLimitedError) Error() string {
	return fmt.Sprintf("trakt rate limited the request, retry after %s", e.RetryAfter)
}

// StatusError is any other unexpected status from Trakt.
type StatusError struct {
	Path   string
	Status int
}

func (e *StatusError) Error() string {
	return fmt.Sprintf("trakt answered %s with status %d", e.Path, e.Status)
}

// TraktClient speaks the parts of the Trakt API this package needs. Errors it
// returns never carry a token.
type TraktClient struct {
	ClientID     string
	ClientSecret string // optional; Trakt treats it as deprecated for these routes
	RedirectURI  string
	APIBase      string
	AuthBase     string
	UserAgent    string
	HTTP         *http.Client
}

// Tokens is a token response from Trakt.
type Tokens struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
	CreatedAt    int64  `json:"created_at"`
}

// ExpiresAt is when the access token stops working, in unix seconds.
func (t Tokens) ExpiresAt(now time.Time) int64 {
	created := t.CreatedAt
	if created <= 0 {
		created = now.Unix()
	}
	return created + t.ExpiresIn
}

// DeviceCode is the start of a device sign-in.
type DeviceCode struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURL string `json:"verification_url"`
	ExpiresIn       int    `json:"expires_in"`
	Interval        int    `json:"interval"`
}

// PollResult is what one device-token poll found.
type PollResult int

const (
	PollPending PollResult = iota
	PollLinked
	PollSlowDown
	PollExpired
	PollDenied
)

func (c *TraktClient) apiBase() string {
	if c.APIBase != "" {
		return strings.TrimRight(c.APIBase, "/")
	}
	return defaultTraktAPIBase
}

func (c *TraktClient) authBase() string {
	if c.AuthBase != "" {
		return strings.TrimRight(c.AuthBase, "/")
	}
	return defaultTraktAuthBase
}

func (c *TraktClient) redirectURI() string {
	if c.RedirectURI != "" {
		return c.RedirectURI
	}
	return DefaultRedirectURI
}

func (c *TraktClient) httpClient() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return http.DefaultClient
}

// withSecret adds the client secret to an auth body when one is configured.
func (c *TraktClient) withSecret(body map[string]string) map[string]string {
	if c.ClientSecret != "" {
		body["client_secret"] = c.ClientSecret
	}
	return body
}

func (c *TraktClient) newRequest(ctx context.Context, method, url string, body any) (*http.Request, error) {
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("encode trakt request: %w", err)
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, rd)
	if err != nil {
		return nil, fmt.Errorf("build trakt request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("trakt-api-version", "2")
	req.Header.Set("trakt-api-key", c.ClientID)
	if c.UserAgent != "" {
		req.Header.Set("User-Agent", c.UserAgent)
	}
	return req, nil
}

// do sends req and returns the response. Transport errors are reduced to their
// kind so a URL or header never ends up in a log line.
func (c *TraktClient) do(req *http.Request) (*http.Response, error) {
	resp, err := c.httpClient().Do(req)
	if err != nil {
		if ctxErr := req.Context().Err(); ctxErr != nil {
			return nil, fmt.Errorf("trakt request to %s: %w", req.URL.Path, ctxErr)
		}
		var netErr interface{ Timeout() bool }
		if errors.As(err, &netErr) && netErr.Timeout() {
			return nil, fmt.Errorf("trakt request to %s timed out", req.URL.Path)
		}
		return nil, fmt.Errorf("trakt request to %s failed", req.URL.Path)
	}
	return resp, nil
}

func drain(resp *http.Response) {
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
	_ = resp.Body.Close()
}

func retryAfter(h http.Header) time.Duration {
	if s, err := strconv.Atoi(strings.TrimSpace(h.Get("Retry-After"))); err == nil && s > 0 {
		return time.Duration(s) * time.Second
	}
	return time.Minute
}

// StartDevice asks Trakt for a device code.
func (c *TraktClient) StartDevice(ctx context.Context) (DeviceCode, error) {
	req, err := c.newRequest(ctx, http.MethodPost, c.authBase()+"/oauth/device/code", map[string]string{"client_id": c.ClientID})
	if err != nil {
		return DeviceCode{}, err
	}
	resp, err := c.do(req)
	if err != nil {
		return DeviceCode{}, err
	}
	defer drain(resp)
	if resp.StatusCode == http.StatusTooManyRequests {
		return DeviceCode{}, &RateLimitedError{RetryAfter: retryAfter(resp.Header)}
	}
	if resp.StatusCode != http.StatusOK {
		return DeviceCode{}, &StatusError{Path: req.URL.Path, Status: resp.StatusCode}
	}
	var dc DeviceCode
	if err := json.NewDecoder(io.LimitReader(resp.Body, 64<<10)).Decode(&dc); err != nil {
		return DeviceCode{}, fmt.Errorf("decode trakt device code: %w", err)
	}
	if dc.DeviceCode == "" || dc.UserCode == "" {
		return DeviceCode{}, errors.New("trakt returned an empty device code")
	}
	return dc, nil
}

// PollDevice asks once whether the owner has approved the device code.
func (c *TraktClient) PollDevice(ctx context.Context, deviceCode string) (PollResult, Tokens, error) {
	body := c.withSecret(map[string]string{"code": deviceCode, "client_id": c.ClientID})
	req, err := c.newRequest(ctx, http.MethodPost, c.authBase()+"/oauth/device/token", body)
	if err != nil {
		return PollPending, Tokens{}, err
	}
	resp, err := c.do(req)
	if err != nil {
		return PollPending, Tokens{}, err
	}
	defer drain(resp)
	switch resp.StatusCode {
	case http.StatusOK:
		t, err := decodeTokens(resp.Body)
		if err != nil {
			return PollPending, Tokens{}, err
		}
		return PollLinked, t, nil
	case http.StatusBadRequest:
		return PollPending, Tokens{}, nil
	case http.StatusTooManyRequests:
		return PollSlowDown, Tokens{}, nil
	case http.StatusNotFound, http.StatusConflict, http.StatusGone:
		return PollExpired, Tokens{}, nil
	case http.StatusTeapot:
		return PollDenied, Tokens{}, nil
	}
	return PollPending, Tokens{}, &StatusError{Path: req.URL.Path, Status: resp.StatusCode}
}

// Refresh trades a refresh token for a new pair. Trakt's refresh tokens are
// single-use, so the caller must store the returned pair before using it.
func (c *TraktClient) Refresh(ctx context.Context, refreshToken string) (Tokens, error) {
	body := c.withSecret(map[string]string{
		"refresh_token": refreshToken,
		"client_id":     c.ClientID,
		"redirect_uri":  c.redirectURI(),
		"grant_type":    "refresh_token",
	})
	req, err := c.newRequest(ctx, http.MethodPost, c.authBase()+"/oauth/token", body)
	if err != nil {
		return Tokens{}, err
	}
	resp, err := c.do(req)
	if err != nil {
		return Tokens{}, err
	}
	defer drain(resp)
	switch resp.StatusCode {
	case http.StatusOK:
		return decodeTokens(resp.Body)
	case http.StatusBadRequest, http.StatusUnauthorized:
		return Tokens{}, ErrInvalidGrant
	case http.StatusTooManyRequests:
		return Tokens{}, &RateLimitedError{RetryAfter: retryAfter(resp.Header)}
	}
	return Tokens{}, &StatusError{Path: req.URL.Path, Status: resp.StatusCode}
}

// Revoke ends the access token at Trakt.
func (c *TraktClient) Revoke(ctx context.Context, accessToken string) error {
	body := c.withSecret(map[string]string{"token": accessToken, "client_id": c.ClientID})
	req, err := c.newRequest(ctx, http.MethodPost, c.authBase()+"/oauth/revoke", body)
	if err != nil {
		return err
	}
	resp, err := c.do(req)
	if err != nil {
		return err
	}
	defer drain(resp)
	if resp.StatusCode != http.StatusOK {
		return &StatusError{Path: req.URL.Path, Status: resp.StatusCode}
	}
	return nil
}

func decodeTokens(r io.Reader) (Tokens, error) {
	var t Tokens
	if err := json.NewDecoder(io.LimitReader(r, 64<<10)).Decode(&t); err != nil {
		return Tokens{}, fmt.Errorf("decode trakt tokens: %w", err)
	}
	if t.AccessToken == "" || t.RefreshToken == "" {
		return Tokens{}, errors.New("trakt returned an incomplete token pair")
	}
	return t, nil
}

type traktMovieIDs struct {
	IMDb string `json:"imdb"`
	TMDB int    `json:"tmdb"`
}

// MovieProgress reads the owner's paused movies and watched movies.
func (c *TraktClient) MovieProgress(ctx context.Context, accessToken string) (Map, error) {
	var playback []struct {
		Progress float64   `json:"progress"`
		PausedAt time.Time `json:"paused_at"`
		Type     string    `json:"type"`
		Movie    *struct {
			IDs traktMovieIDs `json:"ids"`
		} `json:"movie"`
	}
	if err := c.getJSON(ctx, accessToken, "/sync/playback/movies", &playback); err != nil {
		return Map{}, err
	}
	var watched []struct {
		LastWatchedAt time.Time `json:"last_watched_at"`
		Movie         *struct {
			IDs traktMovieIDs `json:"ids"`
		} `json:"movie"`
	}
	if err := c.getJSON(ctx, accessToken, "/sync/watched/movies", &watched); err != nil {
		return Map{}, err
	}

	b := newMapBuilder()
	for _, w := range watched {
		if w.Movie != nil {
			b.add(w.Movie.IDs, 100, w.LastWatchedAt)
		}
	}
	for _, p := range playback {
		if p.Movie == nil || (p.Type != "" && p.Type != "movie") {
			continue
		}
		b.add(p.Movie.IDs, int(math.Floor(p.Progress)), p.PausedAt)
	}
	return b.m, nil
}

func (c *TraktClient) getJSON(ctx context.Context, accessToken, path string, out any) error {
	req, err := c.newRequest(ctx, http.MethodGet, c.apiBase()+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := c.do(req)
	if err != nil {
		return err
	}
	defer drain(resp)
	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusUnauthorized:
		return ErrUnauthorized
	case http.StatusTooManyRequests:
		return &RateLimitedError{RetryAfter: retryAfter(resp.Header)}
	default:
		return &StatusError{Path: path, Status: resp.StatusCode}
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxTraktBody)).Decode(out); err != nil {
		return fmt.Errorf("decode trakt %s: %w", path, err)
	}
	return nil
}
