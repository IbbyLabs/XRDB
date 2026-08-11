package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// A cache hit and a fresh render are one line apart in the log, and only
// latency distinguished them — a guess at a threshold rather than a fact.
func TestTheRequestLogSaysWhereTheAnswerCameFrom(t *testing.T) {
	h := renderingHandler(t)
	const url = "/poster/tt0816692"

	first := httptest.NewRecorder()
	h.ServeHTTP(first, httptest.NewRequest(http.MethodGet, url, nil))
	if first.Code != http.StatusOK {
		t.Fatalf("first render: %d", first.Code)
	}
	if got := first.Header().Get("X-Render-Source"); got != "miss" {
		t.Errorf("a fresh render reported X-Render-Source %q, want miss", got)
	}

	second := httptest.NewRecorder()
	h.ServeHTTP(second, httptest.NewRequest(http.MethodGet, url, nil))
	if got := second.Header().Get("X-Render-Source"); got != "hit" {
		t.Errorf("a cached render reported X-Render-Source %q, want hit", got)
	}
}
