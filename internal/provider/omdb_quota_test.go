package provider

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

// OMDb reports a spent allowance with HTTP 200 in the same envelope it uses for
// a title it does not carry. As a plain error it reached none of the machinery
// that exists: not degraded, not cooled off, and no X on the poster.
func omdbSaying(t *testing.T, body string) *OMDB {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	o := NewOMDB("key")
	o.baseURL = srv.URL
	o.httpClient = srv.Client()
	return o
}

func TestASpentOMDbAllowanceIsARateLimit(t *testing.T) {
	o := omdbSaying(t, `{"Response":"False","Error":"Request limit reached!"}`)
	_, err := o.Fetch(context.Background(), "movie", "tt0111161")

	if err == nil {
		t.Fatal("a spent allowance returned no error")
	}
	// A test asserting only that it errors passes today, which is the point.
	if !errors.Is(err, ErrRateLimited) {
		t.Errorf("a spent allowance is not a rate limit: %v", err)
	}
	var rl *RateLimitError
	if errors.As(err, &rl) && !rl.QuotaExhausted {
		t.Error("a spent allowance was not marked as an exhausted quota")
	}
}

// The control, and the one that stops this cooling the source off on every
// obscure film: OMDb uses the same envelope to say it does not carry a title.
func TestAMissingTitleIsNotARateLimit(t *testing.T) {
	o := omdbSaying(t, `{"Response":"False","Error":"Movie not found!"}`)
	_, err := o.Fetch(context.Background(), "movie", "tt9999999")

	if err == nil {
		t.Fatal("a missing title returned no error")
	}
	if errors.Is(err, ErrRateLimited) {
		t.Error("a title OMDb does not carry was treated as a rate limit")
	}
	if !errors.Is(err, errNotFound) {
		t.Errorf("a missing title is not a not-found: %v", err)
	}
}

// A rejected key is the source's own problem but it never recovers, so it must
// not be classed as a rate limit either.
func TestARejectedKeyIsNotARateLimit(t *testing.T) {
	o := omdbSaying(t, `{"Response":"False","Error":"Invalid API key!"}`)
	_, err := o.Fetch(context.Background(), "movie", "tt0111161")

	if err == nil {
		t.Fatal("a rejected key returned no error")
	}
	if errors.Is(err, ErrRateLimited) {
		t.Error("a rejected key was treated as a rate limit, so it would be retried forever")
	}
	if errors.Is(err, errNotFound) {
		t.Error("a rejected key was treated as a missing title, so it would never mark the source unhealthy")
	}
}
