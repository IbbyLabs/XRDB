package folderwriter

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"
)

// artworkFilenames is the complete set of names this package will ever create.
// Every media server reads these, and keeping the list closed is what makes the
// blast radius of the feature knowable.
var artworkFilenames = map[string]string{
	"poster":   "poster.jpg",
	"backdrop": "fanart.jpg",
	"logo":     "clearlogo.png",
}

// Renderer produces artwork bytes for one surface of one title. It is the
// render pipeline, narrowed to what this package needs.
type Renderer interface {
	RenderArtwork(ctx context.Context, mediaType, contentType, mediaID string) (data []byte, placeholder bool, err error)
}

// Options controls one write pass.
type Options struct {
	Roots []string
	// Surfaces to write, e.g. {"poster", "backdrop"}. Unknown names are ignored.
	Surfaces []string
	// DryRun reports what would be written without touching anything.
	DryRun bool
	// Pace is the delay between titles, so a first run over a large library
	// does not saturate the rating sources or the disk.
	Pace time.Duration
	// Overwrite replaces artwork this package finds already in place. Off by
	// default: a user who has curated their own posters should keep them.
	Overwrite bool
}

// Report is the outcome of a write pass.
type Report struct {
	Scanned     int      `json:"scanned"`
	Written     int      `json:"written"`
	SkippedDirs int      `json:"skippedDirs"`
	Unchanged   int      `json:"unchanged"`
	Failed      int      `json:"failed"`
	DryRun      bool     `json:"dryRun"`
	Errors      []string `json:"errors,omitempty"`
	// Unidentified lists directories holding video that could not be tied to a
	// title. Surfacing these is the point: silence would look like success.
	Unidentified []string `json:"unidentified,omitempty"`
}

// Run scans the roots and writes artwork for every title it can identify.
func Run(ctx context.Context, r Renderer, opts Options, logger *slog.Logger) (Report, error) {
	if logger == nil {
		logger = slog.Default()
	}
	if len(opts.Roots) == 0 {
		return Report{}, ErrNoRoots
	}
	surfaces := opts.Surfaces
	if len(surfaces) == 0 {
		surfaces = []string{"poster", "backdrop"}
	}

	scan, scanErr := Scan(opts.Roots)
	report := Report{
		Scanned:     len(scan.Entries),
		SkippedDirs: len(scan.Skipped),
		DryRun:      opts.DryRun,
	}
	for _, s := range scan.Skipped {
		report.Unidentified = append(report.Unidentified, s.Dir+" — "+s.Reason)
	}

	for _, entry := range scan.Entries {
		select {
		case <-ctx.Done():
			return report, ctx.Err()
		default:
		}

		for _, surface := range surfaces {
			name, ok := artworkFilenames[surface]
			if !ok {
				continue
			}
			dest := filepath.Join(entry.Dir, name)
			if !opts.Overwrite {
				if _, err := os.Stat(dest); err == nil {
					report.Unchanged++
					continue
				}
			}

			data, placeholder, err := r.RenderArtwork(ctx, surface, entry.ContentType, entry.MediaID)
			if err != nil {
				report.Failed++
				report.Errors = append(report.Errors, entry.Dir+": "+err.Error())
				logger.WarnContext(ctx, "Could not render artwork for a library title",
					"dir", entry.Dir, "media_id", entry.MediaID, "surface", surface, "error", err)
				continue
			}
			// A placeholder is the "no artwork available" answer. Writing it
			// into a library would replace a real poster with a grey rectangle.
			if placeholder || len(data) == 0 {
				report.Failed++
				logger.WarnContext(ctx, "Skipped a library title with no artwork available",
					"dir", entry.Dir, "media_id", entry.MediaID, "surface", surface)
				continue
			}

			if opts.DryRun {
				report.Written++
				continue
			}
			if err := writeAtomic(dest, data); err != nil {
				report.Failed++
				report.Errors = append(report.Errors, dest+": "+err.Error())
				logger.WarnContext(ctx, "Could not write artwork into the library",
					"path", dest, "error", err)
				continue
			}
			report.Written++
		}

		if opts.Pace > 0 {
			select {
			case <-time.After(opts.Pace):
			case <-ctx.Done():
				return report, ctx.Err()
			}
		}
	}

	logger.InfoContext(ctx, "Finished writing artwork into the library",
		"scanned", report.Scanned, "written", report.Written,
		"unchanged", report.Unchanged, "failed", report.Failed,
		"unidentified", len(report.Unidentified), "dry_run", opts.DryRun)
	return report, scanErr
}

// writeAtomic writes through a temporary file in the same directory, so a
// media server scanning mid-write never sees a half-written image and an
// interrupted run cannot leave a corrupt file where a good one was.
func writeAtomic(dest string, data []byte) error {
	dir := filepath.Dir(dest)
	tmp, err := os.CreateTemp(dir, ".xrdb-*.tmp")
	if err != nil {
		return fmt.Errorf("create temp: %w", err)
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }()

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("write: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close: %w", err)
	}
	if err := os.Chmod(tmpName, 0o644); err != nil {
		return fmt.Errorf("chmod: %w", err)
	}
	return os.Rename(tmpName, dest)
}
