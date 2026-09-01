package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const wikidataEndpoint = "https://query.wikidata.org/sparql"

// Wikidata reviewer entities. Matching on the entity rather than on a label
// avoids joining the label service and cannot be broken by a rename.
const (
	wikidataRottenTomatoes = "Q105584"
	wikidataMetacritic     = "Q150248"
)

// Wikidata supplies Rotten Tomatoes and Metacritic scores for titles that have
// them. There is no free API for either — Rotten Tomatoes' own programme is
// Fandango-gated and Metacritic publishes none — so this is the one source for
// them that costs nothing and needs no key. CC0.
//
// Two properties of the data decide how it is used, and both argue for a
// fallback rather than a source in its own right:
//
//   - The values are hand-edited snapshots. A score still moving as reviews land
//     drifts from the real one, and nothing here can tell how old a value is.
//   - Coverage is patchy on television. Measured 2026-08-13 over twelve mixed
//     titles: 15 Rotten Tomatoes scores and 9 Metacritic, with the three that
//     returned nothing all being series.
//
// So it fills gaps a metered source did not answer and never overrides one that
// did. A live score beats a remembered one even when the remembered one is free.
type Wikidata struct {
	httpClient *http.Client
	endpoint   string
}

func NewWikidata() *Wikidata {
	return &Wikidata{
		httpClient: newHTTPClient("wikidata", 12*time.Second),
		endpoint:   wikidataEndpoint,
	}
}

func (w *Wikidata) Name() string { return "wikidata" }

// RatingSources lists what this can supply, so a render asking for neither
// skips the call entirely.
func (w *Wikidata) RatingSources() []string { return []string{"rt", "metacritic"} }

// wikidataQuery asks for every review score on the title with this IMDb id,
// narrowed to the two reviewers we can use. Bound by the id, so it is one
// title's worth of work however many scores it carries.
func wikidataQuery(imdbID string) string {
	return `SELECT ?reviewer ?score WHERE {
  ?item wdt:P345 "` + imdbID + `" .
  ?item p:P444 ?statement .
  ?statement ps:P444 ?score .
  ?statement pq:P447 ?reviewer .
  VALUES ?reviewer { wd:` + wikidataRottenTomatoes + ` wd:` + wikidataMetacritic + ` }
}`
}

type wikidataResults struct {
	Results struct {
		Bindings []struct {
			Reviewer struct {
				Value string `json:"value"`
			} `json:"reviewer"`
			Score struct {
				Value string `json:"value"`
			} `json:"score"`
		} `json:"bindings"`
	} `json:"results"`
}

// Fetch retrieves the scores for an IMDb id. Any other id scheme is not an
// error: this source is keyed on IMDb ids alone and has nothing to say.
func (w *Wikidata) Fetch(ctx context.Context, _, id string) (*MediaMeta, error) {
	imdbID := strings.TrimSpace(id)
	if !strings.HasPrefix(imdbID, "tt") {
		return nil, fmt.Errorf("wikidata: needs an IMDb id, got %q: %w", id, ErrNotApplicable)
	}
	// Guarded rather than escaped: the id goes into a SPARQL string literal, and
	// anything outside this shape is not an IMDb id in the first place.
	if !isIMDbID(imdbID) {
		return nil, fmt.Errorf("wikidata: %q is not an IMDb id: %w", id, ErrNotApplicable)
	}

	endpoint := w.endpoint + "?format=json&query=" + url.QueryEscape(wikidataQuery(imdbID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("wikidata: %w", err)
	}
	req.Header.Set("Accept", "application/sparql-results+json")

	res, err := w.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("wikidata: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("wikidata: %s", res.Status)
	}

	var out wikidataResults
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("wikidata: %w", err)
	}

	meta := &MediaMeta{}
	for _, b := range out.Results.Bindings {
		source := ""
		switch {
		case strings.HasSuffix(b.Reviewer.Value, "/"+wikidataRottenTomatoes):
			source = "rt"
		case strings.HasSuffix(b.Reviewer.Value, "/"+wikidataMetacritic):
			source = "metacritic"
		default:
			continue
		}
		value, ok := wikidataScore(b.Score.Value)
		if !ok {
			continue
		}
		meta.Ratings = append(meta.Ratings, Rating{Source: source, Value: value})
	}
	return meta, nil
}

// isIMDbID reports whether a string is tt followed by digits and nothing else.
func isIMDbID(s string) bool {
	if !strings.HasPrefix(s, "tt") || len(s) < 3 {
		return false
	}
	for _, r := range s[2:] {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// wikidataScore normalises the forms these two reviewers are recorded in — "91%"
// and "81/100" — onto XRDB's 0-10 scale. Anything else is left alone rather than
// guessed at: a value we cannot read is worse on a poster than no badge.
func wikidataScore(raw string) (float64, bool) {
	s := strings.TrimSpace(raw)
	switch {
	case strings.HasSuffix(s, "%"):
		n, err := strconv.ParseFloat(strings.TrimSuffix(s, "%"), 64)
		if err != nil || n < 0 || n > 100 {
			return 0, false
		}
		return n / 10, true
	case strings.Contains(s, "/"):
		num, den, _ := strings.Cut(s, "/")
		n, err := strconv.ParseFloat(strings.TrimSpace(num), 64)
		d, derr := strconv.ParseFloat(strings.TrimSpace(den), 64)
		if err != nil || derr != nil || d <= 0 || n < 0 || n > d {
			return 0, false
		}
		// n*10/d rather than n/d*10: the second gives 8.100000000000001 for
		// 81/100, and a rating is stored as it is computed.
		return n * 10 / d, true
	}
	return 0, false
}
