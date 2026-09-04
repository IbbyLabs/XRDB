package compose

import "sort"

// RatingAvailability reports, per rating badge, whether any source that can
// supply it is currently reachable.
//
// A reader asks about Letterboxd rather than about the provider that happens to
// fetch it, and the two lists differ: five badges have exactly one supplier, so
// they vanish when it is held out, while IMDb, Rotten Tomatoes and Metacritic
// have several and usually survive. Reporting per provider would name something
// nobody configured and mark working badges broken.
//
// A badge is unavailable only when every supplier of it is held out. The class
// is the interactive one, because that is the render a person is waiting on; a
// bulk sweep's hold does not stop anybody's poster.
func (p *Pipeline) RatingAvailability() map[string]bool {
	if p == nil || p.providers == nil {
		return nil
	}
	out := make(map[string]bool)
	for _, name := range p.providers.Names() {
		prov := p.providers.Get(name)
		sourcer, ok := prov.(interface{ RatingSources() []string })
		if !ok {
			continue
		}
		// A provider this instance never configured is absent rather than
		// unavailable. A badge whose only supplier is unready gets no entry at
		// all, because nothing is broken: it was never on offer.
		if !providerReady(prov) {
			continue
		}
		reachable := p.reachable(name)
		for _, rating := range sourcer.RatingSources() {
			if rating == "" {
				continue
			}
			// Any reachable supplier makes the badge available, so an entry
			// already true is never lowered by a second supplier being out.
			out[rating] = out[rating] || reachable
		}
	}
	return out
}

// UnavailableRatings lists the badges no supplier can currently serve, sorted so
// the same state always reads the same way.
func (p *Pipeline) UnavailableRatings() []string {
	avail := p.RatingAvailability()
	out := make([]string, 0, len(avail))
	for rating, ok := range avail {
		if !ok {
			out = append(out, rating)
		}
	}
	sort.Strings(out)
	return out
}
