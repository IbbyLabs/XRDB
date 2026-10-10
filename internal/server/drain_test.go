package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"xrdb_rewrite/internal/config"
)

// Once draining, readiness fails so a balancer moves away, while health and
// every other route still answer.
func TestDrainingFailsReadinessOnly(t *testing.T) {
	t.Cleanup(func() { draining.Store(false) })
	h := NewHandler("test", nil, nil, nil, nil, config.Config{})
	get := func(path string) int {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, path, nil))
		return rr.Code
	}
	if code := get("/readyz"); code != http.StatusOK {
		t.Fatalf("readyz before drain = %d, want 200", code)
	}
	BeginDrain()
	if code := get("/readyz"); code != http.StatusServiceUnavailable {
		t.Errorf("readyz while draining = %d, want 503", code)
	}
	if code := get("/healthz"); code != http.StatusOK {
		t.Errorf("healthz while draining = %d, want 200", code)
	}
}
