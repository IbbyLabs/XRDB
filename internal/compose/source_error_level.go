package compose

import (
	"context"
	"errors"
	"log/slog"

	"xrdb_rewrite/internal/provider"
)

// didNotAnswerLevel is warn for an error that is the source's or the call's,
// and debug for a hold-out (warned on its own line) or a fact about one title.
func didNotAnswerLevel(err error) slog.Level {
	if provider.HoldOutGate(err) != "" {
		return slog.LevelDebug
	}
	var uncounted *provider.UncountedStatus
	if provider.RecordsAgainstHealth(err) || errors.As(err, &uncounted) ||
		errors.Is(err, context.DeadlineExceeded) {
		return slog.LevelWarn
	}
	return slog.LevelDebug
}
