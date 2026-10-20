package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"xrdb_rewrite/internal/config"
)

func fakeAIOM(t *testing.T, hits *atomic.Int32, loadError string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "application/json")
		switch {
		case loadError != "":
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]any{"success": false, "error": loadError})
		case strings.HasPrefix(r.URL.Path, "/api/config/load/"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "config": map[string]any{"language": "en"}})
		case strings.HasPrefix(r.URL.Path, "/api/config/update/"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "installUrl": "https://aiom.example/manifest.json"})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func postAIOMInstall(h http.Handler, base string) *httptest.ResponseRecorder {
	body := `{"baseUrl":"` + base + `","userUUID":"u","password":"p","posterUrlPattern":"https://xrdb.example/poster/{imdb_id}"}`
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/api/aiometadata/install", strings.NewReader(body)))
	return rr
}

func TestAIOMInstallRefusesPrivateAddressesByDefault(t *testing.T) {
	var hits atomic.Int32
	srv := fakeAIOM(t, &hits, "INTERNAL BANNER")
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})

	rr := postAIOMInstall(h, srv.URL)
	if rr.Code != http.StatusBadGateway {
		t.Errorf("status %d, want 502", rr.Code)
	}
	if hits.Load() != 0 {
		t.Errorf("the private address was reached %d times", hits.Load())
	}
	if strings.Contains(rr.Body.String(), "INTERNAL BANNER") {
		t.Errorf("a private service's answer was returned: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "XRDB_AIOM_ALLOW_PRIVATE") {
		t.Errorf("the refusal does not name the setting that lifts it: %s", rr.Body.String())
	}
}

func TestAIOMClientRefusesEveryPrivateDial(t *testing.T) {
	client := newAIOMClient(false)
	for _, target := range []string{"http://127.0.0.1:1/", "http://[::1]:1/", "http://10.0.0.1:1/", "http://169.254.169.254/"} {
		_, err := client.Get(target)
		if !errors.Is(err, errAIOMBlockedAddress) {
			t.Errorf("GET %s: err %v, want the private-address refusal", target, err)
		}
	}
}

func TestAIOMInstallReachesAPrivateInstanceWhenAllowed(t *testing.T) {
	var hits atomic.Int32
	srv := fakeAIOM(t, &hits, "")
	h := NewHandler("test", nil, nil, nil, nil, config.Config{AIOMAllowPrivate: true})

	rr := postAIOMInstall(h, srv.URL)
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), "aiom.example/manifest.json") {
		t.Fatalf("status %d body %s, want 200 with the install URL", rr.Code, rr.Body.String())
	}
	if hits.Load() != 2 {
		t.Errorf("AIOMetadata saw %d requests, want load and update", hits.Load())
	}
}

func TestAIOMUpstreamErrorIsBounded(t *testing.T) {
	if got := upstreamError("", "fallback"); got != "fallback" {
		t.Errorf("empty message gave %q", got)
	}
	if got := upstreamError("bad\npassword\x00", "f"); got != "bad password" {
		t.Errorf("control characters kept: %q", got)
	}
	long := strings.Repeat("x", 500)
	if got := []rune(upstreamError(long, "f")); len(got) != aiomMaxErrorLength+1 {
		t.Errorf("long message is %d runes, want %d", len(got), aiomMaxErrorLength+1)
	}
}
