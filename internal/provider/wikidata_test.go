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

// The default value mode draws the label, and this provider outranks the ones
// that supply it, so a rating without one puts N/A on the poster where a score
// belongs. Both raw forms, because the label is the display string verbatim.
func TestWikidataKeepsTheDisplayStringForTheBadge(t *testing.T) {
	meta, err := wikidataStub(t, wikidataBothScores).Fetch(context.Background(), "movie", "tt0111161")
	if err != nil {
		t.Fatal(err)
	}

	got := map[string]string{}
	for _, r := range meta.Ratings {
		got[r.Source] = r.Label
	}
	for source, want := range map[string]string{"rt": "91%", "metacritic": "81/100"} {
		if got[source] != want {
			t.Errorf("%s label = %q, want %q", source, got[source], want)
		}
	}
}

// Rotten Tomatoes records both a tomatometer and an average of rated reviews on
// the same title, under the same reviewer. The average arrives first, so taking
// the first row drew 7.5/10 in a badge that means a percentage — a plausible
// number in the wrong metric, which is worse on a poster than a missing one.
const wikidataTwoRTScores = `{"results":{"bindings":[
  {"reviewer":{"value":"http://www.wikidata.org/entity/Q105584"},"score":{"value":"7.5/10"},"method":{"value":"http://www.wikidata.org/entity/Q108403540"}},
  {"reviewer":{"value":"http://www.wikidata.org/entity/Q105584"},"score":{"value":"80%"},"method":{"value":"http://www.wikidata.org/entity/Q108403393"}},
  {"reviewer":{"value":"http://www.wikidata.org/entity/Q150248"},"score":{"value":"81/100"},"method":{"value":"http://www.wikidata.org/entity/Q106515043"}}
]}}`

func TestWikidataTakesTheTomatometerNotTheAverage(t *testing.T) {
	meta, err := wikidataStub(t, wikidataTwoRTScores).Fetch(context.Background(), "movie", "tt1527186")
	if err != nil {
		t.Fatal(err)
	}

	got := map[string]string{}
	for _, r := range meta.Ratings {
		if _, dup := got[r.Source]; dup {
			t.Errorf("%s appeared twice; one source must yield one rating", r.Source)
		}
		got[r.Source] = r.Label
	}
	if got["rt"] != "80%" {
		t.Errorf("rt = %q, want the tomatometer 80%% rather than the average", got["rt"])
	}
	if got["metacritic"] != "81/100" {
		t.Errorf("metacritic = %q, want 81/100", got["metacritic"])
	}
}

// The order the rows arrive in must not decide the winner, since the query
// imposes none and SPARQL promises none.
func TestWikidataPicksTheTomatometerWhicheverOrderItArrivesIn(t *testing.T) {
	reversed := `{"results":{"bindings":[
  {"reviewer":{"value":"http://www.wikidata.org/entity/Q105584"},"score":{"value":"80%"},"method":{"value":"http://www.wikidata.org/entity/Q108403393"}},
  {"reviewer":{"value":"http://www.wikidata.org/entity/Q105584"},"score":{"value":"7.5/10"},"method":{"value":"http://www.wikidata.org/entity/Q108403540"}}
]}}`
	meta, err := wikidataStub(t, reversed).Fetch(context.Background(), "movie", "tt1527186")
	if err != nil {
		t.Fatal(err)
	}
	if len(meta.Ratings) != 1 || meta.Ratings[0].Label != "80%" {
		t.Errorf("ratings = %+v, want one rt rating labelled 80%%", meta.Ratings)
	}
}

// A statement with no determination method still earns a badge: dropping it
// would trade a wrong number for a missing one on any title Wikidata has not
// qualified.
func TestWikidataKeepsAnUnqualifiedScore(t *testing.T) {
	body := `{"results":{"bindings":[
  {"reviewer":{"value":"http://www.wikidata.org/entity/Q105584"},"score":{"value":"64%"}}
]}}`
	meta, err := wikidataStub(t, body).Fetch(context.Background(), "movie", "tt1527186")
	if err != nil {
		t.Fatal(err)
	}
	if len(meta.Ratings) != 1 || meta.Ratings[0].Label != "64%" {
		t.Errorf("ratings = %+v, want the unqualified score kept", meta.Ratings)
	}
}

// The average is never the badge's figure, so a title carrying only the average
// gets no tomatometer rather than a wrong one.
func TestWikidataNeverFallsBackToTheAverage(t *testing.T) {
	body := `{"results":{"bindings":[
  {"reviewer":{"value":"http://www.wikidata.org/entity/Q105584"},"score":{"value":"7.5/10"},"method":{"value":"http://www.wikidata.org/entity/Q108403540"}}
]}}`
	meta, err := wikidataStub(t, body).Fetch(context.Background(), "movie", "tt1527186")
	if err != nil {
		t.Fatal(err)
	}
	if len(meta.Ratings) != 0 {
		t.Errorf("ratings = %+v, want none: the average is not a tomatometer", meta.Ratings)
	}
}

// A named method displaces an unqualified statement whichever order they arrive
// in. Without that, an unqualified score arriving after the tomatometer would
// overwrite it, which is the same first-wins fault in a different disguise.
func TestWikidataPrefersTheNamedMethodOverAnUnqualifiedOne(t *testing.T) {
	for _, tc := range []struct{ name, body string }{
		{
			name: "the unqualified one arrives second",
			body: `{"results":{"bindings":[
  {"reviewer":{"value":"http://www.wikidata.org/entity/Q105584"},"score":{"value":"80%"},"method":{"value":"http://www.wikidata.org/entity/Q108403393"}},
  {"reviewer":{"value":"http://www.wikidata.org/entity/Q105584"},"score":{"value":"64%"}}
]}}`,
		},
		{
			name: "the unqualified one arrives first",
			body: `{"results":{"bindings":[
  {"reviewer":{"value":"http://www.wikidata.org/entity/Q105584"},"score":{"value":"64%"}},
  {"reviewer":{"value":"http://www.wikidata.org/entity/Q105584"},"score":{"value":"80%"},"method":{"value":"http://www.wikidata.org/entity/Q108403393"}}
]}}`,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			meta, err := wikidataStub(t, tc.body).Fetch(context.Background(), "movie", "tt1527186")
			if err != nil {
				t.Fatal(err)
			}
			if len(meta.Ratings) != 1 || meta.Ratings[0].Label != "80%" {
				t.Errorf("ratings = %+v, want the named tomatometer 80%%", meta.Ratings)
			}
		})
	}
}
