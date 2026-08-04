package provider

import "strings"

// TMDB gives television a single combined "Sci-Fi & Fantasy" genre where film
// gets "Fantasy" and "Science Fiction" separately. Genre matching is on names,
// so that compound never equals "fantasy" and no series can resolve to the
// fantasy family: Game of Thrones renders in the sci-fi colour with a spaceship
// while The Lord of the Rings renders green. Narrowing the compound here fixes
// the family, the label and the short label at once, because everything
// downstream reads this list.
//
// The signal is TMDB's own keywords, already fetched for the stinger check.

// The buckets are tam's. "folklore" and "supernatural" were considered and
// rejected as false-positive magnets.
var (
	compoundFantasyKeywords = []string{
		"fantasy", "magic", "dragon", "sword", "sorcery", "sword and sorcery",
		"witchcraft", "witch", "witches", "wizard", "vampire", "werewolf",
		"mythology", "fairy", "fairy tale",
	}
	compoundSciFiKeywords = []string{
		"space travel", "space opera", "spacecraft", "spaceship", "time travel",
		"alien", "extraterrestrial", "space", "dystopia", "post-apocalyptic",
		"cyberpunk", "steampunk", "virtual reality", "artificial intelligence",
		"robot", "cloning", "parallel world",
	}
)

// compoundOverrides force a side for titles the keywords cannot settle. They are
// two different cases and the distinction matters to anyone editing this:
//
//	56570 Outlander    — matched BOTH buckets (magic vs time travel)
//	90027 Carnival Row — matched BOTH buckets (fairy, fantasy vs steampunk)
//	63174 Lucifer      — matched NEITHER, no signal at all
//
// Keyed on TMDB id rather than title, because titles repeat across years.
var compoundOverrides = map[string]string{
	"56570": genreFantasy,
	"90027": genreFantasy,
	"63174": genreFantasy,
}

const (
	genreFantasy = "Fantasy"
	genreSciFi   = "Science Fiction"
)

// normalizeCompoundName folds case and separators so "Sci-Fi & Fantasy" and
// "sci fi & fantasy" compare equal, matching how the renderer compares genres.
func normalizeCompoundName(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	v = strings.NewReplacer("_", " ", "-", " ").Replace(v)
	return strings.Join(strings.Fields(v), " ")
}

func isSciFiFantasyCompound(genre string) bool {
	return normalizeCompoundName(genre) == "sci fi & fantasy"
}

// matchesBucket reports whether any keyword carries any of the bucket's terms.
// Substring rather than whole-name matching, because Willow's only signal is
// "high fantasy" and an exact comparison drops it.
func matchesBucket(keywords, bucket []string) bool {
	for _, kw := range keywords {
		low := normalizeCompoundName(kw)
		for _, term := range bucket {
			if strings.Contains(low, term) {
				return true
			}
		}
	}
	return false
}

// narrowSciFiFantasy picks the genre the compound should become, or "" to leave
// it alone. Matching both buckets or neither leaves it alone, which is what
// stops this making any title worse than it is today.
func narrowSciFiFantasy(keywords []string, tmdbID string) string {
	if forced, ok := compoundOverrides[tmdbID]; ok {
		return forced
	}
	fantasy := matchesBucket(keywords, compoundFantasyKeywords)
	scifi := matchesBucket(keywords, compoundSciFiKeywords)
	switch {
	case fantasy && !scifi:
		return genreFantasy
	case scifi && !fantasy:
		return genreSciFi
	default:
		return ""
	}
}

// narrowCompoundGenres rewrites TMDB's television compound in a genre list. A
// list without it, or a title the keywords cannot settle, comes back unchanged.
func narrowCompoundGenres(genres, keywords []string, tmdbID string) []string {
	narrowed := ""
	for _, g := range genres {
		if isSciFiFantasyCompound(g) {
			narrowed = narrowSciFiFantasy(keywords, tmdbID)
			break
		}
	}
	if narrowed == "" {
		return genres
	}
	out := make([]string, 0, len(genres))
	for _, g := range genres {
		if isSciFiFantasyCompound(g) {
			out = append(out, narrowed)
			continue
		}
		out = append(out, g)
	}
	return out
}
