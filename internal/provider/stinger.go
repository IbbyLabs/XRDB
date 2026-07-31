package provider

import "strings"

// stingerFromKeywords reads TMDB's credits-scene keyword tags. TMDB tags films
// with "duringcreditsstinger" (a mid-credits scene) and "aftercreditsstinger"
// (a post-credits scene); this is the same structured source the Stinger Pro
// addon draws on, so no scraping is involved.
func stingerFromKeywords(names []string) StingerInfo {
	var info StingerInfo
	for _, n := range names {
		switch strings.ToLower(strings.TrimSpace(n)) {
		case "duringcreditsstinger":
			info.MidCredits = true
		case "aftercreditsstinger":
			info.PostCredits = true
		}
	}
	return info
}
