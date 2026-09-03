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
	return omdbWithKeysSaying(t, "key", body)
}

func omdbWithKeysSaying(t *testing.T, keys, body string) *OMDB {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	o := NewOMDB(keys)
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

// Rotation shares a branch with the classification, so the test above passes
// whether or not markSpent runs.
func TestASpentOMDbAllowanceRotatesTheKey(t *testing.T) {
	o := omdbWithKeysSaying(t, "first,second", `{"Response":"False","Error":"Request limit reached!"}`)
	if got := o.keys.current(); got != "first" {
		t.Fatalf("the ring started on %q, want first", got)
	}

	_, _ = o.Fetch(context.Background(), "movie", "tt0111161")

	if got := o.keys.current(); got != "second" {
		t.Errorf("current = %q, want second after the allowance was spent", got)
	}
}

// An owner's credential has its own allowance, so spending it must not move the
// server's ring.
func TestAnOwnerKeySpentOnOMDbDoesNotMoveTheServerRing(t *testing.T) {
	o := omdbWithKeysSaying(t, "first,second", `{"Response":"False","Error":"Request limit reached!"}`)
	ctx := WithKeys(context.Background(), map[string]string{KeyOMDB: "theirs"})

	_, _ = o.Fetch(ctx, "movie", "tt0111161")

	if got := o.keys.current(); got != "first" {
		t.Errorf("current = %q, want first", got)
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
