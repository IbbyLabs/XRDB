package server

import (
	"context"

	"xrdb_rewrite/internal/provider"
)

// renderStore is how a finished render is kept in the render cache.
type renderStore int

const (
	skipRenderStore renderStore = iota
	storeRender
	storeRenderFromBulk
)

// renderStoreFor decides how a cacheable render is stored. degraded means one
// of our own gates held a badge back. A named sweep's renders are not re-read,
// so are not stored; an unknown caller's are, large ones shed first. A warm
// render is for the next reader, so it is stored only when nothing was held.
func renderStoreFor(ctx context.Context, degraded bool) renderStore {
	class := provider.CallerClassFrom(ctx)
	switch {
	case isWarmRequest(ctx):
		if degraded {
			return skipRenderStore
		}
		return storeRender
	case class == provider.CallerBulk:
		return skipRenderStore
	case provider.TreatedAsBulk(class):
		return storeRenderFromBulk
	}
	return storeRender
}
