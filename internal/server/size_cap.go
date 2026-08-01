package server

import (
	"context"

	"xrdb_rewrite/internal/imageconfig"
)

type sizeCapKey struct{}

// withSizeCap marks a request as reached through a route that caps the output
// size. It rides on the context rather than the query so it cannot be set from
// outside: a caller choosing its own cap would be choosing another profile's
// render cost.
func withSizeCap(ctx context.Context, max imageconfig.MediaSize) context.Context {
	return context.WithValue(ctx, sizeCapKey{}, max)
}

// sizeCapFrom returns the cap for this request, or "" when the route sets none.
func sizeCapFrom(ctx context.Context) imageconfig.MediaSize {
	v, _ := ctx.Value(sizeCapKey{}).(imageconfig.MediaSize)
	return v
}
