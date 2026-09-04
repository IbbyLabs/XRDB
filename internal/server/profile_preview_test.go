package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"xrdb_rewrite/internal/config"
	"xrdb_rewrite/internal/profile"
)

func updateProfileBody(t *testing.T, h http.Handler, id, body string) profile.Profile {
	t.Helper()
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodPut, "/profile/"+id, strings.NewReader(body)))
	if rr.Code != http.StatusOK {
		t.Fatalf("PUT /profile/%s: expected 200, got %d: %s", id, rr.Code, rr.Body.String())
	}
	var out profile.Profile
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode update response: %v", err)
	}
	return out
}

// FR-208. The configurator autosaves the config on every change and those
// requests do not mention the preview, so an update that omits it has to keep
// what is stored. Without this the title would survive exactly until the next
// keystroke.
func TestAnUpdateOmittingThePreviewKeepsIt(t *testing.T) {
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	create := `{"id":"pv1","type":"poster","config":{"v":1},"preview":{"mediaType":"poster","id":"tt2560140","title":"Attack on Titan (2013)"}}`
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/profile", strings.NewReader(create)))

	got := updateProfileBody(t, h, "pv1", `{"name":"Updated","config":{"v":2}}`)
	if got.Preview == nil {
		t.Fatal("an update that did not mention the preview cleared it")
	}
	if got.Preview.Title != "Attack on Titan (2013)" || got.Preview.ID != "tt2560140" {
		t.Errorf("preview %+v, want the stored one", *got.Preview)
	}
}

// A named preview replaces the stored one, or the feature cannot be changed
// once set.
func TestAnUpdateNamingAPreviewReplacesIt(t *testing.T) {
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	create := `{"id":"pv2","type":"poster","config":{"v":1},"preview":{"mediaType":"poster","id":"tt1","title":"First"}}`
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/profile", strings.NewReader(create)))

	got := updateProfileBody(t, h, "pv2",
		`{"config":{"v":2},"preview":{"mediaType":"backdrop","id":"tt2","title":"Second"}}`)
	if got.Preview == nil || got.Preview.Title != "Second" || got.Preview.MediaType != "backdrop" {
		t.Errorf("preview %v, want the one just sent", got.Preview)
	}
}

// An empty object clears it, so someone can go back to the built-in default.
func TestAnUpdateSendingAnEmptyPreviewClearsIt(t *testing.T) {
	h := NewHandler("test", openTestStore(t), nil, nil, nil, config.Config{})
	create := `{"id":"pv3","type":"poster","config":{"v":1},"preview":{"mediaType":"poster","id":"tt1","title":"First"}}`
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/profile", strings.NewReader(create)))

	if got := updateProfileBody(t, h, "pv3", `{"config":{"v":2},"preview":{}}`); got.Preview != nil {
		t.Errorf("preview %+v, want nil after an explicit clear", *got.Preview)
	}
}
