package compose

import (
	"sort"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// generalArtworkSources is the chain every render falls through to after the
// source a profile named. Order is the fallback order.
var generalArtworkSources = []string{"fanart", "tmdb", "cinemeta"}

// ArtworkAvailability reports, per artwork source a profile can name, whether
// it is currently reachable. A name no provider answers for is absent.
//
// Per source rather than aggregated, unlike the rating badges: a profile names
// an artwork source directly, so someone who chose MediUX wants to read that
// MediUX is out. The class is the interactive one, matching RatingAvailability.
func (p *Pipeline) ArtworkAvailability() map[string]bool {
	if p == nil || p.providers == nil {
		return nil
	}
	out := make(map[string]bool)
	for _, name := range imageconfig.ArtworkSourceNames() {
		prov := p.providers.Get(name)
		if prov == nil || !providerReady(prov) {
			continue
		}
		out[name] = p.reachable(name)
	}
	return out
}

// UnavailableArtworkSources lists the artwork sources held out, sorted so the
// same state always reads the same way.
func (p *Pipeline) UnavailableArtworkSources() []string {
	avail := p.ArtworkAvailability()
	out := make([]string, 0, len(avail))
	for name, ok := range avail {
		if !ok {
			out = append(out, name)
		}
	}
	sort.Strings(out)
	return out
}

// ArtworkFallbackReachable reports whether any general source can be reached.
// False is the state where a render whose configured source is out has nothing
// left to try.
func (p *Pipeline) ArtworkFallbackReachable() bool {
	if p == nil || p.providers == nil {
		return false
	}
	for _, name := range generalArtworkSources {
		prov := p.providers.Get(name)
		if prov == nil || !providerReady(prov) {
			continue
		}
		if p.reachable(name) {
			return true
		}
	}
	return false
}

// reachable reports whether an interactive render can currently call name.
func (p *Pipeline) reachable(name string) bool {
	return p.health == nil || !p.health.CoolingOff(name, provider.CallerInteractive)
}
