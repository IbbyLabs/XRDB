// Package curated answers questions about a title from lists bundled with the
// binary, so the render path can ask "is this a Great Movie" without knowing
// that a list exists or where it came from.
//
// The lists are static because their sources are. Roger Ebert died in 2013, so
// the Great Movies collection is closed: there is nothing to poll, no quota to
// spend, and no staleness to manage.
package curated

import (
	_ "embed"
	"encoding/json"
	"strings"
	"sync"
)

//go:embed lists.json
var listsJSON []byte

// GreatMovies is the list name for Roger Ebert's Great Movies essays.
const GreatMovies = "great-movies"

var (
	once   sync.Once
	lists  map[string]map[string]struct{}
	loaded bool
)

func load() {
	once.Do(func() {
		var doc struct {
			Lists map[string][]string `json:"lists"`
		}
		if err := json.Unmarshal(listsJSON, &doc); err != nil {
			return
		}
		lists = make(map[string]map[string]struct{}, len(doc.Lists))
		for name, ids := range doc.Lists {
			set := make(map[string]struct{}, len(ids))
			for _, id := range ids {
				set[strings.ToLower(strings.TrimSpace(id))] = struct{}{}
			}
			lists[name] = set
		}
		loaded = true
	})
}

// Contains reports whether a title is on a list, and whether that could be
// determined at all.
//
// The second return is not decoration. The lists are keyed on IMDb tt-ids, and a
// title identified only by a TMDB id cannot be looked up — which is a different
// answer from "not on the list", and the difference is invisible downstream: a
// Great Movie would simply render without its mark, nothing would look wrong,
// and nobody would report it. Callers that treat unknown as false should do so
// deliberately.
func Contains(list, imdbID string) (on bool, known bool) {
	load()
	if !loaded {
		return false, false
	}
	id := strings.ToLower(strings.TrimSpace(imdbID))
	if !strings.HasPrefix(id, "tt") {
		return false, false
	}
	set, ok := lists[list]
	if !ok {
		return false, false
	}
	_, on = set[id]
	return on, true
}

// Size reports how many titles a list holds, for tests and diagnostics.
func Size(list string) int {
	load()
	return len(lists[list])
}
