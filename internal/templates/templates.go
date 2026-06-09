// Package templates provides built-in render config templates.
// Templates are curated profile configs that ship with the binary and are
// available to all users without requiring an account.
package templates

import (
	"encoding/json"
	"sort"
)

// Template is a named, shareable render configuration preset.
type Template struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Category    string          `json:"category"` // "minimal" | "detailed" | "cinema" | "streaming"
	Config      json.RawMessage `json:"config"`
}

// All returns a copy of all built-in templates sorted by category then name.
func All() []Template {
	out := make([]Template, len(builtins))
	copy(out, builtins)
	sort.Slice(out, func(i, j int) bool {
		if out[i].Category != out[j].Category {
			return out[i].Category < out[j].Category
		}
		return out[i].Name < out[j].Name
	})
	return out
}

// ByID returns the template with the given id, or (zero, false).
func ByID(id string) (Template, bool) {
	for _, t := range builtins {
		if t.ID == id {
			return t, true
		}
	}
	return Template{}, false
}

func cfg(raw string) json.RawMessage { return json.RawMessage(raw) }

// builtins is the catalogue of built-in templates.
var builtins = []Template{
	// ── Minimal ───────────────────────────────────────────────────────────────
	{
		ID:          "minimal",
		Name:        "Minimal",
		Description: "Clean poster with no overlays.",
		Category:    "minimal",
		Config:      cfg(`{"artworkSource":"tmdb","ratings":[],"ageRating":false,"genre":false,"providers":false,"badges":[]}`),
	},
	{
		ID:          "scores-only",
		Name:        "Scores only",
		Description: "IMDb and TMDB ratings at the bottom, nothing else.",
		Category:    "minimal",
		Config:      cfg(`{"artworkSource":"tmdb","ratings":["imdb","tmdb"],"ratingsLayout":"bottom","ageRating":false,"genre":false,"providers":false,"badges":[]}`),
	},

	// ── Detailed ──────────────────────────────────────────────────────────────
	{
		ID:          "full-info",
		Name:        "Full info",
		Description: "Ratings, age rating, genre, and quality badges all enabled.",
		Category:    "detailed",
		Config:      cfg(`{"artworkSource":"tmdb","ratings":["imdb","tmdb","rt","metacritic"],"ratingsLayout":"bottom","ageRating":true,"ageRatingPos":"tl","genre":true,"genrePos":"bl","providers":false,"badges":[]}`),
	},
	{
		ID:          "critics-panel",
		Name:        "Critics panel",
		Description: "RT, Metacritic, Letterboxd, and IMDb in a split layout.",
		Category:    "detailed",
		Config:      cfg(`{"artworkSource":"tmdb","ratings":["rt","metacritic","letterboxd","imdb"],"ratingsLayout":"bottom","ageRating":true,"ageRatingPos":"tr","genre":false,"providers":false,"badges":[]}`),
	},
	{
		ID:          "aggregate-focus",
		Name:        "Aggregate focus",
		Description: "Score bar across the bottom with key ratings.",
		Category:    "detailed",
		Config:      cfg(`{"artworkSource":"tmdb","ratings":["imdb","tmdb","rt"],"ratingsLayout":"bottom","aggregateBar":true,"aggregateBarPos":"bottom","ageRating":false,"genre":false,"providers":false,"badges":[]}`),
	},

	// ── Cinema ────────────────────────────────────────────────────────────────
	{
		ID:          "cinema-classic",
		Name:        "Cinema classic",
		Description: "HD artwork from Fanart.tv with IMDb and RT overlaid top.",
		Category:    "cinema",
		Config:      cfg(`{"artworkSource":"fanart","ratings":["imdb","rt"],"ratingsLayout":"top","ageRating":true,"ageRatingPos":"br","genre":true,"genrePos":"bl","providers":false,"badges":[]}`),
	},
	{
		ID:          "4k-hdr",
		Name:        "4K HDR",
		Description: "Quality badges front and centre for home theatre setups.",
		Category:    "cinema",
		Config:      cfg(`{"artworkSource":"fanart","ratings":["imdb"],"ratingsLayout":"bottom","ageRating":true,"ageRatingPos":"tl","genre":false,"providers":false,"badges":["4k","hdr","atmos"]}`),
	},

	// ── Streaming ─────────────────────────────────────────────────────────────
	{
		ID:          "where-to-watch",
		Name:        "Where to watch",
		Description: "Provider chips + ratings — ideal for watchlist posters.",
		Category:    "streaming",
		Config:      cfg(`{"artworkSource":"tmdb","ratings":["imdb","tmdb"],"ratingsLayout":"bottom","ageRating":false,"genre":true,"genrePos":"bl","providers":true,"badges":[]}`),
	},
	{
		ID:          "streaming-full",
		Name:        "Streaming full",
		Description: "Everything: providers, ratings, age, genre, quality.",
		Category:    "streaming",
		Config:      cfg(`{"artworkSource":"tmdb","ratings":["imdb","tmdb","rt"],"ratingsLayout":"bottom","ageRating":true,"ageRatingPos":"tl","genre":true,"genrePos":"bl","providers":true,"badges":["4k","hdr"]}`),
	},
}
