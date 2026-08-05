package provider

import (
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

// gzTSV builds a ratings dataset body with one title at the given rating.
func gzTSV(t *testing.T, rating string) []byte {
	t.Helper()
	var buf writeBuf
	gz := gzip.NewWriter(&buf)
	_, _ = gz.Write([]byte("tconst\taverageRating\tnumVotes\n"))
	_, _ = fmt.Fprintf(gz, "tt0111161\t%s\t2800000\n", rating)
	if err := gz.Close(); err != nil {
		t.Fatalf("gzip: %v", err)
	}
	return buf.b
}

type writeBuf struct{ b []byte }

func (w *writeBuf) Write(p []byte) (int, error) { w.b = append(w.b, p...); return len(p), nil }

func ratingOf(t *testing.T, d *IMDbDataset) float64 {
	t.Helper()
	meta, err := d.Fetch(context.Background(), "movie", "tt0111161")
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if len(meta.Ratings) == 0 {
		t.Fatal("no rating returned")
	}
	return meta.Ratings[0].Value
}

// The age check only ever ran on the first Fetch, so a long-running process
// served whatever it downloaded at startup, indefinitely (FR-167).
func TestARefreshReplacesTheLiveIndex(t *testing.T) {
	rating := "9.3"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(gzTSV(t, rating))
	}))
	defer srv.Close()

	d := NewIMDbDataset(t.TempDir())
	d.httpClient = srv.Client()
	d.ratingsURL = srv.URL

	if got := ratingOf(t, d); got != 9.3 {
		t.Fatalf("first load gave %v, want 9.3", got)
	}

	rating = "8.1" // IMDb publishes a new figure
	if err := d.refresh(context.Background()); err != nil {
		t.Fatalf("refresh: %v", err)
	}
	if got := ratingOf(t, d); got != 8.1 {
		t.Errorf("after a refresh the index still serves %v; the rebuild did not take", got)
	}
}

// The control that matters: a refresh that fails must leave the previous index
// serving. Stale ratings beat none, and dropping the index was the old
// behaviour of Download.
func TestAFailedRefreshKeepsTheOldIndexServing(t *testing.T) {
	fail := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if fail {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		_, _ = w.Write(gzTSV(t, "9.3"))
	}))
	defer srv.Close()

	d := NewIMDbDataset(t.TempDir())
	d.httpClient = srv.Client()
	d.ratingsURL = srv.URL

	if got := ratingOf(t, d); got != 9.3 {
		t.Fatalf("first load gave %v, want 9.3", got)
	}

	fail = true
	if err := d.refresh(context.Background()); err == nil {
		t.Fatal("a failing download reported success")
	}
	if got := ratingOf(t, d); got != 9.3 {
		t.Errorf("a failed refresh left %v serving; the previous index must survive", got)
	}
	if n := d.Titles(); n != 1 {
		t.Errorf("the index holds %d titles after a failed refresh, want 1", n)
	}
}

// An interval of zero turns the rebuild off rather than spinning.
func TestStartRefreshIgnoresAZeroInterval(t *testing.T) {
	d := NewIMDbDataset(t.TempDir())
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	d.StartRefresh(ctx, 0, slog.New(slog.NewTextHandler(io.Discard, nil)))
}
