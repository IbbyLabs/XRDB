package provider

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

const mdblistProbeTimeout = 15 * time.Second

// StartKeyProbe measures each server key's daily allowance in the background
// when the ring holds more than one key, and keeps doing so for keys added later.
// Call it once the stored budgets are loaded, so a fresh measurement is not repeated.
func (m *MDBList) StartKeyProbe() {
	m.probing.Store(true)
	go m.probeKeys(context.Background(), dailyBudgetFor("mdblist"))
}

// probeKeys reads the allowance of every key whose measurement is missing or
// stale. A failure leaves that key on the budget's projection.
func (m *MDBList) probeKeys(ctx context.Context, b *dailyBudget) {
	m.probeMu.Lock()
	defer m.probeMu.Unlock()
	keys := m.keys.all()
	if len(keys) < 2 {
		return
	}
	for _, key := range keys {
		fp := keyFingerprint(key)
		if !b.needsProbe(fp) {
			continue
		}
		pctx, cancel := context.WithTimeout(ctx, mdblistProbeTimeout)
		limit, err := m.probeKey(pctx, key)
		cancel()
		if err != nil {
			m.log().Warn("Could not measure a key's daily allowance, so it stays on the projection",
				"source", "mdblist", "key", fp, "error", redactHTTPErr(err))
			continue
		}
		b.setLimit(fp, limit)
		m.log().Info("Measured a key's daily allowance", "source", "mdblist", "key", fp, "limit", limit)
	}
}

// probeKey asks /user for one key's allowance.
func (m *MDBList) probeKey(ctx context.Context, key string) (int, error) {
	base := mdblistBase
	if m.baseURL != "" {
		base = m.baseURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		base+"/user?"+url.Values{"apikey": {key}}.Encode(), nil)
	if err != nil {
		return 0, err
	}
	resp, err := m.httpClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, HTTPFault("mdblist", resp.StatusCode)
	}
	if limit, ok := headerNumber(resp.Header, "X-RateLimit-Limit"); ok && limit > 0 {
		return int(limit), nil
	}
	// /user sends no rate-limit headers and does not count against the allowance.
	var body struct {
		APIRequests int `json:"api_requests"`
		RateLimit   int `json:"rate_limit"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&body); err != nil {
		return 0, fmt.Errorf("decode: %w", err)
	}
	for _, l := range []int{body.APIRequests, body.RateLimit} {
		if l > 0 {
			return l, nil
		}
	}
	return 0, errors.New("the response carried no limit")
}
