// Package warm reads the titles a Stremio addon lists so their artwork can be
// rendered into the cache before anyone asks for it.
package warm

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// maxBodyBytes caps a single manifest or catalogue response. An addon is not a
// trusted source, and an unbounded read is a memory hole.
const maxBodyBytes = 4 << 20

// manifest is the part of a Stremio addon manifest this needs: what catalogues
// it serves.
type manifest struct {
	Catalogs []struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	} `json:"catalogs"`
}

type catalogPage struct {
	Metas []struct {
		ID string `json:"id"`
	} `json:"metas"`
}

// Client reads catalogues from a Stremio addon.
type Client struct {
	HTTP *http.Client
}

// baseOf turns a manifest URL into the addon root the catalogue paths hang off.
func baseOf(manifestURL string) string {
	return strings.TrimSuffix(strings.TrimSpace(manifestURL), "/manifest.json")
}

func (c *Client) get(ctx context.Context, url string, into any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("warm: build request: %w", err)
	}
	client := c.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("warm: get: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("warm: http %d for %s", resp.StatusCode, url)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, maxBodyBytes)).Decode(into)
}

// IDs returns the media ids every catalogue of the addon lists, in the order
// the addon gives them, deduplicated and capped at limit. A catalogue that
// fails is skipped rather than failing the batch: one broken catalogue should
// not cost the warm run every other title.
func (c *Client) IDs(ctx context.Context, manifestURL string, limit int) ([]string, error) {
	if limit <= 0 {
		return nil, nil
	}
	base := baseOf(manifestURL)
	if base == "" {
		return nil, fmt.Errorf("warm: empty manifest URL")
	}

	var mf manifest
	if err := c.get(ctx, base+"/manifest.json", &mf); err != nil {
		return nil, err
	}

	seen := make(map[string]bool, limit)
	out := make([]string, 0, limit)
	for _, cat := range mf.Catalogs {
		if len(out) >= limit {
			break
		}
		if cat.Type == "" || cat.ID == "" {
			continue
		}
		var page catalogPage
		url := fmt.Sprintf("%s/catalog/%s/%s.json", base, cat.Type, cat.ID)
		if err := c.get(ctx, url, &page); err != nil {
			continue
		}
		for _, m := range page.Metas {
			if m.ID == "" || seen[m.ID] {
				continue
			}
			seen[m.ID] = true
			out = append(out, m.ID)
			if len(out) >= limit {
				break
			}
		}
	}
	return out, nil
}
