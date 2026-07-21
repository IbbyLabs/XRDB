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
	familyAnime       = genreFamily{"anime", "ANIME", "#f59e0b"}
	familyAnimation   = genreFamily{"animation", "ANIMATION", "#38bdf8"}
	familyHorror      = genreFamily{"horror", "HORROR", "#ef4444"}
	familyComedy      = genreFamily{"comedy", "COMEDY", "#facc15"}
	familyRomance     = genreFamily{"romance", "ROMANCE", "#fb7185"}
	familyAction      = genreFamily{"action", "ACTION", "#fb923c"}
	familySciFi       = genreFamily{"scifi", "SCI FI", "#22d3ee"}
	familyFantasy     = genreFamily{"fantasy", "FANTASY", "#34d399"}
	familyCrime       = genreFamily{"crime", "CRIME", "#60a5fa"}
	familyDrama       = genreFamily{"drama", "DRAMA", "#818cf8"}
	familyDocumentary = genreFamily{"documentary", "DOC", "#a3e635"}
	familyMusic       = genreFamily{"music", "MUSIC", "#c084fc"}
	familyReality     = genreFamily{"reality", "REALITY", "#fbbf24"}
	familyFamily      = genreFamily{"family", "FAMILY", "#4ade80"}
	familyHistory     = genreFamily{"history", "HISTORY", "#94a3b8"}
	familyKids        = genreFamily{"kids", "KIDS", "#f472b6"}
	familyNews        = genreFamily{"news", "NEWS", "#64748b"}
	familySoap        = genreFamily{"soap", "SOAP", "#2dd4bf"}
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
func resolveGenreFamily(genres []string) *genreFamily {
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

	switch {
	case has("anime"):
		return &familyAnime
	case has("animation", "animated"):
		return &familyAnimation
	case has("horror"):
		return &familyHorror
	case has("documentary"):
		return &familyDocumentary
	case has("comedy"):
		return &familyComedy
	case has("romance"):
		return &familyRomance
	}

	// Fantasy outranks sci-fi unless the title is explicitly science fiction,
	// which keeps the combined "Sci-Fi & Fantasy" TV genre on the sci-fi side.
	explicitSciFi := has("science fiction")
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
	case has("music"):
		return &familyMusic
	case has("reality"):
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
	case has("talk"):
		return &familyTalk
	case has("tv movie"):
		return &familyTVMovie
	case has("war & politics"):
		return &familyWarPolitics
	}
	return &familyOther
}
