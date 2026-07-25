package imageconfig

import "strings"

// v2 kept one list called "quality badges" that was really a list of every
// badge feature to switch on: video formats, but also streaming services,
// awards, and settings that are their own flag here. Carried across verbatim
// those become quality tiles, and a token with no tile of its own is drawn as
// its own name in capitals — which is how a migrated poster ends up with a
// column of words like NETFLIX and OSCARWINNER down the side.

// qualityBadgeAliases map v2's spelling onto the token the renderer draws.
var qualityBadgeAliases = map[string]string{
	"dolbyvision":  "dv",
	"dolby-vision": "dv",
	"dolby vision": "dv",
	"dolbyatmos":   "atmos",
	"dolby-atmos":  "atmos",
	"dolby atmos":  "atmos",
	"hdr10+":       "hdr10plus",
	"uhd":          "4k",
}

// qualityBadgeTokens are the tokens with a tile of their own. Anything outside
// this set is not drawn as a quality badge.
var qualityBadgeTokens = map[string]bool{
	"4k": true, "hd": true, "hdr": true, "hdr10": true, "hdr10plus": true,
	"dv": true, "dts": true, "atmos": true, "imax": true,
	"bluray": true, "remux": true, "bdremux": true,
}

// badgeFeatureTokens map a v2 token onto the setting it stands for here, so a
// feature the user had switched on stays switched on instead of being drawn as
// a word. The bool is the field to raise; see applyBadgeFeatureTokens.
const (
	featureAgeRating = "ageRating"
	featureRelease   = "releaseStatus"
	featureTrending  = "trending"
	featureTopRated  = "topRated"
	featureProviders = "providers"
)

var badgeFeatureTokens = map[string]string{
	"certification": featureAgeRating,
	"releasestatus": featureRelease,
	"trendingtoday": featureTrending,
	"trendingweek":  featureTrending,
	"toprated":      featureTopRated,
	"top10":         featureTopRated,
	"top25":         featureTopRated,
	// v2 listed the streaming services individually; here they are one chip row.
	"netflix": featureProviders, "primevideo": featureProviders,
	"hbo": featureProviders, "disneyplus": featureProviders,
	"appletvplus": featureProviders, "hulu": featureProviders,
	"paramountplus": featureProviders, "peacock": featureProviders,
	"max": featureProviders, "amazonprime": featureProviders,
}

// normalizeBadges splits a v2 badge list into the quality tiles that are drawn
// and the features the rest stand for. Tokens matching neither are dropped:
// drawing a word nobody chose is worse than leaving it out.
func normalizeBadges(in []string) (badges []string, features map[string]bool) {
	features = map[string]bool{}
	seen := map[string]bool{}
	for _, raw := range in {
		tok := strings.ToLower(strings.TrimSpace(raw))
		if tok == "" {
			continue
		}
		if alias, ok := qualityBadgeAliases[tok]; ok {
			tok = alias
		}
		if qualityBadgeTokens[tok] {
			if !seen[tok] {
				seen[tok] = true
				badges = append(badges, tok)
			}
			continue
		}
		if feature, ok := badgeFeatureTokens[tok]; ok {
			features[feature] = true
		}
	}
	return badges, features
}
