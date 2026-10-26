package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"xrdb_rewrite/internal/atomicfile"
)

const (
	simklTokenFile = "simkl-v2-token.json"
	// A token is refreshed once it has less than this left.
	simklRefreshWindow = 24 * time.Hour
	// Assumed lifetime when the token response carries no expires_in.
	simklDefaultTokenLife = 7 * 24 * time.Hour
	// Wait after a refresh fails for a reason that may pass.
	simklRefreshBackoff = 30 * time.Second
	simklDeviceGrant    = "urn:ietf:params:oauth:grant-type:device_code"
)

// Why a V2 request cannot be made. Both are skipped quietly by the render.
var (
	errSIMKLNotLinked   = fmt.Errorf("simkl: V2 is not linked: %w", ErrNotApplicable)
	errSIMKLNeedsRelink = fmt.Errorf("simkl: V2 link has lapsed: %w", ErrNotApplicable)
)

type simklToken struct {
	ClientID  string    `json:"client_id"`
	Access    string    `json:"access_token"`
	Refresh   string    `json:"refresh_token"`
	ExpiresAt time.Time `json:"expires_at"`
}

// SIMKLLinkStart is what a person needs to approve a device link.
type SIMKLLinkStart struct {
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	ExpiresIn       int    `json:"expires_in"`
}

// SIMKLLinkStatus reports the V2 link.
type SIMKLLinkStatus struct {
	Linked    bool      `json:"linked"`
	ExpiresAt time.Time `json:"expires_at,omitzero"`
	Pending   bool      `json:"pending"`
}

type refreshCall struct {
	done   chan struct{}
	access string
	err    error
}

// simklAuth holds the V2 credential and the user token that goes with it.
type simklAuth struct {
	clientID string
	secret   string
	path     string
	log      *slog.Logger
	now      func() time.Time
	// pollUnit is the length of one second of the device flow's interval.
	pollUnit time.Duration

	mu          sync.Mutex
	tok         simklToken
	needsRelink bool
	retryAfter  time.Time
	warned      bool
	inflight    *refreshCall
	pending     bool
	// refusedAt rate-limits the 401 warning per endpoint path.
	refusedAt map[string]time.Time
}

func newSIMKLAuth(clientID, secret, dir string, log *slog.Logger) *simklAuth {
	if log == nil {
		log = slog.Default()
	}
	a := &simklAuth{clientID: clientID, secret: secret, log: log, now: time.Now, pollUnit: time.Second}
	if dir != "" {
		a.path = filepath.Join(dir, simklTokenFile)
		a.load()
	}
	return a
}

func (a *simklAuth) load() {
	data, err := os.ReadFile(a.path)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			a.log.Warn("Could not read the Simkl token file", "path", a.path, "error", err)
		}
		return
	}
	var t simklToken
	if err := json.Unmarshal(data, &t); err != nil {
		a.log.Warn("Could not parse the Simkl token file", "path", a.path, "error", err)
		return
	}
	if t.ClientID != a.clientID || t.Access == "" {
		a.log.Warn("Ignoring a Simkl token file saved for another client id", "path", a.path)
		return
	}
	a.tok = t
}

// save persists the token. Callers hold a.mu.
func (a *simklAuth) save() {
	if a.path == "" {
		return
	}
	data, err := json.Marshal(a.tok)
	if err == nil {
		if err = os.MkdirAll(filepath.Dir(a.path), 0o755); err == nil {
			err = atomicfile.WriteFile(a.path, data, 0o600)
		}
	}
	if err != nil {
		a.log.Error("Could not save the Simkl token; it is held in memory only", "path", a.path, "error", err)
	}
}

// usable reports whether a request could be made with the link as it stands.
func (a *simklAuth) usable() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.tok.Access != "" && !a.needsRelink
}

func (a *simklAuth) status() SIMKLLinkStatus {
	a.mu.Lock()
	defer a.mu.Unlock()
	return SIMKLLinkStatus{
		Linked:    a.tok.Access != "" && !a.needsRelink,
		ExpiresAt: a.tok.ExpiresAt,
		Pending:   a.pending,
	}
}

// accessToken returns a token good for a request, refreshing it first when it
// is within the refresh window.
func (a *simklAuth) accessToken(s *SIMKL, ctx context.Context) (string, error) {
	a.mu.Lock()
	tok := a.tok
	relink := a.needsRelink
	backoff := a.now().Before(a.retryAfter)
	a.mu.Unlock()

	switch {
	case tok.Access == "":
		return "", errSIMKLNotLinked
	case relink:
		return "", errSIMKLNeedsRelink
	case tok.ExpiresAt.Sub(a.now()) > simklRefreshWindow:
		return tok.Access, nil
	}
	expired := !a.now().Before(tok.ExpiresAt)
	if backoff {
		if expired {
			return "", errSIMKLNeedsRelink
		}
		return tok.Access, nil
	}
	access, err := a.refresh(s, ctx, tok.Access)
	if err != nil {
		if expired {
			return "", errSIMKLNeedsRelink
		}
		return tok.Access, nil
	}
	return access, nil
}

// refresh swaps the refresh token for a new pair. One refresh runs at a time:
// callers arriving meanwhile wait for its result. stale is the access token the
// caller found wanting; if it has already been replaced, that is returned.
func (a *simklAuth) refresh(s *SIMKL, ctx context.Context, stale string) (string, error) {
	a.mu.Lock()
	if a.tok.Access != stale {
		access := a.tok.Access
		a.mu.Unlock()
		return access, nil
	}
	if a.needsRelink {
		a.mu.Unlock()
		return "", errSIMKLNeedsRelink
	}
	if call := a.inflight; call != nil {
		a.mu.Unlock()
		select {
		case <-call.done:
			return call.access, call.err
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}
	call := &refreshCall{done: make(chan struct{})}
	a.inflight = call
	refreshToken := a.tok.Refresh
	a.mu.Unlock()

	// Detached: a caller giving up must not fail the callers waiting on this.
	rctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 20*time.Second)
	tok, definitive, err := s.exchange(rctx, map[string]string{
		"grant_type":    "refresh_token",
		"refresh_token": refreshToken,
	})
	cancel()

	a.mu.Lock()
	if err == nil {
		if tok.Refresh == "" {
			tok.Refresh = refreshToken
		}
		a.tok = tok
		a.warned, a.retryAfter = false, time.Time{}
		a.save()
		call.access = tok.Access
	} else {
		call.err = err
		if definitive {
			a.needsRelink = true
		} else {
			a.retryAfter = a.now().Add(simklRefreshBackoff)
		}
		if !a.warned {
			a.warned = true
			a.log.Warn("Simkl needs relinking", "reason", err.Error())
		}
	}
	a.inflight = nil
	a.mu.Unlock()
	close(call.done)
	return call.access, call.err
}

// install stores a token obtained through a fresh link.
func (a *simklAuth) install(tok simklToken) {
	a.mu.Lock()
	a.tok = tok
	a.needsRelink, a.warned, a.retryAfter = false, false, time.Time{}
	a.save()
	a.mu.Unlock()
}

type simklTokenReply struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
	Error        string `json:"error"`
	ErrorDesc    string `json:"error_description"`
}

func (s *SIMKL) oauthURL(path string) string {
	base := simklBaseURL
	if s.baseURL != "" {
		base = s.baseURL
	}
	return base + path + "?app-name=" + simklAppName + "&app-version=" + url.QueryEscape(version())
}

// oauthPost sends a JSON body to a Simkl OAuth endpoint and returns the status
// and decoded reply. The body carries credentials and is never logged.
func (s *SIMKL) oauthPost(ctx context.Context, path string, body map[string]string) (int, simklTokenReply, error) {
	var reply simklTokenReply
	raw, err := json.Marshal(body)
	if err != nil {
		return 0, reply, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.oauthURL(path), bytes.NewReader(raw))
	if err != nil {
		return 0, reply, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "XRDB/"+version())
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return 0, reply, redactHTTPErr(err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return resp.StatusCode, reply, err
	}
	// A body that is not JSON leaves the reply empty; the status still speaks.
	_ = json.Unmarshal(data, &reply)
	return resp.StatusCode, reply, nil
}

// exchange posts to /oauth2/token with the client credentials added. definitive
// is true when Simkl refused the grant itself, as opposed to being unreachable.
func (s *SIMKL) exchange(ctx context.Context, fields map[string]string) (tok simklToken, definitive bool, err error) {
	a := s.auth
	body := map[string]string{"client_id": a.clientID, "client_secret": a.secret}
	for k, v := range fields {
		body[k] = v
	}
	status, reply, err := s.oauthPost(ctx, "/oauth2/token", body)
	if err != nil {
		return tok, false, fmt.Errorf("simkl token request: %w", err)
	}
	if status == http.StatusOK && reply.AccessToken != "" {
		life := time.Duration(reply.ExpiresIn) * time.Second
		if life <= 0 {
			life = simklDefaultTokenLife
		}
		return simklToken{
			ClientID:  a.clientID,
			Access:    reply.AccessToken,
			Refresh:   reply.RefreshToken,
			ExpiresAt: a.now().Add(life),
		}, false, nil
	}
	err = fmt.Errorf("simkl token request: http %d %s", status, oauthErrorCode(reply.Error))
	return tok, status >= 400 && status < 500 && status != http.StatusTooManyRequests, err
}

// StartLink begins a device link and polls in the background until it is
// approved or expires.
func (s *SIMKL) StartLink(ctx context.Context) (SIMKLLinkStart, error) {
	a := s.auth
	if a == nil {
		return SIMKLLinkStart{}, errors.New("simkl: V2 is not configured")
	}
	a.mu.Lock()
	if a.pending {
		a.mu.Unlock()
		return SIMKLLinkStart{}, errors.New("simkl: a link is already waiting for approval")
	}
	a.pending = true
	a.mu.Unlock()
	clearPending := func() {
		a.mu.Lock()
		a.pending = false
		a.mu.Unlock()
	}

	raw, err := json.Marshal(map[string]string{"client_id": a.clientID})
	if err != nil {
		clearPending()
		return SIMKLLinkStart{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.oauthURL("/oauth2/device"), bytes.NewReader(raw))
	if err != nil {
		clearPending()
		return SIMKLLinkStart{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "XRDB/"+version())
	resp, err := s.httpClient.Do(req)
	if err != nil {
		clearPending()
		return SIMKLLinkStart{}, fmt.Errorf("simkl device request: %w", redactHTTPErr(err))
	}
	defer resp.Body.Close()
	var dev struct {
		DeviceCode      string `json:"device_code"`
		UserCode        string `json:"user_code"`
		VerificationURI string `json:"verification_uri"`
		ExpiresIn       int    `json:"expires_in"`
		Interval        int    `json:"interval"`
	}
	if resp.StatusCode != http.StatusOK {
		clearPending()
		return SIMKLLinkStart{}, fmt.Errorf("simkl device request: http %d", resp.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&dev); err != nil || dev.DeviceCode == "" || dev.UserCode == "" {
		clearPending()
		return SIMKLLinkStart{}, errors.New("simkl device request: unreadable reply")
	}
	if dev.ExpiresIn <= 0 {
		dev.ExpiresIn = 900
	}
	if dev.Interval <= 0 {
		dev.Interval = 5
	}

	a.log.Info("Started a Simkl link", "expires_in", dev.ExpiresIn, "interval", dev.Interval)
	go s.pollLink(dev.DeviceCode, time.Duration(dev.ExpiresIn)*a.pollUnit, time.Duration(dev.Interval)*a.pollUnit)
	return SIMKLLinkStart{UserCode: dev.UserCode, VerificationURI: dev.VerificationURI, ExpiresIn: dev.ExpiresIn}, nil
}

func (s *SIMKL) pollLink(deviceCode string, life, interval time.Duration) {
	a := s.auth
	defer func() {
		a.mu.Lock()
		a.pending = false
		a.mu.Unlock()
	}()
	ctx, cancel := context.WithTimeout(context.Background(), life)
	defer cancel()
	for {
		select {
		case <-ctx.Done():
			a.log.Warn("Simkl link expired")
			return
		case <-time.After(interval):
		}
		tok, _, err := s.exchange(ctx, map[string]string{"grant_type": simklDeviceGrant, "device_code": deviceCode})
		if err == nil {
			a.install(tok)
			a.log.Info("Linked Simkl", "expires_at", tok.ExpiresAt)
			return
		}
		// Poll errors are reported by name in the error text: pending and
		// slow_down mean keep going, a refusal or expiry ends the link.
		switch {
		case containsAny(err.Error(), "expired_token"):
			a.log.Warn("Simkl link expired")
			return
		case containsAny(err.Error(), "access_denied"):
			a.log.Warn("Simkl link was denied")
			return
		case containsAny(err.Error(), "invalid_client", "invalid_grant"):
			a.log.Warn("Simkl link failed; the client credentials were refused", "reason", err.Error())
			return
		case containsAny(err.Error(), "slow_down"):
			interval += 5 * a.pollUnit
		}
	}
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

var oauthErrorCodeRe = regexp.MustCompile(`^[a-z_]{1,40}$`)

// oauthErrorCode keeps an RFC 6749 error code and drops anything else Simkl
// might put in the field.
func oauthErrorCode(code string) string {
	if oauthErrorCodeRe.MatchString(code) {
		return code
	}
	return "unrecognised_error"
}

// simklRefusalWarnEvery spaces out the warning for one endpoint.
const simklRefusalWarnEvery = time.Hour

// noteUnauthorized warns when Simkl answers a V2 request with 401, at most once
// an hour per endpoint, so a tightened V2 policy shows in the log.
func (a *simklAuth) noteUnauthorized(resp *http.Response) {
	if resp == nil || resp.StatusCode != http.StatusUnauthorized || resp.Request == nil {
		return
	}
	path := resp.Request.URL.Path
	a.mu.Lock()
	if a.refusedAt == nil {
		a.refusedAt = map[string]time.Time{}
	}
	last, seen := a.refusedAt[path]
	due := !seen || a.now().Sub(last) >= simklRefusalWarnEvery
	if due {
		a.refusedAt[path] = a.now()
	}
	a.mu.Unlock()
	if due {
		a.log.Warn("Simkl refused a V2 request", "endpoint", path, "status", resp.StatusCode)
	}
}
