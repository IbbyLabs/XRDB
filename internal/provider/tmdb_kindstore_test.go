package provider

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

func notFoundResp() *http.Response {
	return &http.Response{
		StatusCode: http.StatusNotFound,
		Body:       io.NopCloser(strings.NewReader(`{"status_code":34}`)),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
	}
}

// kindProbe counts what a resolution actually asked TMDB for.
func kindProbe(t *testing.T, movie, tv *http.Response) (*TMDB, *[]string) {
	t.Helper()
	var paths []string
	tmdb := NewTMDB("testkey", "")
	tmdb.SetHTTPClient(&http.Client{Transport: rtFunc(func(r *http.Request) (*http.Response, error) {
		paths = append(paths, r.URL.Path)
		switch {
		case strings.HasPrefix(r.URL.Path, "/3/movie/"):
			return movie, nil
		case strings.HasPrefix(r.URL.Path, "/3/tv/"):
			return tv, nil
		}
		return notFoundResp(), nil
	})})
	tmdb.SetKindCachePath("", nil)
	return tmdb, &paths
}

func TestABareTMDBIDResolvesToItsKind(t *testing.T) {
	tmdb, paths := kindProbe(t, notFoundResp(), jsonResp(`{"id":1399,"name":"Game of Thrones"}`))
	kind, err := tmdb.KindOfTMDBID(context.Background(), "1399")
	if err != nil {
		t.Fatalf("resolving 1399: %v", err)
	}
	if kind != "series" {
		t.Errorf("kind %q, want series", kind)
	}
	if len(*paths) != 2 {
		t.Errorf("asked for %v, want the movie probe then the series one", *paths)
	}
}

func TestAResolvedKindIsNotAskedForTwice(t *testing.T) {
	tmdb, paths := kindProbe(t, jsonResp(`{"id":550,"title":"Fight Club"}`), notFoundResp())
	for i := 0; i < 3; i++ {
		if _, err := tmdb.KindOfTMDBID(context.Background(), "550"); err != nil {
			t.Fatalf("resolving 550: %v", err)
		}
	}
	if len(*paths) != 1 {
		t.Errorf("asked TMDB %d times for one id: %v", len(*paths), *paths)
	}
}

func TestAnIDUnderNeitherKindIsRememberedAsAMiss(t *testing.T) {
	tmdb, paths := kindProbe(t, notFoundResp(), notFoundResp())
	for i := 0; i < 3; i++ {
		if _, err := tmdb.KindOfTMDBID(context.Background(), "99999999"); !errors.Is(err, errNotFound) {
			t.Fatalf("want a not-found error, got %v", err)
		}
	}
	// Two probes once, not two per render: an uncached negative is what makes a
	// wrong id cost more than a right one.
	if len(*paths) != 2 {
		t.Errorf("asked TMDB %d times for an id it does not hold: %v", len(*paths), *paths)
	}
}

func TestAMissExpiresAndAHitDoesNot(t *testing.T) {
	store, err := openTMDBKindStore(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = store.Close() }()

	now := time.Now()
	store.rememberMiss("42", now.Add(-2*tmdbKindMissTTL))
	if store.missedRecently("42", now) {
		t.Error("a miss older than its TTL still counts")
	}
	store.rememberMiss("43", now)
	if !store.missedRecently("43", now) {
		t.Error("a fresh miss does not count")
	}

	store.remember("44", "movie")
	if kind, ok := store.lookup("44"); !ok || kind != "movie" {
		t.Errorf("stored kind came back %q/%v", kind, ok)
	}
}

// A rate limit is not a title that does not exist. Recording one as a miss
// would hold the wrong answer for a day and hide the throttling that caused it.
func TestARefusalIsNotRecordedAsAMissingTitle(t *testing.T) {
	limited := &http.Response{
		StatusCode: http.StatusTooManyRequests,
		Body:       io.NopCloser(strings.NewReader(`{"status_code":25}`)),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
	}
	tmdb, paths := kindProbe(t, limited, notFoundResp())
	err := func() error {
		_, err := tmdb.KindOfTMDBID(context.Background(), "550")
		return err
	}()
	if err == nil {
		t.Fatal("a throttled probe reported success")
	}
	if errors.Is(err, errNotFound) {
		t.Error("a throttled probe was reported as a missing title")
	}
	if n := len(*paths); n != 1 {
		t.Errorf("kept probing after a refusal: %v", *paths)
	}

	// And nothing was remembered, so the next render tries again rather than
	// serving the refusal back for a day.
	tmdb2, paths2 := kindProbe(t, jsonResp(`{"id":550,"title":"Fight Club"}`), notFoundResp())
	tmdb2.kinds = tmdb.kinds
	if kind, err := tmdb2.KindOfTMDBID(context.Background(), "550"); err != nil || kind != "movie" {
		t.Errorf("after a refusal the id resolved to %q/%v, want movie", kind, err)
	}
	if len(*paths2) == 0 {
		t.Error("the retry never reached TMDB")
	}
}
