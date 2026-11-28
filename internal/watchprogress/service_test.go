package watchprogress

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"xrdb_rewrite/internal/profile"
)

type memStore struct {
	mu    sync.Mutex
	auths map[string]*profile.TraktAuth
}

func newMemStore() *memStore { return &memStore{auths: map[string]*profile.TraktAuth{}} }

func (m *memStore) TraktAuth(id string) (*profile.TraktAuth, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	a := m.auths[id]
	if a == nil {
		return nil, nil
	}
	c := *a
	return &c, nil
}

func (m *memStore) SetTraktAuth(id string, a *profile.TraktAuth) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if a == nil {
		delete(m.auths, id)
		return nil
	}
	c := *a
	m.auths[id] = &c
	return nil
}

func (m *memStore) CanStoreSecrets() bool { return true }

// fakeTrakt answers the Trakt routes the service uses and counts each.
type fakeTrakt struct {
	t          *testing.T
	mu         sync.Mutex
	calls      map[string]int
	tokens     map[string]string // access token -> refresh token it pairs with
	syncStatus int
	pollStatus []int
	refreshOK  bool
	playback   string
	watched    string
	lastBody   map[string]string
	seq        int
	syncDelay  time.Duration
}

func newFakeTrakt(t *testing.T) (*fakeTrakt, *httptest.Server) {
	f := &fakeTrakt{
		t: t, calls: map[string]int{}, tokens: map[string]string{"access-1": "refresh-1"},
		syncStatus: http.StatusOK, refreshOK: true,
		playback: `[{"progress":42.7,"paused_at":"2026-11-20T10:00:00.000Z","id":1,"type":"movie","movie":{"ids":{"trakt":1,"imdb":"tt0000042","tmdb":42}}}]`,
		watched:  `[{"plays":1,"last_watched_at":"2026-10-01T10:00:00.000Z","last_updated_at":"2026-10-01T10:00:00.000Z","movie":{"ids":{"trakt":2,"imdb":"tt0000100","tmdb":100}}}]`,
	}
	srv := httptest.NewServer(http.HandlerFunc(f.serve))
	t.Cleanup(srv.Close)
	return f, srv
}

func (f *fakeTrakt) count(path string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls[path]
}

func (f *fakeTrakt) serve(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	f.calls[r.URL.Path]++
	var body map[string]string
	_ = json.NewDecoder(r.Body).Decode(&body)
	f.lastBody = body
	f.mu.Unlock()
	if r.Header.Get("trakt-api-key") != "client-id" || r.Header.Get("trakt-api-version") != "2" {
		f.t.Errorf("%s sent without the Trakt headers", r.URL.Path)
	}
	switch r.URL.Path {
	case "/oauth/device/code":
		writeJSON(w, map[string]any{"device_code": "dev-code", "user_code": "ABCD1234", "verification_url": "https://auth.trakt.tv/activate", "expires_in": 600, "interval": 5})
	case "/oauth/device/token":
		f.mu.Lock()
		status := http.StatusOK
		if len(f.pollStatus) > 0 {
			status, f.pollStatus = f.pollStatus[0], f.pollStatus[1:]
		}
		f.mu.Unlock()
		if body["code"] != "dev-code" {
			f.t.Errorf("polled with device code %q", body["code"])
		}
		if status != http.StatusOK {
			w.WriteHeader(status)
			return
		}
		writeJSON(w, map[string]any{"access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 604800, "created_at": time.Now().Unix(), "token_type": "bearer", "scope": "public"})
	case "/oauth/token":
		f.mu.Lock()
		defer f.mu.Unlock()
		if !f.refreshOK || body["grant_type"] != "refresh_token" {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
			return
		}
		var access string
		for a, rt := range f.tokens {
			if rt == body["refresh_token"] {
				access = a
			}
		}
		if access == "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		delete(f.tokens, access)
		f.seq++
		na, nr := "access-new-"+string(rune('a'+f.seq)), "refresh-new-"+string(rune('a'+f.seq))
		f.tokens[na] = nr
		writeJSON(w, map[string]any{"access_token": na, "refresh_token": nr, "expires_in": 604800, "created_at": time.Now().Unix(), "token_type": "bearer", "scope": "public"})
	case "/oauth/revoke":
		w.WriteHeader(http.StatusOK)
	case "/sync/playback/movies", "/sync/watched/movies":
		if f.syncDelay > 0 {
			time.Sleep(f.syncDelay)
		}
		f.mu.Lock()
		status := f.syncStatus
		_, known := f.tokens[strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")]
		f.mu.Unlock()
		if !known {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if status != http.StatusOK {
			w.Header().Set("Retry-After", "120")
			w.WriteHeader(status)
			return
		}
		if r.URL.Path == "/sync/playback/movies" {
			_, _ = w.Write([]byte(f.playback))
		} else {
			_, _ = w.Write([]byte(f.watched))
		}
	default:
		http.NotFound(w, r)
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

type clock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *clock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *clock) advance(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

type lockedBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (l *lockedBuffer) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.Write(p)
}

func (l *lockedBuffer) String() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.String()
}

func newTestService(t *testing.T, srv *httptest.Server, store TokenStore) (*Service, *clock, *lockedBuffer) {
	t.Helper()
	c := &clock{t: time.Now()}
	logs := &lockedBuffer{}
	s := New(store, Options{
		ClientID: "client-id", APIBase: srv.URL, AuthBase: srv.URL, UserAgent: "XRDB/test",
		Logger: slog.New(slog.NewJSONHandler(logs, &slog.HandlerOptions{Level: slog.LevelDebug})),
		Now:    c.now,
	})
	return s, c, logs
}

func linkedStore(expiresIn time.Duration) *memStore {
	st := newMemStore()
	st.auths["owner"] = &profile.TraktAuth{AccessToken: "access-1", RefreshToken: "refresh-1", ExpiresAt: time.Now().Add(expiresIn).Unix()}
	return st
}

func TestStepRoundsDownToTensAndKeepsTheEnds(t *testing.T) {
	for in, want := range map[int]int{-3: 0, 0: 0, 5: 0, 9: 0, 10: 10, 39: 30, 42: 40, 95: 90, 99: 90, 100: 100, 140: 100} {
		if got := Step(in); got != want {
			t.Errorf("Step(%d) = %d, want %d", in, got, want)
		}
	}
}

func TestProgressIsLookedUpForMoviesOnly(t *testing.T) {
	b := newMapBuilder()
	b.add(traktMovieIDs{IMDb: "tt1", TMDB: 7}, 55, time.Now())
	m := b.m
	cases := []struct {
		id, ct string
		want   int
	}{
		{"tt1", "", 55}, {"tt1", "movie", 55}, {"tt1", "series", 0},
		{"tmdb:movie:7", "", 55}, {"tmdb:7", "movie", 55}, {"tmdb:7", "", 0},
		{"tmdb:tv:7", "", 0}, {"tt2", "", 0}, {"kitsu:7", "movie", 0},
	}
	for _, c := range cases {
		if got := m.Movie(c.id, c.ct); got != c.want {
			t.Errorf("Movie(%q, %q) = %d, want %d", c.id, c.ct, got, c.want)
		}
	}
}

func TestAPauseAfterTheLastWatchIsARewatch(t *testing.T) {
	watchedAt := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	b := newMapBuilder()
	b.add(traktMovieIDs{IMDb: "tt1"}, 100, watchedAt)
	b.add(traktMovieIDs{IMDb: "tt1"}, 30, watchedAt.Add(time.Hour))
	b.add(traktMovieIDs{IMDb: "tt2"}, 100, watchedAt)
	b.add(traktMovieIDs{IMDb: "tt2"}, 30, watchedAt.Add(-time.Hour))
	if got := b.m.Movie("tt1", ""); got != 30 {
		t.Errorf("a newer pause reads %d, want 30", got)
	}
	if got := b.m.Movie("tt2", ""); got != 100 {
		t.Errorf("an older pause reads %d, want the full watch", got)
	}
}

func TestAPageOfPostersMakesOneTraktRead(t *testing.T) {
	f, srv := newFakeTrakt(t)
	f.syncDelay = 50 * time.Millisecond
	s, _, _ := newTestService(t, srv, linkedStore(7*24*time.Hour))

	var wg sync.WaitGroup
	var sawPaused, sawWatched atomic.Int32
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if s.MoviePercent(context.Background(), "owner", "tt0000042", "movie") == 42 {
				sawPaused.Add(1)
			}
			if s.MoviePercent(context.Background(), "owner", "tmdb:movie:100", "") == 100 {
				sawWatched.Add(1)
			}
		}()
	}
	wg.Wait()
	if n := f.count("/sync/playback/movies"); n != 1 {
		t.Errorf("playback was read %d times for one page, want 1", n)
	}
	if sawPaused.Load() != 20 || sawWatched.Load() != 20 {
		t.Errorf("paused seen %d/20, watched seen %d/20", sawPaused.Load(), sawWatched.Load())
	}
}

func TestTheProgressMapIsReadAgainAfterItsWindow(t *testing.T) {
	f, srv := newFakeTrakt(t)
	s, c, _ := newTestService(t, srv, linkedStore(7*24*time.Hour))
	s.MoviePercent(context.Background(), "owner", "tt0000042", "")
	c.advance(defaultCacheTTL - time.Second)
	s.MoviePercent(context.Background(), "owner", "tt0000042", "")
	if n := f.count("/sync/playback/movies"); n != 1 {
		t.Fatalf("read %d times inside the window, want 1", n)
	}
	c.advance(2 * time.Second)
	s.MoviePercent(context.Background(), "owner", "tt0000042", "")
	if n := f.count("/sync/playback/movies"); n != 2 {
		t.Errorf("read %d times after the window, want 2", n)
	}
}

func TestATraktFailureDrawsNoBarWarnsOnceAndLeaksNoToken(t *testing.T) {
	f, srv := newFakeTrakt(t)
	f.syncStatus = http.StatusServiceUnavailable
	s, c, logs := newTestService(t, srv, linkedStore(7*24*time.Hour))
	for i := 0; i < 5; i++ {
		if got := s.MoviePercent(context.Background(), "owner", "tt0000042", ""); got != 0 {
			t.Fatalf("a failed read gave %d, want 0", got)
		}
	}
	if n := f.count("/sync/playback/movies"); n != 1 {
		t.Errorf("an outage was asked %d times, want once per failure window", n)
	}
	out := logs.String()
	if strings.Count(out, "Could not read watched progress from Trakt") != 1 {
		t.Errorf("want one warning, logs: %s", out)
	}
	if strings.Contains(out, "access-1") || strings.Contains(out, "refresh-1") {
		t.Errorf("a token reached the logs: %s", out)
	}
	c.advance(defaultFailureTTL + time.Second)
	f.mu.Lock()
	f.syncStatus = http.StatusOK
	f.mu.Unlock()
	s.MoviePercent(context.Background(), "owner", "tt0000042", "")
	if got := s.MoviePercent(context.Background(), "owner", "tt0000042", ""); got != 42 {
		t.Errorf("after recovery got %d, want 42", got)
	}
}

func TestARateLimitIsWaitedOutForItsRetryAfter(t *testing.T) {
	f, srv := newFakeTrakt(t)
	f.syncStatus = http.StatusTooManyRequests
	s, c, _ := newTestService(t, srv, linkedStore(7*24*time.Hour))
	s.MoviePercent(context.Background(), "owner", "tt0000042", "")
	c.advance(90 * time.Second)
	s.MoviePercent(context.Background(), "owner", "tt0000042", "")
	if n := f.count("/sync/playback/movies"); n != 1 {
		t.Errorf("asked again %d times inside Retry-After", n-1)
	}
}

func TestATokenNearExpiryIsRefreshedAndStored(t *testing.T) {
	f, srv := newFakeTrakt(t)
	st := linkedStore(time.Hour)
	s, _, logs := newTestService(t, srv, st)
	if got := s.MoviePercent(context.Background(), "owner", "tt0000042", ""); got != 42 {
		t.Fatalf("got %d, want 42", got)
	}
	if n := f.count("/oauth/token"); n != 1 {
		t.Fatalf("refreshed %d times, want 1", n)
	}
	stored, _ := st.TraktAuth("owner")
	if stored.AccessToken == "access-1" || stored.RefreshToken == "refresh-1" || !stored.Linked() {
		t.Errorf("the refreshed pair was not stored: %+v", stored)
	}
	if time.Until(time.Unix(stored.ExpiresAt, 0)) < 6*24*time.Hour {
		t.Errorf("the stored expiry was not moved on: %v", time.Unix(stored.ExpiresAt, 0))
	}
	if strings.Contains(logs.String(), stored.AccessToken) || strings.Contains(logs.String(), stored.RefreshToken) {
		t.Error("a refreshed token reached the logs")
	}
}

func TestARevokedAccessTokenIsRefreshedOnce(t *testing.T) {
	f, srv := newFakeTrakt(t)
	st := linkedStore(7 * 24 * time.Hour)
	f.tokens = map[string]string{"access-0": "refresh-1"} // access-1 no longer works
	s, _, _ := newTestService(t, srv, st)
	if got := s.MoviePercent(context.Background(), "owner", "tt0000042", ""); got != 42 {
		t.Fatalf("got %d, want 42", got)
	}
	if n := f.count("/oauth/token"); n != 1 {
		t.Errorf("refreshed %d times, want 1", n)
	}
}

func TestARefusedRefreshTokenAsksTheOwnerToLinkAgain(t *testing.T) {
	f, srv := newFakeTrakt(t)
	f.refreshOK = false
	st := linkedStore(time.Hour)
	s, _, _ := newTestService(t, srv, st)
	if got := s.MoviePercent(context.Background(), "owner", "tt0000042", ""); got != 0 {
		t.Fatalf("got %d, want 0", got)
	}
	stored, _ := st.TraktAuth("owner")
	if stored == nil || !stored.NeedsRelink || stored.Linked() {
		t.Errorf("the link was not marked for renewal: %+v", stored)
	}
	status, _ := s.StatusOf("owner")
	if !status.NeedsRelink || status.Linked {
		t.Errorf("status %+v, want needsRelink", status)
	}
}

func TestTheDeviceFlowLinksAProfile(t *testing.T) {
	f, srv := newFakeTrakt(t)
	f.pollStatus = []int{http.StatusBadRequest, http.StatusOK}
	st := newMemStore()
	s, c, _ := newTestService(t, srv, st)

	start, err := s.StartLink(context.Background(), "owner")
	if err != nil {
		t.Fatal(err)
	}
	if start.UserCode != "ABCD1234" || start.VerificationURL == "" || start.Interval != 5 {
		t.Fatalf("start %+v", start)
	}
	if status, _ := s.StatusOf("owner"); !status.Pending || status.Linked {
		t.Errorf("status after start %+v", status)
	}

	if state, err := s.PollLink(context.Background(), "owner"); err != nil || state != LinkPending {
		t.Fatalf("first poll %q %v", state, err)
	}
	// Polling faster than Trakt's interval is answered without asking Trakt.
	if state, _ := s.PollLink(context.Background(), "owner"); state != LinkPending {
		t.Fatalf("an early poll said %q", state)
	}
	if n := f.count("/oauth/device/token"); n != 1 {
		t.Fatalf("asked Trakt %d times inside one interval, want 1", n)
	}
	c.advance(5 * time.Second)
	if state, err := s.PollLink(context.Background(), "owner"); err != nil || state != LinkLinked {
		t.Fatalf("second poll %q %v", state, err)
	}
	stored, _ := st.TraktAuth("owner")
	if !stored.Linked() || stored.DeviceCode != "" {
		t.Errorf("stored link %+v", stored)
	}
	if got := s.MoviePercent(context.Background(), "owner", "tt0000042", ""); got != 42 {
		t.Errorf("a freshly linked profile reads %d, want 42", got)
	}
}

func TestADeniedOrExpiredDeviceCodeIsForgotten(t *testing.T) {
	f, srv := newFakeTrakt(t)
	f.pollStatus = []int{http.StatusTeapot}
	st := newMemStore()
	s, c, _ := newTestService(t, srv, st)
	if _, err := s.StartLink(context.Background(), "owner"); err != nil {
		t.Fatal(err)
	}
	if state, _ := s.PollLink(context.Background(), "owner"); state != LinkDenied {
		t.Fatalf("got %q, want denied", state)
	}
	if a, _ := st.TraktAuth("owner"); a != nil && a.DeviceCode != "" {
		t.Error("a denied device code was kept")
	}

	if _, err := s.StartLink(context.Background(), "owner"); err != nil {
		t.Fatal(err)
	}
	c.advance(11 * time.Minute)
	if state, _ := s.PollLink(context.Background(), "owner"); state != LinkExpired {
		t.Fatalf("got %q, want expired", state)
	}
}

func TestUnlinkingRevokesAndForgets(t *testing.T) {
	f, srv := newFakeTrakt(t)
	st := linkedStore(7 * 24 * time.Hour)
	s, _, _ := newTestService(t, srv, st)
	s.MoviePercent(context.Background(), "owner", "tt0000042", "")
	if err := s.Unlink(context.Background(), "owner"); err != nil {
		t.Fatal(err)
	}
	if f.count("/oauth/revoke") != 1 {
		t.Error("the token was not revoked")
	}
	if a, _ := st.TraktAuth("owner"); a != nil {
		t.Errorf("the link survived: %+v", a)
	}
	if got := s.MoviePercent(context.Background(), "owner", "tt0000042", ""); got != 0 {
		t.Errorf("an unlinked profile still reads %d", got)
	}
}

func TestNoClientIDMeansNoTraktCalls(t *testing.T) {
	f, srv := newFakeTrakt(t)
	s := New(linkedStore(7*24*time.Hour), Options{APIBase: srv.URL, AuthBase: srv.URL})
	if s.Available() {
		t.Fatal("a service with no client id says it is available")
	}
	if got := s.MoviePercent(context.Background(), "owner", "tt0000042", ""); got != 0 {
		t.Errorf("got %d", got)
	}
	if n := f.count("/sync/playback/movies"); n != 0 {
		t.Errorf("made %d calls with no client id", n)
	}
}

func (f *fakeTrakt) set(fn func(*fakeTrakt)) {
	f.mu.Lock()
	defer f.mu.Unlock()
	fn(f)
}

func TestATransientFailureKeepsServingTheLastMap(t *testing.T) {
	for _, tc := range []struct {
		name    string
		failure func(*fakeTrakt, *httptest.Server)
	}{
		{"server error", func(f *fakeTrakt, _ *httptest.Server) {
			f.set(func(f *fakeTrakt) { f.syncStatus = http.StatusBadGateway })
		}},
		{"rate limited", func(f *fakeTrakt, _ *httptest.Server) {
			f.set(func(f *fakeTrakt) { f.syncStatus = http.StatusTooManyRequests })
		}},
		{"network error", func(_ *fakeTrakt, srv *httptest.Server) { srv.Close() }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f, srv := newFakeTrakt(t)
			s, c, logs := newTestService(t, srv, linkedStore(7*24*time.Hour))
			if got := s.MoviePercent(context.Background(), "owner", "tt0000042", ""); got != 42 {
				t.Fatalf("first read gave %d, want 42", got)
			}
			tc.failure(f, srv)
			c.advance(defaultCacheTTL + time.Second)
			for i := 0; i < 3; i++ {
				if got := s.MoviePercent(context.Background(), "owner", "tt0000042", ""); got != 42 {
					t.Fatalf("during a failure the bar read %d, want the last 42", got)
				}
			}
			c.advance(staleWindow - defaultCacheTTL - time.Minute)
			if got := s.MoviePercent(context.Background(), "owner", "tt0000042", ""); got != 42 {
				t.Errorf("inside the stale window the bar read %d, want the last 42", got)
			}
			if !strings.Contains(logs.String(), "serving the last progress it returned") {
				t.Errorf("the kept map was not logged: %s", logs.String())
			}
		})
	}
}

func TestAFailingRefetchIsStillBackedOff(t *testing.T) {
	f, srv := newFakeTrakt(t)
	s, c, _ := newTestService(t, srv, linkedStore(7*24*time.Hour))
	s.MoviePercent(context.Background(), "owner", "tt0000042", "")
	f.set(func(f *fakeTrakt) { f.syncStatus = http.StatusServiceUnavailable })
	c.advance(defaultCacheTTL + time.Second)
	for i := 0; i < 5; i++ {
		s.MoviePercent(context.Background(), "owner", "tt0000042", "")
	}
	if n := f.count("/sync/playback/movies"); n != 2 {
		t.Errorf("Trakt was asked %d times, want 2: the read and one retry per failure window", n)
	}
}

func TestTheLastMapIsDroppedPastTheStaleWindow(t *testing.T) {
	f, srv := newFakeTrakt(t)
	s, c, _ := newTestService(t, srv, linkedStore(7*24*time.Hour))
	s.MoviePercent(context.Background(), "owner", "tt0000042", "")
	f.set(func(f *fakeTrakt) { f.syncStatus = http.StatusServiceUnavailable })
	c.advance(staleWindow + time.Second)
	if got := s.MoviePercent(context.Background(), "owner", "tt0000042", ""); got != 0 {
		t.Errorf("past the stale window the bar read %d, want none", got)
	}
}

func TestARefusedRefreshTokenEmptiesTheMapAtOnce(t *testing.T) {
	f, srv := newFakeTrakt(t)
	s, c, _ := newTestService(t, srv, linkedStore(7*24*time.Hour))
	s.MoviePercent(context.Background(), "owner", "tt0000042", "")
	f.set(func(f *fakeTrakt) {
		f.tokens = map[string]string{}
		f.refreshOK = false
	})
	c.advance(defaultCacheTTL + time.Second)
	if got := s.MoviePercent(context.Background(), "owner", "tt0000042", ""); got != 0 {
		t.Errorf("after Trakt refused the refresh token the bar read %d, want none", got)
	}
}

func TestUnlinkingEmptiesTheMapAtOnce(t *testing.T) {
	_, srv := newFakeTrakt(t)
	st := linkedStore(7 * 24 * time.Hour)
	s, c, _ := newTestService(t, srv, st)
	s.MoviePercent(context.Background(), "owner", "tt0000042", "")
	if err := s.Unlink(context.Background(), "owner"); err != nil {
		t.Fatal(err)
	}
	if got := s.MoviePercent(context.Background(), "owner", "tt0000042", ""); got != 0 {
		t.Errorf("right after unlinking the bar read %d, want none", got)
	}

	// A link removed elsewhere, such as on another replica, empties at the next read.
	if err := st.SetTraktAuth("owner", &profile.TraktAuth{AccessToken: "access-1", RefreshToken: "refresh-1", ExpiresAt: time.Now().Add(7 * 24 * time.Hour).Unix()}); err != nil {
		t.Fatal(err)
	}
	s.Invalidate("owner")
	if got := s.MoviePercent(context.Background(), "owner", "tt0000042", ""); got != 42 {
		t.Fatalf("relinked read gave %d, want 42", got)
	}
	if err := st.SetTraktAuth("owner", nil); err != nil {
		t.Fatal(err)
	}
	c.advance(defaultCacheTTL + time.Second)
	if got := s.MoviePercent(context.Background(), "owner", "tt0000042", ""); got != 0 {
		t.Errorf("after the link was removed the bar read %d, want none", got)
	}
}
