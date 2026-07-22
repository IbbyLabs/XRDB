package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// allocinePage is the shape the two scores arrive in: identical markup for both,
// told apart only by the label above them.
const allocinePage = `
<div class="rating-item">
  <span class="rating-title light">Presse</span>
  <div class="rating-holder"><span class="stareval-note">3,9</span></div>
</div>
<div class="rating-item">
  <span class="rating-title light">Spectateurs</span>
  <div class="rating-holder"><span class="stareval-note">4,4</span></div>
</div>`

func TestAlloCineName(t *testing.T) {
	if NewAlloCine().Name() != "allocine" {
		t.Error("expected name allocine")
	}
}

func TestAlloCineImplementsInterfaces(t *testing.T) {
	var _ Provider = NewAlloCine()
	var _ TitleRatingProvider = NewAlloCine()
	var _ RatingSourcer = NewAlloCine()
}

func TestParseAllocineRatingsSplitsPressFromAudience(t *testing.T) {
	got := parseAllocineRatings(allocinePage)
	if len(got) != 2 {
		t.Fatalf("ratings = %v, want both scores", got)
	}
	by := make(map[string]Rating, 2)
	for _, r := range got {
		by[r.Source] = r
	}
	// Out of 5 on the page, on the shared 0-10 scale internally, and the badge
	// keeps showing the number AlloCiné itself prints.
	if r := by["allocinepress"]; r.Value != 7.8 || r.Label != "3.9" {
		t.Errorf("press = %+v, want value 7.8 label 3.9", r)
	}
	if r := by["allocine"]; r.Value != 8.8 || r.Label != "4.4" {
		t.Errorf("audience = %+v, want value 8.8 label 4.4", r)
	}
}

func TestParseAllocineRatingsIgnoresOutOfRange(t *testing.T) {
	// A page whose "score" is above 5 is not a star rating, so it is not a
	// score this parser understands and must not be published as one.
	page := `<span class="rating-title">Spectateurs</span><span class="stareval-note">88</span>`
	if got := parseAllocineRatings(page); len(got) != 0 {
		t.Errorf("ratings = %v, want none", got)
	}
}

func TestBestAllocineCandidatePrefersMatchingYear(t *testing.T) {
	body := `{"results":[
		{"entity_type":"movie","entity_id":"1000","label":"Dune","data":{"id":"1000","year":"1984"}},
		{"entity_type":"movie","entity_id":"2000","label":"Dune","data":{"id":"2000","year":"2021"}}
	]}`
	got := bestAllocineCandidate(body, "movie", foldAll([]string{"Dune"}), 2021)
	if !strings.Contains(got, "=2000.") {
		t.Errorf("path = %q, want the 2021 entry", got)
	}
}

func TestBestAllocineCandidateRejectsUnrelatedTitles(t *testing.T) {
	body := `{"results":[{"entity_type":"movie","entity_id":"1","label":"Arrival","data":{"id":"1"}}]}`
	if got := bestAllocineCandidate(body, "movie", foldAll([]string{"Dune"}), 0); got != "" {
		t.Errorf("path = %q, want no match", got)
	}
}

func TestBestAllocineCandidateSkipsNonNumericIDs(t *testing.T) {
	body := `{"results":[{"entity_type":"movie","entity_id":"../etc","label":"Dune","data":{}}]}`
	if got := bestAllocineCandidate(body, "movie", foldAll([]string{"Dune"}), 0); got != "" {
		t.Errorf("path = %q, want the malformed id rejected", got)
	}
}

func TestAlloCineFetchByTitle(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasPrefix(r.URL.Path, "/_/autocomplete/movie/"):
			_, _ = w.Write([]byte(`{"results":[{"entity_type":"movie","entity_id":"143692",` +
				`"label":"The Dark Knight, Le Chevalier noir","original_label":"The Dark Knight",` +
				`"data":{"id":"143692","year":"2008"}}]}`))
		case r.URL.Path == "/film/fichefilm_gen_cfilm=143692.html":
			_, _ = w.Write([]byte(allocinePage))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	a := NewAlloCine()
	a.baseURL = srv.URL
	meta, err := a.FetchByTitle(context.Background(), "movie", "The Dark Knight", "", 2008)
	if err != nil {
		t.Fatalf("FetchByTitle: %v", err)
	}
	if len(meta.Ratings) != 2 {
		t.Fatalf("ratings = %v, want both scores", meta.Ratings)
	}
}

func TestAlloCineFetchByTitleNoMatch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"results":[]}`))
	}))
	defer srv.Close()

	a := NewAlloCine()
	a.baseURL = srv.URL
	if _, err := a.FetchByTitle(context.Background(), "movie", "Nonesuch", "", 2008); err == nil {
		t.Error("expected an error when nothing matches")
	}
}

func TestAlloCineFetchByIDIsRefused(t *testing.T) {
	// AlloCiné has no id-based lookup, so answering an id-only call would mean
	// inventing a match. It has to say so instead.
	if _, err := NewAlloCine().Fetch(context.Background(), "movie", "tt0468569"); err == nil {
		t.Error("expected Fetch by id to be refused")
	}
}
