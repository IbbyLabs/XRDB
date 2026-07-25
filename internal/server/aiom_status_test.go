package server

import (
	"net/http"
	"testing"
)

// A rejected credential is the caller's error. Returning 502 for it also loses
// the message: Cloudflare replaces a 502 body with its own error page.
func TestUpstreamStatusMapsClientErrors(t *testing.T) {
	for _, tc := range []struct {
		upstream, want int
	}{
		{http.StatusUnauthorized, http.StatusBadRequest},
		{http.StatusForbidden, http.StatusBadRequest},
		{http.StatusNotFound, http.StatusBadRequest},
		{http.StatusInternalServerError, http.StatusBadGateway},
		{http.StatusBadGateway, http.StatusBadGateway},
		{http.StatusServiceUnavailable, http.StatusBadGateway},
	} {
		if got := upstreamStatus(tc.upstream); got != tc.want {
			t.Errorf("upstreamStatus(%d) = %d, want %d", tc.upstream, got, tc.want)
		}
	}
}
