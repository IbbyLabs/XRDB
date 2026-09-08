package provider

import (
	"os"
	"strings"
)

// sourceBaseURL returns the base URL a source is reached at: XRDB_<NAME>_URL
// when that is set and non-empty, the compiled-in default otherwise.
//
// This is deliberately a different mechanism from XRDB_<SOURCE>_PROXY. A proxy
// is the answer when the upstream is blocked or throttled by address: the
// request still goes to the upstream's own host, just by a different route. A
// base URL is the answer when something in front of the upstream *mocks its API
// surface* and is addressed as though it were the upstream -- a caching
// passthrough shared by several clients, so that one lookup serves all of them.
// A proxy setting cannot express that, because the host in the URL never
// changes.
//
// XRDB_JIKAN_URL already does exactly this for MAL, for the same reason: "what
// upstream pays for is a favour rather than a dependency". This generalises it
// to every source that has a single base.
//
// The value is used exactly as given. A trailing slash is significant, because
// several sources build a request by concatenating a path onto the base rather
// than resolving it as a URL reference -- kitsuBaseURL and the fanart bases end
// in one, tmdbBaseURL does not. Copy the shape of the default being replaced.
func sourceBaseURL(name, fallback string) string {
	if v := strings.TrimSpace(os.Getenv("XRDB_" + name + "_URL")); v != "" {
		return v
	}
	return fallback
}
