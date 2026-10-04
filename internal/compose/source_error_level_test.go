package compose

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"testing"

	"xrdb_rewrite/internal/provider"
)

func TestDidNotAnswerLevel(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want slog.Level
	}{
		{"server error", provider.HTTPFault("trakt", 503), slog.LevelWarn},
		{"unclassified status", provider.HTTPFault("trakt", 403), slog.LevelWarn},
		{"transport timeout", &net.OpError{Op: "dial", Err: errors.New("i/o timeout")}, slog.LevelWarn},
		{"deadline", fmt.Errorf("trakt: %w", context.DeadlineExceeded), slog.LevelWarn},
		{"missing title", provider.HTTPFault("trakt", 404), slog.LevelDebug},
		{"not applicable", provider.ErrNotApplicable, slog.LevelDebug},
		{"own pacer hold-out", provider.ErrPacerBacklog, slog.LevelDebug},
	}
	for _, c := range cases {
		if got := didNotAnswerLevel(c.err); got != c.want {
			t.Errorf("%s: level = %v, want %v", c.name, got, c.want)
		}
	}
}
