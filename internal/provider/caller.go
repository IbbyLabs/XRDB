package provider

import (
	"context"
	"strings"
)

// CallerClass separates traffic a person is waiting on from traffic that sweeps
// the catalogue in bulk.
type CallerClass int

const (
	// CallerInteractive is a caller that named itself and is not a known sweep.
	CallerInteractive CallerClass = iota
	CallerBulk
	// CallerUnknown is a caller that sent no user agent. It is treated exactly
	// as CallerInteractive; a bulk fetcher that does not name itself spends
	// allowance rather than losing badges, since overspending is visible and a
	// missing badge is not. It is a separate value so a count of people is not
	// also a count of everything anonymous.
	CallerUnknown
)

// callerClassCount sizes the per-class state in this package.
const callerClassCount = int(CallerUnknown) + 1

func (c CallerClass) String() string {
	switch c {
	case CallerBulk:
		return "bulk"
	case CallerUnknown:
		return "unknown"
	default:
		return "interactive"
	}
}

type callerClassKey struct{}

// bulkUserAgents are the fetchers that identify themselves as sweeping the
// catalogue, matched case-insensitively against a prefix of the user agent.
//
// Classification cannot use the profile key. Stremio clients send keyless
// poster requests routinely: okhttp requests split roughly two to one between
// keyed and keyless, and the Android TV clients carry no key at all. Treating
// keyless as bulk would remove the badge from those users permanently.
var bulkUserAgents = []string{"aiometadata/"}

// ClassifyUserAgent reports how a caller should be treated.
func ClassifyUserAgent(ua string) CallerClass {
	lower := strings.ToLower(strings.TrimSpace(ua))
	if lower == "" {
		return CallerUnknown
	}
	for _, prefix := range bulkUserAgents {
		if strings.HasPrefix(lower, prefix) {
			return CallerBulk
		}
	}
	return CallerInteractive
}

// WithCallerClass returns a context carrying how this request's caller is
// classified.
func WithCallerClass(ctx context.Context, class CallerClass) context.Context {
	return context.WithValue(ctx, callerClassKey{}, class)
}

// CallerClassFrom reports the caller's class. A context with no class carries
// no caller at all, which is not the same case as a person, so it reports
// CallerUnknown.
func CallerClassFrom(ctx context.Context) CallerClass {
	if class, ok := ctx.Value(callerClassKey{}).(CallerClass); ok {
		return class
	}
	return CallerUnknown
}

type callerAgentKey struct{}

// WithCallerAgent records the user agent the class was derived from.
func WithCallerAgent(ctx context.Context, ua string) context.Context {
	return context.WithValue(ctx, callerAgentKey{}, ua)
}

// CallerAgentFrom returns the recorded user agent, empty when none was recorded
// or the caller sent none.
func CallerAgentFrom(ctx context.Context) string {
	ua, _ := ctx.Value(callerAgentKey{}).(string)
	return ua
}

// CallerClassIdentified reports whether the class was set from a caller that
// named itself. CallerUnknown carries the same distinction; this remains for
// callers that already log the boolean.
func CallerClassIdentified(ctx context.Context) bool {
	_, ok := ctx.Value(callerClassKey{}).(CallerClass)
	if !ok {
		return false
	}
	return strings.TrimSpace(CallerAgentFrom(ctx)) != ""
}
