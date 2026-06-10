// Package imageconfig defines and normalizes the canonical config for a render request.
package imageconfig

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strings"
)

// MediaSize is the requested output resolution variant.
type MediaSize string

const (
	SizeNormal MediaSize = "normal"
	SizeLarge  MediaSize = "large"
	Size4K     MediaSize = "4k"
)

// ArtworkSource controls which provider supplies the base artwork.
type ArtworkSource string

const (
	ArtworkTMDB     ArtworkSource = "tmdb"
	ArtworkFanart   ArtworkSource = "fanart"
	ArtworkCinemeta ArtworkSource = "cinemeta"
	ArtworkRandom   ArtworkSource = "random"
)

// TextPreference controls which poster text variant is selected.
type TextPreference string

const (
	TextOriginal    TextPreference = "original"
	TextClean       TextPreference = "clean"
	TextTextless    TextPreference = "textless"
	TextAlternative TextPreference = "alternative"
	TextRandom      TextPreference = "random"
)

// BadgeStyle controls the visual treatment of rating badges.
type BadgeStyle string

const (
	BadgePill   BadgeStyle = "pill"
	BadgeSquare BadgeStyle = "square"
	BadgeGlass  BadgeStyle = "glass"
)

// BadgeTheme controls the rating badge color scheme.
type BadgeTheme string

const (
	ThemeDark  BadgeTheme = "dark"
	ThemeLight BadgeTheme = "light"
)

// RatingsLayout controls where the ratings row is placed.
type RatingsLayout string

const (
	LayoutTop       RatingsLayout = "top"
	LayoutBottom    RatingsLayout = "bottom"
	LayoutLeft      RatingsLayout = "left"
	LayoutRight     RatingsLayout = "right"
	LayoutSplitSide RatingsLayout = "split-side"
)

// Config is the canonical, normalized render config for a media request.
// All fields carry explicit defaults; zero values are never used in render logic.
type Config struct {
	Size           MediaSize      `json:"size"`
	ArtworkSource  ArtworkSource  `json:"artworkSource"`
	Language       string         `json:"language"`
	TextPreference TextPreference `json:"textPreference"`
	Ratings        []string       `json:"ratings"`
	RatingsLayout  RatingsLayout  `json:"ratingsLayout"`
	BadgeStyle     BadgeStyle     `json:"badgeStyle"`
	BadgeTheme     BadgeTheme     `json:"badgeTheme"`
	Badges         []string       `json:"badges,omitempty"`
	AgeRating      bool           `json:"ageRating"`
	AgeRatingPos   string         `json:"ageRatingPos,omitempty"`
	Genre             bool           `json:"genre"`
	GenrePos          string         `json:"genrePos,omitempty"`
	Providers         bool           `json:"providers"`
	ProvidersCountry  string         `json:"providersCountry,omitempty"`
	AggregateBar      bool           `json:"aggregateBar"`
	AggregateBarPos   string         `json:"aggregateBarPos,omitempty"` // "top" | "bottom"
	Trending          bool           `json:"trending"`
}

// Default returns a Config populated with production defaults.
func Default() Config {
	return Config{
		Size:           SizeNormal,
		ArtworkSource:  ArtworkTMDB,
		Language:       "en",
		TextPreference: TextOriginal,
		Ratings:        []string{"tmdb", "imdb"},
		RatingsLayout:  LayoutBottom,
		BadgeStyle:     BadgePill,
		BadgeTheme:     ThemeDark,
		AgeRating:      true,
		AgeRatingPos:   "inherit",
	}
}

// raw is the loose JSON shape we accept from profile config fields.
type raw struct {
	Size           *string  `json:"size"`
	ArtworkSource  *string  `json:"artworkSource"`
	Language       *string  `json:"language"`
	TextPreference *string  `json:"textPreference"`
	Ratings        []string `json:"ratings"`
	RatingsLayout  *string  `json:"ratingsLayout"`
	BadgeStyle     *string  `json:"badgeStyle"`
	BadgeTheme     *string  `json:"badgeTheme"`
	Badges         []string `json:"badges"`
	AgeRating      *bool    `json:"ageRating"`
	AgeRatingPos   *string  `json:"ageRatingPos"`
	Genre            *bool    `json:"genre"`
	GenrePos         *string  `json:"genrePos"`
	Providers        *bool    `json:"providers"`
	ProvidersCountry *string  `json:"providersCountry"`
	AggregateBar     *bool    `json:"aggregateBar"`
	AggregateBarPos  *string  `json:"aggregateBarPos"`
	Trending         *bool    `json:"trending"`
}

// Parse deserializes a profile config JSON blob into a normalized Config.
// Missing or invalid fields fall back to Default() values.
// An empty or nil blob returns Default().
func Parse(data json.RawMessage) Config {
	cfg := Default()
	if len(data) == 0 {
		return cfg
	}
	var r raw
	if err := json.Unmarshal(data, &r); err != nil {
		return cfg
	}
	if r.Size != nil {
		if v := normalizeMediaSize(*r.Size); v != "" {
			cfg.Size = v
		}
	}
	if r.ArtworkSource != nil {
		if v := normalizeArtworkSource(*r.ArtworkSource); v != "" {
			cfg.ArtworkSource = v
		}
	}
	if r.Language != nil && strings.TrimSpace(*r.Language) != "" {
		cfg.Language = strings.ToLower(strings.TrimSpace(*r.Language))
	}
	if r.TextPreference != nil {
		if v := normalizeTextPreference(*r.TextPreference); v != "" {
			cfg.TextPreference = v
		}
	}
	if len(r.Ratings) > 0 {
		if valid := dedupeStrings(r.Ratings); len(valid) > 0 {
			cfg.Ratings = valid
		}
	}
	if r.RatingsLayout != nil {
		if v := normalizeRatingsLayout(*r.RatingsLayout); v != "" {
			cfg.RatingsLayout = v
		}
	}
	if r.BadgeStyle != nil {
		switch strings.ToLower(strings.TrimSpace(*r.BadgeStyle)) {
		case "pill":
			cfg.BadgeStyle = BadgePill
		case "square":
			cfg.BadgeStyle = BadgeSquare
		case "glass":
			cfg.BadgeStyle = BadgeGlass
		}
	}
	if r.BadgeTheme != nil {
		switch strings.ToLower(strings.TrimSpace(*r.BadgeTheme)) {
		case "dark":
			cfg.BadgeTheme = ThemeDark
		case "light":
			cfg.BadgeTheme = ThemeLight
		}
	}
	if len(r.Badges) > 0 {
		cfg.Badges = dedupeStrings(r.Badges)
	}
	if r.AgeRating != nil {
		cfg.AgeRating = *r.AgeRating
	}
	if r.AgeRatingPos != nil && strings.TrimSpace(*r.AgeRatingPos) != "" {
		cfg.AgeRatingPos = strings.TrimSpace(*r.AgeRatingPos)
	}
	if r.Genre != nil {
		cfg.Genre = *r.Genre
	}
	if r.GenrePos != nil && strings.TrimSpace(*r.GenrePos) != "" {
		cfg.GenrePos = strings.TrimSpace(*r.GenrePos)
	}
	if r.Providers != nil {
		cfg.Providers = *r.Providers
	}
	if r.ProvidersCountry != nil && strings.TrimSpace(*r.ProvidersCountry) != "" {
		cfg.ProvidersCountry = strings.ToUpper(strings.TrimSpace(*r.ProvidersCountry))
	}
	if r.AggregateBar != nil {
		cfg.AggregateBar = *r.AggregateBar
	}
	if r.AggregateBarPos != nil {
		switch strings.ToLower(strings.TrimSpace(*r.AggregateBarPos)) {
		case "top", "bottom":
			cfg.AggregateBarPos = strings.ToLower(strings.TrimSpace(*r.AggregateBarPos))
		}
	}
	if r.Trending != nil {
		cfg.Trending = *r.Trending
	}
	return cfg
}

// CacheKey returns a deterministic hex string for the config, suitable for use
// as part of a render cache key. The key is stable: same logical config always
// produces the same key regardless of field insertion order.
func CacheKey(cfg Config) string {
	// Canonical serialization: sort ratings and badges, then marshal.
	type canonical struct {
		Size             MediaSize      `json:"size"`
		ArtworkSource    ArtworkSource  `json:"artworkSource"`
		Language         string         `json:"language"`
		TextPreference   TextPreference `json:"textPreference"`
		Ratings          []string       `json:"ratings"`
		RatingsLayout    RatingsLayout  `json:"ratingsLayout"`
		BadgeStyle       BadgeStyle     `json:"badgeStyle"`
		BadgeTheme       BadgeTheme     `json:"badgeTheme"`
		Badges           []string       `json:"badges"`
		AgeRating        bool           `json:"ageRating"`
		AgeRatingPos     string         `json:"ageRatingPos"`
		Genre            bool           `json:"genre"`
		GenrePos         string         `json:"genrePos"`
		Providers        bool           `json:"providers"`
		ProvidersCountry string         `json:"providersCountry"`
		AggregateBar     bool           `json:"aggregateBar"`
		AggregateBarPos  string         `json:"aggregateBarPos"`
		Trending         bool           `json:"trending"`
	}
	ratings := make([]string, len(cfg.Ratings))
	copy(ratings, cfg.Ratings)
	sort.Strings(ratings)
	badges := make([]string, len(cfg.Badges))
	copy(badges, cfg.Badges)
	sort.Strings(badges)

	c := canonical{
		Size:             cfg.Size,
		ArtworkSource:    cfg.ArtworkSource,
		Language:         cfg.Language,
		TextPreference:   cfg.TextPreference,
		Ratings:          ratings,
		RatingsLayout:    cfg.RatingsLayout,
		BadgeStyle:       cfg.BadgeStyle,
		BadgeTheme:       cfg.BadgeTheme,
		Badges:           badges,
		AgeRating:        cfg.AgeRating,
		AgeRatingPos:     cfg.AgeRatingPos,
		Genre:            cfg.Genre,
		GenrePos:         cfg.GenrePos,
		Providers:        cfg.Providers,
		ProvidersCountry: cfg.ProvidersCountry,
		AggregateBar:     cfg.AggregateBar,
		AggregateBarPos:  cfg.AggregateBarPos,
		Trending:         cfg.Trending,
	}
	b, _ := json.Marshal(c)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// CanonicalJSON returns the canonical JSON representation of cfg, suitable for
// export and import round-trips. Ratings and Badges are sorted for stable output.
func CanonicalJSON(cfg Config) (json.RawMessage, error) {
	out := cfg
	if len(out.Ratings) > 0 {
		out.Ratings = make([]string, len(cfg.Ratings))
		copy(out.Ratings, cfg.Ratings)
		sort.Strings(out.Ratings)
	}
	if len(out.Badges) > 0 {
		out.Badges = make([]string, len(cfg.Badges))
		copy(out.Badges, cfg.Badges)
		sort.Strings(out.Badges)
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(out); err != nil {
		return nil, err
	}
	return json.RawMessage(bytes.TrimRight(buf.Bytes(), "\n")), nil
}

func normalizeMediaSize(v string) MediaSize {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "normal", "standard", "default":
		return SizeNormal
	case "large":
		return SizeLarge
	case "4k", "uhd", "ultra", "verylarge":
		return Size4K
	}
	return ""
}

func normalizeArtworkSource(v string) ArtworkSource {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "tmdb":
		return ArtworkTMDB
	case "fanart":
		return ArtworkFanart
	case "cinemeta", "imdb":
		return ArtworkCinemeta
	case "random":
		return ArtworkRandom
	}
	return ""
}

func normalizeTextPreference(v string) TextPreference {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "original":
		return TextOriginal
	case "clean":
		return TextClean
	case "textless":
		return TextTextless
	case "alternative":
		return TextAlternative
	case "random":
		return TextRandom
	}
	return ""
}

func normalizeRatingsLayout(v string) RatingsLayout {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "top":
		return LayoutTop
	case "bottom":
		return LayoutBottom
	case "left":
		return LayoutLeft
	case "right":
		return LayoutRight
	case "split-side", "splittside", "split_side":
		return LayoutSplitSide
	}
	return ""
}

func dedupeStrings(in []string) []string {
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}
