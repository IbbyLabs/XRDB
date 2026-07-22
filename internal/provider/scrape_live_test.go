package provider

import (
	"context"
	"os"
	"testing"
	"time"
)

// AlloCiné and Filmweb are read off their own pages, so they break silently when
// either site changes its markup: nothing fails, the score just stops appearing.
// This is the canary for that. It talks to the real sites, so it is opt-in:
//
//	XRDB_LIVE_SCRAPE=1 go test ./internal/provider/ -run LiveScrape -v
func TestLiveScrapeStillWorks(t *testing.T) {
	if os.Getenv("XRDB_LIVE_SCRAPE") == "" {
		t.Skip("set XRDB_LIVE_SCRAPE=1 to check the scrapers against the live sites")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// A well-known title in each site's home market, plus an accented one that
	// only matches if titles are folded before comparison.
	titles := []struct {
		title, original string
		year            int
	}{
		{"The Dark Knight", "The Dark Knight", 2008},
		{"Amélie", "Le Fabuleux Destin d'Amélie Poulain", 2001},
	}

	for _, c := range titles {
		meta, err := NewAlloCine().FetchByTitle(ctx, "movie", c.title, c.original, c.year)
		if err != nil {
			t.Errorf("allocine %q: %v", c.title, err)
		} else if len(meta.Ratings) == 0 {
			t.Errorf("allocine %q: no scores", c.title)
		} else {
			for _, r := range meta.Ratings {
				t.Logf("allocine %-18s %-14s %.2f (%s/5)", c.title, r.Source, r.Value, r.Label)
			}
		}

		meta, err = NewFilmweb().FetchByTitle(ctx, "movie", c.title, c.original, c.year)
		if err != nil {
			t.Errorf("filmweb %q: %v", c.title, err)
		} else if len(meta.Ratings) == 0 {
			t.Errorf("filmweb %q: no score", c.title)
		} else {
			t.Logf("filmweb  %-18s %-14s %.2f (%s/10)", c.title, meta.Ratings[0].Source,
				meta.Ratings[0].Value, meta.Ratings[0].Label)
		}
	}
}
