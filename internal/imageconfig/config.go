// Package imageconfig defines and normalizes the canonical config for a render request.
package imageconfig

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"reflect"
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
	LayoutNone      RatingsLayout = "none"
)

// TrendingStyle controls the composition of the trending badge: which accent
// glyph it carries and whether the "TRENDING" wordmark is shown.
type TrendingStyle string

const (
	TrendingArrowWord TrendingStyle = "arrow-word" // rising arrow + TRENDING
	TrendingFlameWord TrendingStyle = "flame-word" // flame + TRENDING
	TrendingWord      TrendingStyle = "word"       // TRENDING only
	TrendingArrow     TrendingStyle = "arrow"      // rising arrow only
	TrendingFlame     TrendingStyle = "flame"      // flame only
)

// Config is the canonical, normalized render config for a media request.
// All fields carry explicit defaults; zero values are never used in render logic.
type Config struct {
	Size             MediaSize      `json:"size"`
	ArtworkSource    ArtworkSource  `json:"artworkSource"`
	Language         string         `json:"language"`
	TextPreference   TextPreference `json:"textPreference"`
	Ratings          []string       `json:"ratings"`
	RatingsLayout    RatingsLayout  `json:"ratingsLayout"`
	BadgeStyle       BadgeStyle     `json:"badgeStyle"`
	BadgeTheme       BadgeTheme     `json:"badgeTheme"`
	Badges           []string       `json:"badges,omitempty"`
	AgeRating        bool           `json:"ageRating"`
	AgeRatingPos     string         `json:"ageRatingPos,omitempty"`
	Genre            bool           `json:"genre"`
	GenrePos         string         `json:"genrePos,omitempty"`
	Providers        bool           `json:"providers"`
	ProvidersCountry string         `json:"providersCountry,omitempty"`
	AggregateBar     bool           `json:"aggregateBar"`
	AggregateBarPos  string         `json:"aggregateBarPos,omitempty"` // "top" | "bottom"
	Trending         bool           `json:"trending"`
	TrendingStyle    TrendingStyle  `json:"trendingStyle"`
	BackdropAsPoster bool           `json:"backdropAsPoster,omitempty"`
	BackdropLogo     bool           `json:"backdropLogo,omitempty"`
	RatingRing       bool           `json:"ratingRing,omitempty"`
	RatingRingPos    string         `json:"ratingRingPos,omitempty"`   // "tl" | "tr" | "bl" | "br"
	RatingRingColor  string         `json:"ratingRingColor,omitempty"` // "" = auto (green/amber/red), else "#RRGGBB"

	// Legacy carries config keys XRDB does not yet model — chiefly per-surface
	// fields from a migrated v2 profile whose matching v3 control has not
	// shipped. They are preserved verbatim through Parse/CanonicalJSON
	// round-trips and folded into the cache key, so a migrated config is never
	// silently reduced to the subset v3 understands. They do not affect
	// rendering. As each field gains a real home above, it stops landing here.
	Legacy map[string]json.RawMessage `json:"-"`
}

// knownKeys is the set of top-level config keys Parse models directly, derived
// from the raw parse struct so it can never drift from the fields above. Any
// other key a config carries is preserved in Config.Legacy rather than dropped.
// "surfaces" is reserved for the per-surface envelope (see ParseSurface) and is
// never treated as a legacy field.
var knownKeys = func() map[string]struct{} {
	m := map[string]struct{}{"surfaces": {}}
	t := reflect.TypeOf(raw{})
	for i := 0; i < t.NumField(); i++ {
		name, _, _ := strings.Cut(t.Field(i).Tag.Get("json"), ",")
		if name != "" && name != "-" {
			m[name] = struct{}{}
		}
	}
	return m
}()

// IsModeledKey reports whether a top-level config key is one XRDB renders today,
// as opposed to one preserved verbatim in Config.Legacy. The migration tooling
// uses it to tell a user which of their v2 fields are honoured now and which are
// carried forward untouched until the matching control ships.
func IsModeledKey(key string) bool {
	_, ok := knownKeys[key]
	return ok
}

// collectLegacy returns the keys of data that Parse does not model, compacted so
// round-trips and cache keys are stable. Returns nil when there are none.
func collectLegacy(data json.RawMessage) map[string]json.RawMessage {
	var all map[string]json.RawMessage
	if err := json.Unmarshal(data, &all); err != nil {
		return nil
	}
	var legacy map[string]json.RawMessage
	for k, v := range all {
		if _, known := knownKeys[k]; known {
			continue
		}
		if legacy == nil {
			legacy = make(map[string]json.RawMessage, 4)
		}
		legacy[k] = compactRaw(v)
	}
	return legacy
}

// compactRaw strips insignificant whitespace so a preserved value hashes and
// serializes identically regardless of how it was originally spaced.
func compactRaw(v json.RawMessage) json.RawMessage {
	var buf bytes.Buffer
	if err := json.Compact(&buf, v); err != nil {
		return v
	}
	return json.RawMessage(append([]byte(nil), buf.Bytes()...))
}

// mergeLegacy overlays a config's legacy keys onto an already-marshalled config
// object, skipping any key that is actually modeled so legacy can never shadow a
// real field. The result marshals with sorted keys (encoding/json orders map
// keys), keeping output deterministic.
func mergeLegacy(marshalled []byte, legacy map[string]json.RawMessage) ([]byte, error) {
	if len(legacy) == 0 {
		return marshalled, nil
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(marshalled, &m); err != nil {
		return nil, err
	}
	for k, v := range legacy {
		if _, known := knownKeys[k]; known {
			continue
		}
		m[k] = v
	}
	return json.Marshal(m)
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
		TrendingStyle:  TrendingArrowWord,
	}
}

// raw is the loose JSON shape we accept from profile config fields.
type raw struct {
	Size             *string  `json:"size"`
	ArtworkSource    *string  `json:"artworkSource"`
	Language         *string  `json:"language"`
	TextPreference   *string  `json:"textPreference"`
	Ratings          []string `json:"ratings"`
	RatingsLayout    *string  `json:"ratingsLayout"`
	BadgeStyle       *string  `json:"badgeStyle"`
	BadgeTheme       *string  `json:"badgeTheme"`
	Badges           []string `json:"badges"`
	AgeRating        *bool    `json:"ageRating"`
	AgeRatingPos     *string  `json:"ageRatingPos"`
	Genre            *bool    `json:"genre"`
	GenrePos         *string  `json:"genrePos"`
	Providers        *bool    `json:"providers"`
	ProvidersCountry *string  `json:"providersCountry"`
	AggregateBar     *bool    `json:"aggregateBar"`
	AggregateBarPos  *string  `json:"aggregateBarPos"`
	Trending         *bool    `json:"trending"`
	TrendingStyle    *string  `json:"trendingStyle"`
	BackdropAsPoster *bool    `json:"backdropAsPoster"`
	BackdropLogo     *bool    `json:"backdropLogo"`
	RatingRing       *bool    `json:"ratingRing"`
	RatingRingPos    *string  `json:"ratingRingPos"`
	RatingRingColor  *string  `json:"ratingRingColor"`
}

// Surfaces are the distinct render targets a single profile can style
// independently. They mirror the media-type path segments served by the API.
// This is the single source of truth for valid surfaces; server routing and
// validation derive from it rather than re-declaring the literals.
var Surfaces = []string{"poster", "backdrop", "thumbnail", "logo"}

// IsSurface reports whether name is a recognized render surface.
func IsSurface(name string) bool {
	for _, s := range Surfaces {
		if s == name {
			return true
		}
	}
	return false
}

// surfaceEnvelope is the optional per-surface wrapper. When a profile config
// carries a non-empty "surfaces" object, each render surface is configured
// independently. A flat config (no "surfaces" key) applies to every surface,
// preserving every profile saved before per-surface settings existed.
type surfaceEnvelope struct {
	Surfaces map[string]json.RawMessage `json:"surfaces"`
}

// ParseSurface resolves the Config for a single render surface from a profile
// config blob. The blob may be either the per-surface envelope
// {"surfaces":{"poster":{…},"backdrop":{…}}} or a legacy flat config that
// applies uniformly to every surface. A missing or unknown surface within an
// envelope falls back to Default(); a flat or empty blob is parsed as before.
func ParseSurface(data json.RawMessage, surface string) Config {
	if len(data) == 0 {
		return Default()
	}
	var env surfaceEnvelope
	if err := json.Unmarshal(data, &env); err == nil && len(env.Surfaces) > 0 {
		if sub, ok := env.Surfaces[surface]; ok {
			return Parse(sub)
		}
		return Default()
	}
	// Flat config — applies to every surface (legacy / live-preview shape).
	return Parse(data)
}

// Parse deserializes a flat profile config JSON blob into a normalized Config.
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
	if r.TrendingStyle != nil {
		if v := normalizeTrendingStyle(*r.TrendingStyle); v != "" {
			cfg.TrendingStyle = v
		}
	}
	if r.BackdropAsPoster != nil {
		cfg.BackdropAsPoster = *r.BackdropAsPoster
	}
	if r.BackdropLogo != nil {
		cfg.BackdropLogo = *r.BackdropLogo
	}
	if r.RatingRing != nil {
		cfg.RatingRing = *r.RatingRing
	}
	if r.RatingRingPos != nil {
		switch strings.ToLower(strings.TrimSpace(*r.RatingRingPos)) {
		case "tl", "tr", "bl", "br":
			cfg.RatingRingPos = strings.ToLower(strings.TrimSpace(*r.RatingRingPos))
		}
	}
	if r.RatingRingColor != nil && strings.TrimSpace(*r.RatingRingColor) != "" {
		cfg.RatingRingColor = strings.TrimSpace(*r.RatingRingColor)
	}
	cfg.Legacy = collectLegacy(data)
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
		TrendingStyle    TrendingStyle  `json:"trendingStyle"`
		BackdropAsPoster bool           `json:"backdropAsPoster"`
		BackdropLogo     bool           `json:"backdropLogo"`
		RatingRing       bool           `json:"ratingRing"`
		RatingRingPos    string         `json:"ratingRingPos"`
		RatingRingColor  string         `json:"ratingRingColor"`
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
		TrendingStyle:    cfg.TrendingStyle,
		BackdropAsPoster: cfg.BackdropAsPoster,
		BackdropLogo:     cfg.BackdropLogo,
		RatingRing:       cfg.RatingRing,
		RatingRingPos:    cfg.RatingRingPos,
		RatingRingColor:  cfg.RatingRingColor,
	}
	b, _ := json.Marshal(c)
	// Fold any preserved-but-unmodeled fields into the key so two migrated
	// configs that differ only in a not-yet-honoured field don't collide in the
	// cache. Legacy-free configs hash exactly as before.
	if merged, err := mergeLegacy(b, cfg.Legacy); err == nil {
		b = merged
	}
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
	marshalled := bytes.TrimRight(buf.Bytes(), "\n")
	// Re-attach preserved fields so an export/import round-trip keeps every key a
	// migrated config carried, not just the ones v3 models today.
	merged, err := mergeLegacy(marshalled, out.Legacy)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(merged), nil
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

func normalizeTrendingStyle(v string) TrendingStyle {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "arrow-word", "arrowword", "arrow_word":
		return TrendingArrowWord
	case "flame-word", "flameword", "flame_word":
		return TrendingFlameWord
	case "word", "word-only", "wordonly":
		return TrendingWord
	case "arrow", "arrow-only", "arrowonly":
		return TrendingArrow
	case "flame", "flame-only", "flameonly":
		return TrendingFlame
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
	case "none", "hidden", "off":
		return LayoutNone
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
