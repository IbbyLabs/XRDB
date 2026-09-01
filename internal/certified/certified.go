// Package certified answers whether a title holds Rotten Tomatoes' Certified
// Fresh status, from a file bundled with the binary.
//
// The status is not derivable from a score. Rotten Tomatoes requires a score
// floor, at least five Top Critics reviews, and a wide rather than limited
// release — and no API carries the Top Critics count. XRDB approximated it from
// the total review count, which is a different number, so the mark was applied
// to titles that never earned it and withheld from titles that did.
//
// This holds Rotten Tomatoes' own answer, read from their page rather than
// computed. A title the file does not name gets no answer from here at all —
// Is reports known=false and the caller keeps whatever it did before, because
// the file's coverage grows by demand and an empty file must not strip a mark
// from every title at once.
//
// Unlike internal/curated, whose source is closed because Roger Ebert died, this
// list moves. cmd/rt-refresh rewrites it; nothing here reads the network.
package certified

import (
	_ "embed"
	"encoding/json"
	"strings"
	"sync"
	"time"
)

//go:embed titles.json
var titlesJSON []byte

// Title is one title's Certified Fresh state, keyed by IMDb id in the file.
type Title struct {
	// Certified is Rotten Tomatoes' own answer, read from the page rather than
	// computed. Their rule needs a Top Critics count and a release breadth we
	// cannot see, so anything we derived ourselves would be a guess wearing
	// their name.
	Certified bool `json:"certified"`
	// Score is the Tomatometer at the time of reading, so a reader can see how
	// far the file has drifted from a live score.
	Score int `json:"score"`
}

type file struct {
	// ReadAt dates the whole file. A refresher that cannot reach the source
	// leaves the last good file, so a reader needs to know how old it is.
	ReadAt string           `json:"readAt"`
	Titles map[string]Title `json:"titles"`
}

var (
	once   sync.Once
	loaded file
)

func load() {
	once.Do(func() {
		var doc file
		if err := json.Unmarshal(titlesJSON, &doc); err != nil {
			return
		}
		if doc.Titles == nil {
			doc.Titles = map[string]Title{}
		}
		norm := make(map[string]Title, len(doc.Titles))
		for id, t := range doc.Titles {
			norm[normalizeID(id)] = t
		}
		doc.Titles = norm
		loaded = doc
	})
}

func normalizeID(id string) string { return strings.ToLower(strings.TrimSpace(id)) }

// Is reports whether a title is Certified Fresh, and whether the file has an
// answer for it at all. A caller must not treat "not found" as "not certified"
// in a way that changes something other than the mark: the file's coverage is
// partial by design and grows by demand.
func Is(imdbID string) (certified, known bool) {
	load()
	id := normalizeID(imdbID)
	if id == "" || len(loaded.Titles) == 0 {
		return false, false
	}
	t, ok := loaded.Titles[id]
	if !ok {
		return false, false
	}
	return t.Certified, true
}

// ReadAt is when the bundled file was last written, or the zero time when it
// carries no date. A caller reporting freshness should say so rather than
// implying the data is current.
func ReadAt() time.Time {
	load()
	t, err := time.Parse(time.RFC3339, loaded.ReadAt)
	if err != nil {
		return time.Time{}
	}
	return t
}

// Len is how many titles the file names, for the admin surface and so an empty
// file is visible rather than silently withholding every mark.
func Len() int {
	load()
	return len(loaded.Titles)
}

// SetForTest replaces the loaded titles for the duration of a test. Exported
// because the mark is decided in another package and the interesting cases are
// there.
func SetForTest(t interface{ Cleanup(func()) }, titles map[string]Title) {
	load()
	prev := loaded
	norm := make(map[string]Title, len(titles))
	for id, v := range titles {
		norm[normalizeID(id)] = v
	}
	loaded = file{ReadAt: prev.ReadAt, Titles: norm}
	t.Cleanup(func() { loaded = prev })
}
