package provider

import (
	"compress/gzip"
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writeFakeTSV(t *testing.T, dir string) string {
	t.Helper()
	path := filepath.Join(dir, imdbDatasetFile)
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create tsv: %v", err)
	}
	defer func() { _ = f.Close() }()
	gz := gzip.NewWriter(f)
	_, _ = gz.Write([]byte("tconst\taverageRating\tnumVotes\n"))
	_, _ = gz.Write([]byte("tt0468569\t9.0\t2500000\n"))
	_, _ = gz.Write([]byte("tt1375666\t8.8\t2000000\n"))
	_, _ = gz.Write([]byte("tt0111161\t9.3\t2800000\n"))
	_ = gz.Close()
	return path
}

func TestIMDbDatasetName(t *testing.T) {
	d := NewIMDbDataset(t.TempDir())
	if d.Name() != "imdb_local" {
		t.Errorf("got name %q, want imdb_local", d.Name())
	}
}

func TestIMDbDatasetImplementsProvider(t *testing.T) {
	var _ Provider = NewIMDbDataset(t.TempDir())
}

func TestIMDbDatasetRejectsNonIMDbID(t *testing.T) {
	d := NewIMDbDataset(t.TempDir())
	_, err := d.Fetch(context.Background(), "movie", "mal:20")
	if err == nil {
		t.Error("expected error for non-IMDb id")
	}
}

func TestIMDbDatasetFetchKnownID(t *testing.T) {
	dir := t.TempDir()
	writeFakeTSV(t, dir)

	d := NewIMDbDataset(dir)
	meta, err := d.Fetch(context.Background(), "movie", "tt0468569")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(meta.Ratings) == 0 {
		t.Fatal("expected at least one rating")
	}
	r := meta.Ratings[0]
	if r.Source != "imdb" {
		t.Errorf("got source %q, want imdb", r.Source)
	}
	if r.Value != 9.0 {
		t.Errorf("got value %v, want 9.0", r.Value)
	}
	if r.Label != "9.0" {
		t.Errorf("got label %q, want 9.0", r.Label)
	}
}

func TestIMDbDatasetFetchUnknownID(t *testing.T) {
	dir := t.TempDir()
	writeFakeTSV(t, dir)

	d := NewIMDbDataset(dir)
	_, err := d.Fetch(context.Background(), "movie", "tt9999999")
	if err == nil {
		t.Error("expected error for unknown id")
	}
}

func TestIMDbDatasetIndexLoadedOnce(t *testing.T) {
	dir := t.TempDir()
	writeFakeTSV(t, dir)

	d := NewIMDbDataset(dir)
	// Two calls — both should succeed without re-parsing.
	for _, id := range []string{"tt0468569", "tt1375666"} {
		meta, err := d.Fetch(context.Background(), "movie", id)
		if err != nil {
			t.Fatalf("fetch %s: %v", id, err)
		}
		if len(meta.Ratings) == 0 {
			t.Fatalf("no ratings for %s", id)
		}
	}
}

func TestNeedsRefreshMissingFile(t *testing.T) {
	if !needsRefresh("/nonexistent/path/file.gz", time.Hour) {
		t.Error("expected needsRefresh=true for missing file")
	}
}

func TestNeedsRefreshFreshFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.gz")
	_ = os.WriteFile(path, []byte("x"), 0o644)
	if needsRefresh(path, time.Hour) {
		t.Error("expected needsRefresh=false for fresh file")
	}
}

func TestNeedsRefreshStaleFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.gz")
	_ = os.WriteFile(path, []byte("x"), 0o644)
	// Back-date the file 8 days.
	old := time.Now().Add(-8 * 24 * time.Hour)
	_ = os.Chtimes(path, old, old)
	if !needsRefresh(path, 7*24*time.Hour) {
		t.Error("expected needsRefresh=true for stale file")
	}
}

func TestParseRatingsTSV(t *testing.T) {
	dir := t.TempDir()
	path := writeFakeTSV(t, dir)

	idx, err := parseRatingsTSV(path)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(idx) != 3 {
		t.Fatalf("got %d entries, want 3", len(idx))
	}

	tests := []struct {
		id     string
		rating float64
		votes  int
	}{
		{"tt0468569", 9.0, 2500000},
		{"tt1375666", 8.8, 2000000},
		{"tt0111161", 9.3, 2800000},
	}
	for _, tt := range tests {
		e, ok := idx[tt.id]
		if !ok {
			t.Errorf("id %s not in index", tt.id)
			continue
		}
		if e.Rating != tt.rating {
			t.Errorf("%s: got rating %v, want %v", tt.id, e.Rating, tt.rating)
		}
		if e.Votes != tt.votes {
			t.Errorf("%s: got votes %d, want %d", tt.id, e.Votes, tt.votes)
		}
	}
}
