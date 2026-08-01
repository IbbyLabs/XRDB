package provider

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"xrdb_rewrite/internal/logging"
)

const mdblistBase = "https://api.mdblist.com"

// MDBList is the MDBList metadata provider.
// It accepts an IMDb tt-prefixed ID and returns ratings from multiple sources
// (IMDb, Rotten Tomatoes, Metacritic, Letterboxd, Trakt, and MDBList's own aggregate).
type MDBList struct {
	mu         sync.RWMutex
	apiKey     string
	baseURL    string // overrides mdblistBase; set in tests
	httpClient *http.Client
	// knownType remembers which endpoint answered for a title. A bare
	// /poster/tt... request carries no content type, so a series would otherwise
	// spend a guaranteed 404 on the movie endpoint every single render, against
	// the one source that meters by the day.
	knownType sync.Map // imdb id -> "movie" | "show"
}

// NewMDBList creates an MDBList provider.
func NewMDBList(apiKey string) *MDBList {
	return &MDBList{
		apiKey:     apiKey,
		httpClient: newHTTPClient("mdblist", 10*time.Second),
	}
}

func (m *MDBList) Name() string { return "mdblist" }

// UpdateCredentials swaps the live API key so a key saved in the UI takes effect
// without a restart.
func (m *MDBList) UpdateCredentials(apiKey string) {
	m.mu.Lock()
	m.apiKey = apiKey
	m.mu.Unlock()
}

// HasCredentials reports whether the provider can make authenticated requests.
func (m *MDBList) HasCredentials() bool {
	return m.key(context.Background()) != ""
}

func (m *MDBList) key(ctx context.Context) string {
	// An owner-supplied credential stands in for the server's for this render.
	if k := keyFrom(ctx, KeyMDBList); k != "" {
		return k
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.apiKey
}

// Fetch retrieves multi-provider ratings from MDBList for the given IMDB tt-ID.
// Returns an error (not a fatal failure) when the ID is not an IMDb tt-ID.
func (m *MDBList) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	if m.key(ctx) == "" {
		return nil, fmt.Errorf("mdblist: no api key configured")
	}
	if !strings.HasPrefix(id, "tt") {
		return nil, fmt.Errorf("mdblist: requires imdb tt-id, got %q", id)
	}

	// MDBList serves movies and shows from distinct endpoints, but the artwork
	// surface (poster/backdrop/logo) doesn't tell us which. Try the type implied
	// by the content-type hint first, then fall back to the other on a not-found.
	// Without this, a series requested via the poster/logo surfaces hits the
	// movie endpoint, 404s, and every MDBList-sourced rating silently vanishes.
	primary, secondary := "movie", "show"
	if isSeriesType(mediaType) {
		primary, secondary = "show", "movie"
	}
	// A previous lookup already learned which endpoint holds this title.
	if remembered, ok := m.knownType.Load(id); ok {
		if kind, _ := remembered.(string); kind == "movie" || kind == "show" {
			primary = kind
			secondary = "show"
			if kind == "show" {
				secondary = "movie"
			}
		}
	}
	meta, err := m.fetchType(ctx, primary, id)
	if errors.Is(err, errNotFound) {
		if meta, err = m.fetchType(ctx, secondary, id); err == nil {
			m.knownType.Store(id, secondary)
		}
		return meta, err
	}
	if err == nil {
		m.knownType.Store(id, primary)
	}
	return meta, err
}

// fetchType queries one MDBList endpoint (mdbType is "movie" or "show"). It
// returns a wrapped errNotFound on a 404 so Fetch can retry the other type.
func (m *MDBList) fetchType(ctx context.Context, mdbType, id string) (*MediaMeta, error) {
	base := mdblistBase
	if m.baseURL != "" {
		base = m.baseURL
	}
	params := url.Values{"apikey": {m.key(ctx)}}
	endpoint := fmt.Sprintf("%s/imdb/%s/%s?%s", base, mdbType, id, params.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("mdblist: request: %w", redactHTTPErr(err))
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusTooManyRequests, http.StatusServiceUnavailable:
		return nil, &RateLimitError{Source: "mdblist", Status: resp.StatusCode,
			RetryAfter: retryAfter(resp.Header.Get("Retry-After"))}
	case http.StatusUnauthorized, http.StatusForbidden:
		return nil, fmt.Errorf("mdblist: unauthorized (check api key)")
	case http.StatusNotFound:
		return nil, fmt.Errorf("mdblist: %s not found for %q: %w", mdbType, id, errNotFound)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("mdblist: http %d", resp.StatusCode)
	}

	var payload mdblistPayload
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("mdblist: decode response: %w", err)
	}

	meta := &MediaMeta{
		Ratings:       parseMDBListRatings(payload),
		ContentRating: commonSenseAge(payload),
		Awards:        ParseAwards(payload.Awards),
	}
	// Raw sources alongside the kept ones: a name the parser does not recognise
	// is dropped, so the kept list alone cannot show that it arrived.
	if m.log().Enabled(ctx, slog.LevelDebug) {
		raw := make([]string, 0, len(payload.Ratings))
		for _, r := range payload.Ratings {
			raw = append(raw, r.Source)
		}
		kept := make([]string, 0, len(meta.Ratings))
		for _, r := range meta.Ratings {
			kept = append(kept, r.Source)
		}
		m.log().DebugContext(ctx, "MDBList answered",
			"id", logging.RequestID(ctx), "media_id", id, "media_type", mdbType,
			"raw_sources", raw, "kept_sources", kept, "raw_awards", payload.Awards)
	}
	return meta, nil
}

func (m *MDBList) log() *slog.Logger { return slog.Default() }

type mdblistPayload struct {
	Score       float64         `json:"score"`
	Ratings     []mdblistRating `json:"ratings"`
	Awards      string          `json:"awards"`
	AgeRating   *int            `json:"age_rating"`
	CommonSense *struct {
		CommonSense *int `json:"common_sense"`
	} `json:"commonsense_media"`
}

// commonSenseAge renders the Common Sense recommended minimum age as an age
// rating, e.g. "9+". MDBList reports it at the top level and inside the
// commonsense_media object; either will do.
func commonSenseAge(p mdblistPayload) string {
	age := 0
	switch {
	case p.AgeRating != nil && *p.AgeRating > 0:
		age = *p.AgeRating
	case p.CommonSense != nil && p.CommonSense.CommonSense != nil && *p.CommonSense.CommonSense > 0:
		age = *p.CommonSense.CommonSense
	default:
		return ""
	}
	if age > 21 {
		return ""
	}
	return strconv.Itoa(age) + "+"
}

type mdblistRating struct {
	Source string  `json:"source"`
	Value  float64 `json:"value"`
	Score  float64 `json:"score"`
	Votes  int     `json:"votes"`
}

func parseMDBListRatings(p mdblistPayload) []Rating {
	seen := make(map[string]bool)
	var out []Rating

	for _, r := range p.Ratings {
		source := normalizeMDBSource(r.Source)
		if source == "" || seen[source] {
			continue
		}
		v := r.Value
		if v == 0 {
			v = r.Score
		}
		if v == 0 {
			continue
		}
		normalized, label := mdblistNormalize(source, v)
		if normalized <= 0 {
			continue
		}
		seen[source] = true
		out = append(out, Rating{
			Source: source,
			Value:  normalized,
			Votes:  r.Votes,
			Label:  label,
		})
	}

	// MDBList aggregate score
	if p.Score > 0 && !seen["mdblist"] {
		out = append(out, Rating{
			Source: "mdblist",
			Value:  p.Score / 10,
			Label:  fmt.Sprintf("%.0f", p.Score),
		})
	}

	return out
}

// RatingSources lists the ratings this provider can supply, so a render that
// selected none of them skips the call. It must hold every identifier
// normalizeMDBSource can return; TestMDBListDeclaresEverySourceItMaps checks that.
func (m *MDBList) RatingSources() []string {
	return []string{
		"imdb", "rt", "rtaudience", "metacritic", "metacriticuser", "letterboxd",
		"mdblist", "trakt", "tmdb", "rogerebert", "commonsense", "mal", "anilist",
	}
}

// ProvidesAwards marks MDBList as a source of the awards summary, so a render
// that wants the awards badge fetches it even when no MDBList rating is shown.
func (m *MDBList) ProvidesAwards() bool { return true }

// normalizeMDBSource maps MDBList source strings to canonical source identifiers.
func normalizeMDBSource(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "imdb":
		return "imdb"
	case "tomatoes":
		return "rt"
	case "tomatoes_audience", "popcorn", "popcornmeter", "popcorntime":
		// MDBList reports the Rotten Tomatoes audience (popcornmeter) score under
		// the "popcorn" source; "tomatoes_audience" is kept for compatibility.
		return "rtaudience"
	case "metacritic":
		return "metacritic"
	case "metacritic_user", "metacriticuser", "metacriticusers":
		// The API sends "metacriticuser"; the underscored spelling is kept for
		// compatibility. Missing it dropped the score before it reached a badge.
		return "metacriticuser"
	case "letterboxd":
		return "letterboxd"
	case "mdblist":
		return "mdblist"
	case "trakt":
		return "trakt"
	case "tmdb":
		return "tmdb"
	case "rogerebert":
		return "rogerebert"
	case "commonsense":
		return "commonsense"
	case "myanimelist", "mal":
		return "mal"
	case "anilist":
		return "anilist"
	}
	return ""
}

// mdblistNormalize converts a raw MDBList value to a 0-10 normalized float and
// a display label appropriate for that provider.
func mdblistNormalize(source string, value float64) (float64, string) {
	switch source {
	case "imdb":
		// Already 0–10 scale
		return value, fmt.Sprintf("%.1f", value)
	case "tmdb":
		// MDBList reports TMDB as a 0–100 percentage, while TMDB itself shows a
		// 0–10 score, so 76 here is the 7.6 a viewer expects to read.
		return value / 10, fmt.Sprintf("%.1f", value/10)
	case "rt", "rtaudience":
		// 0–100 percentage
		return value / 10, fmt.Sprintf("%.0f%%", value)
	case "metacritic":
		// 0–100 score
		return value / 10, fmt.Sprintf("%.0f", value)
	case "metacriticuser":
		// Metacritic's user score is out of 10, unlike its critic score.
		return value, fmt.Sprintf("%.1f", value)
	case "letterboxd":
		// 0–5 scale → normalise to 0–10
		return value * 2, fmt.Sprintf("%.1f", value)
	case "rogerebert":
		// Roger Ebert uses a 0–4 star scale.
		return value / 4 * 10, fmt.Sprintf("%.1f", value)
	case "mdblist", "trakt", "commonsense":
		// 0–100 aggregate
		return value / 10, fmt.Sprintf("%.0f", value)
	case "mal", "anilist":
		// 0–10 scale
		return value, fmt.Sprintf("%.1f", value)
	default:
		if value > 10 {
			return value / 10, fmt.Sprintf("%.0f", value)
		}
		return value, fmt.Sprintf("%.1f", value)
	}
}
