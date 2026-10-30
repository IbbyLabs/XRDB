package provider

import (
	"bufio"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"
)

var imdbEpisodesURL = sourceBaseURL("IMDB_EPISODES", "https://datasets.imdbws.com/title.episode.tsv.gz")

const (
	// episodesBuildTimeout bounds one index build; the file is about 55 MB gzipped.
	episodesBuildTimeout = 20 * time.Minute
	// episodesRetryAfter is the wait before a failed build is attempted again.
	episodesRetryAfter = 30 * time.Minute
	// episodesMaxAge is how old the index may get before a lookup starts a rebuild.
	episodesMaxAge = 7 * 24 * time.Hour
	// episodesMaxBytes bounds the streamed read.
	episodesMaxBytes = 256 << 20
)

// An episode packs into one word: season (16 bits), episode (16 bits), episode
// tconst number (32 bits). Sorting the words sorts by season, then episode.
func packEpisode(season, episode, tconst uint64) uint64 {
	return season<<48 | episode<<32 | tconst
}

func unpackEpisode(v uint64) (season, episode int, tconst uint32) {
	return int(v >> 48), int(v >> 32 & 0xFFFF), uint32(v)
}

// ttNumber reads the number out of a tconst such as "tt0903747".
func ttNumber(id string) (uint32, bool) {
	if !strings.HasPrefix(id, "tt") {
		return 0, false
	}
	n, err := strconv.ParseUint(id[2:], 10, 32)
	return uint32(n), err == nil
}

// IMDbEpisode looks an episode up by IMDb's own season and episode numbering.
// It returns the episode's tconst, its 1-based position among the series'
// numbered seasons (specials excluded), and how many episodes each season from
// 1 holds. ok is false until the episode index has been built; the first call
// starts that build in the background.
func (d *IMDbDataset) IMDbEpisode(series string, season, episode int) (id string, absolute int, perSeason []int, ok bool) {
	parent, valid := ttNumber(series)
	if !valid || season < 1 || episode < 1 || season > 0xFFFF || episode > 0xFFFF {
		return "", 0, nil, false
	}
	d.mu.Lock()
	idx := d.episodes
	if idx == nil || time.Since(d.episodesBuiltAt) > episodesMaxAge {
		d.startEpisodesLocked()
	}
	d.mu.Unlock()
	if idx == nil {
		return "", 0, nil, false
	}
	rows := idx[parent]
	if len(rows) == 0 {
		return "", 0, nil, false
	}
	specials, _ := slices.BinarySearch(rows, packEpisode(1, 0, 0))
	at, found := slices.BinarySearchFunc(rows, packEpisode(uint64(season), uint64(episode), 0), func(v, target uint64) int {
		a, b := v>>32, target>>32
		switch {
		case a < b:
			return -1
		case a > b:
			return 1
		}
		return 0
	})
	if !found {
		return "", 0, nil, false
	}
	for _, v := range rows[specials:] {
		s, _, _ := unpackEpisode(v)
		for len(perSeason) < s {
			perSeason = append(perSeason, 0)
		}
		perSeason[s-1]++
	}
	_, _, tconst := unpackEpisode(rows[at])
	return fmt.Sprintf("tt%07d", tconst), at - specials + 1, perSeason, true
}

// startEpisodesLocked begins an index build unless one is running or one was
// attempted recently. d.mu must be held.
func (d *IMDbDataset) startEpisodesLocked() {
	if d.episodesBuilding || time.Since(d.episodesAttempt) < episodesRetryAfter {
		return
	}
	d.episodesBuilding = true
	d.episodesAttempt = time.Now()
	go d.buildEpisodes()
}

func (d *IMDbDataset) buildEpisodes() {
	ctx, cancel := context.WithTimeout(context.Background(), episodesBuildTimeout)
	defer cancel()
	started := time.Now()
	url := d.episodesURL
	if url == "" {
		url = imdbEpisodesURL
	}
	idx, err := loadEpisodeIndex(ctx, d.httpClient, url)
	d.mu.Lock()
	d.episodesBuilding = false
	if err == nil {
		d.episodes = idx
		d.episodesBuiltAt = time.Now()
	}
	d.mu.Unlock()
	if err != nil {
		slog.Warn("Failed to build the IMDb episode index", "error", err, "took_ms", time.Since(started).Milliseconds())
		return
	}
	slog.Info("Built the IMDb episode index", "series", len(idx), "took_ms", time.Since(started).Milliseconds())
}

// loadEpisodeIndex streams title.episode into series tconst → sorted packed episodes.
func loadEpisodeIndex(ctx context.Context, client *http.Client, url string) (map[uint32][]uint64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("http %d from imdb episode dataset", resp.StatusCode)
	}
	gz, err := gzip.NewReader(io.LimitReader(resp.Body, episodesMaxBytes))
	if err != nil {
		return nil, fmt.Errorf("gzip: %w", err)
	}
	defer gz.Close()
	return parseEpisodeIndex(gz)
}

// parseEpisodeIndex reads tconst, parentTconst, seasonNumber, episodeNumber rows.
// Rows without a season or episode number are skipped.
func parseEpisodeIndex(r io.Reader) (map[uint32][]uint64, error) {
	grow := make(map[uint32][]uint64, 1<<18)
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64<<10), 1<<20)
	first := true
	for sc.Scan() {
		if first {
			first = false
			continue
		}
		f := strings.SplitN(sc.Text(), "\t", 5)
		if len(f) < 4 {
			continue
		}
		ep, ok1 := ttNumber(f[0])
		parent, ok2 := ttNumber(f[1])
		season, err1 := strconv.ParseUint(f[2], 10, 16)
		number, err2 := strconv.ParseUint(f[3], 10, 16)
		if !ok1 || !ok2 || err1 != nil || err2 != nil {
			continue
		}
		grow[parent] = append(grow[parent], packEpisode(season, number, uint64(ep)))
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("scan episodes: %w", err)
	}
	// Exact-size copies drop the append slack, which would otherwise hold up to
	// half the index again.
	out := make(map[uint32][]uint64, len(grow))
	for parent, rows := range grow {
		exact := make([]uint64, len(rows))
		copy(exact, rows)
		slices.Sort(exact)
		out[parent] = exact
		delete(grow, parent)
	}
	return out, nil
}
