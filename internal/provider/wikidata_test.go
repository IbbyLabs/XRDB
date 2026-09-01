package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func wikidataStub(t *testing.T, body string) *Wikidata {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/sparql-results+json")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return &Wikidata{httpClient: srv.Client(), endpoint: srv.URL}
}

const wikidataBothScores = `{"results":{"bindings":[
  {"reviewer":{"value":"http://www.wikidata.org/entity/Q105584"},"score":{"value":"91%"}},
  {"reviewer":{"value":"http://www.wikidata.org/entity/Q150248"},"score":{"value":"81/100"}}
]}}`

// There is no free API for either of these, so this is the one source that can
// supply them without a key (FR-187).
func TestWikidataReadsBothReviewers(t *testing.T) {
	meta, err := wikidataStub(t, wikidataBothScores).Fetch(context.Background(), "movie", "tt0111161")
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]float64{}
	for _, r := range meta.Ratings {
		got[r.Source] = r.Value
	}
	if got["rt"] != 9.1 {
		t.Errorf("rt = %v, want 9.1 from 91%%", got["rt"])
	}
	if got["metacritic"] != 8.1 {
		t.Errorf("metacritic = %v, want 8.1 from 81/100", got["metacritic"])
	}
}

// A value we cannot read is worse on a poster than no badge, so an unparseable
// score is dropped rather than guessed at.
func TestWikidataDropsAScoreItCannotRead(t *testing.T) {
	body := `{"results":{"bindings":[
      {"reviewer":{"value":"http://www.wikidata.org/entity/Q105584"},"score":{"value":"fresh"}},
      {"reviewer":{"value":"http://www.wikidata.org/entity/Q150248"},"score":{"value":"140%"}},
      {"reviewer":{"value":"http://www.wikidata.org/entity/Q105584"},"score":{"value":"77%"}}
    ]}}`
	meta, err := wikidataStub(t, body).Fetch(context.Background(), "movie", "tt0111161")
	if err != nil {
		t.Fatal(err)
	}
	if len(meta.Ratings) != 1 || meta.Ratings[0].Source != "rt" || meta.Ratings[0].Value != 7.7 {
		t.Errorf("got %+v, want only the readable 77%% score", meta.Ratings)
	}
}

// The measured gap: three of twelve titles returned nothing and all three were
// series. An empty answer is not an error.
func TestWikidataAnEmptyAnswerIsNotAnError(t *testing.T) {
	meta, err := wikidataStub(t, `{"results":{"bindings":[]}}`).Fetch(context.Background(), "series", "tt0944947")
	if err != nil {
		t.Fatalf("an empty result errored: %v", err)
	}
	if len(meta.Ratings) != 0 {
		t.Errorf("got %+v, want nothing", meta.Ratings)
	}
}

// The id goes into a SPARQL string literal, so anything that is not an IMDb id
// is refused before the query is built rather than escaped into it.
func TestWikidataRefusesAnythingThatIsNotAnIMDbID(t *testing.T) {
	w := wikidataStub(t, wikidataBothScores)
	for _, id := range []string{"550", "tmdb:550", `tt" . ?x ?y ?z . #`, "tt", "ttabc", ""} {
		if _, err := w.Fetch(context.Background(), "movie", id); err == nil {
			t.Errorf("%q was accepted as an IMDb id", id)
		}
	}
	// The control: a real id is accepted, so the guard is not refusing everything.
	if _, err := w.Fetch(context.Background(), "movie", "tt0111161"); err != nil {
		t.Errorf("a real IMDb id was refused: %v", err)
	}
}

func TestWikidataQueryNamesBothReviewers(t *testing.T) {
	q := wikidataQuery("tt0111161")
	for _, want := range []string{"tt0111161", wikidataRottenTomatoes, wikidataMetacritic, "wdt:P345", "p:P444"} {
		if !strings.Contains(q, want) {
			t.Errorf("the query does not mention %s", want)
		}
	}
}

// Wikimedia's policy asks an automated client to identify itself, and throttles
// or refuses one that does not. A block there does not clear on its own.
func TestWikidataIdentifiesItself(t *testing.T) {
	var seen string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = r.Header.Get("User-Agent")
		_, _ = w.Write([]byte(`{"results":{"bindings":[]}}`))
	}))
	t.Cleanup(srv.Close)

	w := &Wikidata{httpClient: srv.Client(), endpoint: srv.URL}
	if _, err := w.Fetch(context.Background(), "movie", "tt0111161"); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(seen, "XRDB/") {
		t.Errorf("User-Agent = %q, want it to name XRDB", seen)
	}
	if !strings.Contains(seen, "ibbylabs") {
		t.Errorf("User-Agent = %q, want a way to reach the operator", seen)
	}
}

// Every other metered source in the table carries an interval; an unpaced client
// at render volume is the shape that gets an address blocked.
func TestWikidataIsPaced(t *testing.T) {
	if got := rateLimitFor("wikidata").MinInterval; got <= 0 {
		t.Errorf("wikidata MinInterval = %v; the endpoint throttles hard", got)
	}
	// The control: an unlisted source has no interval, so this is not something
	// every name gets.
	if got := rateLimitFor("not-a-source").MinInterval; got != 0 {
		t.Errorf("an unlisted source has an interval of %v", got)
	}
}
