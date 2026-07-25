// Package folderwriter writes rendered artwork next to the media it belongs to.
//
// This is the one part of XRDB that touches a user's library, so it is off
// unless explicitly enabled, and it only ever writes the small set of filenames
// listed in artworkFilenames. Nothing is deleted and nothing else is modified.
package folderwriter

import (
	"encoding/xml"
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// videoExtensions are the containers that mark a directory as holding a title.
var videoExtensions = map[string]bool{
	".mkv": true, ".mp4": true, ".avi": true, ".m4v": true,
	".mov": true, ".wmv": true, ".ts": true, ".m2ts": true,
}

// Entry is one resolved title found on disk.
type Entry struct {
	// Dir is the directory the artwork will be written into.
	Dir string
	// MediaID is the id the render route takes: a tt-prefixed IMDb id, or a
	// bare TMDB numeric id.
	MediaID string
	// ContentType is "movie" or "series" when the NFO says so, else empty.
	ContentType string
	// Source names where the id came from, for the scan report.
	Source string
}

// SkipReason explains why a directory was passed over.
type SkipReason struct {
	Dir    string
	Reason string
}

// Result is what one scan found.
type Result struct {
	Entries []Entry
	Skipped []SkipReason
}

// nfoIDPattern pulls an IMDb id out of an NFO. Media managers write these in
// several shapes — a bare <imdbid> element, a <uniqueid type="imdb">, or an
// IMDb URL in a comment — so the id is matched wherever it appears rather than
// by trusting one schema.
var nfoIDPattern = regexp.MustCompile(`tt\d{7,9}`)

// nfoTMDBPattern matches a TMDB id in the element shapes that carry one.
var nfoTMDBPattern = regexp.MustCompile(`(?i)<(?:tmdbid|uniqueid[^>]*type="tmdb"[^>]*)>\s*(\d+)\s*<`)

// nfoRoot is the little of an NFO that matters here: the root element name
// tells movie from series without parsing the rest.
type nfoRoot struct {
	XMLName xml.Name
}

const maxNFOBytes = 1 << 20

// Scan walks each root and returns the titles it can identify with certainty.
//
// A directory is only reported when an NFO gives an unambiguous id. Guessing
// from a folder name would be easy and is deliberately not done: the cost of
// being wrong is someone else's poster written into a stranger's library, and a
// skipped title is recoverable in a way that a wrong one is not.
func Scan(roots []string) (Result, error) {
	var res Result
	var firstErr error
	for _, root := range roots {
		root = strings.TrimSpace(root)
		if root == "" {
			continue
		}
		err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				// An unreadable subtree should not abandon the rest of the scan.
				res.Skipped = append(res.Skipped, SkipReason{Dir: path, Reason: "unreadable: " + err.Error()})
				if d != nil && d.IsDir() {
					return filepath.SkipDir
				}
				return nil
			}
			if !d.IsDir() {
				return nil
			}
			hasVideo, nfoPath := inspectDir(path)
			if !hasVideo {
				return nil
			}
			if nfoPath == "" {
				res.Skipped = append(res.Skipped, SkipReason{Dir: path, Reason: "no .nfo, so the title cannot be identified"})
				return nil
			}
			entry, ok := entryFromNFO(path, nfoPath)
			if !ok {
				res.Skipped = append(res.Skipped, SkipReason{Dir: path, Reason: "the .nfo carries no IMDb or TMDB id"})
				return nil
			}
			res.Entries = append(res.Entries, entry)
			return nil
		})
		if err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return res, firstErr
}

// inspectDir reports whether a directory holds a video, and the NFO beside it.
func inspectDir(dir string) (hasVideo bool, nfoPath string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false, ""
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(e.Name()))
		switch {
		case videoExtensions[ext]:
			hasVideo = true
		case ext == ".nfo" && nfoPath == "":
			nfoPath = filepath.Join(dir, e.Name())
		}
	}
	return hasVideo, nfoPath
}

// entryFromNFO reads the id out of an NFO.
func entryFromNFO(dir, nfoPath string) (Entry, bool) {
	f, err := os.Open(nfoPath)
	if err != nil {
		return Entry{}, false
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, maxNFOBytes))
	if err != nil {
		return Entry{}, false
	}
	text := string(data)

	contentType := contentTypeFromNFO(data)
	// IMDb ids are preferred: every rating source keys off them, whereas a TMDB
	// id has to be resolved first.
	if m := nfoIDPattern.FindString(text); m != "" {
		return Entry{Dir: dir, MediaID: m, ContentType: contentType, Source: "nfo:imdb"}, true
	}
	if m := nfoTMDBPattern.FindStringSubmatch(text); len(m) == 2 {
		return Entry{Dir: dir, MediaID: m[1], ContentType: contentType, Source: "nfo:tmdb"}, true
	}
	return Entry{}, false
}

// contentTypeFromNFO reads the root element to tell a film from a series.
func contentTypeFromNFO(data []byte) string {
	var root nfoRoot
	if err := xml.Unmarshal(data, &root); err != nil {
		return ""
	}
	switch strings.ToLower(root.XMLName.Local) {
	case "movie":
		return "movie"
	case "tvshow", "episodedetails":
		return "series"
	}
	return ""
}

// ErrNoRoots reports that the feature is on but has nowhere to look.
var ErrNoRoots = errors.New("folder writer: no library roots configured")
