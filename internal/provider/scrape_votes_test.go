package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFilmwebReadsItsRatingCount(t *testing.T) {
	page := `<script>window.IRI.setSource('filmDataRating', {"rate":7.5,"count":123456,"countWantToSee":9})</script>`
	if got := parseFilmwebVotes(page); got != 123456 {
		t.Errorf("votes = %d, want 123456", got)
	}
}

// A layout that moves the count must cost the count and nothing else, so the
// score keeps rendering and the rating reads as having no count rather than
// zero votes.
func TestFilmwebWithoutACountStillReadsItsScore(t *testing.T) {
	page := `<script>window.IRI.setSource('filmDataRating', {"rate":7.5})</script>`
	if got := parseFilmwebVotes(page); got != 0 {
		t.Errorf("votes = %d, want 0 for a page with no count", got)
	}
	if v, ok := parseFilmwebRating(page); !ok || v != 7.5 {
		t.Errorf("rating = %v, %v; want 7.5 regardless of the missing count", v, ok)
	}
}

func TestAllocineReadsTheAudienceCountAndNotThePressOne(t *testing.T) {
	page := `
<span class="rating-title">Presse</span>
<span class="stareval-note">3,8</span>
<span class="stareval-review">28 titres de presse</span>
<span class="rating-title">Spectateurs</span>
<span class="stareval-note">4,1</span>
<span class="stareval-review">12 345 notes</span>`

	if got := parseAllocineVotes(page); got != 12345 {
		t.Errorf("votes = %d, want 12345 from the audience row", got)
	}

	ratings := parseAllocineRatings(page)
	if len(ratings) != 2 {
		t.Fatalf("ratings = %+v, want press and audience", ratings)
	}
	for _, r := range ratings {
		switch r.Source {
		case "allocine":
			if r.Votes != 12345 {
				t.Errorf("audience Votes = %d, want 12345", r.Votes)
			}
		case "allocinepress":
			if r.Votes != 0 {
				t.Errorf("press Votes = %d; a count of publications is not a vote count", r.Votes)
			}
		}
	}
}

// Through FetchByTitle, so the count is proven to reach the Rating rather than
// only to be extractable from a page.
func TestFilmwebFetchCarriesTheCountOntoTheRating(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/api/v1/live/search") {
			_, _ = w.Write([]byte(`{"searchHits":[{"id":123,"type":"film","matchedTitle":"Inception","matchedLang":"pl"}]}`))
			return
		}
		_, _ = w.Write([]byte(`<script>window.IRI.setSource('filmDataRating', {"rate":7.5,"count":123456})</script>`))
	}))
	defer srv.Close()

	f := &Filmweb{baseURL: srv.URL, httpClient: srv.Client()}
	meta, err := f.FetchByTitle(context.Background(), "movie", "Inception", "Inception", 2010)
	if err != nil {
		t.Fatalf("FetchByTitle: %v", err)
	}
	if len(meta.Ratings) != 1 {
		t.Fatalf("ratings = %+v, want one", meta.Ratings)
	}
	if meta.Ratings[0].Votes != 123456 {
		t.Errorf("Votes = %d, want 123456", meta.Ratings[0].Votes)
	}
}
