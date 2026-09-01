package main

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
)

// The flag is Rotten Tomatoes' own, embedded in the page. XRDB records it rather
// than computing it: their rule needs a Top Critics count and a release breadth
// no API carries (FR-158/161).
func TestParseReadsTheCertifiedFlagAndScore(t *testing.T) {
	page := `junk before "criticsScore":{"averageRating":"8.40","certified":true,` +
		`"likedCount":131,"notLikedCount":16,"ratingCount":147,"score":"89",` +
		`"sentiment":"POSITIVE","scorePercent":"89%","title":"Tomatometer"} junk after`

	got, err := parseTitle(page)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Certified {
		t.Error("certified was not read")
	}
	if got.Score != 89 {
		t.Errorf("score = %d, want 89", got.Score)
	}
}

func TestParseReadsAnUncertifiedTitle(t *testing.T) {
	page := `"criticsScore":{"certified":false,"score":"61","scorePercent":"61%"}`
	got, err := parseTitle(page)
	if err != nil {
		t.Fatal(err)
	}
	if got.Certified {
		t.Error("an uncertified title was read as certified")
	}
	if got.Score != 61 {
		t.Errorf("score = %d, want 61", got.Score)
	}
}

// A block page, a redirect to search and a genuine absence all look the same to
// a caller that treats a miss as false, and the first two are the ones that
// would quietly strip marks from the file.
func TestAPageWithNoCriticsBlockIsAnErrorRatherThanNotCertified(t *testing.T) {
	for _, page := range []string{
		"",
		"<html><body>Access denied</body></html>",
		`{"audienceScore":{"certified":false,"score":"98"}}`, // the other block, not ours
	} {
		if _, err := parseTitle(page); err == nil {
			t.Errorf("a page with no critics block parsed without error: %.40q", page)
		}
	}
	// The control: a real block still parses, so the guard is not refusing
	// everything.
	if _, err := parseTitle(`"criticsScore":{"certified":true,"score":"90"}`); err != nil {
		t.Errorf("a real block was refused: %v", err)
	}
}

// A title this run cannot reach keeps the answer it already had, so one bad
// night does not strip marks from the whole file.
func TestTheExistingFileIsTheFloor(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "titles.json")
	if err := os.WriteFile(path, []byte(`{"readAt":"2026-09-01T00:00:00Z","titles":{"TT0000001":{"certified":true,"score":90}}}`), 0o644); err != nil {
		t.Fatal(err)
	}

	existing := loadExisting(path, testLogger())
	if got, ok := existing["tt0000001"]; !ok || !got.Certified {
		t.Errorf("the existing file was not carried forward: %+v", existing)
	}

	// An unreadable file starts from nothing rather than failing the run.
	if err := os.WriteFile(path, []byte("not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := loadExisting(path, testLogger()); len(got) != 0 {
		t.Errorf("an unreadable file produced %d titles", len(got))
	}
}

// Only real IMDb ids reach the network, and each is read once.
func TestTheIdListIsFilteredAndDeduped(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "ids.txt")
	body := "tt0111161\n\n  TT0111161  \nnot-an-id\ntt\ntmdb:550\ntt1375666\n"
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := readIDs(path)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"tt0111161", "tt1375666"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("got %v, want %v", got, want)
		}
	}
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}
