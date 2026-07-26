// Package logging provides the structured logger, request-id propagation, and
// secret redaction used across the service. One logger is built at startup and
// installed as the slog default; subsystems log through it.
package logging

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/url"
	"os"
	"strings"
)

// level holds the process-wide verbosity. A slog.LevelVar is safe for
// concurrent use and is read on every log call, so changing it takes effect
// immediately on a running server without rebuilding the handler.
var level = new(slog.LevelVar)

// Levels are the accepted level names, ordered least to most severe. Exported
// so callers (the admin API, the UI) can offer the same set the parser accepts.
var Levels = []string{"debug", "info", "warn", "error"}

// ParseLevel maps a level name to a slog.Level, accepting the names in Levels
// case-insensitively plus "warning" as an alias for "warn". The bool reports
// whether the name was recognised; unrecognised names yield info.
func ParseLevel(name string) (slog.Level, bool) {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "debug":
		return slog.LevelDebug, true
	case "info":
		return slog.LevelInfo, true
	case "warn", "warning":
		return slog.LevelWarn, true
	case "error":
		return slog.LevelError, true
	default:
		return slog.LevelInfo, false
	}
}

// SetLevel changes the verbosity of the running process. It reports whether the
// name was recognised; on an unrecognised name the level is left untouched
// rather than silently reset to info.
func SetLevel(name string) bool {
	lvl, ok := ParseLevel(name)
	if !ok {
		return false
	}
	level.Set(lvl)
	return true
}

// LevelName returns the current level as one of the names in Levels.
func LevelName() string {
	switch level.Level() {
	case slog.LevelDebug:
		return "debug"
	case slog.LevelWarn:
		return "warn"
	case slog.LevelError:
		return "error"
	default:
		return "info"
	}
}

// New returns a JSON slog.Logger writing to stdout at the given level. Accepts
// the names in Levels (case-insensitive); anything else is info. The handler
// reads the level dynamically, so SetLevel affects loggers already handed out.
func New(name string) *slog.Logger {
	lvl, _ := ParseLevel(name)
	level.Set(lvl)
	h := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})
	return slog.New(h)
}

type ctxKey int

const requestIDKey ctxKey = iota

// NewRequestID returns a short random hex id for correlating a request's logs.
func NewRequestID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "unknown"
	}
	return hex.EncodeToString(b[:])
}

// WithRequestID returns a context carrying id.
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey, id)
}

// RequestID returns the request id stored on ctx, or "" if none.
func RequestID(ctx context.Context) string {
	if v, ok := ctx.Value(requestIDKey).(string); ok {
		return v
	}
	return ""
}

// sensitiveParams are query keys whose values must never appear in a log.
var sensitiveParams = map[string]struct{}{
	"key": {}, "apikey": {}, "api_key": {}, "token": {},
	"password": {}, "pass": {}, "admin_key": {}, "adminkey": {}, "secret": {},
	"client_id": {}, "client_secret": {},
}

// RedactQuery returns rawQuery with sensitive values replaced by "REDACTED".
// Unparseable input returns "" rather than risk leaking a secret verbatim.
func RedactQuery(rawQuery string) string {
	if rawQuery == "" {
		return ""
	}
	values, err := url.ParseQuery(rawQuery)
	if err != nil {
		return ""
	}
	for k := range values {
		if _, bad := sensitiveParams[strings.ToLower(k)]; bad {
			for i := range values[k] {
				values[k][i] = "REDACTED"
			}
		}
	}
	return values.Encode()
}
