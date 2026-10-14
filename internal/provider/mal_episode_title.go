package provider

import (
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

const (
	titleJaccardMin    = 0.6
	titleContainsTerms = 3
)

var (
	genericEpisodeName = regexp.MustCompile(`(?i)^\s*(episode|ep\.?|第)\s*\d+`)
	leadingNumbering   = regexp.MustCompile(`^(episode|ep)\s*\d+\s*`)
	diacriticStripper  = transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)
)

// genericTitle reports whether a title says nothing about the episode.
func genericTitle(s string) bool {
	return strings.TrimSpace(s) == "" || genericEpisodeName.MatchString(s)
}

// normalizeTitle lowercases, folds diacritics, drops punctuation and leading
// episode numbering, and collapses spaces.
func normalizeTitle(s string) string {
	folded, _, err := transform.String(diacriticStripper, s)
	if err != nil {
		folded = s
	}
	var b strings.Builder
	for _, r := range strings.ToLower(folded) {
		switch {
		case unicode.IsLetter(r) || unicode.IsNumber(r):
			b.WriteRune(r)
		case r == '\'' || r == '’' || r == '`':
		default:
			b.WriteRune(' ')
		}
	}
	out := strings.Join(strings.Fields(b.String()), " ")
	return strings.TrimSpace(leadingNumbering.ReplaceAllString(out, ""))
}

// titlesMatch reports whether two episode titles name the same episode: equal
// once normalised, sharing at least 60% of their words, or one holding the other
// with at least three words.
func titlesMatch(a, b string) bool {
	na, nb := normalizeTitle(a), normalizeTitle(b)
	if na == "" || nb == "" {
		return false
	}
	if na == nb {
		return true
	}
	ta, tb := strings.Fields(na), strings.Fields(nb)
	if (strings.Contains(na, nb) && len(tb) >= titleContainsTerms) ||
		(strings.Contains(nb, na) && len(ta) >= titleContainsTerms) {
		return true
	}
	set := make(map[string]bool, len(ta))
	for _, w := range ta {
		set[w] = true
	}
	union := len(set)
	shared := 0
	seen := make(map[string]bool, len(tb))
	for _, w := range tb {
		if seen[w] {
			continue
		}
		seen[w] = true
		if set[w] {
			shared++
		} else {
			union++
		}
	}
	return union > 0 && float64(shared)/float64(union) >= titleJaccardMin
}
