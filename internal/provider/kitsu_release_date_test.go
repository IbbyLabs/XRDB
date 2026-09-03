package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Kitsu's startDate is a full date and the year is cut from it. The age rule
// prefers the date, so dropping it puts an anime a year old on 1 January.
func TestKitsuKeepsTheStartDateAsWellAsTheYear(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"attributes":{
			"canonicalTitle":"Cowboy Bebop",
			"startDate":"2007-04-02",
			"averageRating":"74.72"}}}`))
	}))
	defer srv.Close()

	k := &Kitsu{httpClient: srv.Client(), baseURL: srv.URL + "/anime/"}
	meta, err := k.Fetch(context.Background(), "series", "kitsu:1")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if meta.Year != 2007 {
		t.Errorf("Year = %d, want 2007", meta.Year)
	}
	if meta.ReleaseDate != "2007-04-02" {
		t.Errorf("ReleaseDate = %q, want the full startDate", meta.ReleaseDate)
	}
}
