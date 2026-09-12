package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// FR-210's recorder counts what it wrote and what it dropped, and a reading of
// its file has to state both before any number from it. They live beside the
// health numbers, which is where anyone checking a source already looks.
func TestTheSourcesSurfaceCarriesTheRecorderCounts(t *testing.T) {
	h, _ := capHandler(t, 100)

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/admin/sources", nil)
	req.Header.Set("Authorization", "Bearer test-admin-key")
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("sources returned %d, want 200: %s", rr.Code, rr.Body.String())
	}

	var body struct {
		ScoreMovement *struct {
			Written *int64 `json:"written"`
			Dropped *int64 `json:"dropped"`
		} `json:"scoreMovement"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.ScoreMovement == nil || body.ScoreMovement.Written == nil || body.ScoreMovement.Dropped == nil {
		t.Fatalf("the sources surface carries no recorder counts: %s", rr.Body.String())
	}
}
