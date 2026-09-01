package provider

import (
	"strings"
	"sync/atomic"
)

// The running version, told to the sources that ask a client to identify
// itself. Held here rather than in one source's file: two providers send it and
// a version read out of simkl.go by a third reads as a copy-paste slip.
var appVersion atomic.Pointer[string]

// SetAppVersion records the running version for every outbound identification.
func SetAppVersion(v string) {
	v = strings.TrimSpace(v)
	if v == "" {
		return
	}
	appVersion.Store(&v)
}

// version returns the running version, or "0" before one is recorded.
func version() string {
	if p := appVersion.Load(); p != nil {
		return *p
	}
	return "0"
}
