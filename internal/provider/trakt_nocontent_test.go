package provider

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Trakt answers 204 for a title it holds no rating for. That is an empty
// result, and counting it as a failure took Trakt's rating off every other
// poster until the source recovered.
func TestTraktNoContentIsAnEmptyResultNotAFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	tr := NewTrakt("client-id")
	tr.baseURL = srv.URL
	tr.httpClient = srv.Client()

	_, err := tr.Fetch(context.Background(), "movie", "tt0118615")
	if err == nil {
		t.Fatal("a 204 returned no error at all, so nothing distinguishes it from a rating")
	}
	if !errors.Is(err, errNotFound) {
		t.Errorf("a 204 is reported as %v, which the health tracker counts as a source failure", err)
	}

	h := NewHealthTracker(10, 0)
	if h.Failure("trakt", err) {
		t.Error("a title Trakt has no rating for put the whole source into cooldown")
	}
}
