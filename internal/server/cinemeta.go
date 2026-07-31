package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// cinemetaBase is Stremio's default metadata addon. XRDB reads a title's full
// meta from here when it is asked to serve meta with the Cinemeta rating
// stripped, so every field but the rating passes through unchanged.
const cinemetaBase = "https://v3-cinemeta.strem.io"

// cinemetaMaxBody caps a single meta response. Cinemeta is not a trusted source.
const cinemetaMaxBody = 2 << 20

// fetchCinemetaMeta returns the raw meta object for a title, as a map so every
// field passes through without XRDB having to model Cinemeta's whole schema.
func fetchCinemetaMeta(ctx context.Context, client *http.Client, base, mediaType, id string) (map[string]any, error) {
	if base == "" {
		base = cinemetaBase
	}
	url := fmt.Sprintf("%s/meta/%s/%s.json", base, mediaType, id)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	if client == nil {
		client = &http.Client{Timeout: 6 * time.Second}
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("cinemeta: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("cinemeta: http %d", resp.StatusCode)
	}
	var wrapper struct {
		Meta map[string]any `json:"meta"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, cinemetaMaxBody)).Decode(&wrapper); err != nil {
		return nil, fmt.Errorf("cinemeta: decode: %w", err)
	}
	if wrapper.Meta == nil {
		return nil, fmt.Errorf("cinemeta: empty meta")
	}
	return wrapper.Meta, nil
}

// stripImdbRating removes the IMDb rating from a Cinemeta meta object, both the
// top-level imdbRating field and the "imdb" entry in the links array, so
// Cinemeta's rating does not appear beside the one XRDB overlays. It mutates and
// returns the same map.
func stripImdbRating(meta map[string]any) map[string]any {
	if meta == nil {
		return meta
	}
	delete(meta, "imdbRating")
	links, ok := meta["links"].([]any)
	if !ok {
		return meta
	}
	kept := links[:0]
	for _, l := range links {
		if m, ok := l.(map[string]any); ok {
			if cat, _ := m["category"].(string); cat == "imdb" {
				continue
			}
		}
		kept = append(kept, l)
	}
	meta["links"] = kept
	return meta
}
