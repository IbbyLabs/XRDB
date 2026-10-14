package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/provider"
)

type fakeLinker struct {
	enabled bool
	started int
}

func (f *fakeLinker) V2Enabled() bool { return f.enabled }
func (f *fakeLinker) StartLink(context.Context) (provider.SIMKLLinkStart, error) {
	f.started++
	return provider.SIMKLLinkStart{UserCode: "AB12", VerificationURI: "https://simkl.com/pin", ExpiresIn: 900}, nil
}
func (f *fakeLinker) LinkStatus() provider.SIMKLLinkStatus {
	return provider.SIMKLLinkStatus{Linked: true}
}

func TestSIMKLLinkRoute(t *testing.T) {
	mux := http.NewServeMux()
	registerSIMKLLinkRoute(mux, config.Config{AdminKey: "adm"})
	do := func(method, key string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "/api/admin/simkl/link", nil)
		if key != "" {
			req.Header.Set("Authorization", "Bearer "+key)
		}
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		return rec
	}
	f := &fakeLinker{enabled: true}
	SetSIMKLLinker(f)
	t.Cleanup(func() { SetSIMKLLinker(&fakeLinker{}) })

	if c := do(http.MethodPost, "wrong").Code; c != http.StatusUnauthorized {
		t.Errorf("wrong key = %d", c)
	}
	rec := do(http.MethodPost, "adm")
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"user_code":"AB12"`) || f.started != 1 {
		t.Errorf("post = %d %s", rec.Code, rec.Body)
	}
	if rec := do(http.MethodGet, "adm"); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"linked":true`) {
		t.Errorf("get = %d %s", rec.Code, rec.Body)
	}
	if c := do(http.MethodDelete, "adm").Code; c != http.StatusMethodNotAllowed {
		t.Errorf("delete = %d", c)
	}
	f.enabled = false
	if c := do(http.MethodPost, "adm").Code; c != http.StatusConflict {
		t.Errorf("unconfigured = %d", c)
	}
}
