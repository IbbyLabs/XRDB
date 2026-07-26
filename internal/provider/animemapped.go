package provider

import (
	"context"
	"fmt"
	"strings"

	"xrdb_rewrite/internal/provider/animemap"
)

// AnimeMapped wraps an anime provider (MAL, AniList, Kitsu) so it can serve
// the render pipeline's native IMDb/TMDB identifiers. Incoming IDs are
// translated to the wrapped service's ID space via the anime mapper; IDs
// already carrying the service prefix pass through untouched. Titles with no
// anime mapping return an error, which the ratings collector ignores.
type AnimeMapped struct {
	inner  Provider
	mapper *animemap.Mapper
	prefix string
	pick   func(animemap.IDs) int
}

// NewAnimeMapped wraps inner with ID translation. inner must be one of the
// anime providers ("mal", "anilist", "kitsu").
func NewAnimeMapped(inner Provider, mapper *animemap.Mapper) *AnimeMapped {
	w := &AnimeMapped{inner: inner, mapper: mapper}
	switch inner.Name() {
	case "mal":
		w.prefix = "mal:"
		w.pick = func(ids animemap.IDs) int { return ids.MAL }
	case "anilist":
		w.prefix = "al:"
		w.pick = func(ids animemap.IDs) int { return ids.AniList }
	case "kitsu":
		w.prefix = "kitsu:"
		w.pick = func(ids animemap.IDs) int { return ids.Kitsu }
	default:
		panic("animemapped: unsupported inner provider " + inner.Name())
	}
	return w
}

// Name satisfies the Provider interface, reporting the inner provider's name.
func (w *AnimeMapped) Name() string { return w.inner.Name() }

// RatingSources forwards the wrapped provider's declaration. Without this the
// wrapper hides it and the render path calls a source nobody selected.
func (w *AnimeMapped) RatingSources() []string {
	if s, ok := w.inner.(RatingSourcer); ok {
		return s.RatingSources()
	}
	return nil
}

// Fetch translates id to the wrapped service's ID space and delegates.
func (w *AnimeMapped) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	if strings.HasPrefix(id, w.prefix) {
		return w.inner.Fetch(ctx, mediaType, id)
	}
	ids, ok := w.mapper.Resolve(ctx, mediaType, id)
	if !ok {
		return nil, fmt.Errorf("%s: no anime mapping for id %q", w.inner.Name(), id)
	}
	n := w.pick(ids)
	if n == 0 {
		return nil, fmt.Errorf("%s: mapping has no %s id for %q", w.inner.Name(), w.inner.Name(), id)
	}
	return w.inner.Fetch(ctx, mediaType, fmt.Sprintf("%s%d", w.prefix, n))
}
