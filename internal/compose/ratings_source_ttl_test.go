package compose

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strconv"
	"strings"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

const day = 24 * time.Hour

// Ages in whole years, one per FR-210 bucket edge: this year, 1-2, 3-5, 6-15, 16+.
var bucketAges = []int{0, 1, 2, 3, 5, 6, 15, 16, 40}

func TestEachListedSourceTakesItsOwnTermByAge(t *testing.T) {
	now := time.Now().Year()
	for _, tc := range []struct {
		source string
		days   []int // one per bucketAges entry
	}{
		// OMDb's this-year term is the release window's by year alone.
		{"omdb", []int{1, 14, 14, 30, 30, 30, 30, 30, 30}},
		{"mal", []int{2, 14, 14, 14, 14, 14, 14, 14, 14}},
		{"kitsu", []int{2, 14, 14, 14, 14, 14, 14, 14, 14}},
		{"anilist", []int{1, 14, 14, 14, 14, 14, 14, 14, 14}},
		{"filmweb", []int{1, 7, 7, 14, 14, 21, 21, 21, 21}},
		{"imdb_local", []int{1, 7, 7, 14, 14, 21, 21, 21, 21}},
	} {
		for i, age := range bucketAges {
			got := ageScaledTTL(day, tc.source, titleAge{year: now - age})
			if want := time.Duration(tc.days[i]) * day; got != want {
				t.Errorf("%s at %d years: term %s, want %s", tc.source, age, got, want)
			}
		}
	}
}

func TestUnlistedSourcesKeepTheDefaultTiers(t *testing.T) {
	now := time.Now().Year()
	want := []int{1, 4, 4, 6, 6, 6, 8, 8, 8}
	for _, source := range []string{"mdblist", "trakt", "simkl", "tmdb", "allocine", "cinemeta", ""} {
		for i, age := range bucketAges {
			got := ageScaledTTL(day, source, titleAge{year: now - age})
			if w := time.Duration(want[i]) * day; got != w {
				t.Errorf("%q at %d years: term %s, want %s", source, age, got, w)
			}
		}
	}
}

func TestTheBaseTermScalesEverySourcesTerm(t *testing.T) {
	old := time.Now().Year() - 20
	for _, base := range []time.Duration{6 * time.Hour, 12 * time.Hour, 48 * time.Hour} {
		for source, mult := range map[string]time.Duration{
			"omdb": 30, "mal": 14, "anilist": 14, "filmweb": 21, "imdb_local": 21, "mdblist": 8,
		} {
			if got := ageScaledTTL(base, source, titleAge{year: old}); got != mult*base {
				t.Errorf("%s at base %s: term %s, want %s", source, base, got, mult*base)
			}
		}
	}
}

func TestAnUnknownOrFutureYearTakesTheBaseForEverySource(t *testing.T) {
	future := time.Now().Year() + 1
	for source := range sourceAgeTTLTiers {
		for _, age := range []titleAge{{}, {year: future}, {date: time.Now().AddDate(0, 2, 0).Format("2006-01-02")}} {
			if got := ageScaledTTL(day, source, age); got != day {
				t.Errorf("%s with %+v: term %s, want the base", source, age, got)
			}
		}
	}
}

func TestOMDbTakesOneDayForItsFirstThirtyDaysThenThree(t *testing.T) {
	now := time.Now()
	dated := func(daysAgo int) titleAge {
		d := now.AddDate(0, 0, -daysAgo)
		return titleAge{year: d.Year(), date: d.Format("2006-01-02")}
	}
	for _, tc := range []struct {
		name string
		age  titleAge
		want time.Duration
	}{
		{"released yesterday", dated(1), day},
		{"released 28 days ago", dated(28), day},
		{"released 32 days ago", dated(32), 3 * day},
		{"released 200 days ago", dated(200), 3 * day},
		{"this year, no date", titleAge{year: now.Year()}, day},
		{"last year by date, inside its first year", dated(340), 3 * day},
		{"over a year by date", dated(400), 14 * day},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := ageScaledTTL(day, "omdb", tc.age); got != tc.want {
				t.Errorf("term %s, want %s", got, tc.want)
			}
		})
	}
}

func TestTheReleaseWindowIsOMDbsAlone(t *testing.T) {
	recent := time.Now().AddDate(0, 0, -5)
	age := titleAge{year: recent.Year(), date: recent.Format("2006-01-02")}
	if got := ageScaledTTL(day, "mal", age); got != 2*day {
		t.Errorf("mal five days after release: term %s, want 2 days", got)
	}
	if got := ageScaledTTL(day, "mdblist", age); got != day {
		t.Errorf("mdblist five days after release: term %s, want the base", got)
	}
}

func TestStoringAnOMDbAnswerUsesItsOwnTerms(t *testing.T) {
	c := newRatingsCache(day, nil)
	answer := &provider.MediaMeta{Ratings: []provider.Rating{{Source: "imdb", Value: 7}}}
	old := titleAge{year: time.Now().Year() - 20}

	c.mu.Lock()
	c.storeLocked("omdb|movie|tt1", answer, true, old)
	c.storeLocked("omdb|movie|tt2", answer, false, old)
	c.storeLocked("trakt|movie|tt1", answer, true, old)
	full, thin, other := c.entries["omdb|movie|tt1"].TTL, c.entries["omdb|movie|tt2"].TTL, c.entries["trakt|movie|tt1"].TTL
	c.mu.Unlock()

	if full != 30*day {
		t.Errorf("full OMDb answer: term %s, want 30 days", full)
	}
	if thin != PartialRatingsCacheTTL {
		t.Errorf("thin OMDb answer: term %s, want %s", thin, PartialRatingsCacheTTL)
	}
	if other != 8*day {
		t.Errorf("trakt answer: term %s, want 8 days", other)
	}
}

func decodeLogLines(t *testing.T, buf *bytes.Buffer) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		if line == "" {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			t.Fatalf("log line is not JSON: %q", line)
		}
		out = append(out, m)
	}
	return out
}

func findLog(lines []map[string]any, prefix string) map[string]any {
	for _, l := range lines {
		if msg, _ := l["msg"].(string); strings.HasPrefix(msg, prefix) {
			return l
		}
	}
	return nil
}

func TestReachingTheCapLogsTheEviction(t *testing.T) {
	var buf bytes.Buffer
	c := newRatingsCache(day, slog.New(slog.NewJSONHandler(&buf, nil)))
	meta := metaWith("imdb")
	future := time.Now().Add(time.Hour)
	for i := 0; i < ratingsCacheMax; i++ {
		c.entries["mdblist|movie|"+strconv.Itoa(i)] = ratingsEntry{Meta: meta, ExpiresAt: future}
	}

	c.mu.Lock()
	c.storeLocked("mdblist|movie|new", meta, true, titleAge{})
	c.mu.Unlock()

	line := findLog(decodeLogLines(t, &buf), "The ratings cache reached its cap and dropped live answers")
	if line == nil {
		t.Fatalf("no eviction line in %q", buf.String())
	}
	if line["level"] != "WARN" {
		t.Errorf("eviction level %v, want WARN", line["level"])
	}
	if got := int(line["dropped_live"].(float64)); got != ratingsCacheMax/10+1 {
		t.Errorf("dropped_live %d, want %d", got, ratingsCacheMax/10+1)
	}
	if got := int(line["cap"].(float64)); got != ratingsCacheMax {
		t.Errorf("cap %d, want %d", got, ratingsCacheMax)
	}
	if r := c.takeUsage(); r.EvictedLive != ratingsCacheMax/10+1 {
		t.Errorf("usage counted %d live evictions, want %d", r.EvictedLive, ratingsCacheMax/10+1)
	}
}

func TestDroppingOnlyExpiredAnswersAtTheCapIsLogged(t *testing.T) {
	var buf bytes.Buffer
	c := newRatingsCache(day, slog.New(slog.NewJSONHandler(&buf, nil)))
	meta := metaWith("imdb")
	past, future := time.Now().Add(-time.Hour), time.Now().Add(time.Hour)
	for i := 0; i < ratingsCacheMax; i++ {
		at := future
		if i%2 == 0 {
			at = past
		}
		c.entries["mdblist|movie|"+strconv.Itoa(i)] = ratingsEntry{Meta: meta, ExpiresAt: at}
	}

	c.mu.Lock()
	c.evictLocked()
	c.mu.Unlock()

	line := findLog(decodeLogLines(t, &buf), "The ratings cache reached its cap and dropped expired answers")
	if line == nil {
		t.Fatalf("no eviction line in %q", buf.String())
	}
	if got := int(line["dropped_expired"].(float64)); got != ratingsCacheMax/2 {
		t.Errorf("dropped_expired %d, want %d", got, ratingsCacheMax/2)
	}
	if r := c.takeUsage(); r.EvictedExpired != ratingsCacheMax/2 || r.EvictedLive != 0 {
		t.Errorf("usage %+v, want %d expired and no live", r, ratingsCacheMax/2)
	}
}

func TestTheHourlyReportCarriesSizeEvictionsAndHitRate(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, nil))
	p := &Pipeline{ratings: newRatingsCache(day, logger)}
	fetch := func(context.Context) (*provider.MediaMeta, bool, error) { return metaWith("imdb"), true, nil }
	ctx := context.Background()
	for i := 0; i < 4; i++ {
		if _, err := p.ratings.do(ctx, "trakt|movie|tt1", titleAge{}, fetch); err != nil {
			t.Fatal(err)
		}
	}
	p.ratings.mu.Lock()
	p.ratings.usage.EvictedLive = 7
	p.ratings.mu.Unlock()

	r := p.ReportRatingsCache(logger)
	line := findLog(decodeLogLines(t, &buf), "Reporting the ratings cache's size, evictions and hit rate")
	if line == nil {
		t.Fatalf("no report line in %q", buf.String())
	}
	if line["level"] != "INFO" {
		t.Errorf("report level %v, want INFO", line["level"])
	}
	if r.Hits != 3 || r.Misses != 1 || r.Entries != 1 {
		t.Errorf("report %+v, want 3 hits, 1 miss, 1 entry", r)
	}
	if line["hit_rate"].(float64) != 0.75 || int(line["evicted_live"].(float64)) != 7 || int(line["cap"].(float64)) != ratingsCacheMax {
		t.Errorf("report line %v", line)
	}
	if next := p.ratings.takeUsage(); next.Hits != 0 || next.Misses != 0 || next.EvictedLive != 0 {
		t.Errorf("the window did not reset: %+v", next)
	}
}

func TestTheStartupLineCarriesTheCapAndSize(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, nil))
	p := &Pipeline{ratings: newRatingsCache(day, logger)}
	p.ratings.entries["trakt|movie|tt1"] = ratingsEntry{Meta: metaWith("imdb"), ExpiresAt: time.Now().Add(time.Hour)}

	p.LogRatingsCacheStart(logger)
	off := &Pipeline{}
	off.LogRatingsCacheStart(logger)

	lines := decodeLogLines(t, &buf)
	ready := findLog(lines, "The ratings cache is ready")
	if ready == nil || int(ready["cap"].(float64)) != ratingsCacheMax || int(ready["entries"].(float64)) != 1 {
		t.Errorf("startup line %v", ready)
	}
	if findLog(lines, "The ratings cache is off") == nil {
		t.Error("a disabled cache said nothing at startup")
	}
	if r := off.ReportRatingsCache(logger); r.Entries != 0 {
		t.Errorf("a disabled cache reported %d entries", r.Entries)
	}
}
