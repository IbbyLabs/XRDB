package provider

import "strings"

// ParseAwards reads a source's free-text awards line into a compact summary.
// MDBList reports two shapes, and the win must be tied to the specific award or
// a title that won elsewhere is falsely stamped a winner:
//
//	"Won: Best Picture (Oscars, 1973). Plus 4 Oscar nominations…"   won an Oscar
//	"Won: Berlin, 1957. Plus 2 Oscar nominations…"                  won Berlin, Oscar-nominated
//	"Nominated: Best Picture (Oscars, 1995)…"                       Oscar-nominated
//	"Won 8 Oscars. 15 wins & 20 nominations total."                won Oscars (summary form)
//	"Won 16 awards, including 3 Oscar nominations."                 won elsewhere, Oscar-nominated
//
// A false win is a claim printed on the artwork; a missed win is only an absent
// badge. So the parser only reports a win on an unambiguous signal and treats
// everything else as a nomination.
func ParseAwards(s string) AwardSummary {
	l := strings.ToLower(strings.TrimSpace(s))
	if l == "" {
		return AwardSummary{}
	}
	if mentioned, won := oscarOutcome(l); mentioned {
		return AwardSummary{Kind: "oscar", Won: won}
	}
	if mentioned, won := emmyOutcome(l); mentioned {
		return AwardSummary{Kind: "emmy", Won: won}
	}
	return AwardSummary{}
}

func oscarOutcome(l string) (mentioned, won bool) {
	if !strings.Contains(l, "oscar") && !strings.Contains(l, "academy award") {
		return false, false
	}
	return true, wonAward(l, "oscar")
}

func emmyOutcome(l string) (mentioned, won bool) {
	if !strings.Contains(l, "emmy") {
		return false, false
	}
	return true, wonAward(l, "emmy")
}

// wonAward reports whether the line unambiguously says the named award was won.
func wonAward(l, word string) bool {
	// Verdict-led form: "Won: <title> (<Body>, <Year>)…". The award actually won
	// is the body of the first parenthetical, so a win counts only when the
	// leading clause both starts with "won" and names the award there.
	lead := l
	if i := strings.IndexAny(lead, ".;"); i > 0 {
		lead = lead[:i]
	}
	if strings.HasPrefix(lead, "won") {
		if p := strings.Index(lead, "("); p >= 0 && strings.Contains(lead[p:], word) {
			return true
		}
	}
	// Summary form: "Won N <award>s" stated directly, but not "<award>
	// nomination(s)". Scan each "won " and read the clause after it.
	from := 0
	for {
		w := strings.Index(l[from:], "won ")
		if w < 0 {
			return false
		}
		w += from
		clause := l[w:]
		if b := strings.IndexAny(clause, ".;"); b >= 0 {
			clause = clause[:b]
		}
		if ai := strings.Index(clause, word); ai >= 0 {
			after := strings.TrimLeft(clause[ai+len(word):], "s ")
			if !strings.HasPrefix(after, "nomination") {
				return true
			}
		}
		from = w + len("won ")
	}
}

// Label renders the summary as a short badge caption, or "" when there is none.
func (a AwardSummary) Label() string {
	if !a.Has() {
		return ""
	}
	name := "OSCAR"
	if a.Kind == "emmy" {
		name = "EMMY"
	}
	if a.Won {
		return name + " WINNER"
	}
	return name + " NOMINEE"
}
