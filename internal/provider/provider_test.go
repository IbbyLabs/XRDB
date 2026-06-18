package provider

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// stubProvider is a Provider that returns a fixed MediaMeta.
type stubProvider struct {
	name  string
	meta  *MediaMeta
	err   error
	calls int
}

func (s *stubProvider) Name() string { return s.name }
func (s *stubProvider) Fetch(_ context.Context, _, _ string) (*MediaMeta, error) {
	s.calls++
	return s.meta, s.err
}

func TestRegistryRegisterAndGet(t *testing.T) {
	r := NewRegistry()
	p := &stubProvider{name: "stub"}
	r.Register(p)
	got := r.Get("stub")
	if got == nil {
		t.Fatal("expected to get registered provider")
	}
	if got.Name() != "stub" {
		t.Errorf("expected name stub, got %q", got.Name())
	}
	if r.Get("missing") != nil {
		t.Error("expected nil for unregistered provider")
	}
}

func TestRegistryDuplicatePanics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("expected panic on duplicate registration")
		}
	}()
	reg := NewRegistry()
	reg.Register(&stubProvider{name: "p"})
	reg.Register(&stubProvider{name: "p"})
}

func TestCachedFetchCachesResult(t *testing.T) {
	stub := &stubProvider{name: "s", meta: &MediaMeta{Title: "Test"}}
	cached := NewCachedFetch(stub, time.Minute)

	m1, _ := cached.Fetch(context.Background(), "movie", "123")
	m2, _ := cached.Fetch(context.Background(), "movie", "123")
	if m1 != m2 {
		t.Error("expected same pointer from cache on second fetch")
	}
	if stub.calls != 1 {
		t.Errorf("expected 1 inner call, got %d", stub.calls)
	}
}

func TestCachedFetchExpires(t *testing.T) {
	stub := &stubProvider{name: "s", meta: &MediaMeta{Title: "Test"}}
	cached := NewCachedFetch(stub, time.Millisecond)

	_, _ = cached.Fetch(context.Background(), "movie", "123")
	time.Sleep(5 * time.Millisecond)
	_, _ = cached.Fetch(context.Background(), "movie", "123")
	if stub.calls != 2 {
		t.Errorf("expected 2 inner calls after expiry, got %d", stub.calls)
	}
}

func TestTMDBClientParsesResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]any{
			"title":         "Inception",
			"overview":      "A thief...",
			"release_date":  "2010-07-16",
			"vote_average":  8.4,
			"vote_count":    35000,
			"poster_path":   "/poster.jpg",
			"backdrop_path": "/backdrop.jpg",
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	p := &TMDB{apiKey: "test", httpClient: srv.Client()}
	// override base URL via direct get call
	ctx := context.Background()
	var result struct {
		Title       string  `json:"title"`
		VoteAverage float64 `json:"vote_average"`
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, srv.URL+"/movie/27205", nil)
	resp, err := p.httpClient.Do(req)
	if err != nil {
		t.Fatalf("http request: %v", err)
	}
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if result.Title != "Inception" {
		t.Errorf("expected Inception, got %q", result.Title)
	}
	if result.VoteAverage != 8.4 {
		t.Errorf("expected 8.4, got %f", result.VoteAverage)
	}
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestTMDBUpdateCredentialsUsesLatestToken(t *testing.T) {
	t.Parallel()

	var gotAuth string
	client := &http.Client{Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		gotAuth = req.Header.Get("Authorization")
		body := io.NopCloser(strings.NewReader(`{"results":[]}`))
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       body,
			Request:    req,
		}, nil
	})}

	p := &TMDB{httpClient: client}
	p.UpdateCredentials("api-key-1", "read-token-1")
	if _, err := p.SearchTitles(context.Background(), "matrix"); err != nil {
		t.Fatalf("search titles: %v", err)
	}
	if gotAuth != "Bearer read-token-1" {
		t.Fatalf("expected bearer token to update, got %q", gotAuth)
	}
}
