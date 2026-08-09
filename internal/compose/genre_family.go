package compose

import "strings"

// genreFamily is a genre bucket: a short display label and an accent colour.
// A title's genre list resolves to exactly one family, which drives both the
// genre badge's icon/label and the "genre" aggregate accent mode.
type genreFamily struct {
	id     string
	label  string
	accent string
}

var (
	familyAnime     = genreFamily{"anime", "ANIME", "#f59e0b"}
	familyAnimation = genreFamily{"animation", "ANIMATION", "#38bdf8"}
	familyHorror    = genreFamily{"horror", "HORROR", "#ef4444"}
	familyComedy    = genreFamily{"comedy", "COMEDY", "#facc15"}
	familyRomance   = genreFamily{"romance", "ROMANCE", "#fb7185"}
	familyAction    = genreFamily{"action", "ACTION", "#fb923c"}
	familySciFi     = genreFamily{"scifi", "SCI-FI", "#22d3ee"}
	familyFantasy   = genreFamily{"fantasy", "FANTASY", "#34d399"}
	// TMDB's television compound where the keywords settle on both buckets or
	// neither: the title genuinely is both, so it gets its own family rather than
	// being filed under one of them.
	familySciFantasy  = genreFamily{"scifantasy", "Sci-Fantasy", "#b55fe6"}
	familyCrime       = genreFamily{"crime", "CRIME", "#60a5fa"}
	familyDrama       = genreFamily{"drama", "DRAMA", "#818cf8"}
	familyDocumentary = genreFamily{"documentary", "DOC", "#a3e635"}
	familyMusic       = genreFamily{"music", "MUSIC", "#c084fc"}
	familyReality     = genreFamily{"reality", "REALITY", "#fbbf24"}
	familyFamily      = genreFamily{"family", "FAMILY", "#4ade80"}
	familyHistory     = genreFamily{"history", "HISTORY", "#94a3b8"}
	familyKids        = genreFamily{"kids", "KIDS", "#f472b6"}
	familyNews        = genreFamily{"news", "NEWS", "#64748b"}
	familySoap        = genreFamily{"soap", "SOAP", "#d946ef"}
	familyTalk        = genreFamily{"talk", "TALK", "#a78bfa"}
	familyTVMovie     = genreFamily{"tvmovie", "TV", "#f59e0b"}
	familyWarPolitics = genreFamily{"warpolitics", "WAR", "#f87171"}
	familyOther       = genreFamily{"other", "OTHER", "#9ca3af"}
)

// normalizeGenreName lowercases and folds separators so "Sci-Fi_Fantasy" and
// "sci fi fantasy" compare equal.
func normalizeGenreName(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	v = strings.NewReplacer("_", " ", "-", " ").Replace(v)
	return strings.Join(strings.Fields(v), " ")
}

// resolveGenreFamily buckets a title's genres into a single family. The order
// is a fixed priority chain, first match wins, so a title tagged both Fantasy
// and Adventure lands on Fantasy rather than Action. Returns nil when the title
// has no genres at all; an unrecognised genre resolves to the "other" family.
//
// Matching is on genre names, which assumes they arrive in English. The TMDB
// details request deliberately sends no language parameter for that reason:
// adding one would return localised names ("Science-Fiction", "Guerre &
// Politique") and collapse every non-English title into the "other" family.
func resolveGenreFamily(genres []string) *genreFamily {
	return resolveGenreFamilyGrouped(genres, false, "")
}

// resolveGenreFamilyGrouped buckets genres with anime handling. isAnime marks a
// title the anime mapper recognised; grouping controls where those land:
//
//	split (default) — anime gets its own family
//	animation       — anime is folded in with everything else animated
//	secondary       — anime and animation both defer to the next strongest
//	                  genre, so a title reads by what it is rather than how
//	                  it was drawn
func resolveGenreFamilyGrouped(genres []string, isAnime bool, grouping string) *genreFamily {
	primary := resolveFamilyPass(genres, true, isAnime, grouping)
	if grouping != "secondary" || primary == nil {
		return primary
	}
	if primary.id != "anime" && primary.id != "animation" {
		return primary
	}
	// Re-run with the animated families suppressed and take that instead, unless
	// nothing else matched at all.
	if secondary := resolveFamilyPass(genres, false, isAnime, grouping); secondary != nil && secondary.id != "other" {
		return secondary
	}
	return primary
}

// shortGenreNames renames only where the source is long and the shorter form
// resolves to the same family, so the word on the plate cannot disagree with the
// glyph beside it. War & Politics is deliberately absent: TMDB's movie "War"
// resolves to the action family and its TV compound to the war family, so
// collapsing it would put one word on two different marks.
var shortGenreNames = map[string]string{
	"action & adventure": "Action",
	"sci-fi & fantasy":   "Sci-Fi",
	"sci fi & fantasy":   "Sci-Fi",
	"science fiction":    "Sci-Fi",
}

// shortenGenres rewrites a genre list to its short forms. Names with no short
// form are left exactly as the source spells them.
func shortenGenres(genres []string) []string {
	out := make([]string, 0, len(genres))
	for _, g := range genres {
		if short, ok := shortGenreNames[normalizeGenreName(g)]; ok {
			out = append(out, short)
			continue
		}
		out = append(out, g)
	}
	return out
}

// groupAnimeGenres applies the same anime grouping to a raw genre list that
// resolveGenreFamilyGrouped applies to a family, so a badge labelled by its
// genres answers the control too.
func groupAnimeGenres(genres []string, isAnime bool, grouping string) []string {
	animated := func(g string) bool {
		n := normalizeGenreName(g)
		return n == "anime" || n == "animation" || n == "animated"
	}
	out := make([]string, 0, len(genres))
	seen := make(map[string]bool, len(genres))
	add := func(g string) {
		n := normalizeGenreName(g)
		if n == "" || seen[n] {
			return
		}
		seen[n] = true
		out = append(out, g)
	}
	switch grouping {
	case "secondary":
		for _, g := range genres {
			if !animated(g) {
				add(g)
			}
		}
		if len(out) == 0 {
			return genres
		}
		return out
	case "animation":
		for _, g := range genres {
			if animated(g) {
				g = "Animation"
			}
			add(g)
		}
	default:
		if !isAnime {
			return genres
		}
		for _, g := range genres {
			if animated(g) {
				g = "Anime"
			}
			add(g)
		}
	}
	if len(out) == 0 {
		return genres
	}
	return out
}

func resolveFamilyPass(genres []string, includeAnimated, isAnime bool, grouping string) *genreFamily {
	names := make(map[string]bool, len(genres))
	for _, g := range genres {
		if n := normalizeGenreName(g); n != "" {
			names[n] = true
		}
	}
	if len(names) == 0 {
		return nil
	}
	has := func(candidates ...string) bool {
		for _, c := range candidates {
			if names[c] {
				return true
			}
		}
		return false
	}

	if includeAnimated {
		switch {
		case has("anime"):
			return &familyAnime
		case isAnime:
			if grouping == "animation" {
				return &familyAnimation
			}
			return &familyAnime
		case has("animation", "animated"):
			return &familyAnimation
		}
	}

	switch {
	case has("horror"):
		return &familyHorror
	case has("documentary", "docuseries"):
		return &familyDocumentary
	case has("comedy"):
		return &familyComedy
	case has("romance"):
		return &familyRomance
	}

	if has("sci fantasy") {
		return &familySciFantasy
	}

	// Fantasy outranks sci-fi unless the title is explicitly science fiction,
	// which keeps the combined "Sci-Fi & Fantasy" TV genre on the sci-fi side.
	explicitSciFi := has("science fiction", "sci fi")
	if has("fantasy") && !explicitSciFi {
		return &familyFantasy
	}
	if explicitSciFi || has("sci fi & fantasy") {
		return &familySciFi
	}

	switch {
	case has("crime", "thriller", "mystery"):
		return &familyCrime
	case has("action", "adventure", "war", "western", "action & adventure"):
		return &familyAction
	case has("drama"):
		return &familyDrama
	case has("music", "musical"):
		return &familyMusic
	case has("reality", "reality tv"):
		return &familyReality
	case has("family"):
		return &familyFamily
	case has("history"):
		return &familyHistory
	case has("kids"):
		return &familyKids
	case has("news"):
		return &familyNews
	case has("soap"):
		return &familySoap
	case has("talk", "talk show"):
		return &familyTalk
	case has("tv movie", "tv special"):
		return &familyTVMovie
	case has("war & politics"):
		return &familyWarPolitics
	}
	return &familyOther
}

// leadWithFamily moves the genres that belong to the resolved family to the
// front, keeping the rest in order. The glyph and accent are chosen from the
// whole list regardless of position, so without this the count trim could drop
// the very genre the mark is drawn from and leave the words disagreeing with
// it. The resolved family is unchanged, since resolution reads a set and ignores
// order. When the family has no genre word to promote — anime, resolved from a
// flag rather than a name, or a family that needs a combination no single genre
// carries — the order is left as it was.
func leadWithFamily(genres []string, isAnime bool, grouping string) []string {
	fam := resolveGenreFamilyGrouped(genres, isAnime, grouping)
	if fam == nil {
		return genres
	}
	lead := make([]string, 0, len(genres))
	rest := make([]string, 0, len(genres))
	for _, g := range genres {
		if f := resolveGenreFamilyGrouped([]string{g}, isAnime, grouping); f != nil && f.id == fam.id {
			lead = append(lead, g)
		} else {
			rest = append(rest, g)
		}
	}
	if len(lead) == 0 || len(rest) == 0 {
		return genres
	}
	return append(lead, rest...)
}
