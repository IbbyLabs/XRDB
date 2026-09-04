package provider

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

// altHosts stands up both MDBList hosts. primary decides what the first one
// does; the second always answers with a rating so a reached fallback is
// visible in the result rather than only in a counter.
func altHosts(t *testing.T, primary http.HandlerFunc) (*MDBList, *int32) {
	t.Helper()
	var altCalls int32

	first := httptest.NewServer(primary)
	t.Cleanup(first.Close)

	second := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&altCalls, 1)
		if r.URL.Query().Get("i") == "" {
			t.Error("the alternate host was called without an imdb id")
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"response": true,
			"ratings": []map[string]any{
				{"source": "tomatoesaudience", "value": 85, "score": 85},
			},
		})
	}))
	t.Cleanup(second.Close)

	m := &MDBList{
		keys:       newKeyRing("k"),
		baseURL:    first.URL,
		altBaseURL: second.URL,
		httpClient: first.Client(),
	}
	return m, &altCalls
}

func alternateRating(t *testing.T, meta *MediaMeta) {
	t.Helper()
	if meta == nil {
		t.Fatal("the fallback returned no metadata")
	}
	for _, r := range meta.Ratings {
		if r.Source == "rtaudience" {
			return
		}
	}
	t.Fatalf("the fallback's ratings were %v, want an rtaudience among them", meta.Ratings)
}

// The control: a first host that answers is the whole of the request. A
// fallback that fires anyway would double every render's cost against the one
// source metered by the day.
func TestTheAlternateHostIsNotAskedWhenTheFirstAnswers(t *testing.T) {
	m, calls := altHosts(t, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ratings": []map[string]any{{"source": "imdb", "value": 8.1, "score": 81}},
		})
	})
	meta, err := m.Fetch(context.Background(), "movie", "tt0133093")
	if err != nil {
		t.Fatalf("Fetch() = %v, want the first host's answer", err)
	}
	if len(meta.Ratings) == 0 {
		t.Fatal("the first host's answer carried no ratings")
	}
	if n := atomic.LoadInt32(calls); n != 0 {
		t.Errorf("the alternate host was called %d times while the first was answering", n)
	}
}

// A first host that cannot be reached is what the fallback exists for, and it
// is what MDBList's own api subdomain did while the other one served fine.
func TestAnUnreachableFirstHostFallsBack(t *testing.T) {
	m, calls := altHosts(t, func(w http.ResponseWriter, _ *http.Request) {
		// Closing without a response is a transport failure, not a status.
		hj, ok := w.(http.Hijacker)
		if !ok {
			t.Fatal("the test server cannot simulate a dropped connection")
		}
		conn, _, err := hj.Hijack()
		if err != nil {
			t.Fatalf("cannot hijack: %v", err)
		}
		_ = conn.Close()
	})
	meta, err := m.Fetch(context.Background(), "movie", "tt0133093")
	if err != nil {
		t.Fatalf("Fetch() = %v, want the alternate host's answer", err)
	}
	alternateRating(t, meta)
	if n := atomic.LoadInt32(calls); n != 1 {
		t.Errorf("the alternate host was called %d times, want 1", n)
	}
}

func TestAFailingFirstHostFallsBack(t *testing.T) {
	m, calls := altHosts(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	})
	meta, err := m.Fetch(context.Background(), "movie", "tt0133093")
	if err != nil {
		t.Fatalf("Fetch() = %v, want the alternate host's answer", err)
	}
	alternateRating(t, meta)
	if n := atomic.LoadInt32(calls); n != 1 {
		t.Errorf("the alternate host was called %d times, want 1", n)
	}
}

// Both hosts meter the same key, so a refusal is not a reason to ask again. 503
// is how MDBList refuses, which is why it is not treated as the host failing.
func TestARefusedKeyIsNotRetriedOnTheAlternateHost(t *testing.T) {
	m, calls := altHosts(t, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("X-RateLimit-Remaining", "0")
		w.WriteHeader(http.StatusServiceUnavailable)
	})
	_, err := m.Fetch(context.Background(), "movie", "tt0133093")
	var limit *RateLimitError
	if !errors.As(err, &limit) {
		t.Fatalf("Fetch() = %v, want a rate-limit error", err)
	}
	if n := atomic.LoadInt32(calls); n != 0 {
		t.Errorf("a refusal asked the alternate host %d times, want 0", n)
	}
}

func TestAnUnauthorizedKeyIsNotRetriedOnTheAlternateHost(t *testing.T) {
	m, calls := altHosts(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	})
	if _, err := m.Fetch(context.Background(), "movie", "tt0133093"); err == nil {
		t.Fatal("an unauthorized key returned no error")
	}
	if n := atomic.LoadInt32(calls); n != 0 {
		t.Errorf("an unauthorized key asked the alternate host %d times, want 0", n)
	}
}

// The alternate host reports a title it does not hold with a 200 whose body
// says otherwise. Read as a status alone it is a successful empty answer, which
// would cache an absence as a fact.
func TestTheAlternateHostsMissingTitleIsNotAnEmptyAnswer(t *testing.T) {
	first := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	t.Cleanup(first.Close)
	second := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"response": false, "error": "Not Found"})
	}))
	t.Cleanup(second.Close)

	m := &MDBList{
		keys: newKeyRing("k"), baseURL: first.URL,
		altBaseURL: second.URL, httpClient: first.Client(),
	}
	meta, err := m.Fetch(context.Background(), "movie", "tt0133093")
	if err == nil {
		t.Fatalf("Fetch() returned %v and no error, want the first host's failure", meta)
	}
	if meta != nil && len(meta.Ratings) > 0 {
		t.Errorf("a not-found body produced ratings: %v", meta.Ratings)
	}
}

// The two hosts spell the Rotten Tomatoes audience source differently. Missing
// the second spelling drops the badge with no error anywhere.
func TestTheAlternateHostsAudienceSpellingIsKept(t *testing.T) {
	if got := normalizeMDBSource("tomatoesaudience"); got != "rtaudience" {
		t.Errorf("normalizeMDBSource(\"tomatoesaudience\") = %q, want rtaudience", got)
	}
	if got := normalizeMDBSource("popcorn"); got != "rtaudience" {
		t.Errorf("normalizeMDBSource(\"popcorn\") = %q, want rtaudience", got)
	}
}
