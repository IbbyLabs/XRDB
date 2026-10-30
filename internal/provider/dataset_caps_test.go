package provider

import (
	"errors"
	"io"
	"strings"
	"testing"
)

func TestACappedReaderFailsPastItsLimit(t *testing.T) {
	_, err := io.ReadAll(&cappedReader{r: strings.NewReader(strings.Repeat("x", 100)), max: 64})
	if !errors.Is(err, errTooLarge) {
		t.Fatalf("err = %v, want errTooLarge", err)
	}
	if b, err := io.ReadAll(&cappedReader{r: strings.NewReader("short"), max: 64}); err != nil || string(b) != "short" {
		t.Fatalf("got %q, %v", b, err)
	}
}

func TestAnAbsurdSeasonNumberIsDropped(t *testing.T) {
	tsv := "tconst\tparentTconst\tseasonNumber\tepisodeNumber\n" +
		"tt0000002\ttt0000001\t1\t1\n" +
		"tt0000003\ttt0000001\t65535\t1\n"
	idx, err := parseEpisodeIndex(strings.NewReader(tsv))
	if err != nil {
		t.Fatal(err)
	}
	if got := len(idx[1]); got != 1 {
		t.Fatalf("kept %d episodes, want 1", got)
	}
}

func TestSimklRefusalsAreCountedPerEndpoint(t *testing.T) {
	for in, want := range map[string]string{
		"/movies/472214":       "/movies/:id",
		"/tv/17465/episodes":   "/tv/:id/episodes",
		"/redirect":            "/redirect",
		"/search/id/tt1375666": "/search/id/:id",
	} {
		if got := simklEndpoint(in); got != want {
			t.Errorf("simklEndpoint(%q) = %q, want %q", in, got, want)
		}
	}
}
