package watchprogress

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"xrdb_rewrite/internal/logging"
	"xrdb_rewrite/internal/profile"
)

const (
	defaultCacheTTL     = 5 * time.Minute
	defaultFailureTTL   = time.Minute
	defaultFetchTimeout = 6 * time.Second
	// refreshMargin is how long before expiry a token is renewed. Trakt access
	// tokens last 7 days.
	refreshMargin = 24 * time.Hour
	// staleWindow is how long the last map read from Trakt keeps being served
	// while Trakt is failing.
	staleWindow = 6 * time.Hour
	// minPollInterval is the floor between device-token polls for one profile.
	minPollInterval = 5 * time.Second
	maxEntries      = 1024
)

// TokenStore holds each profile's sealed Trakt link.
type TokenStore interface {
	TraktAuth(profileID string) (*profile.TraktAuth, error)
	SetTraktAuth(profileID string, a *profile.TraktAuth) error
	CanStoreSecrets() bool
}

// Options configures a Service.
type Options struct {
	ClientID     string
	ClientSecret string
	RedirectURI  string
	UserAgent    string
	APIBase      string
	AuthBase     string
	HTTP         *http.Client
	Logger       *slog.Logger
	CacheTTL     time.Duration
	FailureTTL   time.Duration
	FetchTimeout time.Duration
	Now          func() time.Time
}

// Service reads owners' movie progress from Trakt and keeps each owner's map
// for a few minutes, so a page of posters costs one read.
type Service struct {
	client       *TraktClient
	store        TokenStore
	log          *slog.Logger
	cacheTTL     time.Duration
	failureTTL   time.Duration
	fetchTimeout time.Duration
	now          func() time.Time

	mu       sync.Mutex
	entries  map[string]*entry
	lastPoll map[string]time.Time

	// refreshing serialises token refreshes: Trakt refresh tokens are single-use.
	refreshing sync.Mutex
}

type entry struct {
	m       Map
	until   time.Time
	loaded  bool
	loading chan struct{}
	// good is the last map Trakt answered with, served through a failure
	// until staleWindow after goodAt.
	good    Map
	goodAt  time.Time
	hasGood bool
}

// outcome is what a read from Trakt established.
type outcome int

const (
	fetchOK     outcome = iota // the map is current
	fetchGone                  // no link, or Trakt refused the refresh token
	fetchFailed                // the read failed; the last good map still stands
)

// New builds a Service. It is usable whatever the options; Available says
// whether it can do anything.
func New(store TokenStore, o Options) *Service {
	httpClient := o.HTTP
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	s := &Service{
		client: &TraktClient{
			ClientID: o.ClientID, ClientSecret: o.ClientSecret, RedirectURI: o.RedirectURI,
			APIBase: o.APIBase, AuthBase: o.AuthBase, UserAgent: o.UserAgent, HTTP: httpClient,
		},
		store:        store,
		log:          o.Logger,
		cacheTTL:     o.CacheTTL,
		failureTTL:   o.FailureTTL,
		fetchTimeout: o.FetchTimeout,
		now:          o.Now,
		entries:      map[string]*entry{},
		lastPoll:     map[string]time.Time{},
	}
	if s.log == nil {
		s.log = slog.Default()
	}
	if s.cacheTTL <= 0 {
		s.cacheTTL = defaultCacheTTL
	}
	if s.failureTTL <= 0 {
		s.failureTTL = defaultFailureTTL
	}
	if s.fetchTimeout <= 0 {
		s.fetchTimeout = defaultFetchTimeout
	}
	if s.now == nil {
		s.now = time.Now
	}
	return s
}

// Available reports whether Trakt linking can work on this server.
func (s *Service) Available() bool {
	return s != nil && s.client.ClientID != "" && s.store != nil && s.store.CanStoreSecrets()
}

// MoviePercent is how far the owner of profileID is through the movie mediaID,
// 0 when unknown, not a movie, or Trakt could not be read.
func (s *Service) MoviePercent(ctx context.Context, profileID, mediaID, contentType string) int {
	if !s.Available() || profileID == "" || !MovieIDKnown(mediaID, contentType) {
		return 0
	}
	return s.progressFor(ctx, profileID).Movie(mediaID, contentType)
}

// Invalidate drops the cached map for a profile, including one being read.
func (s *Service) Invalidate(profileID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.entries, profileID)
}

func (s *Service) progressFor(ctx context.Context, profileID string) Map {
	s.mu.Lock()
	e := s.entries[profileID]
	now := s.now()
	if e != nil && e.loaded && (now.Before(e.until) || e.loading != nil) {
		// Fresh, or being refreshed: the last map stands until the new one lands.
		m := e.m
		s.mu.Unlock()
		return m
	}
	if e != nil && e.loading != nil {
		ch := e.loading
		s.mu.Unlock()
		select {
		case <-ch:
			s.mu.Lock()
			defer s.mu.Unlock()
			if e := s.entries[profileID]; e != nil {
				return e.m
			}
			return Map{}
		case <-ctx.Done():
			return Map{}
		}
	}
	if e == nil {
		s.pruneLocked(now)
		e = &entry{}
		s.entries[profileID] = e
	}
	ch := make(chan struct{})
	e.loading = ch
	s.mu.Unlock()

	fetchCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), s.fetchTimeout)
	m, ttl, result, err := s.fetch(fetchCtx, profileID)
	cancel()

	s.mu.Lock()
	if s.entries[profileID] != e {
		// Unlinked or relinked while this read ran; its answer is not wanted.
		e.loading = nil
		close(ch)
		s.mu.Unlock()
		return Map{}
	}
	now = s.now()
	kept, staleFor := false, time.Duration(0)
	switch result {
	case fetchOK:
		e.good, e.goodAt, e.hasGood = m, now, true
	case fetchGone:
		e.good, e.hasGood = Map{}, false
	case fetchFailed:
		staleFor = now.Sub(e.goodAt)
		if e.hasGood && staleFor <= staleWindow {
			m, kept = e.good, true
		} else {
			e.good, e.hasGood = Map{}, false
		}
	}
	e.m, e.loaded, e.until, e.loading = m, true, now.Add(ttl), nil
	close(ch)
	s.mu.Unlock()

	if result == fetchFailed {
		if kept {
			s.log.WarnContext(ctx, "Could not read watched progress from Trakt; serving the last progress it returned",
				"id", logging.RequestID(ctx), "profile_id", profileID, "error", err,
				"retry_in_s", int(ttl.Seconds()), "stale_s", int(staleFor.Seconds()))
		} else {
			s.log.WarnContext(ctx, "Could not read watched progress from Trakt; posters show no bar until it answers",
				"id", logging.RequestID(ctx), "profile_id", profileID, "error", err, "retry_in_s", int(ttl.Seconds()))
		}
	}
	return m
}

func (s *Service) pruneLocked(now time.Time) {
	if len(s.entries) < maxEntries {
		return
	}
	for id, e := range s.entries {
		if e.loading == nil && now.After(e.until) {
			delete(s.entries, id)
		}
	}
}

// fetch reads the owner's map and says how long to keep it. A failure is kept
// for the failure window, so a page of posters during an outage makes one
// attempt and logs one warning.
func (s *Service) fetch(ctx context.Context, profileID string) (Map, time.Duration, outcome, error) {
	auth, err := s.store.TraktAuth(profileID)
	if err != nil {
		return Map{}, s.failureTTL, fetchFailed, err
	}
	if !auth.Linked() {
		return Map{}, s.cacheTTL, fetchGone, nil
	}
	auth, err = s.freshAuth(ctx, profileID, auth, false)
	if err != nil {
		return s.failed(err)
	}
	m, err := s.client.MovieProgress(ctx, auth.AccessToken)
	if errors.Is(err, ErrUnauthorized) {
		if auth, err = s.freshAuth(ctx, profileID, auth, true); err == nil {
			m, err = s.client.MovieProgress(ctx, auth.AccessToken)
		}
	}
	if err != nil {
		return s.failed(err)
	}
	s.log.DebugContext(ctx, "Read watched progress from Trakt",
		"id", logging.RequestID(ctx), "profile_id", profileID, "movies", m.Len())
	return m, s.cacheTTL, fetchOK, nil
}

// failed classifies a failed read. Only a refused refresh token ends the
// link's progress; anything else is retried after the failure window, or
// Trakt's Retry-After when longer.
func (s *Service) failed(err error) (Map, time.Duration, outcome, error) {
	if errors.Is(err, ErrInvalidGrant) {
		return Map{}, s.failureTTL, fetchGone, err
	}
	wait := s.failureTTL
	var rl *RateLimitedError
	if errors.As(err, &rl) && rl.RetryAfter > wait {
		wait = rl.RetryAfter
	}
	return Map{}, wait, fetchFailed, err
}

// freshAuth returns a link whose access token is good, refreshing it when it is
// near expiry or force is set.
func (s *Service) freshAuth(ctx context.Context, profileID string, auth *profile.TraktAuth, force bool) (*profile.TraktAuth, error) {
	if !force && (auth.ExpiresAt == 0 || time.Unix(auth.ExpiresAt, 0).Sub(s.now()) > refreshMargin) {
		return auth, nil
	}
	s.refreshing.Lock()
	defer s.refreshing.Unlock()
	// Another request, or another replica, may have refreshed while this one
	// waited, and the refresh token it holds is spent.
	stored, err := s.store.TraktAuth(profileID)
	if err != nil {
		return nil, err
	}
	if !stored.Linked() {
		return nil, ErrInvalidGrant
	}
	if stored.AccessToken != auth.AccessToken && time.Unix(stored.ExpiresAt, 0).Sub(s.now()) > refreshMargin {
		return stored, nil
	}
	t, err := s.client.Refresh(ctx, stored.RefreshToken)
	if errors.Is(err, ErrInvalidGrant) {
		relink := &profile.TraktAuth{NeedsRelink: true}
		if serr := s.store.SetTraktAuth(profileID, relink); serr != nil {
			s.log.ErrorContext(ctx, "Could not record that a Trakt link needs renewing",
				"id", logging.RequestID(ctx), "profile_id", profileID, "error", serr)
		}
		s.log.WarnContext(ctx, "Trakt refused a profile's refresh token, so the owner has to link Trakt again",
			"id", logging.RequestID(ctx), "profile_id", profileID)
		return nil, err
	}
	if err != nil {
		return nil, err
	}
	next := &profile.TraktAuth{AccessToken: t.AccessToken, RefreshToken: t.RefreshToken, ExpiresAt: t.ExpiresAt(s.now())}
	if err := s.store.SetTraktAuth(profileID, next); err != nil {
		// The old refresh token is spent, so this pair is the only one left.
		s.log.ErrorContext(ctx, "Could not store a refreshed Trakt token; the owner may have to link Trakt again",
			"id", logging.RequestID(ctx), "profile_id", profileID, "error", err)
	} else {
		s.log.InfoContext(ctx, "Refreshed a profile's Trakt token",
			"id", logging.RequestID(ctx), "profile_id", profileID, "expires_at", time.Unix(next.ExpiresAt, 0).UTC())
	}
	return next, nil
}

// Status is what the configurator shows about a profile's Trakt link.
type Status struct {
	Available   bool `json:"available"`
	Linked      bool `json:"linked"`
	Pending     bool `json:"pending"`
	NeedsRelink bool `json:"needsRelink"`
}

// StatusOf reads a profile's link state.
func (s *Service) StatusOf(profileID string) (Status, error) {
	st := Status{Available: s.Available()}
	if s == nil || s.store == nil {
		return st, nil
	}
	auth, err := s.store.TraktAuth(profileID)
	if err != nil {
		return st, err
	}
	if auth != nil {
		st.Linked = auth.Linked()
		st.NeedsRelink = auth.NeedsRelink
		st.Pending = auth.DeviceCode != "" && s.now().Unix() < auth.DeviceExpiresAt
	}
	return st, nil
}

// LinkStart is what the owner needs to approve a device sign-in.
type LinkStart struct {
	UserCode        string `json:"userCode"`
	VerificationURL string `json:"verificationUrl"`
	ExpiresIn       int    `json:"expiresIn"`
	Interval        int    `json:"interval"`
}

// StartLink asks Trakt for a device code and keeps it on the profile. An
// existing link stays in place until the new one is approved.
func (s *Service) StartLink(ctx context.Context, profileID string) (LinkStart, error) {
	auth, err := s.store.TraktAuth(profileID)
	if err != nil {
		return LinkStart{}, err
	}
	dc, err := s.client.StartDevice(ctx)
	if err != nil {
		return LinkStart{}, err
	}
	interval := dc.Interval
	if interval < int(minPollInterval/time.Second) {
		interval = int(minPollInterval / time.Second)
	}
	next := profile.TraktAuth{}
	if auth != nil {
		next = *auth
	}
	next.DeviceCode = dc.DeviceCode
	next.DeviceExpiresAt = s.now().Add(time.Duration(dc.ExpiresIn) * time.Second).Unix()
	next.DeviceInterval = interval
	if err := s.store.SetTraktAuth(profileID, &next); err != nil {
		return LinkStart{}, err
	}
	s.mu.Lock()
	delete(s.lastPoll, profileID)
	s.mu.Unlock()
	return LinkStart{UserCode: dc.UserCode, VerificationURL: dc.VerificationURL, ExpiresIn: dc.ExpiresIn, Interval: interval}, nil
}

// Link states PollLink reports.
const (
	LinkNone    = "none"
	LinkPending = "pending"
	LinkLinked  = "linked"
	LinkExpired = "expired"
	LinkDenied  = "denied"
)

// PollLink checks once whether the owner approved the device code, at most
// once per Trakt's interval whatever the caller's pace.
func (s *Service) PollLink(ctx context.Context, profileID string) (string, error) {
	auth, err := s.store.TraktAuth(profileID)
	if err != nil {
		return "", err
	}
	if auth == nil || auth.DeviceCode == "" {
		if auth.Linked() {
			return LinkLinked, nil
		}
		return LinkNone, nil
	}
	now := s.now()
	if now.Unix() >= auth.DeviceExpiresAt {
		return LinkExpired, s.clearDevice(profileID, auth)
	}
	interval := time.Duration(auth.DeviceInterval) * time.Second
	if interval < minPollInterval {
		interval = minPollInterval
	}
	s.mu.Lock()
	last, polled := s.lastPoll[profileID]
	if polled && now.Sub(last) < interval {
		s.mu.Unlock()
		return LinkPending, nil
	}
	s.lastPoll[profileID] = now
	s.mu.Unlock()

	result, t, err := s.client.PollDevice(ctx, auth.DeviceCode)
	if err != nil {
		return "", err
	}
	switch result {
	case PollLinked:
		next := &profile.TraktAuth{AccessToken: t.AccessToken, RefreshToken: t.RefreshToken, ExpiresAt: t.ExpiresAt(now)}
		if err := s.store.SetTraktAuth(profileID, next); err != nil {
			return "", err
		}
		s.forgetPoll(profileID)
		s.Invalidate(profileID)
		s.log.InfoContext(ctx, "Linked a profile to Trakt",
			"id", logging.RequestID(ctx), "profile_id", profileID)
		return LinkLinked, nil
	case PollSlowDown:
		next := *auth
		next.DeviceInterval = int(interval/time.Second) + 5
		return LinkPending, s.store.SetTraktAuth(profileID, &next)
	case PollExpired:
		return LinkExpired, s.clearDevice(profileID, auth)
	case PollDenied:
		return LinkDenied, s.clearDevice(profileID, auth)
	}
	return LinkPending, nil
}

func (s *Service) forgetPoll(profileID string) {
	s.mu.Lock()
	delete(s.lastPoll, profileID)
	s.mu.Unlock()
}

func (s *Service) clearDevice(profileID string, auth *profile.TraktAuth) error {
	s.forgetPoll(profileID)
	next := *auth
	next.DeviceCode, next.DeviceExpiresAt, next.DeviceInterval = "", 0, 0
	return s.store.SetTraktAuth(profileID, &next)
}

// Unlink revokes the token at Trakt, best effort, and forgets the link.
func (s *Service) Unlink(ctx context.Context, profileID string) error {
	auth, err := s.store.TraktAuth(profileID)
	if err != nil {
		return err
	}
	if auth.Linked() {
		if err := s.client.Revoke(ctx, auth.AccessToken); err != nil {
			s.log.WarnContext(ctx, "Could not revoke a Trakt token while unlinking; forgetting it anyway",
				"id", logging.RequestID(ctx), "profile_id", profileID, "error", err)
		}
	}
	if err := s.store.SetTraktAuth(profileID, nil); err != nil {
		return err
	}
	s.forgetPoll(profileID)
	s.Invalidate(profileID)
	s.log.InfoContext(ctx, "Unlinked a profile from Trakt",
		"id", logging.RequestID(ctx), "profile_id", profileID)
	return nil
}
