package server

import "sync/atomic"

var draining atomic.Bool

// BeginDrain makes /readyz answer 503 from now on, while every other route
// keeps serving.
func BeginDrain() { draining.Store(true) }
