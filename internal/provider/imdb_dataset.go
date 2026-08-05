package provider

import (
	"bufio"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	imdbRatingsURL    = "https://datasets.imdbws.com/title.ratings.tsv.gz"
	imdbDatasetFile   = "imdb_ratings.tsv.gz"
	imdbDatasetMaxAge = 7 * 24 * time.Hour // re-download weekly
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
	// ratingsURL overrides the published dataset URL; set in tests.
	ratingsURL string

	// topRated is opt-in: building it streams a second, much larger dataset,
	// which is not a cost to impose on an operator who does not want the badge.
	topRatedEnabled bool

	mu       sync.RWMutex
	index    map[string]imdbEntry // tconst → entry
	topRated map[string]int       // tconst → rank, 1-based
	loaded   bool
	loadErr  error
}

// EnableTopRated turns on the top-rated ranking. It costs one streamed pass
// over IMDb's title-basics dataset per refresh, needed to tell films apart from
// the TV episodes that would otherwise dominate the list.
func (d *IMDbDataset) EnableTopRated() { d.topRatedEnabled = true }

// NewIMDbDataset creates a dataset provider. dataDir is where the TSV file is cached.
func NewIMDbDataset(dataDir string) *IMDbDataset {
	return &IMDbDataset{
		dataDir:    dataDir,
		httpClient: &http.Client{Timeout: 5 * time.Minute},
	}
}

func (d *IMDbDataset) Name() string { return "imdb_local" }

// RatingSources lists the rating this provider can supply, so a render that
// selected none of them skips the call.
func (d *IMDbDataset) RatingSources() []string { return []string{"imdb"} }

// RanksTitles reports that this provider also carries the top-rated rank.
func (d *IMDbDataset) RanksTitles() bool { return d.topRatedEnabled }

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
	rank := d.topRated[id]
	d.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("imdb_local: id %q not found in dataset: %w", id, errNotFound)
	}

	return &MediaMeta{
		TopRatedRank: rank,
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
	if err == nil && d.topRatedEnabled {
		// A failure here must not take the ratings down with it: the rank is a
		// garnish, the ratings are the point.
		if ranks, rankErr := buildTopRated(ctx, d.httpClient, idx); rankErr != nil {
			slog.WarnContext(ctx, "Could not build the top-rated ranking; ratings are unaffected",
				"error", rankErr)
		} else {
			d.topRated = ranks
		}
	}
	return err
}

// Download re-downloads the dataset from IMDb. Public so callers (e.g. a CLI
// warm-up command) can force a refresh outside of a Fetch call.
func (d *IMDbDataset) Download(ctx context.Context) error { return d.refresh(ctx) }

// refresh downloads the dataset and rebuilds the index, swapping the live one
// only once the replacement has parsed. A failed refresh leaves the previous
// index serving: stale ratings beat none.
func (d *IMDbDataset) refresh(ctx context.Context) error {
	if err := os.MkdirAll(d.dataDir, 0o755); err != nil {
		return fmt.Errorf("mkdir: %w", err)
	}
	path := filepath.Join(d.dataDir, imdbDatasetFile)
	if err := d.download(ctx, path); err != nil {
		return fmt.Errorf("download: %w", err)
	}
	idx, err := parseRatingsTSV(path)
	if err != nil {
		return fmt.Errorf("parse: %w", err)
	}

	var ranks map[string]int
	if d.topRatedEnabled {
		// A failure here must not take the ratings down with it: the rank is a
		// garnish, the ratings are the point.
		if r, rankErr := buildTopRated(ctx, d.httpClient, idx); rankErr != nil {
			slog.WarnContext(ctx, "Could not rebuild the top-rated ranking; ratings are unaffected",
				"error", rankErr)
		} else {
			ranks = r
		}
	}

	d.mu.Lock()
	d.index = idx
	d.loaded = true
	d.loadErr = nil
	if ranks != nil {
		d.topRated = ranks
	}
	d.mu.Unlock()
	return nil
}

// Titles reports how many titles the live index holds, for logging and the
// admin surface.
func (d *IMDbDataset) Titles() int {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return len(d.index)
}

// StartRefresh rebuilds the index on a timer for the life of the process.
//
// The age check in ensureLoaded is only ever consulted on the first Fetch, so
// without this a long-running container serves whatever it downloaded at start
// and drifts further from IMDb the longer it stays up.
func (d *IMDbDataset) StartRefresh(ctx context.Context, every time.Duration, logger *slog.Logger) {
	if d == nil || every <= 0 {
		return
	}
	if logger == nil {
		logger = slog.Default()
	}
	go func() {
		ticker := time.NewTicker(every)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				before := d.Titles()
				if err := d.refresh(ctx); err != nil {
					// The old index is still serving, so this is degraded rather
					// than lost. Logged because nothing else would show it.
					logger.WarnContext(ctx, "Could not refresh the IMDb dataset; the previous copy is still serving",
						"titles", before, "error", err)
					continue
				}
				logger.InfoContext(ctx, "Refreshed the IMDb dataset",
					"titles_before", before, "titles_after", d.Titles())
			}
		}
	}()
}

func (d *IMDbDataset) download(ctx context.Context, dest string) error {
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return fmt.Errorf("mkdir: %w", err)
	}
	url := imdbRatingsURL
	if d.ratingsURL != "" {
		url = d.ratingsURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
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
