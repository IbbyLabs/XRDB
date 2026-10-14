package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

const (
	testV2ID     = "v2-client-id-aaaaaaaaaaaa"
	testV2Secret = "super-secret-value-zzz"
)

type syncBuf struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuf) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.Write(p)
}

func (s *syncBuf) String() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.String()
}

func writeTokenFile(t *testing.T, dir string, tok simklToken) {
	t.Helper()
	data, _ := json.Marshal(tok)
	if err := os.WriteFile(filepath.Join(dir, simklTokenFile), data, 0o600); err != nil {
		t.Fatal(err)
	}
}

func v2Provider(t *testing.T, srv *httptest.Server, dir string, buf *syncBuf) *SIMKL {
	t.Helper()
	return v2ProviderWithV1(t, srv, dir, buf, "v1-id")
}

func v2ProviderWithV1(t *testing.T, srv *httptest.Server, dir string, buf *syncBuf, v1 string) *SIMKL {
	t.Helper()
	s := NewSIMKL(v1)
	s.baseURL = srv.URL
	s.httpClient = srv.Client()
	s.ConfigureV2(testV2ID, testV2Secret, dir, slog.New(slog.NewJSONHandler(buf, nil)))
	s.auth.pollUnit = time.Millisecond
	return s
}

const simklBody = `{"title":"T","year":2000}`

func TestSIMKLBearerAttached(t *testing.T) {
	var gotAuth, gotClient, gotUA string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth, gotClient, gotUA = r.Header.Get("Authorization"), r.URL.Query().Get("client_id"), r.Header.Get("User-Agent")
		_, _ = w.Write([]byte(simklBody))
	}))
	defer srv.Close()
	dir := t.TempDir()
	writeTokenFile(t, dir, simklToken{ClientID: testV2ID, Access: "acc1", Refresh: "ref1", ExpiresAt: time.Now().Add(72 * time.Hour)})
	s := v2Provider(t, srv, dir, &syncBuf{})
	if _, err := s.fetchSegment(context.Background(), "movies", "1", "x"); err != nil {
		t.Fatal(err)
	}
	if gotAuth != "Bearer acc1" || gotClient != testV2ID || !strings.HasPrefix(gotUA, "XRDB/") {
		t.Fatalf("auth=%q client=%q ua=%q", gotAuth, gotClient, gotUA)
	}
}

func TestSIMKLV1PathUnchanged(t *testing.T) {
	cases := []struct {
		name string
		ctx  context.Context
		v2   bool
		want string
	}{
		{"no v2 configured", context.Background(), false, "v1-id"},
		{"v2 with an owner key", WithKeys(context.Background(), map[string]string{KeySIMKL: "owner-key"}), true, "owner-key"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var gotAuth, gotClient string
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotAuth, gotClient = r.Header.Get("Authorization"), r.URL.Query().Get("client_id")
				_, _ = w.Write([]byte(simklBody))
			}))
			defer srv.Close()
			s := NewSIMKL("v1-id")
			s.baseURL, s.httpClient = srv.URL, srv.Client()
			if tc.v2 {
				s = v2Provider(t, srv, t.TempDir(), &syncBuf{})
			}
			if _, err := s.fetchSegment(tc.ctx, "movies", "1", "x"); err != nil {
				t.Fatal(err)
			}
			if gotAuth != "" || gotClient != tc.want {
				t.Fatalf("auth=%q client=%q, want no bearer and %q", gotAuth, gotClient, tc.want)
			}
		})
	}
}

func TestSIMKLOwnerKeyEqualToV2IDGetsBearer(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		_, _ = w.Write([]byte(simklBody))
	}))
	defer srv.Close()
	dir := t.TempDir()
	writeTokenFile(t, dir, simklToken{ClientID: testV2ID, Access: "acc1", Refresh: "r", ExpiresAt: time.Now().Add(72 * time.Hour)})
	s := v2Provider(t, srv, dir, &syncBuf{})
	ctx := WithKeys(context.Background(), map[string]string{KeySIMKL: testV2ID})
	if _, err := s.fetchSegment(ctx, "movies", "1", "x"); err != nil {
		t.Fatal(err)
	}
	if gotAuth != "Bearer acc1" {
		t.Fatalf("auth=%q", gotAuth)
	}
}

// refreshServer answers token requests and counts them. Data requests succeed
// only with the bearer in okToken.
type refreshServer struct {
	*httptest.Server
	refreshes atomic.Int32
	dataCalls atomic.Int32
	okToken   atomic.Value
	delay     time.Duration
	fail      atomic.Bool
	keepOK    bool
}

func newRefreshServer(t *testing.T, ok string) *refreshServer {
	rs := &refreshServer{}
	rs.okToken.Store(ok)
	rs.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/oauth2/token" {
			rs.refreshes.Add(1)
			time.Sleep(rs.delay)
			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			if rs.fail.Load() || body["grant_type"] != "refresh_token" || body["refresh_token"] != "ref1" ||
				body["client_secret"] != testV2Secret || body["client_id"] != testV2ID {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
				return
			}
			if !rs.keepOK {
				rs.okToken.Store("acc2")
			}
			_, _ = w.Write([]byte(`{"access_token":"acc2","refresh_token":"ref2","expires_in":604800}`))
			return
		}
		rs.dataCalls.Add(1)
		if r.Header.Get("Authorization") != "Bearer "+rs.okToken.Load().(string) {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"user_token_required"}`))
			return
		}
		_, _ = w.Write([]byte(simklBody))
	}))
	t.Cleanup(rs.Close)
	return rs
}

func TestSIMKL401RefreshesOnceAndRetries(t *testing.T) {
	rs := newRefreshServer(t, "acc2")
	dir := t.TempDir()
	writeTokenFile(t, dir, simklToken{ClientID: testV2ID, Access: "acc1", Refresh: "ref1", ExpiresAt: time.Now().Add(72 * time.Hour)})
	s := v2Provider(t, rs.Server, dir, &syncBuf{})
	if _, err := s.fetchSegment(context.Background(), "movies", "1", "x"); err != nil {
		t.Fatal(err)
	}
	if rs.refreshes.Load() != 1 || rs.dataCalls.Load() != 2 {
		t.Fatalf("refreshes=%d data=%d, want 1 and 2", rs.refreshes.Load(), rs.dataCalls.Load())
	}
	var saved simklToken
	data, _ := os.ReadFile(filepath.Join(dir, simklTokenFile))
	_ = json.Unmarshal(data, &saved)
	if saved.Access != "acc2" || saved.Refresh != "ref2" {
		t.Fatalf("rotated pair was not saved: %+v", saved)
	}
}

func TestSIMKLStillUnauthorizedAfterRefreshIsNotLooped(t *testing.T) {
	rs := newRefreshServer(t, "never")
	rs.keepOK = true
	dir := t.TempDir()
	writeTokenFile(t, dir, simklToken{ClientID: testV2ID, Access: "acc1", Refresh: "ref1", ExpiresAt: time.Now().Add(72 * time.Hour)})
	s := v2Provider(t, rs.Server, dir, &syncBuf{})
	if _, err := s.fetchSegment(context.Background(), "movies", "1", "x"); err == nil {
		t.Fatal("want an error")
	}
	if rs.refreshes.Load() != 1 || rs.dataCalls.Load() != 2 {
		t.Fatalf("refreshes=%d data=%d, want 1 and 2", rs.refreshes.Load(), rs.dataCalls.Load())
	}
}

func TestSIMKLConcurrentRefreshIsSingleFlight(t *testing.T) {
	rs := newRefreshServer(t, "acc2")
	rs.delay = 100 * time.Millisecond
	dir := t.TempDir()
	// Inside the refresh window, so every caller wants a refresh first.
	writeTokenFile(t, dir, simklToken{ClientID: testV2ID, Access: "acc1", Refresh: "ref1", ExpiresAt: time.Now().Add(time.Hour)})
	s := v2Provider(t, rs.Server, dir, &syncBuf{})
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.fetchSegment(context.Background(), "movies", "1", "x"); err != nil {
				t.Errorf("fetch: %v", err)
			}
		}()
	}
	wg.Wait()
	if n := rs.refreshes.Load(); n != 1 {
		t.Fatalf("refresh calls = %d, want 1", n)
	}
}

func TestSIMKLRelinkWarningLoggedOnce(t *testing.T) {
	rs := newRefreshServer(t, "acc2")
	rs.fail.Store(true)
	dir := t.TempDir()
	writeTokenFile(t, dir, simklToken{ClientID: testV2ID, Access: "acc1", Refresh: "ref1", ExpiresAt: time.Now().Add(72 * time.Hour)})
	buf := &syncBuf{}
	s := v2ProviderWithV1(t, rs.Server, dir, buf, "")
	for i := 0; i < 5; i++ {
		_, err := s.fetchSegment(context.Background(), "movies", "1", "x")
		if !errors.Is(err, ErrNotApplicable) && i > 0 {
			t.Fatalf("call %d: err=%v, want a quiet skip", i, err)
		}
	}
	if n := strings.Count(buf.String(), "Simkl needs relinking"); n != 1 {
		t.Fatalf("warning logged %d times, want 1\n%s", n, buf.String())
	}
	if s.HasCredentials() {
		t.Fatal("a lapsed link must read as no credentials")
	}
	if rs.refreshes.Load() != 1 {
		t.Fatalf("refresh retried %d times after a refused grant", rs.refreshes.Load())
	}
}

func TestSIMKLNotLinkedSkipsQuietly(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { calls.Add(1) }))
	defer srv.Close()
	s := v2ProviderWithV1(t, srv, t.TempDir(), &syncBuf{}, "")
	_, err := s.fetchSegment(context.Background(), "movies", "1", "x")
	if !errors.Is(err, ErrNotApplicable) || calls.Load() != 0 || s.HasCredentials() {
		t.Fatalf("err=%v calls=%d has=%v", err, calls.Load(), s.HasCredentials())
	}
}

func TestSIMKLUnlinkedV2FallsBackToV1(t *testing.T) {
	var gotAuth, gotClient string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth, gotClient = r.Header.Get("Authorization"), r.URL.Query().Get("client_id")
		_, _ = w.Write([]byte(simklBody))
	}))
	defer srv.Close()
	s := v2Provider(t, srv, t.TempDir(), &syncBuf{})
	if _, err := s.fetchSegment(context.Background(), "movies", "1", "x"); err != nil {
		t.Fatal(err)
	}
	if gotAuth != "" || gotClient != "v1-id" || !s.HasCredentials() {
		t.Fatalf("auth=%q client=%q has=%v", gotAuth, gotClient, s.HasCredentials())
	}
}

func TestSIMKLTokenFileModeAndAtomic(t *testing.T) {
	dir := t.TempDir()
	buf := &syncBuf{}
	a := newSIMKLAuth(testV2ID, testV2Secret, dir, slog.New(slog.NewJSONHandler(buf, nil)))
	a.install(simklToken{ClientID: testV2ID, Access: "a", Refresh: "r", ExpiresAt: time.Now().Add(time.Hour)})
	path := filepath.Join(dir, simklTokenFile)
	fi, err := os.Stat(path)
	if err != nil || fi.Mode().Perm() != 0o600 {
		t.Fatalf("stat=%v err=%v, want mode 0600", fi, err)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("temp files left behind: %v", entries)
	}
	if b := newSIMKLAuth(testV2ID, testV2Secret, dir, nil); b.tok.Access != "a" {
		t.Fatal("token did not survive a reload")
	}
	if c := newSIMKLAuth("another-id", testV2Secret, dir, slog.New(slog.NewJSONHandler(&syncBuf{}, nil))); c.tok.Access != "" {
		t.Fatal("a token saved for another client id was loaded")
	}
}

func TestSIMKLDeviceFlowSavesTokensAndNeverLogsSecrets(t *testing.T) {
	var polls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		switch r.URL.Path {
		case "/oauth2/device":
			if body["client_id"] != testV2ID {
				t.Errorf("device client_id = %q", body["client_id"])
			}
			_, _ = w.Write([]byte(`{"device_code":"DEVCODE","user_code":"AB12","verification_uri":"https://simkl.com/pin","expires_in":900,"interval":1}`))
		case "/oauth2/token":
			if body["grant_type"] != simklDeviceGrant || body["device_code"] != "DEVCODE" || body["client_secret"] != testV2Secret {
				t.Errorf("poll body = %v", body)
			}
			switch polls.Add(1) {
			case 1:
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"error":"authorization_pending"}`))
			case 2:
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"error":"slow_down"}`))
			default:
				_, _ = w.Write([]byte(`{"access_token":"ACCESS-SECRET","refresh_token":"REFRESH-SECRET","expires_in":604800}`))
			}
		}
	}))
	defer srv.Close()
	dir := t.TempDir()
	buf := &syncBuf{}
	s := v2Provider(t, srv, dir, buf)

	start, err := s.StartLink(context.Background())
	if err != nil || start.UserCode != "AB12" || start.VerificationURI != "https://simkl.com/pin" || start.ExpiresIn != 900 {
		t.Fatalf("start=%+v err=%v", start, err)
	}
	if !s.LinkStatus().Pending {
		t.Fatal("link should be pending")
	}
	if _, err := s.StartLink(context.Background()); err == nil {
		t.Fatal("a second link while one waits should be refused")
	}
	deadline := time.Now().Add(5 * time.Second)
	for !s.LinkStatus().Linked && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	st := s.LinkStatus()
	if !st.Linked || st.ExpiresAt.IsZero() {
		t.Fatalf("status=%+v", st)
	}
	data, _ := os.ReadFile(filepath.Join(dir, simklTokenFile))
	if !strings.Contains(string(data), "ACCESS-SECRET") {
		t.Fatal("tokens were not saved")
	}
	time.Sleep(20 * time.Millisecond)
	logs := buf.String()
	for _, want := range []string{"Started a Simkl link", "Linked Simkl"} {
		if !strings.Contains(logs, want) {
			t.Errorf("missing log %q in %s", want, logs)
		}
	}
	for _, secret := range []string{testV2Secret, "ACCESS-SECRET", "REFRESH-SECRET", "DEVCODE"} {
		if strings.Contains(logs, secret) {
			t.Errorf("logs contain %q", secret)
		}
	}
}

func TestSIMKLDeviceFlowExpiry(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/oauth2/device" {
			_, _ = w.Write([]byte(`{"device_code":"D","user_code":"U","verification_uri":"https://simkl.com/pin","expires_in":900,"interval":1}`))
			return
		}
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"expired_token"}`))
	}))
	defer srv.Close()
	buf := &syncBuf{}
	s := v2Provider(t, srv, t.TempDir(), buf)
	if _, err := s.StartLink(context.Background()); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for !strings.Contains(buf.String(), "Simkl link expired") && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if !strings.Contains(buf.String(), "Simkl link expired") {
		t.Fatalf("no expiry log: %s", buf.String())
	}
	time.Sleep(20 * time.Millisecond)
	if s.LinkStatus().Pending || s.LinkStatus().Linked {
		t.Fatalf("status=%+v", s.LinkStatus())
	}
}

func TestSIMKLRefreshFailureLogsNoSecrets(t *testing.T) {
	rs := newRefreshServer(t, "acc2")
	rs.fail.Store(true)
	dir := t.TempDir()
	writeTokenFile(t, dir, simklToken{ClientID: testV2ID, Access: "acc1", Refresh: "ref1", ExpiresAt: time.Now().Add(72 * time.Hour)})
	buf := &syncBuf{}
	s := v2Provider(t, rs.Server, dir, buf)
	_, _ = s.fetchSegment(context.Background(), "movies", "1", "x")
	for _, secret := range []string{testV2Secret, "acc1", "ref1"} {
		if strings.Contains(buf.String(), secret) {
			t.Errorf("logs contain %q: %s", secret, buf.String())
		}
	}
}

func TestOAuthErrorCodeDropsAnythingButACode(t *testing.T) {
	for in, want := range map[string]string{
		"invalid_grant":                "invalid_grant",
		"":                             "unrecognised_error",
		"refresh_token=abc secret=xyz": "unrecognised_error",
		strings.Repeat("a", 41):        "unrecognised_error",
	} {
		if got := oauthErrorCode(in); got != want {
			t.Errorf("oauthErrorCode(%q) = %q, want %q", in, got, want)
		}
	}
}
