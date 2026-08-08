package provider

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// Jikan answers 504 per title: a broken anime id fails in about 130ms while
// other ids answer 200 in the same second. Counting those against the source
// takes it off every poster after five broken ids in a row.
func TestABrokenTitleDoesNotCountAgainstTheSource(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/2001" {
			w.WriteHeader(http.StatusGatewayTimeout)
			_, _ = w.Write([]byte(`{"status":504,"type":"BadResponseException","message":"Jikan failed to connect to MyAnimeList"}`))
			return
		}
		_, _ = w.Write([]byte(`{"data":{"title":"Working","score":8.5,"year":2007}}`))
	}))
	defer srv.Close()

	m := NewMALWithURL(srv.URL + "/")
	h := NewHealthTracker(10, time.Hour)

	for i := range failureBreakerThreshold + 3 {
		_, err := m.Fetch(context.Background(), "series", "mal:2001")
		if !errors.Is(err, ErrUpstreamUnavailable) {
			t.Fatalf("fetch %d: err = %v, want ErrUpstreamUnavailable", i, err)
		}
		if h.Failure("mal", err, CallerInteractive) {
			t.Fatalf("fetch %d reported a cooldown transition", i)
		}
	}
	if h.CoolingOff("mal", CallerInteractive) {
		t.Error("broken titles held the source out of every render")
	}

	// The source is fine, which is the point: another title still answers.
	meta, err := m.Fetch(context.Background(), "series", "mal:9253")
	if err != nil {
		t.Fatalf("a working title failed: %v", err)
	}
	if len(meta.Ratings) == 0 {
		t.Error("a working title returned no rating")
	}
}

// A source that is actually failing must still be held out, so the guard cannot
// pass by ignoring every error.
func TestAnOrdinaryServerErrorStillCountsAgainstTheSource(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	m := NewMALWithURL(srv.URL + "/")
	h := NewHealthTracker(10, time.Hour)
	for range failureBreakerThreshold {
		_, err := m.Fetch(context.Background(), "series", "mal:9253")
		if errors.Is(err, ErrUpstreamUnavailable) {
			t.Fatalf("http 500 was treated as a broken title: %v", err)
		}
		h.Failure("mal", err, CallerInteractive)
	}
	if !h.CoolingOff("mal", CallerInteractive) {
		t.Error("a source returning 500 to everything was not held out")
	}
}
