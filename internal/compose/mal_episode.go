package compose

import (
	"strings"

	"xrdb_rewrite/internal/provider"
)

// episodeMALSource is the source key the per-episode MAL score arrives under.
// It is drawn as the MAL rating, so it is wanted whenever MAL is selected.
const episodeMALSource = "malep"

// withEpisodeMAL makes the episode's MAL score the render's MAL rating. When one
// was found it takes the series score's place, so a render never carries both.
// Without one, an episode render keeps the series score only when
// fallbackToSeries is set.
func withEpisodeMAL(ratings []provider.Rating, contributors []string, isEpisode, fallbackToSeries bool) ([]provider.Rating, []string) {
	var episode *provider.Rating
	out := make([]provider.Rating, 0, len(ratings))
	for i := range ratings {
		r := ratings[i]
		switch r.Source {
		case episodeMALSource:
			episode = &r
		case "mal":
			if isEpisode && !fallbackToSeries {
				continue
			}
			out = append(out, r)
		default:
			out = append(out, r)
		}
	}
	if episode == nil {
		return out, contributors
	}
	episode.Source = "mal"
	replaced := false
	for i := range out {
		if out[i].Source == "mal" {
			out[i], replaced = *episode, true
			break
		}
	}
	if !replaced {
		out = append(out, *episode)
	}
	return out, withMALContributor(contributors)
}

// withMALContributor names MAL among the contributors, since its cache term is
// the one the render takes.
func withMALContributor(contributors []string) []string {
	for _, c := range contributors {
		if c == "mal" {
			return contributors
		}
	}
	return append(contributors, "mal")
}

// tmdbNameForMatching returns the TMDB episode name when it can be compared with
// MAL's English titles, and empty when the render asked TMDB for another language.
func tmdbNameForMatching(name, language string) string {
	lang := strings.ToLower(strings.TrimSpace(language))
	if lang != "" && !strings.HasPrefix(lang, "en") {
		return ""
	}
	return name
}
