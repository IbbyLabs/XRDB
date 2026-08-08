package compose

import (
	"strings"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// preferredSuppliers names, for each source any provider answered with, the
// provider whose copy is kept. Only providers that actually returned a value
// for a source are considered, so a preferred supplier that failed or was held
// out loses to a lower-preference one that answered — the badge falls back
// rather than disappearing.
//
// A source with one supplier maps to that supplier, which is the majority of
// them, and nothing about those moves.
func preferredSuppliers(called []provider.Provider, answers []*provider.MediaMeta) map[string]string {
	offers := make(map[string][]provider.Supplier)
	for i, meta := range answers {
		if meta == nil || i >= len(called) {
			continue
		}
		name := called[i].Name()
		declares := 1
		if s, ok := called[i].(provider.RatingSourcer); ok {
			if n := len(s.RatingSources()); n > 0 {
				declares = n
			}
		}
		for _, r := range meta.Ratings {
			offers[r.Source] = append(offers[r.Source], provider.Supplier{Name: name, Declares: declares})
		}
	}

	winner := make(map[string]string, len(offers))
	for source, suppliers := range offers {
		winner[source] = provider.PreferredSupplier(source, suppliers)
	}
	return winner
}

// freePreferredSuppliers indexes the providers worth asking before anything
// else: those that cost nothing to consult and are the preferred supplier of at
// least one wanted source. Asking them first turns a redundant call into no
// call at all when they have the title, and costs nothing when they do not.
func freePreferredSuppliers(called []provider.Provider, cfg imageconfig.Config, contentType string) []int {
	wanted := wantedSources(cfg, contentType)
	if len(wanted) == 0 {
		return nil
	}
	best := preferredByWantedSource(called, wanted)

	var out []int
	for i, prov := range called {
		if !provider.AsksNothing(prov) {
			continue
		}
		for _, source := range best {
			if source == prov.Name() {
				out = append(out, i)
				break
			}
		}
	}
	return out
}

// redundantAfter reports which providers no longer need calling, given the
// sources a free supplier has already answered for.
//
// Only a source actually answered for counts. A supplier that could serve a
// source but has no entry for this title covers nothing, which is the whole
// reason selection cannot be decided before the answers arrive.
func redundantAfter(called []provider.Provider, covered map[string]bool, cfg imageconfig.Config, contentType string, skip map[int]bool) map[int]bool {
	wanted := wantedSources(cfg, contentType)
	out := make(map[int]bool)
	if len(covered) == 0 {
		return out
	}
	for i, prov := range called {
		if skip[i] || wantedBeyondRatings(prov, cfg) {
			continue
		}
		s, ok := prov.(provider.RatingSourcer)
		if !ok {
			continue
		}
		needed := false
		offers := false
		for _, src := range s.RatingSources() {
			key := strings.ToLower(src)
			if !wanted[key] {
				continue
			}
			offers = true
			if !covered[key] {
				needed = true
				break
			}
		}
		if offers && !needed {
			out[i] = true
		}
	}
	return out
}

// wantedBeyondRatings reports whether a provider is needed for something other
// than the rating it supplies. The top-rated rank and the awards summary ride
// along with a provider's ratings, so dropping it as a rating supplier would
// take the badge with it.
func wantedBeyondRatings(prov provider.Provider, cfg imageconfig.Config) bool {
	if cfg.TopRated {
		if r, ranks := prov.(provider.Ranker); ranks && r.RanksTitles() {
			return true
		}
	}
	if cfg.Awards {
		if a, ok := prov.(interface{ ProvidesAwards() bool }); ok && a.ProvidesAwards() {
			return true
		}
	}
	return false
}

func wantedSources(cfg imageconfig.Config, contentType string) map[string]bool {
	wanted := make(map[string]bool)
	for _, s := range imageconfig.RatingsCandidatesForType(cfg, contentType) {
		wanted[strings.ToLower(s)] = true
	}
	return wanted
}

// preferredByWantedSource names the preferred supplier of each wanted source
// among the providers given.
func preferredByWantedSource(called []provider.Provider, wanted map[string]bool) map[string]string {
	offers := make(map[string][]provider.Supplier)
	for _, prov := range called {
		s, ok := prov.(provider.RatingSourcer)
		if !ok {
			continue
		}
		sources := s.RatingSources()
		for _, src := range sources {
			key := strings.ToLower(src)
			if wanted[key] {
				offers[key] = append(offers[key], provider.Supplier{Name: prov.Name(), Declares: len(sources)})
			}
		}
	}
	best := make(map[string]string, len(offers))
	for source, suppliers := range offers {
		best[source] = provider.PreferredSupplier(source, suppliers)
	}
	return best
}
