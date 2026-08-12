package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const filmwebBaseURL = "https://www.filmweb.pl"

// Filmweb reads the community score from Filmweb, the Polish film database. It
// is a 0–10 score like IMDb's, from a largely separate audience.
//
// Filmweb has a live search endpoint but no public ratings API, so a title is
// matched through search and the score is read off the resulting page.
type Filmweb struct {
	baseURL    string // overrides filmwebBaseURL; set in tests
	httpClient *http.Client
}

// NewFilmweb creates the Filmweb provider. It needs no credential.
func NewFilmweb() *Filmweb {
	return &Filmweb{httpClient: newHTTPClient("filmweb", 12*time.Second)}
}

func (f *Filmweb) Name() string { return "filmweb" }

// RatingSources lets the pipeline skip Filmweb unless its score was asked for.
func (f *Filmweb) RatingSources() []string { return []string{"filmweb"} }

// Fetch satisfies Provider. Filmweb cannot be looked up by IMDb or TMDB id, so
// the pipeline calls FetchByTitle instead.
func (f *Filmweb) Fetch(context.Context, string, string) (*MediaMeta, error) {
	return nil, fmt.Errorf("filmweb: needs a title, not an id: %w", ErrNotApplicable)
}

func (f *Filmweb) base() string {
	if f.baseURL != "" {
		return f.baseURL
	}
	return filmwebBaseURL
}

var filmwebHeaders = map[string]string{
	"User-Agent":      browserUserAgent,
	"Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
	"Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
}

type filmwebCandidate struct {
	id    string
	title string
	lang  string
}

// FetchByTitle finds the title on Filmweb and returns its community score.
func (f *Filmweb) FetchByTitle(ctx context.Context, mediaType, title, originalTitle string, year int) (*MediaMeta, error) {
	variants := titleVariants(title, originalTitle)
	if len(variants) == 0 {
		return nil, fmt.Errorf("filmweb: no title to search for: %w", ErrNotApplicable)
	}
	// A Filmweb page URL embeds the release year, so without one there is no
	// address to fetch even after the title is matched.
	if year <= 0 {
		return nil, fmt.Errorf("filmweb: no release year for %q: %w", variants[0], ErrNotApplicable)
	}

	kind := "film"
	if isSeriesType(mediaType) {
		kind = "serial"
	}
	candidate, ok := f.search(ctx, kind, variants)
	if !ok {
		return nil, fmt.Errorf("filmweb: no match for %q: %w", variants[0], errNotFound)
	}

	// Filmweb's own URLs are "/film/<title>-<year>-<id>"; the title part is
	// cosmetic but the year and id have to be right.
	page, err := fetchText(ctx, f.httpClient, fmt.Sprintf("%s/%s/%s-%d-%s",
		f.base(), kind, filmwebSlug(candidate.title), year, candidate.id), filmwebHeaders)
	if err != nil {
		return nil, fmt.Errorf("filmweb: page: %w", err)
	}
	value, ok := parseFilmwebRating(page)
	if !ok {
		return nil, fmt.Errorf("filmweb: no score for %q: %w", candidate.title, errNotFound)
	}
	return &MediaMeta{Ratings: []Rating{{
		Source: "filmweb",
		Value:  value,
		Votes:  parseFilmwebVotes(page),
		Label:  fmt.Sprintf("%.1f", value),
	}}}, nil
}

func (f *Filmweb) search(ctx context.Context, kind string, variants []string) (filmwebCandidate, bool) {
	wanted := foldAll(variants)
	for _, variant := range variants {
		body, err := fetchText(ctx, f.httpClient,
			f.base()+"/api/v1/live/search?query="+url.QueryEscape(variant), filmwebHeaders)
		if err != nil {
			continue
		}
		if c, ok := bestFilmwebCandidate(body, kind, wanted); ok {
			return c, true
		}
	}
	return filmwebCandidate{}, false
}

type filmwebSearch struct {
	SearchHits []struct {
		ID           any    `json:"id"`
		Type         string `json:"type"`
		MatchedTitle string `json:"matchedTitle"`
		MatchedLang  string `json:"matchedLang"`
	} `json:"searchHits"`
}

// bestFilmwebCandidate picks the search hit that best matches the wanted titles.
// A Polish or English title is preferred among equally good matches, since those
// are the two the site indexes most completely.
func bestFilmwebCandidate(body, kind string, wanted []string) (filmwebCandidate, bool) {
	var payload filmwebSearch
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		return filmwebCandidate{}, false
	}
	best, bestScore := filmwebCandidate{}, 0
	for _, hit := range payload.SearchHits {
		if !strings.EqualFold(strings.TrimSpace(hit.Type), kind) {
			continue
		}
		id := anyToDigits(hit.ID)
		if id == "" {
			continue
		}
		score := scoreTitleMatch(hit.MatchedTitle, wanted)
		if score == 0 {
			continue
		}
		switch {
		case strings.HasPrefix(hit.MatchedLang, "pl"):
			score += 6
		case strings.HasPrefix(hit.MatchedLang, "en"):
			score += 3
		}
		if score > bestScore {
			bestScore = score
			best = filmwebCandidate{id: id, title: hit.MatchedTitle, lang: hit.MatchedLang}
		}
	}
	return best, bestScore > 0
}

// filmwebSlug renders a title the way Filmweb's own URLs do: percent-encoded
// with spaces as "+".
func filmwebSlug(title string) string {
	return strings.ReplaceAll(url.QueryEscape(strings.TrimSpace(title)), "+", "+")
}

// filmwebRatingRes are tried in order. The page carries its score in an inline
// script on most layouts and in markup on others, so more than one shape has to
// be recognised.
// The key is written bare on some payloads and quoted on others, so both forms
// are accepted rather than betting on one.
var filmwebRatingRes = []*regexp.Regexp{
	regexp.MustCompile(`(?is)window\.IRI\.setSource\('filmDataRating',\s*\{.{0,400}?"?rate"?\s*:\s*"?([0-9]+(?:[.,][0-9]+)?)"?`),
	regexp.MustCompile(`(?is)window\.IRI\.setSource\('filmRating',\s*\{.{0,400}?"?rate"?\s*:\s*"?([0-9]+(?:[.,][0-9]+)?)"?`),
	regexp.MustCompile(`(?is)itemprop="ratingValue"[^>]*>\s*([0-9]+(?:[.,][0-9]+)?)\s*<`),
	regexp.MustCompile(`(?is)class="filmRating__rateValue[^>]*>\s*([0-9]+(?:[.,][0-9]+)?)\s*<`),
}

// parseFilmwebRating reads the community score off a title page. Filmweb scores
// out of 10, the same scale the renderer works in.
func parseFilmwebRating(page string) (float64, bool) {
	for _, re := range filmwebRatingRes {
		m := re.FindStringSubmatch(page)
		if m == nil {
			continue
		}
		if v, ok := parseRatingNumber(m[1]); ok && v <= 10 {
			return v, true
		}
	}
	return 0, false
}

// filmwebVoteRes read the number of ratings from the same payloads the score
// comes from. Read separately from the score so a layout that moves the count
// leaves the rating alone: no match is no count, which renders as unknown.
var filmwebVoteRes = []*regexp.Regexp{
	regexp.MustCompile(`(?is)setSource\('filmDataRating',\s*\{.{0,400}?"?count"?\s*:\s*"?([0-9][0-9\s,]*)"?`),
	regexp.MustCompile(`(?is)setSource\('filmRating',\s*\{.{0,400}?"?count"?\s*:\s*"?([0-9][0-9\s,]*)"?`),
	regexp.MustCompile(`(?is)itemprop="ratingCount"[^>]*>\s*([0-9][0-9\s,]*)\s*<`),
	regexp.MustCompile(`(?is)itemprop="ratingCount"[^>]*content="([0-9]+)"`),
}

// parseFilmwebVotes reads how many people rated a title, or 0 when the page
// does not say.
func parseFilmwebVotes(page string) int {
	for _, re := range filmwebVoteRes {
		if m := re.FindStringSubmatch(page); len(m) > 1 {
			if n := parseGroupedInt(strings.TrimSpace(m[1])); n > 0 {
				return n
			}
		}
	}
	return 0
}
