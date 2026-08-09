package provider

import (
	"errors"
	"fmt"
	"net"
	"net/http"
)

// ErrSourceFault marks an error that says something about the source's health
// rather than about one title. Only these count toward the failure breaker.
//
// The default runs the other way from how it used to. Failure() counted
// everything it did not recognise, so an error shape nobody had classified
// counted as the source being unwell — which is how a per-title miss came to
// hold a healthy source off every poster. Now an unrecognised error counts for
// nothing.
//
// The cost of that is real and is the cheaper of the two: a genuinely new
// failure mode stops tripping the breaker until somebody classifies it, so a
// sick source answers slightly too long. The old default took a healthy source
// off every render instead.
var ErrSourceFault = errors.New("provider: the source is at fault")

// HTTPFault turns a status code into an error that says whether the source or
// the title is the problem, so the caller does not have to decide from a string.
//
//   - 404 and 410: the title is not there. A fact about the title.
//   - 429: rate limiting, which the rate-limit path already owns.
//   - 5xx: the source is unwell.
//   - anything else (4xx): a bad request of ours, which is not the source's
//     health and not the title's fault either, so it counts for neither.
func HTTPFault(source string, status int) error {
	switch {
	case status == http.StatusNotFound || status == http.StatusGone:
		return fmt.Errorf("%s: http %d: %w", source, status, errNotFound)
	case status >= 500:
		return fmt.Errorf("%s: http %d: %w", source, status, ErrSourceFault)
	default:
		return fmt.Errorf("%s: http %d", source, status)
	}
}

// RecordsAgainstHealth reports whether an error is evidence about the source
// rather than about one title, one request, or one of our own queues.
//
// Recognised as the source's fault: an explicit fault, a rate-limit refusal the
// source itself made, and a transport failure — a connection refused or timed
// out is the source not answering.
func RecordsAgainstHealth(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, ErrSourceFault) {
		return true
	}
	// Our own queues refusing a request are rate-limit errors too, and the
	// source never saw them. They are excluded before this is reached, but the
	// order is load-bearing enough to say so rather than rely on it.
	if errors.Is(err, ErrPacerBacklog) || errors.Is(err, ErrGovernorBacklog) ||
		errors.Is(err, ErrCoolingOff) || errors.Is(err, ErrFailureBreaker) ||
		errors.Is(err, ErrBulkAllowanceHeld) {
		return false
	}
	if errors.Is(err, ErrRateLimited) {
		return true
	}
	var netErr net.Error
	return errors.As(err, &netErr)
}
