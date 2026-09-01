package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"xrdb_rewrite/internal/config"
)

// XRDB_DEFAULT_PROFILE is set on instances that may have no profile store at
// all. Resolving it at startup must not reach a nil store.
func TestDefaultProfileWithNoStoreDoesNotPanic(t *testing.T) {
	h := NewHandler("test", nil, nil, nil, nil, config.Config{DefaultProfile: "house"})

	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rr.Code != http.StatusOK {
		t.Errorf("healthz = %d, want 200", rr.Code)
	}
}

// The instance default is capped by address. A profile key would hold every
// request to the instance in one bucket.
func TestDefaultProfileIsTreatedAsShared(t *testing.T) {
	cfg := config.Config{DefaultProfile: "House-Look", SharedProfileAliases: []string{"public"}}
	aliases := sharedAliasSet(cfg)

	for _, name := range []string{"house-look", "public"} {
		if !aliases[name] {
			t.Errorf("%q is not held as a shared alias", name)
		}
	}
	if aliases[strings.ToLower("private")] {
		t.Error("an unrelated profile is held as shared")
	}
}
