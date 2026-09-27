package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"xrdb_rewrite/internal/logging"
)

var pmdbBase = sourceBaseURL("PMDB", "https://publicmetadb.com")

// pmdbCommunityLabels are the labels PMDB members use for their own score.
var pmdbCommunityLabels = []string{"Overall", "overall"}

// pmdbDefaultLabels maps PMDB's rating labels to XRDB rating sources.
var pmdbDefaultLabels = map[string]string{
	"TM": "tmdb",
	"IM": "imdb",
	"RT": "rt",
	"PC": "rtaudience",
	"MC": "metacritic",
	"LB": "letterboxd",
	"TR": "trakt",
	"RE": "rogerebert",
}

// tmdbIdentifier resolves an IMDb id to a TMDB id and content type.
type tmdbIdentifier interface {
	IdentifyID(ctx context.Context, id, hint string) (tmdbID, contentType string, err error)
}

// PMDB supplies PublicMetaDB community ratings.
type PMDB struct {
	mu         sync.RWMutex
	apiKey     string
	httpClient *http.Client
	baseURL    string // overrides pmdbBase; set in tests
	ids        tmdbIdentifier
	labels     map[string]string
}

// NewPMDB creates a PMDB provider. ids resolves the TMDB id PMDB is keyed on.
func NewPMDB(apiKey string, ids tmdbIdentifier) *PMDB {
	return &PMDB{
		apiKey:     apiKey,
		httpClient: newHTTPClient("pmdb", 10*time.Second),
		ids:        ids,
		labels:     parsePMDBLabels(os.Getenv("XRDB_PMDB_LABELS")),
	}
}

// parsePMDBLabels overlays LABEL=source pairs on the default label map. An
// empty source removes the label.
func parsePMDBLabels(raw string) map[string]string {
	out := make(map[string]string, len(pmdbDefaultLabels))
	for k, v := range pmdbDefaultLabels {
		out[k] = v
	}
	for _, pair := range strings.Split(raw, ",") {
		pair = strings.TrimSpace(pair)
		if pair == "" {
			continue
		}
		label, source, ok := strings.Cut(pair, "=")
		label, source = strings.TrimSpace(label), strings.ToLower(strings.TrimSpace(source))
		if !ok || label == "" {
			slog.Default().Warn("Ignoring an unreadable PMDB label mapping", "entry", pair)
			continue
		}
		if source == "" {
			delete(out, label)
			continue
		}
		if !pmdbMappable(source) {
			slog.Default().Warn("Ignoring a PMDB label mapped to a source PMDB cannot fill",
				"label", label, "source", source)
			continue
		}
		out[label] = source
	}
	return out
}

func pmdbMappable(source string) bool {
	for _, s := range (&PMDB{}).RatingSources()[1:] {
		if s == source {
			return true
		}
	}
	return false
}

// UpdateCredentials swaps the live credential so a value saved in the UI takes
// effect without a restart.
func (p *PMDB) UpdateCredentials(apiKey string) {
	p.mu.Lock()
	p.apiKey = apiKey
	p.mu.Unlock()
}

// HasCredentials reports whether the provider can make authenticated requests.
func (p *PMDB) HasCredentials() bool { return p.cred(context.Background()) != "" }

func (p *PMDB) cred(ctx context.Context) string {
	if k := keyFrom(ctx, KeyPMDB); k != "" {
		return k
	}
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.apiKey
}

func (p *PMDB) Name() string { return "pmdb" }

// RatingSources lists the community score and every source a label can map to.
func (p *PMDB) RatingSources() []string {
	return []string{"pmdb", "imdb", "letterboxd", "metacritic", "rogerebert", "rt", "rtaudience", "tmdb", "trakt"}
}

// AppliesTo reports whether the id is one PMDB can answer for.
func (p *PMDB) AppliesTo(_ context.Context, _, id string) bool { return isIMDbTitleOnly(id) }

// Fetch returns the community score and the mapped site-labelled scores.
func (p *PMDB) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	key := p.cred(ctx)
	if key == "" {
		return nil, fmt.Errorf("pmdb: no api key configured")
	}
	if !isIMDbTitleOnly(id) {
		return nil, fmt.Errorf("pmdb: only IMDb tt-IDs are supported, got %q: %w", id, ErrNotApplicable)
	}
	if p.ids == nil {
		return nil, fmt.Errorf("pmdb: no TMDB lookup configured")
	}
	tmdbID, contentType, err := p.ids.IdentifyID(ctx, id, mediaType)
	if err != nil {
		return nil, fmt.Errorf("pmdb: resolve %q: %w", id, err)
	}
	kind := "movie"
	if contentType == "series" {
		kind = "tv"
	}
	latest, err := p.get(ctx, key, tmdbID, kind, "")
	if err != nil {
		return nil, err
	}
	ratings := p.siteRatings(ctx, id, latest.Items)
	community, ok, err := p.community(ctx, key, tmdbID, kind)
	if err != nil {
		return nil, err
	}
	if ok {
		ratings = append(ratings, community)
	}
	return &MediaMeta{Ratings: ratings}, nil
}

type pmdbItem struct {
	Label       string  `json:"label"`
	Score       float64 `json:"score"`
	Created     string  `json:"created"`
	Contributor string  `json:"contributor"`
}

type pmdbResponse struct {
	Items   []pmdbItem `json:"items"`
	Total   int        `json:"total"`
	Average float64    `json:"average"`
}

func (p *PMDB) get(ctx context.Context, key, tmdbID, kind, label string) (*pmdbResponse, error) {
	base := pmdbBase
	if p.baseURL != "" {
		base = p.baseURL
	}
	params := url.Values{"tmdb_id": {tmdbID}, "media_type": {kind}}
	if label != "" {
		params.Set("label", label)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/api/external/ratings?"+params.Encode(), nil)
	if err != nil {
		return nil, fmt.Errorf("pmdb: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+key)
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("pmdb: http get: %w", redactHTTPErr(err))
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, HTTPFault("pmdb", resp.StatusCode)
	}
	var out pmdbResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("pmdb: decode response: %w", err)
	}
	return &out, nil
}

// siteRatings keeps the newest score for each mapped label.
func (p *PMDB) siteRatings(ctx context.Context, id string, items []pmdbItem) []Rating {
	newest := map[string]pmdbItem{}
	for _, it := range items {
		source, ok := p.labels[it.Label]
		if !ok || it.Score <= 0 {
			continue
		}
		if cur, seen := newest[source]; !seen || it.Created > cur.Created {
			newest[source] = it
		}
	}
	out := make([]Rating, 0, len(newest))
	for source, it := range newest {
		value, label := mdblistNormalize(source, pmdbNative(source, it.Score))
		if value <= 0 {
			continue
		}
		slog.Default().DebugContext(ctx, "Took a PMDB site-labelled score",
			"id", logging.RequestID(ctx), "media_id", id, "label", it.Label,
			"source", source, "score", it.Score, "contributor", it.Contributor)
		out = append(out, Rating{Source: source, Value: value, Label: label})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Source < out[j].Source })
	return out
}

// community averages every community-labelled score, whatever its case.
func (p *PMDB) community(ctx context.Context, key, tmdbID, kind string) (Rating, bool, error) {
	var sum float64
	var total int
	for _, label := range pmdbCommunityLabels {
		r, err := p.get(ctx, key, tmdbID, kind, label)
		if err != nil {
			return Rating{}, false, err
		}
		sum += r.Average * float64(r.Total)
		total += r.Total
	}
	if total == 0 || sum <= 0 {
		return Rating{}, false, nil
	}
	avg := sum / float64(total)
	return Rating{Source: "pmdb", Value: avg / 10, Votes: total, Label: fmt.Sprintf("%.0f", avg)}, true, nil
}

// pmdbNative converts a 0–100 PMDB score to the scale the source reports in.
func pmdbNative(source string, score float64) float64 {
	switch source {
	case "imdb", "metacriticuser", "mal", "anilist":
		return score / 10
	case "letterboxd":
		return score / 20
	case "rogerebert":
		return score / 25
	default:
		return score
	}
}
