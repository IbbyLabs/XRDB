package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/profile"
)

// GET /profile lists every stored profile and takes the admin key. It shares a
// mux entry with the POST that creates one, which ordinary users reach, so the
// list needs a check of its own and that check has to fail closed.
func TestProfileListRequiresAdminKeyEvenWithNoAPIKey(t *testing.T) {
	store, err := profile.Open(t.TempDir() + "/profiles.db")
	if err != nil {
		t.Fatalf("profile store: %v", err)
	}

	cases := []struct {
		name    string
		cfg     config.Config
		bearer  string
		wantGet int
	}{
		{"no keys set at all", config.Config{}, "", http.StatusUnauthorized},
		{"admin key set, none presented", config.Config{AdminKey: "sekrit"}, "", http.StatusUnauthorized},
		{"admin key set, wrong one presented", config.Config{AdminKey: "sekrit"}, "nope", http.StatusUnauthorized},
		{"admin key set and presented", config.Config{AdminKey: "sekrit"}, "sekrit", http.StatusOK},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			mux := http.NewServeMux()
			registerProfileRoutes(mux, store, tc.cfg, nil)

			req := httptest.NewRequest(http.MethodGet, "/profile", nil)
			if tc.bearer != "" {
				req.Header.Set("Authorization", "Bearer "+tc.bearer)
			}
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)

			if rec.Code != tc.wantGet {
				t.Errorf("GET /profile = %d, want %d", rec.Code, tc.wantGet)
			}
		})
	}
}

// The create path is what the configurator uses for every ordinary user, so
// closing the list must not close it. This is the control: if it ever returns
// 401 with no keys configured, the fix above has overreached.
func TestProfileCreateStaysOpenWithNoAPIKey(t *testing.T) {
	store, err := profile.Open(t.TempDir() + "/profiles.db")
	if err != nil {
		t.Fatalf("profile store: %v", err)
	}
	mux := http.NewServeMux()
	registerProfileRoutes(mux, store, config.Config{AdminKey: "sekrit"}, nil)

	req := httptest.NewRequest(http.MethodPost, "/profile", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code == http.StatusUnauthorized {
		t.Fatal("creating a profile now needs the admin key; the list fix has closed the user path too")
	}
}
