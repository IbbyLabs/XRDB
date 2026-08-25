// Package logging provides the structured logger, request-id propagation, and
// secret redaction used across the service. One logger is built at startup and
// installed as the slog default; subsystems log through it.
package logging

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
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

// RedactURL reduces a URL to scheme and host. Some services carry their
// credential in the path rather than the query — a Stremio addon install link
// puts the whole configuration, debrid token included, in the first segment —
// so naming the host is as much as can be logged safely.
func RedactURL(raw string) string {
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Host == "" {
		// Unparseable or host-less: say nothing rather than guess at a boundary.
		return "REDACTED"
	}
	host := parsed.Host
	if parsed.Scheme != "" {
		host = parsed.Scheme + "://" + host
	}
	if parsed.Path != "" && parsed.Path != "/" {
		return host + "/…"
	}
	return host
}

// sensitiveFragments match a query key whose value must never appear in a log.
// Matching on a fragment rather than on an exact name is what makes this safe by
// default: a migrated v2 profile still carries provider credentials in its config
// blob (mdblistKey, tmdbKey, fanartKey, omdbKey, xrdbKey, simklClientId,
// traktClientId), and a config blob can be rendered inline. A list of exact names
// silently passes every name it has not been told about.
var sensitiveFragments = []string{
	"key", "token", "secret", "password", "pass", "clientid", "client_id", "credential", "auth",
	"sig", "signature", "hmac", "session", "cookie", "bearer",
}

// notSensitive names query keys that contain a fragment above and carry nothing
// secret. Without it, a search term or a passthrough flag would be redacted and
// the log would lose something useful.
var notSensitive = map[string]struct{}{
	"keywords": {}, "keyword": {}, "passthrough": {},
}

func isSensitiveParam(name string) bool {
	lower := strings.ToLower(name)
	if _, fine := notSensitive[lower]; fine {
		return false
	}
	for _, frag := range sensitiveFragments {
		if strings.Contains(lower, frag) {
			return true
		}
	}
	return false
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
		for i := range values[k] {
			if isSensitiveParam(k) {
				values[k][i] = "REDACTED"
				continue
			}
			// A v2 profile keeps its credentials inside the config blob, so a
			// parameter with an innocent name can still carry one.
			values[k][i] = redactJSONCredentials(values[k][i])
		}
	}
	return values.Encode()
}

// redactJSONCredentials replaces the value of any credential-named field in a
// JSON object, leaving the rest readable. A value that is not a JSON object is
// returned unchanged.
func redactJSONCredentials(value string) string {
	trimmed := strings.TrimSpace(value)
	if !strings.HasPrefix(trimmed, "{") {
		return value
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal([]byte(trimmed), &fields); err != nil {
		return value
	}
	touched := false
	for k := range fields {
		if isSensitiveParam(k) {
			fields[k] = json.RawMessage(`"REDACTED"`)
			touched = true
		}
	}
	if !touched {
		return value
	}
	out, err := json.Marshal(fields)
	if err != nil {
		return "REDACTED"
	}
	return string(out)
}
