package provider

import (
	"testing"

	"xrdb_rewrite/internal/provider/animemap"
)

// A provider that does not declare its sources is called on every render and
// its answer thrown away when nobody selected it, so the declaration is what
// keeps an unwanted source off the render path.
func TestEveryRatingProviderDeclaresItsSources(t *testing.T) {
	providers := []Provider{
		NewSIMKL(""), NewTrakt(""), NewMDBList(""), NewOMDB(""),
		NewKitsu(), NewMAL(), NewAniList(), NewCinemeta(),
		NewTMDB("", ""), NewFanart(""), NewIMDbDataset(""),
	}
	for _, p := range providers {
		if _, ok := p.(RatingSourcer); !ok {
			t.Errorf("%s does not declare its rating sources", p.Name())
		}
	}
}

// The declared list is what the render path filters on, so a source the mapper
// can produce but the list omits would be silently unreachable.
func TestMDBListDeclaresEverySourceItMaps(t *testing.T) {
	declared := make(map[string]bool)
	for _, s := range (&MDBList{}).RatingSources() {
		declared[s] = true
	}
	// Every raw spelling normalizeMDBSource accepts, from its own switch.
	raw := []string{
		"imdb", "tomatoes", "tomatoes_audience", "popcorn", "popcornmeter",
		"popcorntime", "metacritic", "metacritic_user", "letterboxd", "mdblist",
		"trakt", "tmdb", "rogerebert", "commonsense", "myanimelist", "mal", "anilist",
	}
	for _, r := range raw {
		mapped := normalizeMDBSource(r)
		if mapped == "" {
			t.Errorf("normalizeMDBSource(%q) returned nothing", r)
			continue
		}
		if !declared[mapped] {
			t.Errorf("normalizeMDBSource(%q) = %q, which RatingSources does not declare", r, mapped)
		}
	}
}

// The wrapper stands in for the provider everywhere, so an interface it fails
// to forward is one the render path cannot see.
func TestAnimeMappedForwardsRatingSources(t *testing.T) {
	for _, inner := range []Provider{NewMAL(), NewAniList(), NewKitsu()} {
		w := NewAnimeMapped(inner, animemap.New(animemap.Options{}))
		got := w.RatingSources()
		want := inner.(RatingSourcer).RatingSources()
		if len(got) != len(want) || (len(got) > 0 && got[0] != want[0]) {
			t.Errorf("%s: wrapper returned %v, inner returns %v", inner.Name(), got, want)
		}
	}
}
