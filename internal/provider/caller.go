package provider

import (
	"context"
	"strings"
)

// CallerClass separates traffic a person is waiting on from traffic that sweeps
// the catalogue in bulk.
type CallerClass int

const (
	// CallerInteractive is the default, and an unrecognised caller lands here.
	// A bulk fetcher that does not name itself spends allowance rather than
	// losing badges: overspending is visible, a missing badge is not.
	CallerInteractive CallerClass = iota
	CallerBulk
)

func (c CallerClass) String() string {
	if c == CallerBulk {
		return "bulk"
	}
	return "interactive"
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

// CallerClassFrom reports the caller's class, defaulting to interactive.
func CallerClassFrom(ctx context.Context) CallerClass {
	if class, ok := ctx.Value(callerClassKey{}).(CallerClass); ok {
		return class
	}
	return CallerInteractive
}
