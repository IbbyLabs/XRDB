package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

// mediuxGraphQL is MediUX's GraphQL endpoint, and mediuxAssets is where a poster
// or backdrop asset is fetched by id. Both require the Bearer token.
const (
	mediuxGraphQL = "https://images.mediux.io/graphql"
	mediuxAssets  = "https://images.mediux.io/assets/"
)

// MediUX is a curated-artwork source. It is keyed on a TMDB id and returns the
// poster and backdrop from the most popular community set for a title. The API
// is in beta and every request — the GraphQL query and each image — needs a
// per-user Bearer token, so a title with no configured token yields nothing.
type MediUX struct {
	mu         sync.RWMutex
	apiKey     string
	baseURL    string // overrides mediuxGraphQL; set in tests
	httpClient *http.Client
}

// NewMediUX creates a MediUX provider with an instance-default API key. An
// owner-supplied key on the render context takes precedence.
func NewMediUX(apiKey string) *MediUX {
	return &MediUX{apiKey: apiKey, httpClient: newHTTPClient("mediux", 12*time.Second)}
}

func (m *MediUX) Name() string { return "mediux" }

// UpdateCredentials swaps the instance key without a restart.
func (m *MediUX) UpdateCredentials(apiKey string) {
	m.mu.Lock()
	m.apiKey = apiKey
	m.mu.Unlock()
}

// HasCredentials reports whether the provider can authenticate at all.
func (m *MediUX) HasCredentials() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.apiKey != ""
}

// key resolves the token for this render: the owner's own if present, else the
// instance default.
func (m *MediUX) key(ctx context.Context) string {
	if k := keyFrom(ctx, KeyMediux); k != "" {
		return k
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.apiKey
}

const mediuxSetsQuery = `query($id: ID!){movies_by_id(id:$id){movie_sets(filter:{_or:[{movie_poster:{id:{_neq:null}}},{movie_backdrop:{id:{_neq:null}}}]}){popularity movie_poster{id} movie_backdrop{id}}}}`

type mediuxResponse struct {
	Data struct {
		Movie *struct {
			Sets []mediuxSet `json:"movie_sets"`
		} `json:"movies_by_id"`
	} `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

type mediuxSet struct {
	Popularity float64        `json:"popularity"`
	Poster     []mediuxAsset  `json:"movie_poster"`
	Backdrop   []mediuxAsset  `json:"movie_backdrop"`
}

type mediuxAsset struct {
	ID string `json:"id"`
}

// Fetch satisfies the Provider interface, delegating to FetchArtwork.
func (m *MediUX) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	return m.FetchArtwork(ctx, mediaType, id, ArtworkOptions{})
}

// FetchArtwork returns the poster and backdrop from the most popular set for a
// TMDB id. The id must be numeric (TMDB); a tt-id has to be resolved first, so
// the pipeline passes the resolved TMDB id.
func (m *MediUX) FetchArtwork(ctx context.Context, mediaType, id string, opts ArtworkOptions) (*MediaMeta, error) {
	token := m.key(ctx)
	if token == "" {
		return nil, fmt.Errorf("mediux: no api token configured")
	}
	tmdbID := strings.TrimSpace(id)
	if tmdbID == "" || !isNumericID(tmdbID) {
		return nil, fmt.Errorf("mediux: needs a numeric TMDB id, got %q: %w", id, errNotFound)
	}

	body, _ := json.Marshal(map[string]any{
		"query":     mediuxSetsQuery,
		"variables": map[string]string{"id": tmdbID},
	})
	base := m.baseURL
	if base == "" {
		base = mediuxGraphQL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("mediux: request: %w", redactHTTPErr(err))
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusTooManyRequests, http.StatusServiceUnavailable:
		return nil, &RateLimitError{Source: "mediux", Status: resp.StatusCode,
			RetryAfter: retryAfter(resp.Header.Get("Retry-After"))}
	case http.StatusUnauthorized, http.StatusForbidden:
		return nil, fmt.Errorf("mediux: unauthorized (check api token)")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("mediux: http %d", resp.StatusCode)
	}

	var out mediuxResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("mediux: decode: %w", err)
	}
	if len(out.Errors) > 0 {
		return nil, fmt.Errorf("mediux: %s", out.Errors[0].Message)
	}
	if out.Data.Movie == nil || len(out.Data.Movie.Sets) == 0 {
		return nil, fmt.Errorf("mediux: no set for %q: %w", tmdbID, errNotFound)
	}
	return mediaFromSets(out.Data.Movie.Sets), nil
}

// mediaFromSets picks the most popular set that has a poster, and separately the
// most popular with a backdrop, so a set that only contributes one does not deny
// the other.
func mediaFromSets(sets []mediuxSet) *MediaMeta {
	byPop := make([]mediuxSet, len(sets))
	copy(byPop, sets)
	sort.SliceStable(byPop, func(i, j int) bool { return byPop[i].Popularity > byPop[j].Popularity })

	meta := &MediaMeta{}
	for _, s := range byPop {
		if meta.PosterURL == "" && len(s.Poster) > 0 && s.Poster[0].ID != "" {
			meta.PosterURL = mediuxAssets + s.Poster[0].ID
		}
		if meta.BackdropURL == "" && len(s.Backdrop) > 0 && s.Backdrop[0].ID != "" {
			meta.BackdropURL = mediuxAssets + s.Backdrop[0].ID
		}
		if meta.PosterURL != "" && meta.BackdropURL != "" {
			break
		}
	}
	return meta
}

func isNumericID(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
