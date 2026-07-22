package provider

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

// Shared plumbing for the rating sources that have no API of their own and are
// read off their public site instead. They are matched by title rather than by
// id, so most of the work here is deciding whether a search result is really the
// title being rendered.

// browserUserAgent identifies the client to sites that serve a different (or no)
// page to something that does not look like a browser.
const browserUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
	"(KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"

// maxTitleVariants caps how many spellings of a title are searched for. Beyond
// the localised and original titles there is little left that is not noise, and
// each variant costs a request.
const maxTitleVariants = 3

// foldTitle reduces a title to a comparison key: accents dropped, case and
// punctuation removed. "Le Fabuleux Destin d'Amélie Poulain" and "le fabuleux
// destin damelie poulain" collapse to the same key, which is what makes a search
// result from a French or Polish site comparable to a TMDB title.
func foldTitle(value string) string {
	cleaner := transform.Chain(norm.NFKD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)
	folded, _, err := transform.String(cleaner, value)
	if err != nil {
		folded = value
	}
	folded = strings.ToLower(folded)
	folded = strings.ReplaceAll(folded, "&", "and")
	var b strings.Builder
	for _, r := range folded {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// titleVariants returns the distinct spellings worth searching for, in the order
// given and capped at maxTitleVariants.
func titleVariants(titles ...string) []string {
	out := make([]string, 0, len(titles))
	seen := make(map[string]bool, len(titles))
	for _, t := range titles {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		key := foldTitle(t)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, t)
		if len(out) == maxTitleVariants {
			break
		}
	}
	return out
}

// scoreTitleMatch rates how well a search result's title matches the one being
// rendered. An exact match after folding is worth far more than a prefix, which
// in turn beats a substring, so "Dune" cannot outrank "Dune: Part Two" when the
// latter is what was asked for. Zero means no match at all.
func scoreTitleMatch(candidate string, wanted []string) int {
	key := foldTitle(candidate)
	if key == "" || len(wanted) == 0 {
		return 0
	}
	best := 0
	for _, w := range wanted {
		switch {
		case w == "":
			continue
		case key == w:
			return 120
		case strings.HasPrefix(key, w) || strings.HasPrefix(w, key):
			if best < 75 {
				best = 75
			}
		case strings.Contains(key, w) || strings.Contains(w, key):
			if best < 35 {
				best = 35
			}
		}
	}
	return best
}

// foldAll folds a set of titles into comparison keys, dropping any that fold to
// nothing.
func foldAll(titles []string) []string {
	out := make([]string, 0, len(titles))
	for _, t := range titles {
		if k := foldTitle(t); k != "" {
			out = append(out, k)
		}
	}
	return out
}

// decodeHTMLEntities expands the entities that show up in scraped titles and
// rating values. It is deliberately narrow: this reads short attribute and text
// fragments, not whole documents.
func decodeHTMLEntities(value string) string {
	replacer := strings.NewReplacer(
		"&quot;", `"`,
		"&#39;", "'",
		"&apos;", "'",
		"&lt;", "<",
		"&gt;", ">",
		"&nbsp;", " ",
		"&amp;", "&", // last: an entity that decoded to "&" must not re-expand
	)
	value = replacer.Replace(value)
	return decodeNumericEntities(value)
}

func decodeNumericEntities(value string) string {
	if !strings.Contains(value, "&#") {
		return value
	}
	var b strings.Builder
	for i := 0; i < len(value); {
		if value[i] != '&' || i+2 >= len(value) || value[i+1] != '#' {
			b.WriteByte(value[i])
			i++
			continue
		}
		end := strings.IndexByte(value[i:], ';')
		if end < 0 {
			b.WriteString(value[i:])
			break
		}
		body := value[i+2 : i+end]
		base := 10
		if len(body) > 0 && (body[0] == 'x' || body[0] == 'X') {
			base, body = 16, body[1:]
		}
		if cp, err := strconv.ParseInt(body, base, 32); err == nil && cp > 0 && cp <= unicode.MaxRune {
			b.WriteRune(rune(cp))
			i += end + 1
			continue
		}
		b.WriteByte(value[i])
		i++
	}
	return b.String()
}

// maxScrapeBody caps how much of a page is read. The ratings sit in the head or
// early body of these pages, and an unbounded read of an arbitrary site is a way
// to lose the process to one bad response.
const maxScrapeBody = 2 << 20 // 2 MiB

// fetchText performs a GET and returns the body as a string.
func fetchText(ctx context.Context, client *http.Client, url string, headers map[string]string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("http %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxScrapeBody))
	if err != nil {
		return "", fmt.Errorf("read body: %w", err)
	}
	return string(body), nil
}

// parseRatingNumber reads a rating written for humans: a comma decimal mark as
// used across Europe, stray whitespace, and a possible "/10" suffix.
func parseRatingNumber(raw string) (float64, bool) {
	raw = strings.TrimSpace(decodeHTMLEntities(raw))
	if i := strings.IndexByte(raw, '/'); i >= 0 {
		raw = raw[:i]
	}
	raw = strings.ReplaceAll(strings.TrimSpace(raw), ",", ".")
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil || v <= 0 {
		return 0, false
	}
	return v, true
}

// yearOf pulls a four-digit year out of a release date or free text.
func yearOf(value string) int {
	for i := 0; i+4 <= len(value); i++ {
		chunk := value[i : i+4]
		if chunk[0] < '1' || chunk[0] > '2' {
			continue
		}
		if n, err := strconv.Atoi(chunk); err == nil && n >= 1000 && n <= 2999 {
			return n
		}
	}
	return 0
}
