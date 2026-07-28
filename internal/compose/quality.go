package compose

import (
	"context"
	"strings"
	"sync"
	"time"

	"xrdb_rewrite/internal/logging"
	"xrdb_rewrite/internal/provider"
)

// DefaultQualityCacheTTL is how long a title's detected qualities stand in for
// asking again. What a title is available in moves over weeks, not minutes.
const DefaultQualityCacheTTL = 24 * time.Hour

// qualityCacheMax bounds the number of remembered titles.
const qualityCacheMax = 50_000

// qualityDetector reports which badge tokens a title has releases for.
// Satisfied by *provider.StreamQuality.
type qualityDetector interface {
	Detect(ctx context.Context, contentType, id string) (map[string]bool, error)
}

// qualityCache remembers a title's available qualities.
//
// The addon call is the one part of the badge row that leaves the host, so it
// is asked once per title and shared: a catalogue opening on twenty posters of
// the same title asks once, and the answer outlives the render that paid for it.
type qualityCache struct {
	ttl time.Duration

	mu       sync.Mutex
	entries  map[string]qualityEntry
	inflight map[string]*qualityCall
}

type qualityEntry struct {
	tokens    map[string]bool
	expiresAt time.Time
}

type qualityCall struct {
	done   chan struct{}
	tokens map[string]bool
	err    error
}

func newQualityCache(ttl time.Duration) *qualityCache {
	if ttl <= 0 {
		ttl = DefaultQualityCacheTTL
	}
	return &qualityCache{
		ttl:      ttl,
		entries:  make(map[string]qualityEntry),
		inflight: make(map[string]*qualityCall),
	}
}

// do returns the remembered tokens for key, or runs fetch to produce them.
// A failure is not remembered: caching it would hold an addon's outage past
// its end. An empty answer is, because "nothing carries this" is a real answer.
func (c *qualityCache) do(ctx context.Context, key string, fetch func() (map[string]bool, error)) (map[string]bool, error) {
	if c == nil {
		return fetch()
	}

	c.mu.Lock()
	if e, ok := c.entries[key]; ok && time.Now().Before(e.expiresAt) {
		c.mu.Unlock()
		return e.tokens, nil
	}
	if call, ok := c.inflight[key]; ok {
		c.mu.Unlock()
		select {
		case <-call.done:
			return call.tokens, call.err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	call := &qualityCall{done: make(chan struct{})}
	c.inflight[key] = call
	c.mu.Unlock()

	call.tokens, call.err = fetch()
	close(call.done)

	c.mu.Lock()
	delete(c.inflight, key)
	if call.err == nil {
		if len(c.entries) >= qualityCacheMax {
			c.entries = make(map[string]qualityEntry)
		}
		c.entries[key] = qualityEntry{tokens: call.tokens, expiresAt: time.Now().Add(c.ttl)}
	}
	c.mu.Unlock()

	return call.tokens, call.err
}

// SetQualityDetector attaches the stream addon quality lookup. Optional: nil
// leaves quality badges as the plain labels they are.
func (p *Pipeline) SetQualityDetector(d qualityDetector, ttl time.Duration) {
	p.quality = d
	p.qualityCache = newQualityCache(ttl)
}

// streamContentType maps a render onto the addon's own vocabulary. An id
// carrying a season and episode is a series whatever the caller said.
func streamContentType(contentType, id string) string {
	if strings.Contains(id, ":") {
		return "series"
	}
	if provider.IsSeriesContentType(contentType) {
		return "series"
	}
	return "movie"
}

// qualityResolver is awaited just before the badge row is drawn. It returns the
// badges to draw and whether the answer was verified.
type qualityResolver func() (badges []string, verified bool)

// startQualityDetect kicks off the addon lookup so it runs alongside the rating
// fan-out rather than after it. It returns nil when there is nothing to verify,
// which is the common case and costs nothing.
//
// There is no per-render switch: a quality badge that is not true of the title
// is decoration, so the row is always checked where it can be. An instance with
// no addon configured has nothing to check against and draws the picks as they
// are, which is what every instance did before the check existed.
func (p *Pipeline) startQualityDetect(ctx context.Context, cfg imageconfigBadges, contentType, id string) qualityResolver {
	if p.quality == nil || len(cfg.badges) == 0 || cfg.hidden {
		return nil
	}
	if !strings.HasPrefix(id, "tt") {
		// Every addon keys on IMDb, so a title we could not resolve to one is
		// drawn as picked rather than held back.
		return nil
	}

	streamType := streamContentType(contentType, id)
	key := streamType + ":" + id
	selected := cfg.badges

	type outcome struct {
		tokens map[string]bool
		err    error
	}
	ch := make(chan outcome, 1)
	go func() {
		tokens, err := p.qualityCache.do(ctx, key, func() (map[string]bool, error) {
			return p.quality.Detect(ctx, streamType, id)
		})
		ch <- outcome{tokens, err}
	}()

	return func() ([]string, bool) {
		res := <-ch
		if res.err != nil {
			p.log().WarnContext(ctx, "Could not check which qualities a title is available in; drawing the picked badges unverified",
				"id", logging.RequestID(ctx), "media_id", id,
				"content_type", streamType, "error", res.err)
			return selected, false
		}
		kept := filterAvailableBadges(selected, res.tokens)
		p.log().DebugContext(ctx, "Checked which qualities a title is available in",
			"id", logging.RequestID(ctx), "media_id", id,
			"picked", len(selected), "drawn", len(kept))
		return kept, true
	}
}

// imageconfigBadges is the slice of render config the lookup depends on, so the
// decision to run is made from two fields rather than the whole config.
type imageconfigBadges struct {
	badges []string
	hidden bool
}

// filterAvailableBadges keeps the picked badges the title has a release in,
// in the order they were picked.
func filterAvailableBadges(selected []string, available map[string]bool) []string {
	kept := make([]string, 0, len(selected))
	for _, badge := range selected {
		if available[strings.ToLower(strings.TrimSpace(badge))] {
			kept = append(kept, badge)
		}
	}
	return kept
}
