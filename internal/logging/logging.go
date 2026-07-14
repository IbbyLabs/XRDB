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

// New returns a JSON slog.Logger writing to stdout at the given level. Accepts
// "debug", "info", "warn", "error" (case-insensitive); anything else is info.
func New(level string) *slog.Logger {
	var lvl slog.Level
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		lvl = slog.LevelDebug
	case "warn", "warning":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	h := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: lvl})
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
