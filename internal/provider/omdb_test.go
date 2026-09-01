package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestOMDBName(t *testing.T) {
	o := NewOMDB("key")
	if o.Name() != "omdb" {
		t.Errorf("Name() = %q, want omdb", o.Name())
	}
}

func TestOMDBNoKey(t *testing.T) {
	o := NewOMDB("")
	_, err := o.Fetch(context.Background(), "movie", "tt0468569")
	if err == nil {
		t.Error("expected error when no API key configured")
	}
}

func TestOMDBNonIMDbID(t *testing.T) {
	o := NewOMDB("key")
	_, err := o.Fetch(context.Background(), "movie", "12345")
	if err == nil {
		t.Error("expected error for non-IMDb ID")
	}
}

func TestOMDBParsesRatings(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"Response": "True",
			"Ratings": []map[string]string{
				{"Source": "Internet Movie Database", "Value": "9.0/10"},
				{"Source": "Rotten Tomatoes", "Value": "85%"},
				{"Source": "Metacritic", "Value": "74/100"},
			},
		})
	}))
	defer srv.Close()

	o := &OMDB{keys: newKeyRing("test"), httpClient: srv.Client(), baseURL: srv.URL + "/"}
	meta, err := o.Fetch(context.Background(), "movie", "tt0468569")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if len(meta.Ratings) != 3 {
		t.Errorf("expected 3 ratings, got %d", len(meta.Ratings))
	}

	// Verify per-source values are correctly parsed and scaled.
	ratingsBySource := make(map[string]float64, len(meta.Ratings))
	for _, r := range meta.Ratings {
		ratingsBySource[r.Source] = r.Value
	}
	if v := ratingsBySource["imdb"]; v < 8.9 || v > 9.1 {
		t.Errorf("imdb rating = %v, want ~9.0", v)
	}
	if v := ratingsBySource["rt"]; v < 8.4 || v > 8.6 {
		t.Errorf("rt rating = %v, want ~8.5", v)
	}
	if v := ratingsBySource["metacritic"]; v < 7.3 || v > 7.5 {
		t.Errorf("metacritic rating = %v, want ~7.4", v)
	}

	// Test parsePercent
	if v := parsePercent("85%"); v < 8.4 || v > 8.6 {
		t.Errorf("parsePercent(85%%) = %v, want ~8.5", v)
	}
	if v := parsePercent("N/A"); v >= 0 {
		t.Errorf("parsePercent(N/A) should return -1, got %v", v)
	}

	// Test parseSlashScore
	if v := parseSlashScore("9.0/10"); v < 8.9 || v > 9.1 {
		t.Errorf("parseSlashScore(9.0/10) = %v, want ~9.0", v)
	}
	if v := parseSlashScore("74/100"); v < 7.3 || v > 7.5 {
		t.Errorf("parseSlashScore(74/100) = %v, want ~7.4", v)
	}
	if v := parseSlashScore("N/A"); v >= 0 {
		t.Errorf("parseSlashScore(N/A) should return -1, got %v", v)
	}
}

func TestOMDBHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	o := &OMDB{keys: newKeyRing("bad"), httpClient: srv.Client(), baseURL: srv.URL + "/"}
	_, err := o.Fetch(context.Background(), "movie", "tt0468569")
	if err == nil {
		t.Error("expected error for HTTP 401 response")
	}
}

func TestOMDBAPIErrorResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"Response": "False",
			"Error":    "Movie not found!",
		})
	}))
	defer srv.Close()

	o := &OMDB{
		keys:       newKeyRing("test"),
		httpClient: srv.Client(),
		baseURL:    srv.URL + "/",
	}
	_, err := o.Fetch(context.Background(), "movie", "tt9999999")
	if err == nil {
		t.Error("expected error for OMDB API error response")
	}
}

func TestOMDBImplementsProvider(t *testing.T) {
	var _ Provider = NewOMDB("key")
}

// The case that took OMDb off unrelated posters, and the one the prefix-rejection
// tests miss entirely: a VALID tt-id, OMDb answers, and the answer carries no
// ratings. That is OMDb reporting on the title, not OMDb being unwell — but it
// reached the health tracker as a failure and opened the breaker (BUG-214).
//
// Reproduced on production against tt41111628, where rendering one title with no
// IMDb score dropped the IMDb badge from every other render.
func TestOMDbAnsweringWithNoRatingsIsNotAHealthFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// A real OMDb reply for a title it knows and has no score for.
		_, _ = fmt.Fprint(w, `{"Response":"True","Title":"The Truthers","imdbRating":"N/A","Ratings":[]}`)
	}))
	defer srv.Close()
	o := &OMDB{keys: newKeyRing("test"), httpClient: srv.Client(), baseURL: srv.URL + "/"}

	_, err := o.Fetch(context.Background(), "movie", "tt41111628")
	if err == nil {
		t.Fatal("expected an error when the reply carries no ratings")
	}
	h := NewHealthTracker(10, time.Hour)
	h.Failure("omdb", err, CallerInteractive)
	for _, s := range h.Snapshot() {
		if s.Source == "omdb" && !s.Healthy {
			t.Errorf("a title with no ratings marked OMDb unhealthy: %v", err)
		}
	}
}

// A rejected key fails every title, so it is the source's own problem and has to
// keep counting. OMDb reports it with HTTP 200 and Response=False, the same shape
// as a title it does not carry, so only the message separates them.
func TestOMDbRejectingTheKeyStillMarksTheSourceUnhealthy(t *testing.T) {
	for _, upstream := range []string{"Invalid API key!", "No API key provided.", "Request limit reached!"} {
		t.Run(upstream, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = fmt.Fprintf(w, `{"Response":"False","Error":%q}`, upstream)
			}))
			defer srv.Close()
			o := &OMDB{keys: newKeyRing("test"), httpClient: srv.Client(), baseURL: srv.URL + "/"}

			_, err := o.Fetch(context.Background(), "movie", "tt0468569")
			if err == nil {
				t.Fatal("expected an error")
			}
			h := NewHealthTracker(10, time.Hour)
			h.Failure("omdb", err, CallerInteractive)
			healthy := true
			for _, s := range h.Snapshot() {
				if s.Source == "omdb" {
					healthy = s.Healthy
				}
			}
			if healthy {
				t.Errorf("a rejected key left OMDb healthy: %v", err)
			}
		})
	}
}

// Any Response=False on a 200 is OMDb answering about the title. The previous
// gate matched two phrasings and missed this one, which production emits: 77
// counted failures in half an hour, each holding OMDb out of unrelated renders.
func TestOMDbRejectingATitleIsNotAHealthFailure(t *testing.T) {
	for _, upstream := range []string{"Incorrect IMDb ID.", "Error getting data. Movie not found!", "Error getting data."} {
		t.Run(upstream, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = fmt.Fprintf(w, `{"Response":"False","Error":%q}`, upstream)
			}))
			defer srv.Close()
			o := &OMDB{keys: newKeyRing("test"), httpClient: srv.Client(), baseURL: srv.URL + "/"}

			_, err := o.Fetch(context.Background(), "movie", "tt0000001")
			if err == nil {
				t.Fatal("expected an error")
			}
			h := NewHealthTracker(10, time.Hour)
			h.Failure("omdb", err, CallerInteractive)
			for _, s := range h.Snapshot() {
				if s.Source == "omdb" && !s.Healthy {
					t.Errorf("OMDb rejecting a title marked the source unhealthy: %v", err)
				}
			}
		})
	}
}

// OMDb is the preferred supplier of the imdb source wherever the local dataset
// is not configured, so a rating it hands over without a count leaves IMDb
// unmeasurable: vote counts render blank and a minimum has nothing to act on.
func TestOMDbCarriesTheIMDbVoteCount(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"Response":  "True",
			"imdbVotes": "3,221,305",
			"Ratings": []map[string]string{
				{"Source": "Internet Movie Database", "Value": "9.3/10"},
			},
		})
	}))
	defer srv.Close()

	o := &OMDB{keys: newKeyRing("k"), httpClient: srv.Client(), baseURL: srv.URL + "/"}
	meta, err := o.Fetch(context.Background(), "movie", "tt0111161")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	var got int
	for _, r := range meta.Ratings {
		if r.Source == "imdb" {
			got = r.Votes
		}
	}
	if got != 3221305 {
		t.Errorf("Votes = %d, want 3221305", got)
	}
}

func TestAGroupedCountThatIsNotANumberReadsAsUnknown(t *testing.T) {
	for _, in := range []string{"N/A", "", "many"} {
		if got := parseGroupedInt(in); got != 0 {
			t.Errorf("parseGroupedInt(%q) = %d, want 0", in, got)
		}
	}
	if got := parseGroupedInt("1,234"); got != 1234 {
		t.Errorf("parseGroupedInt(\"1,234\") = %d, want 1234", got)
	}
}
