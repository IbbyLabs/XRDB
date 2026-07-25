package folderwriter

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// stubRenderer answers with fixed bytes, or a placeholder / error on demand.
type stubRenderer struct {
	data        []byte
	placeholder bool
	err         error
	calls       int
}

func (s *stubRenderer) RenderArtwork(context.Context, string, string, string) ([]byte, bool, error) {
	s.calls++
	if s.err != nil {
		return nil, false, s.err
	}
	return s.data, s.placeholder, nil
}

// makeTitle creates a directory holding a video and, optionally, an NFO.
func makeTitle(t *testing.T, root, name, nfo string) string {
	t.Helper()
	dir := filepath.Join(root, name)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "movie.mkv"), []byte("video"), 0o644); err != nil {
		t.Fatalf("write video: %v", err)
	}
	if nfo != "" {
		if err := os.WriteFile(filepath.Join(dir, "movie.nfo"), []byte(nfo), 0o644); err != nil {
			t.Fatalf("write nfo: %v", err)
		}
	}
	return dir
}

func TestScanFindsTitlesWithAnIMDbID(t *testing.T) {
	root := t.TempDir()
	makeTitle(t, root, "Interstellar (2014)", `<movie><imdbid>tt0816692</imdbid></movie>`)

	res, err := Scan([]string{root})
	if err != nil {
		t.Fatalf("Scan: %v", err)
	}
	if len(res.Entries) != 1 {
		t.Fatalf("found %d titles, want 1", len(res.Entries))
	}
	got := res.Entries[0]
	if got.MediaID != "tt0816692" || got.ContentType != "movie" {
		t.Errorf("got %+v", got)
	}
}

func TestScanReadsTheUniqueidForm(t *testing.T) {
	root := t.TempDir()
	makeTitle(t, root, "A Show", `<tvshow><uniqueid type="imdb">tt0903747</uniqueid></tvshow>`)

	res, _ := Scan([]string{root})
	if len(res.Entries) != 1 {
		t.Fatalf("found %d titles, want 1", len(res.Entries))
	}
	if res.Entries[0].MediaID != "tt0903747" || res.Entries[0].ContentType != "series" {
		t.Errorf("got %+v", res.Entries[0])
	}
}

func TestScanFallsBackToATMDbID(t *testing.T) {
	root := t.TempDir()
	makeTitle(t, root, "Fight Club", `<movie><tmdbid>550</tmdbid></movie>`)

	res, _ := Scan([]string{root})
	if len(res.Entries) != 1 {
		t.Fatalf("found %d titles, want 1", len(res.Entries))
	}
	if res.Entries[0].MediaID != "550" || res.Entries[0].Source != "nfo:tmdb" {
		t.Errorf("got %+v", res.Entries[0])
	}
}

// The safety rule the whole design rests on: without a definite id, the title
// is reported and left alone. Guessing risks writing a stranger's poster into
// someone's library, which is not a recoverable mistake.
func TestUnidentifiableTitlesAreSkippedNotGuessed(t *testing.T) {
	root := t.TempDir()
	makeTitle(t, root, "Some Movie (1999)", "")                             // no NFO at all
	makeTitle(t, root, "Another (2001)", `<movie><title>x</title></movie>`) // NFO without an id

	res, _ := Scan([]string{root})
	if len(res.Entries) != 0 {
		t.Errorf("identified %d titles from names alone; expected none", len(res.Entries))
	}
	if len(res.Skipped) != 2 {
		t.Fatalf("skipped %d, want 2", len(res.Skipped))
	}
	for _, s := range res.Skipped {
		if s.Reason == "" {
			t.Error("a skipped directory carried no reason")
		}
	}
}

func TestDirectoriesWithoutVideoAreIgnored(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "Artwork")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "notes.nfo"), []byte("tt1234567"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	res, _ := Scan([]string{root})
	if len(res.Entries) != 0 || len(res.Skipped) != 0 {
		t.Errorf("a directory with no video was considered: %+v", res)
	}
}

func TestRunWritesArtwork(t *testing.T) {
	root := t.TempDir()
	dir := makeTitle(t, root, "Interstellar (2014)", `<movie><imdbid>tt0816692</imdbid></movie>`)
	r := &stubRenderer{data: []byte("image-bytes")}

	rep, err := Run(context.Background(), r, Options{Roots: []string{root}, Surfaces: []string{"poster"}}, nil)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if rep.Written != 1 {
		t.Errorf("written = %d, want 1 (%+v)", rep.Written, rep)
	}
	got, err := os.ReadFile(filepath.Join(dir, "poster.jpg"))
	if err != nil {
		t.Fatalf("read poster: %v", err)
	}
	if string(got) != "image-bytes" {
		t.Errorf("poster content = %q", got)
	}
}

// A placeholder means "no artwork available". Writing it would replace a real
// poster with a grey rectangle.
func TestPlaceholdersAreNeverWritten(t *testing.T) {
	root := t.TempDir()
	dir := makeTitle(t, root, "Obscure (1970)", `<movie><imdbid>tt0000001</imdbid></movie>`)
	r := &stubRenderer{data: []byte("grey"), placeholder: true}

	rep, err := Run(context.Background(), r, Options{Roots: []string{root}, Surfaces: []string{"poster"}}, nil)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if rep.Written != 0 || rep.Failed != 1 {
		t.Errorf("written=%d failed=%d, want 0/1", rep.Written, rep.Failed)
	}
	if _, err := os.Stat(filepath.Join(dir, "poster.jpg")); !os.IsNotExist(err) {
		t.Error("a placeholder was written into the library")
	}
}

// Someone who curated their own posters should keep them.
func TestExistingArtworkIsLeftAloneByDefault(t *testing.T) {
	root := t.TempDir()
	dir := makeTitle(t, root, "Interstellar (2014)", `<movie><imdbid>tt0816692</imdbid></movie>`)
	existing := filepath.Join(dir, "poster.jpg")
	if err := os.WriteFile(existing, []byte("my own poster"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	r := &stubRenderer{data: []byte("new")}

	rep, _ := Run(context.Background(), r, Options{Roots: []string{root}, Surfaces: []string{"poster"}}, nil)
	if rep.Unchanged != 1 || rep.Written != 0 {
		t.Errorf("unchanged=%d written=%d, want 1/0", rep.Unchanged, rep.Written)
	}
	got, _ := os.ReadFile(existing)
	if string(got) != "my own poster" {
		t.Errorf("existing artwork was replaced: %q", got)
	}
	if r.calls != 0 {
		t.Errorf("rendered %d times for a file it was not going to write", r.calls)
	}
}

func TestOverwriteReplacesExistingArtwork(t *testing.T) {
	root := t.TempDir()
	dir := makeTitle(t, root, "Interstellar (2014)", `<movie><imdbid>tt0816692</imdbid></movie>`)
	existing := filepath.Join(dir, "poster.jpg")
	if err := os.WriteFile(existing, []byte("old"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	r := &stubRenderer{data: []byte("new")}

	if _, err := Run(context.Background(), r, Options{
		Roots: []string{root}, Surfaces: []string{"poster"}, Overwrite: true,
	}, nil); err != nil {
		t.Fatalf("Run: %v", err)
	}
	got, _ := os.ReadFile(existing)
	if string(got) != "new" {
		t.Errorf("poster = %q, want the new render", got)
	}
}

func TestDryRunTouchesNothing(t *testing.T) {
	root := t.TempDir()
	dir := makeTitle(t, root, "Interstellar (2014)", `<movie><imdbid>tt0816692</imdbid></movie>`)
	r := &stubRenderer{data: []byte("image")}

	rep, err := Run(context.Background(), r, Options{
		Roots: []string{root}, Surfaces: []string{"poster"}, DryRun: true,
	}, nil)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if rep.Written != 1 || !rep.DryRun {
		t.Errorf("report = %+v, want 1 would-be write flagged as a dry run", rep)
	}
	if _, err := os.Stat(filepath.Join(dir, "poster.jpg")); !os.IsNotExist(err) {
		t.Error("a dry run wrote a file")
	}
}

// Only the closed set of names is ever created, and no stray temp files are
// left behind.
func TestOnlyKnownFilenamesAreCreated(t *testing.T) {
	root := t.TempDir()
	dir := makeTitle(t, root, "Interstellar (2014)", `<movie><imdbid>tt0816692</imdbid></movie>`)
	r := &stubRenderer{data: []byte("image")}

	if _, err := Run(context.Background(), r, Options{
		Roots: []string{root}, Surfaces: []string{"poster", "backdrop", "logo"},
	}, nil); err != nil {
		t.Fatalf("Run: %v", err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	allowed := map[string]bool{"movie.mkv": true, "movie.nfo": true,
		"poster.jpg": true, "fanart.jpg": true, "clearlogo.png": true}
	for _, e := range entries {
		if !allowed[e.Name()] {
			t.Errorf("unexpected file created: %q", e.Name())
		}
		if strings.HasSuffix(e.Name(), ".tmp") {
			t.Errorf("a temporary file was left behind: %q", e.Name())
		}
	}
}

func TestRunWithoutRootsIsAnError(t *testing.T) {
	if _, err := Run(context.Background(), &stubRenderer{}, Options{}, nil); err == nil {
		t.Error("expected an error when no roots are configured")
	}
}

func TestRenderFailuresAreReportedNotFatal(t *testing.T) {
	root := t.TempDir()
	makeTitle(t, root, "A (2000)", `<movie><imdbid>tt0000001</imdbid></movie>`)
	makeTitle(t, root, "B (2001)", `<movie><imdbid>tt0000002</imdbid></movie>`)
	r := &stubRenderer{err: os.ErrDeadlineExceeded}

	rep, err := Run(context.Background(), r, Options{Roots: []string{root}, Surfaces: []string{"poster"}}, nil)
	if err != nil {
		t.Fatalf("Run returned %v; a per-title failure should not abort the pass", err)
	}
	if rep.Failed != 2 || len(rep.Errors) != 2 {
		t.Errorf("report = %+v, want both titles recorded as failed", rep)
	}
}

func TestCancellationStopsThePass(t *testing.T) {
	root := t.TempDir()
	makeTitle(t, root, "A (2000)", `<movie><imdbid>tt0000001</imdbid></movie>`)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := Run(ctx, &stubRenderer{data: []byte("x")}, Options{
		Roots: []string{root}, Surfaces: []string{"poster"},
	}, nil); err == nil {
		t.Error("expected cancellation to stop the pass")
	}
}
