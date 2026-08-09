package provider

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The reported defect. MediUX answers 200 with an error naming one title, and
// returning it bare made a fact about that title count as the source failing —
// five in a row would hold MediUX out of every render.
func TestAPerTitleMediUXErrorIsNotASourceFailure(t *testing.T) {
	for _, tc := range []struct{ name, code, message string }{
		{"the reported one", "FORBIDDEN", "You don't have permission to access this."},
		{"a not-found", "NOT_FOUND", "Item not found."},
		{"no code at all", "", "something new"},
		{"an unfamiliar code", "SOMETHING_ELSE", "unfamiliar"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := mediuxGraphQLError("550", tc.code, tc.message)
			if !errors.Is(err, errNotFound) {
				t.Errorf("%v does not read as not-found", err)
			}
			if RecordsAgainstHealth(err) {
				t.Errorf("%v counts against MediUX's health", err)
			}
		})
	}
}

// The message has to survive, or an operator reading the log learns nothing.
func TestTheMediUXMessageIsKept(t *testing.T) {
	err := mediuxGraphQLError("550", "FORBIDDEN", "You don't have permission to access this.")
	if got := err.Error(); got == "" || !contains(got, "permission") {
		t.Errorf("got %q, want MediUX's own wording kept", got)
	}
}

func contains(haystack, needle string) bool {
	return len(haystack) >= len(needle) && (haystack == needle ||
		len(haystack) > 0 && indexOf(haystack, needle) >= 0)
}

func indexOf(h, n string) int {
	for i := 0; i+len(n) <= len(h); i++ {
		if h[i:i+len(n)] == n {
			return i
		}
	}
	return -1
}

// Through the real fetch, with MediUX's actual reply for a title it will not
// serve. Recorded from images.mediux.io rather than invented.
func TestForbiddenFromMediUXReachesTheCallerAsNotFound(t *testing.T) {
	const reply = `{"data":{"movies_by_id":null},"errors":[{"message":"You don't have permission to access this.","extensions":{"code":"FORBIDDEN"},"path":["movies_by_id"]}]}`

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(reply))
	}))
	defer srv.Close()

	m := &MediUX{apiKey: "tok", baseURL: srv.URL, httpClient: srv.Client()}
	_, err := m.FetchArtwork(context.Background(), "poster", "22248376", ArtworkOptions{})
	if err == nil {
		t.Fatal("expected an error")
	}
	if !errors.Is(err, errNotFound) {
		t.Errorf("%v does not read as not-found", err)
	}
	if RecordsAgainstHealth(err) {
		t.Errorf("%v counts against MediUX's health", err)
	}
}

// The control: a real fault must still count. A 500 is the source, not the title.
func TestAMediUXFaultStillCounts(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	m := &MediUX{apiKey: "tok", baseURL: srv.URL, httpClient: srv.Client()}
	_, err := m.FetchArtwork(context.Background(), "poster", "550", ArtworkOptions{})
	if err == nil {
		t.Fatal("expected an error")
	}
	if !RecordsAgainstHealth(err) {
		t.Errorf("%v does not count against MediUX's health, but a 500 should", err)
	}
}
