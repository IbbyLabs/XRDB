package compose

import (
	"context"
	"strings"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// knownRatingSources is every name a registered provider answers for. It is the
// same set a requested source is matched against, so a name outside it reaches
// no provider. Built once: registration happens at startup and the set does not
// move afterwards.
func (p *Pipeline) knownRatingSources() map[string]bool {
	if cached, ok := p.ratingSourceNames.Load().(map[string]bool); ok {
		return cached
	}
	known := make(map[string]bool)
	for _, name := range p.providers.Names() {
		rs, ok := p.providers.Get(name).(provider.RatingSourcer)
		if !ok {
			continue
		}
		for _, source := range rs.RatingSources() {
			known[strings.ToLower(strings.TrimSpace(source))] = true
		}
	}
	p.ratingSourceNames.Store(known)
	return known
}

// warnUnknownRatingSources reports a configured rating source no provider
// answers for. The name is dropped and the render is indistinguishable from one
// that never asked for it, so the log is the only place it can be seen. v2
// spellings still circulate in pasted configs, "tomatoes" for "rt" among them.
func (p *Pipeline) warnUnknownRatingSources(ctx context.Context, cfg imageconfig.Config) {
	wanted := imageconfig.RatingsCandidatesForType(cfg, "")
	if len(wanted) == 0 {
		return
	}
	known := p.knownRatingSources()
	for _, want := range wanted {
		key := strings.ToLower(strings.TrimSpace(want))
		if key == "" || known[key] {
			continue
		}
		if _, seen := p.warnedRatingSources.LoadOrStore(key, true); seen {
			continue
		}
		p.log().WarnContext(ctx, "A configured rating source is not recognised, so it is dropped",
			"source", want,
			"effect", "the render draws the other configured sources and nothing for this one")
	}
}
