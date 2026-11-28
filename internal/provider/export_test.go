package provider

import "time"

// NewMDBListForTest is an MDBList on base, with a quiet window of quietMinutes
// read from now. The end-of-window log is never scheduled.
func NewMDBListForTest(key, base string, quietMinutes int, now func() time.Time) *MDBList {
	m := NewMDBList(key)
	m.baseURL, m.altBaseURL = base, base
	m.quiet = newMDBListQuietWindow(quietMinutes)
	m.quiet.now = now
	m.quiet.after = func(time.Duration, func()) {}
	return m
}
