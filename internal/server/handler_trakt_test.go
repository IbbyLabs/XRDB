package server

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"xrdb_rewrite/internal/cache"
	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/provider"
)

// stubTrakt answers the Trakt routes with a fixed history: tt0000042 paused at
// 42%, tt0000100 watched.
type stubTrakt struct {
	mu     sync.Mutex
	calls  map[string]int
	fail   bool
	tokens map[string]bool
	// revokeFail makes /oauth/revoke answer 502.
	revokeFail bool
}

func (s *stubTrakt) count(path string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.calls[path]
}

func (s *stubTrakt) total() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	n := 0
	for _, c := range s.calls {
		n += c
	}
	return n
}

func (s *stubTrakt) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	s.calls[r.URL.Path]++
	fail := s.fail
	revokeFail := s.revokeFail
	known := s.tokens[strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")]
	s.mu.Unlock()
	switch r.URL.Path {
	case "/oauth/device/code":
		writeJSON(w, http.StatusOK, map[string]any{"device_code": "dev", "user_code": "WXYZ9876", "verification_url": "https://auth.trakt.tv/activate", "expires_in": 600, "interval": 5})
	case "/oauth/device/token":
		s.mu.Lock()
		s.tokens["linked-access"] = true
		s.mu.Unlock()
		writeJSON(w, http.StatusOK, map[string]any{"access_token": "linked-access", "refresh_token": "linked-refresh", "expires_in": 604800, "created_at": time.Now().Unix()})
	case "/oauth/revoke":
		if revokeFail {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		w.WriteHeader(http.StatusOK)
	case "/sync/playback/movies", "/sync/watched/movies":
		if fail {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		if !known {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.URL.Path == "/sync/playback/movies" {
			_, _ = w.Write([]byte(`[{"progress":42.0,"paused_at":"2026-11-20T10:00:00.000Z","id":1,"type":"movie","movie":{"ids":{"imdb":"tt0000042","tmdb":42}}}]`))
		} else {
			_, _ = w.Write([]byte(`[{"plays":1,"last_watched_at":"2026-10-01T10:00:00.000Z","movie":{"ids":{"imdb":"tt0000100","tmdb":100}}}]`))
		}
	default:
		http.NotFound(w, r)
	}
}

type traktFixture struct {
	h     http.Handler
	store *profile.Store
	trakt *stubTrakt
	id    string
	alias string
	uuid  string
}

// newTraktFixture builds a handler with a render pipeline, a stub Trakt, and a
// password-protected profile with the bar on and Trakt linked.
func newTraktFixture(t *testing.T, mutate func(*config.Config)) *traktFixture {
	t.Helper()
	trakt := &stubTrakt{calls: map[string]int{}, tokens: map[string]bool{"owner-access": true}}
	srv := httptest.NewServer(trakt)
	t.Cleanup(srv.Close)
	prevAPI, prevAuth := traktAPIBase, traktAuthBase
	traktAPIBase, traktAuthBase = srv.URL, srv.URL
	t.Cleanup(func() { traktAPIBase, traktAuthBase = prevAPI, prevAuth })

	store := openTestStore(t)
	stub := &provider.StubProvider{ProviderName: "tmdb", Meta: &provider.MediaMeta{Title: "Test", PosterURL: "http://fake/poster.jpg"}}
	reg := provider.NewRegistry()
	reg.Register(stub)
	pipeline := compose.NewWithFetcher(reg, fixedFetcher{data: testSourcePNG(t, 300, 450)})
	c, err := cache.New(t.TempDir(), time.Hour, 100, 8<<20)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.Close)

	f := &traktFixture{store: store, trakt: trakt, id: "ownerprofile1", alias: "sharedlook", uuid: "legacy-uuid-1"}
	p := &profile.Profile{ID: f.id, Alias: f.alias, UUID: f.uuid, Type: "poster", Config: json.RawMessage(`{"watchedProgress":true}`)}
	if err := store.Save(p); err != nil {
		t.Fatal(err)
	}
	if err := store.SetPassword(p.ID, "pw"); err != nil {
		t.Fatal(err)
	}
	if err := store.SetTraktAuth(p.ID, &profile.TraktAuth{AccessToken: "owner-access", RefreshToken: "owner-refresh", ExpiresAt: time.Now().Add(7 * 24 * time.Hour).Unix()}); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{TraktClientID: "client-id"}
	if mutate != nil {
		mutate(&cfg)
	}
	f.h = NewHandler("test", store, nil, pipeline, c, cfg)
	return f
}

func (f *traktFixture) get(t *testing.T, path string) *httptest.ResponseRecorder {
	t.Helper()
	rr := httptest.NewRecorder()
	f.h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, path, nil))
	return rr
}

func TestOnlyTheOwnersOwnIDGetsTheWatchedBar(t *testing.T) {
	f := newTraktFixture(t, nil)

	owner := f.get(t, "/poster/tt0000042?type=movie&config="+f.id)
	if owner.Code != http.StatusOK {
		t.Fatalf("owner render: %d", owner.Code)
	}
	if cc := owner.Header().Get("Cache-Control"); !strings.HasPrefix(cc, "private") {
		t.Errorf("a barred poster is cacheable by shared caches: %q", cc)
	}
	if f.trakt.count("/sync/playback/movies") != 1 {
		t.Fatalf("the owner's render read Trakt %d times, want 1", f.trakt.count("/sync/playback/movies"))
	}

	// Rendered after the owner's, so a shared cache entry would be served here.
	for name, path := range map[string]string{
		"alias":  "/poster/tt0000042?type=movie&config=" + f.alias,
		"uuid":   "/poster/tt0000042?type=movie&config=" + f.uuid,
		"inline": "/poster/tt0000042?type=movie&config=" + url.QueryEscape(`{"watchedProgress":true}`),
	} {
		before := f.trakt.total()
		rr := f.get(t, path)
		if rr.Code != http.StatusOK {
			t.Fatalf("%s render: %d", name, rr.Code)
		}
		if bytes.Equal(rr.Body.Bytes(), owner.Body.Bytes()) {
			t.Errorf("the %s link was served the owner's barred poster", name)
		}
		if rr.Header().Get("X-Cache-Key") == owner.Header().Get("X-Cache-Key") {
			t.Errorf("the %s link shares the owner's cache key", name)
		}
		if cc := rr.Header().Get("Cache-Control"); strings.HasPrefix(cc, "private") {
			t.Errorf("the %s link was marked private: %q", name, cc)
		}
		if f.trakt.total() != before {
			t.Errorf("the %s link reached Trakt", name)
		}
	}

	alias := f.get(t, "/poster/tt0000042?type=movie&config="+f.alias)
	uuid := f.get(t, "/poster/tt0000042?type=movie&config="+f.uuid)
	if !bytes.Equal(alias.Body.Bytes(), uuid.Body.Bytes()) {
		t.Error("the alias and uuid links render differently, so one of them carries something")
	}
}

func TestASharedProfileNeverGetsTheWatchedBarEvenByID(t *testing.T) {
	f := newTraktFixture(t, func(c *config.Config) { c.SharedProfileAliases = []string{"ownerprofile1"} })
	shared := f.get(t, "/poster/tt0000042?type=movie&config="+f.id)
	if shared.Code != http.StatusOK {
		t.Fatalf("render: %d", shared.Code)
	}
	if f.trakt.total() != 0 {
		t.Errorf("a shared profile reached Trakt %d times", f.trakt.total())
	}
	alias := f.get(t, "/poster/tt0000042?type=movie&config="+f.alias)
	if !bytes.Equal(shared.Body.Bytes(), alias.Body.Bytes()) {
		t.Error("a shared profile's id render differs from its alias render")
	}
}

func TestTheInstanceDefaultProfileNeverGetsTheWatchedBar(t *testing.T) {
	f := newTraktFixture(t, func(c *config.Config) { c.DefaultProfile = "ownerprofile1" })
	if rr := f.get(t, "/poster/tt0000042?type=movie"); rr.Code != http.StatusOK {
		t.Fatalf("render: %d", rr.Code)
	}
	if rr := f.get(t, "/poster/tt0000042?type=movie&config="+f.id); rr.Code != http.StatusOK {
		t.Fatalf("render: %d", rr.Code)
	}
	if f.trakt.total() != 0 {
		t.Errorf("the instance default reached Trakt %d times", f.trakt.total())
	}
}

func TestTheProgressStepParameterIsOnlyACacheBuster(t *testing.T) {
	f := newTraktFixture(t, nil)
	low := f.get(t, "/poster/tt0000042?type=movie&wp=10&config="+f.id)
	high := f.get(t, "/poster/tt0000042?type=movie&wp=90&config="+f.id)
	none := f.get(t, "/poster/tt0000042?type=movie&config="+f.id)
	if !bytes.Equal(low.Body.Bytes(), high.Body.Bytes()) || !bytes.Equal(low.Body.Bytes(), none.Body.Bytes()) {
		t.Error("the drawn bar followed the wp parameter rather than Trakt")
	}
	if low.Header().Get("X-Cache-Key") != high.Header().Get("X-Cache-Key") {
		t.Error("the wp parameter moved the render cache key")
	}
	forged := f.get(t, "/poster/tt0000042?type=movie&wp=90&config="+f.alias)
	plain := f.get(t, "/poster/tt0000042?type=movie&config="+f.alias)
	if !bytes.Equal(forged.Body.Bytes(), plain.Body.Bytes()) {
		t.Error("a wp parameter on an alias link drew something")
	}
}

func TestAMovieWithNoProgressAndASeriesGetNoBar(t *testing.T) {
	f := newTraktFixture(t, nil)
	for _, path := range []string{
		"/poster/tt0000999?type=movie&config=",
		"/poster/tt0000042?type=series&config=",
	} {
		owner := f.get(t, path+f.id)
		alias := f.get(t, path+f.alias)
		if owner.Header().Get("X-Cache-Key") != alias.Header().Get("X-Cache-Key") {
			t.Errorf("%s: a poster with nothing to draw left the shared key", path)
		}
		if strings.HasPrefix(owner.Header().Get("Cache-Control"), "private") {
			t.Errorf("%s: a bar-free poster was marked private", path)
		}
	}
}

func TestATraktFailureRendersThePosterWithoutABar(t *testing.T) {
	f := newTraktFixture(t, nil)
	f.trakt.mu.Lock()
	f.trakt.fail = true
	f.trakt.mu.Unlock()
	owner := f.get(t, "/poster/tt0000042?type=movie&config="+f.id)
	alias := f.get(t, "/poster/tt0000042?type=movie&config="+f.alias)
	if owner.Code != http.StatusOK {
		t.Fatalf("render during a Trakt outage: %d", owner.Code)
	}
	if owner.Header().Get("X-Cache-Key") != alias.Header().Get("X-Cache-Key") || !bytes.Equal(owner.Body.Bytes(), alias.Body.Bytes()) {
		t.Error("a Trakt failure drew something on the owner's poster")
	}
}

func TestWatchedKeyPartSeparatesOwnersAndPercents(t *testing.T) {
	if watchedKeyPart("a", 0) != "" {
		t.Error("no percent produced a key term")
	}
	if watchedKeyPart("a", 40) == watchedKeyPart("b", 40) || watchedKeyPart("a", 40) == watchedKeyPart("a", 41) {
		t.Error("the key term does not separate owners and percents")
	}
	if strings.Contains(watchedKeyPart("ownerprofile1", 40), "ownerprofile1") {
		t.Error("the key term carries the profile id in the clear")
	}
}

func stremioPosterURL(t *testing.T, f *traktFixture, path string) (string, string) {
	t.Helper()
	prev := stremioCinemetaBase
	stremioCinemetaBase = "http://127.0.0.1:1"
	t.Cleanup(func() { stremioCinemetaBase = prev })
	rr := f.get(t, path)
	if rr.Code != http.StatusOK {
		t.Fatalf("%s: %d %s", path, rr.Code, rr.Body.String())
	}
	var body struct {
		Meta struct {
			Poster     string `json:"poster"`
			Background string `json:"background"`
		} `json:"meta"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body.Meta.Poster, body.Meta.Background
}

func TestStremioPosterURLsMoveInTenPercentStepsForTheOwnerOnly(t *testing.T) {
	f := newTraktFixture(t, nil)
	poster, backdrop := stremioPosterURL(t, f, "/stremio/c/"+f.id+"/meta/movie/tt0000042.json")
	if !strings.Contains(poster, "wp=40") {
		t.Errorf("the owner's poster URL %q carries no wp=40", poster)
	}
	if strings.Contains(backdrop, "wp=") {
		t.Errorf("the backdrop URL carries a progress step: %q", backdrop)
	}
	if poster, _ := stremioPosterURL(t, f, "/stremio/c/"+f.id+"/meta/movie/tt0000100.json"); !strings.Contains(poster, "wp=100") {
		t.Errorf("a watched movie's poster URL %q carries no wp=100", poster)
	}
	for _, path := range []string{
		"/stremio/c/" + f.alias + "/meta/movie/tt0000042.json",
		"/stremio/c/" + f.id + "/meta/series/tt0000042.json",
		"/stremio/c/" + f.id + "/meta/movie/tt0000999.json",
		"/stremio/meta/movie/tt0000042.json",
	} {
		if poster, _ := stremioPosterURL(t, f, path); strings.Contains(poster, "wp=") {
			t.Errorf("%s: the poster URL %q carries a progress step", path, poster)
		}
	}
}

func traktRequest(f *traktFixture, method, path, password string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	if password != "" {
		req.Header.Set("X-Profile-Password", password)
	}
	rr := httptest.NewRecorder()
	f.h.ServeHTTP(rr, req)
	return rr
}

func TestLinkingTraktThroughTheDeviceFlow(t *testing.T) {
	f := newTraktFixture(t, nil)
	if err := f.store.SetTraktAuth(f.id, nil); err != nil {
		t.Fatal(err)
	}
	base := "/profile/" + f.id + "/trakt"
	if rr := traktRequest(f, http.MethodGet, base, ""); rr.Code != http.StatusUnauthorized {
		t.Fatalf("status without the password: %d, want 401", rr.Code)
	}
	rr := traktRequest(f, http.MethodGet, base, "pw")
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"available":true`) || !strings.Contains(rr.Body.String(), `"linked":false`) {
		t.Fatalf("status: %d %s", rr.Code, rr.Body.String())
	}
	if rr := traktRequest(f, http.MethodPost, base+"-link", ""); rr.Code != http.StatusUnauthorized {
		t.Fatalf("link without the password: %d, want 401", rr.Code)
	}
	rr = traktRequest(f, http.MethodPost, base+"-link", "pw")
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), "WXYZ9876") {
		t.Fatalf("link: %d %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), `"dev"`) {
		t.Error("the device code was handed to the browser")
	}
	rr = traktRequest(f, http.MethodPost, base+"-poll", "pw")
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"linked"`) {
		t.Fatalf("poll: %d %s", rr.Code, rr.Body.String())
	}
	if rr := traktRequest(f, http.MethodGet, base, "pw"); !strings.Contains(rr.Body.String(), `"linked":true`) {
		t.Fatalf("status after linking: %s", rr.Body.String())
	}
	for _, s := range []string{"linked-access", "linked-refresh"} {
		if strings.Contains(rr.Body.String(), s) {
			t.Errorf("a token reached the browser: %s", rr.Body.String())
		}
	}
	if rr := f.get(t, "/poster/tt0000042?type=movie&config="+f.id); !strings.HasPrefix(rr.Header().Get("Cache-Control"), "private") {
		t.Error("a freshly linked profile drew no bar")
	}

	rr = traktRequest(f, http.MethodDelete, base, "pw")
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"linked":false`) {
		t.Fatalf("unlink: %d %s", rr.Code, rr.Body.String())
	}
	if f.trakt.count("/oauth/revoke") != 1 {
		t.Error("unlinking did not revoke the token")
	}
	if a, _ := f.store.TraktAuth(f.id); a != nil {
		t.Errorf("the link survived unlinking: %+v", a)
	}
}

func TestTraktLinkingNeedsAPasswordAndAClientID(t *testing.T) {
	f := newTraktFixture(t, func(c *config.Config) { c.TraktClientID = "" })
	rr := traktRequest(f, http.MethodPost, "/profile/"+f.id+"/trakt-link", "pw")
	if rr.Code != http.StatusServiceUnavailable || !strings.Contains(rr.Body.String(), "trakt_unavailable") {
		t.Errorf("link with no client id: %d %s", rr.Code, rr.Body.String())
	}
	if rr := traktRequest(f, http.MethodGet, "/profile/"+f.id+"/trakt", "pw"); !strings.Contains(rr.Body.String(), `"available":false`) {
		t.Errorf("status with no client id: %s", rr.Body.String())
	}

	open := &profile.Profile{ID: "openprofile1", Type: "poster", Config: json.RawMessage(`{}`)}
	if err := f.store.Save(open); err != nil {
		t.Fatal(err)
	}
	rr = traktRequest(f, http.MethodPost, "/profile/"+open.ID+"/trakt-link", "")
	if rr.Code != http.StatusConflict || !strings.Contains(rr.Body.String(), "password_required") {
		t.Errorf("link on a passwordless profile: %d %s", rr.Code, rr.Body.String())
	}
}

func TestDeletingAProfileRevokesItsTraktLink(t *testing.T) {
	for _, tc := range []struct {
		name       string
		revokeFail bool
	}{
		{"revoke succeeds", false},
		{"revoke fails", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var buf bytes.Buffer
			prev := slog.Default()
			slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})))
			t.Cleanup(func() { slog.SetDefault(prev) })

			f := newTraktFixture(t, nil)
			f.trakt.mu.Lock()
			f.trakt.revokeFail = tc.revokeFail
			f.trakt.mu.Unlock()

			rr := traktRequest(f, http.MethodDelete, "/profile/"+f.id, "pw")
			if rr.Code != http.StatusNoContent {
				t.Fatalf("delete: %d %s", rr.Code, rr.Body.String())
			}
			if f.trakt.count("/oauth/revoke") != 1 {
				t.Errorf("deleting revoked the token %d times, want 1", f.trakt.count("/oauth/revoke"))
			}
			if _, err := f.store.Get(f.id); err == nil {
				t.Error("the profile survived the delete")
			}
			out := buf.String()
			for _, secret := range []string{"owner-access", "owner-refresh"} {
				if strings.Contains(out, secret) {
					t.Errorf("a Trakt token reached the log: %s", out)
				}
			}
			warned := strings.Contains(out, `"level":"WARN"`) && strings.Contains(out, "Could not revoke a Trakt token") && strings.Contains(out, f.id)
			if tc.revokeFail && !warned {
				t.Errorf("a failed revoke was not logged at warn with the profile id; log was: %s", out)
			}
		})
	}
}

func TestDeletingAProfileWithoutTraktLinkSkipsTrakt(t *testing.T) {
	f := newTraktFixture(t, nil)
	if err := f.store.SetTraktAuth(f.id, nil); err != nil {
		t.Fatal(err)
	}
	if rr := traktRequest(f, http.MethodDelete, "/profile/"+f.id, "pw"); rr.Code != http.StatusNoContent {
		t.Fatalf("delete: %d %s", rr.Code, rr.Body.String())
	}
	if f.trakt.total() != 0 {
		t.Errorf("deleting an unlinked profile reached Trakt %d times", f.trakt.total())
	}
}

func TestAWrongPasswordDeleteLeavesTheTraktLink(t *testing.T) {
	f := newTraktFixture(t, nil)
	if rr := traktRequest(f, http.MethodDelete, "/profile/"+f.id, "wrong"); rr.Code == http.StatusNoContent {
		t.Fatalf("delete with the wrong password succeeded")
	}
	if f.trakt.count("/oauth/revoke") != 0 {
		t.Error("a refused delete revoked the Trakt token")
	}
	if a, _ := f.store.TraktAuth(f.id); !a.Linked() {
		t.Error("a refused delete dropped the Trakt link")
	}
}
