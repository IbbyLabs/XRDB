package watchprogress

import (
	"strconv"
	"strings"
	"time"
)

// Map is one owner's movie progress, 1-100 percent, by IMDb and TMDB id.
type Map struct {
	imdb map[string]int
	tmdb map[int]int
}

// Len is how many movies carry progress.
func (m Map) Len() int { return len(m.imdb) + len(m.tmdb) }

// Movie returns the percent watched for a render's media id, 0 when none is
// known. contentType is the request's movie|series hint; a series is never
// looked up.
func (m Map) Movie(mediaID, contentType string) int {
	if contentType == "series" {
		return 0
	}
	if strings.HasPrefix(mediaID, "tt") {
		return m.imdb[mediaID]
	}
	rest, ok := strings.CutPrefix(mediaID, "tmdb:")
	if !ok {
		return 0
	}
	if r, ok := strings.CutPrefix(rest, "movie:"); ok {
		rest = r
	} else if contentType != "movie" {
		return 0
	}
	n, err := strconv.Atoi(rest)
	if err != nil {
		return 0
	}
	return m.tmdb[n]
}

// MovieIDKnown reports whether mediaID is a form Movie can answer, so a caller
// can skip the Trakt read for ids that never could.
func MovieIDKnown(mediaID, contentType string) bool {
	if contentType == "series" {
		return false
	}
	if strings.HasPrefix(mediaID, "tt") {
		return true
	}
	rest, ok := strings.CutPrefix(mediaID, "tmdb:")
	if !ok {
		return false
	}
	return strings.HasPrefix(rest, "movie:") || contentType == "movie"
}

// Step rounds a percent down to its 10% step, the granularity a poster URL
// changes at.
func Step(pct int) int {
	if pct <= 0 {
		return 0
	}
	if pct >= 100 {
		return 100
	}
	return pct / 10 * 10
}

// mapBuilder keeps, per movie, whichever entry is newest: a pause after the
// last full watch is a rewatch under way.
type mapBuilder struct {
	m    Map
	when map[string]time.Time
}

func newMapBuilder() *mapBuilder {
	return &mapBuilder{m: Map{imdb: map[string]int{}, tmdb: map[int]int{}}, when: map[string]time.Time{}}
}

func (b *mapBuilder) add(ids traktMovieIDs, pct int, at time.Time) {
	if pct <= 0 {
		return
	}
	if pct > 100 {
		pct = 100
	}
	key := ids.IMDb
	if key == "" && ids.TMDB > 0 {
		key = "tmdb:" + strconv.Itoa(ids.TMDB)
	}
	if key == "" {
		return
	}
	if prev, seen := b.when[key]; seen && at.Before(prev) {
		return
	}
	b.when[key] = at
	if strings.HasPrefix(ids.IMDb, "tt") {
		b.m.imdb[ids.IMDb] = pct
	}
	if ids.TMDB > 0 {
		b.m.tmdb[ids.TMDB] = pct
	}
}
