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

const allocineBaseURL = "https://www.allocine.fr"

// AlloCine reads the two scores AlloCiné publishes for a title: the audience
// score ("spectateurs") and the press score ("presse"). Both are French star
// ratings out of 5.
//
// AlloCiné has no public API, so a title is found through the site's own
// autocomplete endpoint and the scores are read off the resulting page.
type AlloCine struct {
	baseURL    string // overrides allocineBaseURL; set in tests
	httpClient *http.Client
}

// NewAlloCine creates the AlloCiné provider. It needs no credential.
func NewAlloCine() *AlloCine {
	return &AlloCine{httpClient: &http.Client{Timeout: 12 * time.Second}}
}

func (a *AlloCine) Name() string { return "allocine" }

// RatingSources lets the pipeline skip AlloCiné entirely unless one of its two
// scores was actually asked for, so a scrape only happens on request.
func (a *AlloCine) RatingSources() []string { return []string{"allocine", "allocinepress"} }

// Fetch satisfies Provider. AlloCiné cannot be looked up by IMDb or TMDB id, so
// an id on its own is not enough; the pipeline calls FetchByTitle instead.
func (a *AlloCine) Fetch(context.Context, string, string) (*MediaMeta, error) {
	return nil, fmt.Errorf("allocine: needs a title, not an id")
}

func (a *AlloCine) base() string {
	if a.baseURL != "" {
		return a.baseURL
	}
	return allocineBaseURL
}

var allocineHeaders = map[string]string{
	"User-Agent":      browserUserAgent,
	"Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	"Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
}

// FetchByTitle finds the title on AlloCiné and returns whichever of the two
// scores the page carries.
func (a *AlloCine) FetchByTitle(ctx context.Context, mediaType, title, originalTitle string, year int) (*MediaMeta, error) {
	variants := titleVariants(title, originalTitle)
	if len(variants) == 0 {
		return nil, fmt.Errorf("allocine: no title to search for")
	}

	path := a.findPath(ctx, mediaType, variants, year)
	if path == "" {
		return nil, fmt.Errorf("allocine: no match for %q", variants[0])
	}

	page, err := fetchText(ctx, a.httpClient, a.base()+path, allocineHeaders)
	if err != nil {
		return nil, fmt.Errorf("allocine: page: %w", err)
	}
	ratings := parseAllocineRatings(page)
	if len(ratings) == 0 {
		return nil, fmt.Errorf("allocine: no scores on %s", path)
	}
	return &MediaMeta{Ratings: ratings}, nil
}

// findPath searches each title variant in turn and returns the path of the best
// match, or "" when nothing scores.
func (a *AlloCine) findPath(ctx context.Context, mediaType string, variants []string, year int) string {
	kind := "movie"
	if isSeriesType(mediaType) {
		kind = "series"
	}
	wanted := foldAll(variants)
	for _, variant := range variants {
		body, err := fetchText(ctx,
			a.httpClient,
			fmt.Sprintf("%s/_/autocomplete/%s/%s", a.base(), kind, url.PathEscape(variant)),
			allocineHeaders)
		if err != nil {
			continue
		}
		if path := bestAllocineCandidate(body, kind, wanted, year); path != "" {
			return path
		}
	}
	return ""
}

type allocineAutocomplete struct {
	Results []struct {
		EntityType string `json:"entity_type"`
		EntityID   any    `json:"entity_id"`
		Label      string `json:"label"`
		// OriginalLabel is the original-language title, which is usually the
		// closer match to what the artwork provider reported.
		OriginalLabel string `json:"original_label"`
		LastRelease   string `json:"last_release"`
		Data          struct {
			ID   any `json:"id"`
			Year any `json:"year"`
		} `json:"data"`
	} `json:"results"`
}

// bestAllocineCandidate picks the autocomplete result that best matches the
// wanted titles, preferring one released in the same year.
func bestAllocineCandidate(body, kind string, wanted []string, year int) string {
	var payload allocineAutocomplete
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		return ""
	}
	bestScore, bestPath := 0, ""
	for _, r := range payload.Results {
		if !strings.EqualFold(strings.TrimSpace(r.EntityType), kind) {
			continue
		}
		id := anyToDigits(r.EntityID)
		if id == "" {
			id = anyToDigits(r.Data.ID)
		}
		if id == "" {
			continue
		}
		score := scoreTitleMatch(r.OriginalLabel, wanted)
		if s := scoreTitleMatch(r.Label, wanted); s > score {
			score = s
		}
		if score == 0 {
			continue
		}
		// A year that matches is strong evidence; one that is years out is
		// strong evidence against, which is how a remake is told from the
		// original when both carry the same title.
		if candidateYear := yearOf(anyToString(r.Data.Year) + " " + r.LastRelease); year > 0 && candidateYear > 0 {
			if candidateYear == year {
				score += 30
			} else {
				score -= min(25, abs(candidateYear-year)*3)
			}
		}
		if score > bestScore {
			bestScore = score
			if kind == "movie" {
				bestPath = "/film/fichefilm_gen_cfilm=" + id + ".html"
			} else {
				bestPath = "/series/ficheserie_gen_cserie=" + id + ".html"
			}
		}
	}
	if bestScore <= 0 {
		return ""
	}
	return bestPath
}

// allocineRatingRe pairs each rating block's label with the score beside it.
// AlloCiné renders both scores with the same markup and only the label tells
// them apart.
var allocineRatingRe = regexp.MustCompile(
	`(?is)<span class="[^"]*\brating-title\b[^"]*">\s*(Presse|Spectateurs)\s*</span>.{0,500}?<span class="stareval-note(?: [^"]*)?">([^<]+)</span>`)

// parseAllocineRatings reads the press and audience scores off a title page.
// Both are out of 5 and are normalised to the 0–10 scale every source shares,
// while the badge keeps showing the number AlloCiné itself prints.
func parseAllocineRatings(page string) []Rating {
	var out []Rating
	seen := make(map[string]bool, 2)
	for _, m := range allocineRatingRe.FindAllStringSubmatch(page, -1) {
		value, ok := parseRatingNumber(m[2])
		if !ok || value > 5 {
			continue
		}
		source := "allocine"
		if strings.EqualFold(strings.TrimSpace(m[1]), "presse") {
			source = "allocinepress"
		}
		if seen[source] {
			continue
		}
		seen[source] = true
		out = append(out, Rating{
			Source: source,
			Value:  value * 2,
			Label:  fmt.Sprintf("%.1f", value),
		})
	}
	return out
}

func anyToString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return fmt.Sprintf("%.0f", t)
	case json.Number:
		return t.String()
	case nil:
		return ""
	default:
		return fmt.Sprint(t)
	}
}

// anyToDigits returns the value as a string only when it is all digits, which is
// what an entity id has to be before it can be pasted into a URL.
func anyToDigits(v any) string {
	s := strings.TrimSpace(anyToString(v))
	if s == "" {
		return ""
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return ""
		}
	}
	return s
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}
