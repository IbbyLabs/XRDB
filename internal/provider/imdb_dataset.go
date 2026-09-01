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
	// Ranking build state. The build streams a second dataset, so it runs off
	// the request path and at most one at a time.
	rankBuilding bool
	rankAttempt  time.Time
}

const (
	// topRatedBuildTimeout bounds one ranking build. The basics dataset is a
	// few hundred megabytes gzipped.
	topRatedBuildTimeout = 20 * time.Minute
	// topRatedRetryAfter is the wait before a failed ranking is attempted again.
	topRatedRetryAfter = 30 * time.Minute
)

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

// TopRatedRank returns a title's place in the ranking, or 0 when it has none.
//
// The draw path reads this rather than the rank on a cached MediaMeta: the
// ranking is built after startup, so an entry cached before it existed carries
// 0 and holds it for the ratings cache TTL.
func (d *IMDbDataset) TopRatedRank(imdbID string) int {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.topRated[imdbID]
}

// TopRatedReady reports whether a ranking is loaded and renders carry it.
// False while the first build runs, and after one that failed.
func (d *IMDbDataset) TopRatedReady() bool {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return len(d.topRated) > 0
}

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

	d.mu.Lock()
	entry, ok := d.index[id]
	rank := d.topRated[id]
	// The load path runs once, so a ranking that failed there would otherwise
	// wait for the weekly refresh.
	if d.topRated == nil {
		d.startRankLocked(d.index)
	}
	d.mu.Unlock()

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

// FreeToAsk reports that a lookup costs nothing: the dataset is held in memory
// and answering is a map read. The one-off load is paid on the first fetch
// either way.
func (d *IMDbDataset) FreeToAsk() bool { return true }

// Ready reports whether the dataset can be relied on to answer.
//
// True before anything has been loaded, because the load happens on the first
// fetch: a provider that called itself unready until then would never be asked
// and would never load. It goes false once a load has failed, which is what
// takes a broken dataset out of the running to supply a rating so the next
// provider covers it.
func (d *IMDbDataset) Ready() bool {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.loadErr == nil
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
			// Recorded as well as returned. A caller asking whether this source
			// can be relied on reads loadErr, and a download that failed
			// without leaving a trace there reads as a dataset that is fine.
			d.loadErr = fmt.Errorf("download: %w", err)
			return d.loadErr
		}
	}

	idx, err := parseRatingsTSV(path)
	d.loaded = true
	d.index = idx
	d.loadErr = err
	if err == nil {
		d.startRankLocked(idx)
	}
	return err
}

// startRankLocked begins a ranking build for idx unless one is running or a
// recent one failed. Caller holds d.mu.
//
// The build is detached from the caller: it streams a second, much larger
// dataset, and a request that ends first would otherwise cancel it. A failure
// must not take the ratings down with it either — the rank is a garnish, the
// ratings are the point.
func (d *IMDbDataset) startRankLocked(idx map[string]imdbEntry) {
	if !d.topRatedEnabled || d.rankBuilding || time.Now().Before(d.rankAttempt) {
		return
	}
	d.rankBuilding = true
	d.rankAttempt = time.Now().Add(topRatedRetryAfter)
	go d.buildRank(idx)
}

func (d *IMDbDataset) buildRank(idx map[string]imdbEntry) {
	ctx, cancel := context.WithTimeout(context.Background(), topRatedBuildTimeout)
	defer cancel()
	started := time.Now()
	ranks, err := buildTopRated(ctx, d.httpClient, idx)

	d.mu.Lock()
	d.rankBuilding = false
	if err == nil {
		d.topRated = ranks
		d.rankAttempt = time.Time{}
	}
	d.mu.Unlock()

	if err != nil {
		slog.Warn("Could not build the top-rated ranking; ratings are unaffected",
			"error", err, "retry_in", topRatedRetryAfter.String())
		return
	}
	slog.Info("Built the top-rated ranking",
		"titles", len(ranks), "took_ms", time.Since(started).Milliseconds())
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

	d.mu.Lock()
	d.index = idx
	d.loaded = true
	d.loadErr = nil
	// A refresh is the point at which a stale or missing ranking gets another
	// go, so it clears the retry wait rather than honouring it.
	d.rankAttempt = time.Time{}
	d.startRankLocked(idx)
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
// StartRefresh schedules the refresh and returns a channel closed once the
// scheduler has stopped. A caller that does not wait can ignore it; a test that
// writes into a temporary directory must, or cleanup races the last write.
func (d *IMDbDataset) StartRefresh(ctx context.Context, every time.Duration, logger *slog.Logger) <-chan struct{} {
	stopped := make(chan struct{})
	if logger == nil {
		logger = slog.Default()
	}
	// A silent return leaves an operator unable to tell a scheduled refresh from
	// a disabled one from a dataset that is switched off, because all three
	// produce no output at all until the first interval elapses — a week at the
	// default.
	if d == nil {
		logger.Info("The IMDb dataset is not configured, so no refresh is scheduled")
		close(stopped)
		return stopped
	}
	if every <= 0 {
		logger.Info("The IMDb dataset refresh is disabled by a zero interval")
		close(stopped)
		return stopped
	}
	logger.Info("Scheduled the IMDb dataset refresh", "every", every.String())
	go func() {
		defer close(stopped)
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
	return stopped
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
