package provider

import (
	"bufio"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
)

// imdbBasicsURL carries one row per title with its type. The ratings file does
// not, and without it a "top rated" list is dominated by single episodes of
// popular shows, which routinely out-rate every film ever made.
const imdbBasicsURL = "https://datasets.imdbws.com/title.basics.tsv.gz"

const (
	// topRatedMinVotes is the vote floor for eligibility. It is also the weight
	// in the Bayesian average below, which is what stops a title with four
	// ten-star votes outranking an established classic.
	topRatedMinVotes = 25_000
	// topRatedSize is how many ranks are kept.
	topRatedSize = 250
	// basicsMaxBytes bounds the streamed read. The file is well under this;
	// the cap exists so a redirected or replaced URL cannot run away with the
	// process.
	basicsMaxBytes = 512 << 20
)

// buildTopRated computes the rank table from the already-parsed ratings index.
//
// It approximates IMDb's own published list: the same Bayesian weighting and
// vote floor, restricted to feature films. It cannot reproduce that list
// exactly, because IMDb weights by voter history in a way they do not publish
// — so this is presented as XRDB's own ranking rather than as IMDb's.
func buildTopRated(ctx context.Context, client *http.Client, index map[string]imdbEntry) (map[string]int, error) {
	// Only titles that clear the floor can place, so the type lookup is done
	// for a few thousand ids rather than the eleven million in the file.
	candidates := make(map[string]imdbEntry)
	for id, e := range index {
		if e.Votes >= topRatedMinVotes {
			candidates[id] = e
		}
	}
	if len(candidates) == 0 {
		return nil, nil
	}

	movies, err := filterToMovies(ctx, client, candidates)
	if err != nil {
		return nil, err
	}
	if len(movies) == 0 {
		return nil, nil
	}

	// C is the mean rating across eligible titles; the Bayesian average pulls
	// every title toward it in proportion to how few votes it has.
	var sum float64
	for _, e := range movies {
		sum += e.Rating
	}
	mean := sum / float64(len(movies))

	type scored struct {
		id    string
		score float64
		votes int
	}
	ranked := make([]scored, 0, len(movies))
	for id, e := range movies {
		v := float64(e.Votes)
		m := float64(topRatedMinVotes)
		ranked = append(ranked, scored{
			id:    id,
			score: (v/(v+m))*e.Rating + (m/(v+m))*mean,
			votes: e.Votes,
		})
	}
	sort.Slice(ranked, func(i, j int) bool {
		if ranked[i].score != ranked[j].score {
			return ranked[i].score > ranked[j].score
		}
		// Ties break on votes, then id, so the table is identical between runs.
		if ranked[i].votes != ranked[j].votes {
			return ranked[i].votes > ranked[j].votes
		}
		return ranked[i].id < ranked[j].id
	})

	if len(ranked) > topRatedSize {
		ranked = ranked[:topRatedSize]
	}
	out := make(map[string]int, len(ranked))
	for i, r := range ranked {
		out[r.id] = i + 1
	}
	return out, nil
}

// filterToMovies streams the basics dataset and keeps the candidates that are
// feature films. The response is never written to disk: only a few thousand ids
// survive the pass, so holding the whole file would be wasted for a table that
// fits in a few kilobytes.
func filterToMovies(ctx context.Context, client *http.Client, candidates map[string]imdbEntry) (map[string]imdbEntry, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, imdbBasicsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("http %d from imdb basics dataset", resp.StatusCode)
	}

	gz, err := gzip.NewReader(io.LimitReader(resp.Body, basicsMaxBytes))
	if err != nil {
		return nil, fmt.Errorf("gzip: %w", err)
	}
	defer gz.Close()

	out := make(map[string]imdbEntry, len(candidates))
	sc := bufio.NewScanner(gz)
	sc.Buffer(make([]byte, 0, 64<<10), 1<<20)
	first := true
	for sc.Scan() {
		if first { // header row
			first = false
			continue
		}
		line := sc.Text()
		// Columns: tconst, titleType, primaryTitle, ... — only the first two
		// are needed, so the rest of the row is never split.
		tab := strings.IndexByte(line, '\t')
		if tab < 0 {
			continue
		}
		id := line[:tab]
		e, ok := candidates[id]
		if !ok {
			continue
		}
		rest := line[tab+1:]
		typeEnd := strings.IndexByte(rest, '\t')
		if typeEnd < 0 {
			continue
		}
		if rest[:typeEnd] == "movie" {
			out[id] = e
		}
		// Every candidate is decided on its first appearance, so once they are
		// all accounted for the remaining millions of rows are pointless.
		if len(out) == len(candidates) {
			break
		}
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("scan basics: %w", err)
	}
	return out, nil
}
