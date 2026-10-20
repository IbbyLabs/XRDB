package compose

import (
	"context"
	"fmt"
	"log/slog"
	"runtime/debug"

	"xrdb_rewrite/internal/logging"
	"xrdb_rewrite/internal/provider"
)

// logRenderPanic records a panic recovered inside a render's goroutine.
func logRenderPanic(ctx context.Context, where string, v any) {
	slog.Default().ErrorContext(ctx, "Recovered from a panic during a render",
		"id", logging.RequestID(ctx), "where", where, "panic", fmt.Sprint(v), "stack", string(debug.Stack()))
}

// safeFetch runs a ratings fetch, turning a panic into an error.
func safeFetch(ctx context.Context, fetch ratingsFetch) (meta *provider.MediaMeta, complete bool, err error) {
	defer func() {
		if v := recover(); v != nil {
			logRenderPanic(ctx, "ratings fetch", v)
			meta, complete, err = nil, false, fmt.Errorf("ratings fetch panicked: %v", v)
		}
	}()
	return fetch(ctx)
}
