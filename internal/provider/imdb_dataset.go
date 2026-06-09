package provider

import (
	"bufio"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	imdbRatingsURL     = "https://datasets.imdbws.com/title.ratings.tsv.gz"
	imdbDatasetFile    = "imdb_ratings.tsv.gz"
	imdbDatasetMaxAge  = 7 * 24 * time.Hour // re-download weekly
)

// imdbEntry holds the data for one IMDb title.
type imdbEntry struct {
	Rating float64
	Votes  int
}

// IMDbDataset is a local ratings provider backed by the IMDb public dataset.
// On first Fetch the dataset is downloaded and cached to dataDir.
// Subsequent calls use the in-memory index.
type IMDbDataset struct {
	dataDir    string
	httpClient *http.Client

	mu      sync.RWMutex
	index   map[string]imdbEntry // tconst → entry
	loaded  bool
	loadErr error
}

// NewIMDbDataset creates a dataset provider. dataDir is where the TSV file is cached.
func NewIMDbDataset(dataDir string) *IMDbDataset {
	return &IMDbDataset{
		dataDir:    dataDir,
		httpClient: &http.Client{Timeout: 5 * time.Minute},
	}
}

func (d *IMDbDataset) Name() string { return "imdb_local" }

// Fetch returns an IMDb rating from the local dataset.
// id must be a tt-prefixed IMDb ID (e.g. "tt0468569").
// On first call the dataset is downloaded and parsed.
func (d *IMDbDataset) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	if !strings.HasPrefix(id, "tt") {
		return nil, fmt.Errorf("imdb_local: unsupported id %q (expected tt<imdb-id>)", id)
	}

	if err := d.ensureLoaded(ctx); err != nil {
		return nil, fmt.Errorf("imdb_local: load dataset: %w", err)
	}

	d.mu.RLock()
	entry, ok := d.index[id]
	d.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("imdb_local: id %q not found in dataset", id)
	}

	return &MediaMeta{
		Ratings: []Rating{{
			Source: "imdb",
			Value:  entry.Rating,
			Votes:  entry.Votes,
			Label:  fmt.Sprintf("%.1f", entry.Rating),
		}},
	}, nil
}

// ensureLoaded loads or downloads the dataset if not already in memory.
func (d *IMDbDataset) ensureLoaded(ctx context.Context) error {
	d.mu.RLock()
	loaded, loadErr := d.loaded, d.loadErr
	d.mu.RUnlock()
	if loaded {
		return loadErr
	}

	d.mu.Lock()
	defer d.mu.Unlock()
	// Double-check under write lock.
	if d.loaded {
		return d.loadErr
	}

	path := filepath.Join(d.dataDir, imdbDatasetFile)
	if needsRefresh(path, imdbDatasetMaxAge) {
		if err := d.download(ctx, path); err != nil {
			return fmt.Errorf("download: %w", err)
		}
	}

	idx, err := parseRatingsTSV(path)
	d.loaded = true
	d.index = idx
	d.loadErr = err
	return err
}

// Download re-downloads the dataset from IMDb. Public so callers (e.g. a CLI
// warm-up command) can force a refresh outside of a Fetch call.
func (d *IMDbDataset) Download(ctx context.Context) error {
	if err := os.MkdirAll(d.dataDir, 0o755); err != nil {
		return fmt.Errorf("mkdir: %w", err)
	}
	path := filepath.Join(d.dataDir, imdbDatasetFile)
	if err := d.download(ctx, path); err != nil {
		return err
	}
	// Invalidate the index so the next Fetch re-parses.
	d.mu.Lock()
	d.loaded = false
	d.index = nil
	d.loadErr = nil
	d.mu.Unlock()
	return nil
}

func (d *IMDbDataset) download(ctx context.Context, dest string) error {
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return fmt.Errorf("mkdir: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imdbRatingsURL, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	resp, err := d.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("http %d from imdb dataset", resp.StatusCode)
	}

	f, err := os.CreateTemp(filepath.Dir(dest), "imdb-*.tmp")
	if err != nil {
		return fmt.Errorf("create tmp: %w", err)
	}
	tmp := f.Name()
	defer func() { _ = os.Remove(tmp) }()

	buf := bufio.NewWriterSize(f, 1<<20)
	lr := &io.LimitedReader{R: resp.Body, N: 100 << 20}
	if _, err := io.Copy(buf, lr); err != nil {
		_ = f.Close()
		return fmt.Errorf("write: %w", err)
	}
	if lr.N == 0 {
		// Limit was reached — probe one extra byte to detect overflow.
		var probe [1]byte
		if n, _ := resp.Body.Read(probe[:]); n > 0 {
			_ = f.Close()
			return fmt.Errorf("dataset response exceeds 100 MiB limit")
		}
	}
	if err := buf.Flush(); err != nil {
		_ = f.Close()
		return fmt.Errorf("flush: %w", err)
	}
	if err := f.Close(); err != nil {
		return fmt.Errorf("close: %w", err)
	}
	return os.Rename(tmp, dest)
}

// parseRatingsTSV reads the compressed TSV and builds the in-memory index.
// Format: tconst\taverageRating\tnumVotes (header on first line).
func parseRatingsTSV(path string) (map[string]imdbEntry, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open: %w", err)
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return nil, fmt.Errorf("gzip: %w", err)
	}
	defer gz.Close()

	index := make(map[string]imdbEntry, 600_000)
	sc := bufio.NewScanner(gz)
	first := true
	for sc.Scan() {
		line := sc.Text()
		if first {
			first = false
			continue // skip header row
		}
		parts := strings.SplitN(line, "\t", 3)
		if len(parts) < 3 {
			continue
		}
		tconst, ratingStr, votesStr := parts[0], parts[1], parts[2]
		rating, err := strconv.ParseFloat(ratingStr, 64)
		if err != nil {
			continue
		}
		votes, _ := strconv.Atoi(votesStr)
		index[tconst] = imdbEntry{Rating: rating, Votes: votes}
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("scan: %w", err)
	}
	return index, nil
}

// needsRefresh returns true if path doesn't exist or is older than maxAge.
func needsRefresh(path string, maxAge time.Duration) bool {
	fi, err := os.Stat(path)
	if err != nil {
		return true // missing
	}
	return time.Since(fi.ModTime()) > maxAge
}
