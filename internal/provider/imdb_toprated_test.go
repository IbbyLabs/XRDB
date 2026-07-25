package provider

import (
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"xrdb_rewrite/internal/testutil"
)

// basicsResponse gzips a title.basics-shaped TSV the way IMDb serves it.
func basicsResponse(t *testing.T, rows [][2]string) *http.Response {
	t.Helper()
	var raw bytes.Buffer
	raw.WriteString("tconst\ttitleType\tprimaryTitle\toriginalTitle\tisAdult\n")
	for _, r := range rows {
		fmt.Fprintf(&raw, "%s\t%s\tA Title\tA Title\t0\n", r[0], r[1])
	}
	var gzipped bytes.Buffer
	zw := gzip.NewWriter(&gzipped)
	if _, err := zw.Write(raw.Bytes()); err != nil {
		t.Fatalf("gzip write: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("gzip close: %v", err)
	}
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(bytes.NewReader(gzipped.Bytes())),
	}
}

func basicsClient(t *testing.T, rows [][2]string) *http.Client {
	t.Helper()
	return &http.Client{Transport: testutil.RoundTripperFunc(func(*http.Request) (*http.Response, error) {
		return basicsResponse(t, rows), nil
	})}
}

// The reason the basics dataset is streamed at all: a single episode of a
// popular show out-rates almost every film, and must not appear in a film list.
func TestTopRatedExcludesTVEpisodes(t *testing.T) {
	index := map[string]imdbEntry{
		"tt_episode": {Rating: 9.9, Votes: 250_000},
		"tt_film":    {Rating: 8.8, Votes: 900_000},
	}
	client := basicsClient(t, [][2]string{
		{"tt_episode", "tvEpisode"},
		{"tt_film", "movie"},
	})

	ranks, err := buildTopRated(context.Background(), client, index)
	if err != nil {
		t.Fatalf("buildTopRated: %v", err)
	}
	if _, ok := ranks["tt_episode"]; ok {
		t.Error("a TV episode placed in the film ranking")
	}
	if ranks["tt_film"] != 1 {
		t.Errorf("film rank = %d, want 1", ranks["tt_film"])
	}
}

func TestTopRatedIgnoresTitlesBelowTheVoteFloor(t *testing.T) {
	index := map[string]imdbEntry{
		"tt_obscure": {Rating: 10.0, Votes: 12},
		"tt_classic": {Rating: 8.5, Votes: 500_000},
	}
	client := basicsClient(t, [][2]string{
		{"tt_obscure", "movie"},
		{"tt_classic", "movie"},
	})

	ranks, err := buildTopRated(context.Background(), client, index)
	if err != nil {
		t.Fatalf("buildTopRated: %v", err)
	}
	if _, ok := ranks["tt_obscure"]; ok {
		t.Error("a title with a handful of votes placed in the ranking")
	}
	if ranks["tt_classic"] == 0 {
		t.Error("the well-voted title should have placed")
	}
}

// What the weighting actually guarantees: between two titles with the same
// score, the one carrying more votes ranks higher. It pulls a thin score toward
// the mean rather than inverting the order outright, so a large enough rating
// gap still wins — that is the formula working, not a flaw in it.
func TestMoreVotesWinsAtEqualRating(t *testing.T) {
	index := map[string]imdbEntry{
		"tt_thin":  {Rating: 9.2, Votes: topRatedMinVotes + 1},
		"tt_solid": {Rating: 9.2, Votes: 2_000_000},
		"tt_mid":   {Rating: 8.0, Votes: 400_000},
	}
	rows := [][2]string{{"tt_thin", "movie"}, {"tt_solid", "movie"}, {"tt_mid", "movie"}}

	ranks, err := buildTopRated(context.Background(), basicsClient(t, rows), index)
	if err != nil {
		t.Fatalf("buildTopRated: %v", err)
	}
	if ranks["tt_solid"] >= ranks["tt_thin"] {
		t.Errorf("at an equal 9.2, the 2M-vote title ranked %d and the barely-eligible one ranked %d",
			ranks["tt_solid"], ranks["tt_thin"])
	}
}

// Shrinkage must actually bite: a barely-eligible title is pulled toward the
// mean, so its lead over a heavily voted one is narrower than the raw ratings
// suggest.
func TestThinlyVotedTitlesArePulledTowardTheMean(t *testing.T) {
	index := map[string]imdbEntry{
		"tt_thin":  {Rating: 9.9, Votes: topRatedMinVotes + 1},
		"tt_solid": {Rating: 9.2, Votes: 2_000_000},
	}
	scores := topRatedScores(t, index)

	rawGap := 9.9 - 9.2
	weightedGap := scores["tt_thin"] - scores["tt_solid"]
	if weightedGap >= rawGap {
		t.Errorf("weighted gap %.3f is not narrower than the raw gap %.3f; shrinkage is not applied",
			weightedGap, rawGap)
	}
	if scores["tt_thin"] >= 9.9 {
		t.Errorf("thin title scored %.3f, expected it pulled below its raw 9.9", scores["tt_thin"])
	}
}

// topRatedScores recomputes the weighting so a test can assert on the scores
// themselves rather than only on their resulting order.
func topRatedScores(t *testing.T, index map[string]imdbEntry) map[string]float64 {
	t.Helper()
	var sum float64
	for _, e := range index {
		sum += e.Rating
	}
	mean := sum / float64(len(index))
	out := make(map[string]float64, len(index))
	for id, e := range index {
		v, m := float64(e.Votes), float64(topRatedMinVotes)
		out[id] = (v/(v+m))*e.Rating + (m/(v+m))*mean
	}
	return out
}

func TestTopRatedIsCappedAndDenselyRanked(t *testing.T) {
	index := make(map[string]imdbEntry)
	var rows [][2]string
	for i := 0; i < topRatedSize+40; i++ {
		id := fmt.Sprintf("tt%04d", i)
		index[id] = imdbEntry{Rating: 9.0 - float64(i)*0.01, Votes: 100_000}
		rows = append(rows, [2]string{id, "movie"})
	}
	ranks, err := buildTopRated(context.Background(), basicsClient(t, rows), index)
	if err != nil {
		t.Fatalf("buildTopRated: %v", err)
	}
	if len(ranks) != topRatedSize {
		t.Fatalf("kept %d ranks, want %d", len(ranks), topRatedSize)
	}
	seen := make(map[int]bool, len(ranks))
	for _, r := range ranks {
		if r < 1 || r > topRatedSize {
			t.Fatalf("rank %d is out of range", r)
		}
		if seen[r] {
			t.Fatalf("rank %d was assigned twice", r)
		}
		seen[r] = true
	}
}

// The table must be identical between runs, or a rebuild would silently
// reshuffle badges across a library.
func TestTopRatedIsDeterministicOnTies(t *testing.T) {
	index := map[string]imdbEntry{
		"ttb": {Rating: 9.0, Votes: 100_000},
		"tta": {Rating: 9.0, Votes: 100_000},
		"ttc": {Rating: 9.0, Votes: 100_000},
	}
	rows := [][2]string{{"tta", "movie"}, {"ttb", "movie"}, {"ttc", "movie"}}

	first, err := buildTopRated(context.Background(), basicsClient(t, rows), index)
	if err != nil {
		t.Fatalf("buildTopRated: %v", err)
	}
	for i := 0; i < 5; i++ {
		again, err := buildTopRated(context.Background(), basicsClient(t, rows), index)
		if err != nil {
			t.Fatalf("buildTopRated: %v", err)
		}
		for id, rank := range first {
			if again[id] != rank {
				t.Fatalf("%s moved from rank %d to %d between runs", id, rank, again[id])
			}
		}
	}
}

func TestTopRatedHandlesNoEligibleTitles(t *testing.T) {
	index := map[string]imdbEntry{"tt1": {Rating: 9.9, Votes: 5}}
	ranks, err := buildTopRated(context.Background(), basicsClient(t, nil), index)
	if err != nil {
		t.Fatalf("buildTopRated: %v", err)
	}
	if len(ranks) != 0 {
		t.Errorf("got %d ranks, want none", len(ranks))
	}
}

func TestTopRatedSurfacesAFetchFailure(t *testing.T) {
	index := map[string]imdbEntry{"tt1": {Rating: 9.0, Votes: 100_000}}
	client := &http.Client{Transport: testutil.RoundTripperFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusServiceUnavailable,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader("")),
		}, nil
	})}
	if _, err := buildTopRated(context.Background(), client, index); err == nil {
		t.Error("expected an error when the basics dataset cannot be read")
	}
}
