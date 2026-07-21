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
	NetworkTileColor string         `json:"networkTileColor,omitempty"` // "#RRGGBB" tile behind provider chips
	// Outline for background-less ("plain") badge text.
	NoBackgroundBadgeOutlineColor string        `json:"noBackgroundBadgeOutlineColor,omitempty"` // "#RRGGBB"; "" = default shadow
	NoBackgroundBadgeOutlineWidth int           `json:"noBackgroundBadgeOutlineWidth,omitempty"` // px; 0 = default
	AggregateBar                  bool          `json:"aggregateBar"`
	AggregateBarPos               string        `json:"aggregateBarPos,omitempty"` // "top" | "bottom"
	Trending                      bool          `json:"trending"`
	TrendingStyle                 TrendingStyle `json:"trendingStyle"`
	BackdropAsPoster              bool          `json:"backdropAsPoster,omitempty"`
	BackdropLogo                  bool          `json:"backdropLogo,omitempty"`
	RatingRing                    bool          `json:"ratingRing,omitempty"`
	RatingRingPos                 string        `json:"ratingRingPos,omitempty"`   // "tl" | "tr" | "bl" | "br"
	RatingRingColor               string        `json:"ratingRingColor,omitempty"` // "" = auto (green/amber/red), else "#RRGGBB"

	// Grouped component controls. Anonymous embeds keep the JSON flat (one key
	// per field, matching v2's naming) while grouping the Go source by concern.
	GenreBadgeConfig
	QualityBadgeConfig
	TrendingConfig
	RatingBadgeConfig
	AggregateConfig
	AgeRatingConfig
	PerSurfaceBaseConfig
	RatingRingConfig
	RandomPosterConfig

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
	// Recurse into anonymously embedded structs: grouped config components embed
	// their raw counterparts, and encoding/json promotes their fields to the
	// flat top-level object, so their json tags are known keys too.
	var walk func(t reflect.Type)
	walk = func(t reflect.Type) {
		for i := 0; i < t.NumField(); i++ {
			f := t.Field(i)
			if f.Anonymous && f.Type.Kind() == reflect.Struct {
				walk(f.Type)
				continue
			}
			name, _, _ := strings.Cut(f.Tag.Get("json"), ",")
			if name != "" && name != "-" {
				m[name] = struct{}{}
			}
		}
	}
	walk(reflect.TypeOf(raw{}))
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
		legacy[k] = canonicalizeRaw(v)
	}
	return legacy
}

// canonicalizeRaw returns a preserved value in a stable form: nested object keys
// are sorted and insignificant whitespace removed, so two logically identical
// values hash and serialize identically regardless of key order or spacing.
// Numbers are decoded with full fidelity (json.Number), so no integer precision
// is lost. Values that don't decode fall back to whitespace compaction.
func canonicalizeRaw(v json.RawMessage) json.RawMessage {
	dec := json.NewDecoder(bytes.NewReader(v))
	dec.UseNumber()
	var decoded any
	if err := dec.Decode(&decoded); err != nil {
		var buf bytes.Buffer
		if err := json.Compact(&buf, v); err != nil {
			return v
		}
		return json.RawMessage(append([]byte(nil), buf.Bytes()...))
	}
	// json.Marshal emits map keys in sorted order, giving a canonical form.
	b, err := json.Marshal(decoded)
	if err != nil {
		return v
	}
	return json.RawMessage(b)
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

// RatingBadgeConfig groups the rating-badge sizing and count controls. Style,
// theme, layout, and the ratings allow-list remain flat fields on Config.
type RatingBadgeConfig struct {
	RatingBadgeScale   int    `json:"ratingBadgeScale,omitempty"`   // percent 70-200; 0 = 100
	RatingsMax         *int   `json:"ratingsMax,omitempty"`         // cap on badge count; nil = no cap
	RatingBadgeOffsetX int    `json:"ratingBadgeOffsetX,omitempty"` // px nudge of the whole strip
	RatingBadgeOffsetY int    `json:"ratingBadgeOffsetY,omitempty"`
	RatingPresentation string `json:"ratingPresentation,omitempty"` // standard|editorial|none (others modeled)
	// Split-side layout geometry.
	SideRatingsPosition string `json:"sideRatingsPosition,omitempty"` // top|middle|bottom|custom; "" = middle
	SideRatingsOffset   int    `json:"sideRatingsOffset,omitempty"`   // px vertical offset for the custom position
	RatingsMaxPerSide   int    `json:"ratingsMaxPerSide,omitempty"`   // cap badges per side; 0 = no cap
	// RatingProviderOverrides maps a provider source (e.g. "imdb") to a
	// "#RRGGBB" accent color that replaces the built-in one for that badge.
	RatingProviderOverrides map[string]string `json:"ratingProviderOverrides,omitempty"`
}

// RandomPosterConfig groups the filters applied when the artwork source is
// "random", so a random pick can be constrained to quality/size/language.
type RandomPosterConfig struct {
	RandomPosterText           string  `json:"randomPosterText,omitempty"`           // any | text | textless
	RandomPosterLanguage       string  `json:"randomPosterLanguage,omitempty"`       // any | requested
	RandomPosterMinVoteCount   int     `json:"randomPosterMinVoteCount,omitempty"`   // 0 = no floor
	RandomPosterMinVoteAverage float64 `json:"randomPosterMinVoteAverage,omitempty"` // 0 = no floor
	RandomPosterMinWidth       int     `json:"randomPosterMinWidth,omitempty"`
	RandomPosterMinHeight      int     `json:"randomPosterMinHeight,omitempty"`
	RandomPosterFallback       string  `json:"randomPosterFallback,omitempty"` // best | original; "" = best
}

// AggregateConfig groups the aggregate-score-bar appearance controls. The bar's
// on/off and position stay flat (AggregateBar / AggregateBarPos).
type AggregateConfig struct {
	AggregateAccentColor  string `json:"aggregateAccentColor,omitempty"`  // "#RRGGBB" bar fill; "" = auto 3-band
	AggregateValueColor   string `json:"aggregateValueColor,omitempty"`   // "#RRGGBB" value text; "" = default
	AggregateBarOffset    int    `json:"aggregateBarOffset,omitempty"`    // px nudge inward from the edge; 0 = flush
	AggregateRatingSource string `json:"aggregateRatingSource,omitempty"` // overall | critics | audience; "" = overall
	ScorebarStyle         string `json:"scorebarStyle,omitempty"`         // progress | solid | gradient; "" = progress
	// Scorebar band overrides. When a color is set it replaces the built-in
	// green/amber/red for that band; thresholds (0-10) move the band boundaries.
	ScorebarLowColor      string  `json:"scorebarLowColor,omitempty"`
	ScorebarMidColor      string  `json:"scorebarMidColor,omitempty"`
	ScorebarHighColor     string  `json:"scorebarHighColor,omitempty"`
	ScorebarLowThreshold  float64 `json:"scorebarLowThreshold,omitempty"`  // below = low band; 0 = default 5.0
	ScorebarHighThreshold float64 `json:"scorebarHighThreshold,omitempty"` // at/above = high band; 0 = default 8.0
}

// QualityBadgeConfig groups the quality-badge (4K/HDR/DV/…) styling controls.
// Zero values keep the original fixed appearance.
type QualityBadgeConfig struct {
	QualityBadgesPos             string `json:"qualityBadgesPos,omitempty"`             // tl|tr|bl|br|tc|bc; "" = tr
	QualityBadgeScale            int    `json:"qualityBadgeScale,omitempty"`            // percent 70-200; 0 = 100
	QualityBadgeOffsetX          int    `json:"qualityBadgeOffsetX,omitempty"`          //
	QualityBadgeOffsetY          int    `json:"qualityBadgeOffsetY,omitempty"`          //
	QualityBadgesStyle           string `json:"qualityBadgesStyle,omitempty"`           // glass | plain | tile
	QualityBadgesMax             *int   `json:"qualityBadgesMax,omitempty"`             // cap on badge count; nil = no cap
	QualityBadgesTileAccentColor string `json:"qualityBadgesTileAccentColor,omitempty"` // "#RRGGBB" for the tile style
}

// RatingRingConfig groups the compact rating-ring options beyond the existing
// flat RatingRing/RatingRingPos/RatingRingColor fields.
type RatingRingConfig struct {
	RingCenterOpacity  int    `json:"ringCenterOpacity,omitempty"`  // 0-100 opacity of the centre disk; 0 = default
	RingValueSource    string `json:"ringValueSource,omitempty"`    // "" / "overall" = average, else a provider (e.g. "imdb")
	RingProgressSource string `json:"ringProgressSource,omitempty"` // source for the arc fill; same values
}

// PerSurfaceBaseConfig groups per-surface base-artwork options that aren't
// badge styling. Only meaningful on the surface they name.
type PerSurfaceBaseConfig struct {
	LogoBackground     string `json:"logoBackground,omitempty"`     // transparent (default) | dark
	EpisodeArtworkMode string `json:"episodeArtworkMode,omitempty"` // still (default) | series | streaming
}

// AgeRatingConfig groups the age/content-rating badge styling. The badge's
// on/off (AgeRating) and position (AgeRatingPos) stay flat.
type AgeRatingConfig struct {
	AgeRatingBadgeStyle string `json:"ageRatingBadgeStyle,omitempty"` // glass | plain | tile
	AgeRatingTileColor  string `json:"ageRatingTileColor,omitempty"`  // "#RRGGBB" for the tile style
}

// TrendingConfig groups the trending-tag styling not already covered by the
// existing Trending/TrendingStyle fields.
type TrendingConfig struct {
	TrendingPos       string `json:"trendingPos,omitempty"`       // tl|tr|bl|br|tc|bc; "" = tl
	TrendingTextColor string `json:"trendingTextColor,omitempty"` // "#RRGGBB" for the trending label text
}

// GenreBadgeConfig groups the genre-badge styling controls. v2 exposed these
// per surface (poster*/backdrop*/thumbnail*/logo*); v3 needs one field each
// because the surfaces envelope already resolves an independent Config per
// surface. Zero values mean "use the built-in default", so an unset config
// renders exactly as before these fields existed.
type GenreBadgeConfig struct {
	GenreBadgeMode              string  `json:"genreBadgeMode,omitempty"`              // off | text | icon | both
	GenreBadgeStyle             string  `json:"genreBadgeStyle,omitempty"`             // glass | square | plain | clean | tile
	GenreBadgeScale             int     `json:"genreBadgeScale,omitempty"`             // percent 70-200; 0 = 100
	GenreBadgeOffsetX           int     `json:"genreBadgeOffsetX,omitempty"`           // px nudge from the resolved corner
	GenreBadgeOffsetY           int     `json:"genreBadgeOffsetY,omitempty"`           //
	GenreBadgeBorderWidth       float64 `json:"genreBadgeBorderWidth,omitempty"`       // px; 0 = default hairline
	GenreBadgeBackgroundOpacity int     `json:"genreBadgeBackgroundOpacity,omitempty"` // 0-100; 0 = default
	GenreBadgeTileAccentColor   string  `json:"genreBadgeTileAccentColor,omitempty"`   // "#RRGGBB" for the tile style
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
	Size                          *string  `json:"size"`
	ArtworkSource                 *string  `json:"artworkSource"`
	Language                      *string  `json:"language"`
	TextPreference                *string  `json:"textPreference"`
	Ratings                       []string `json:"ratings"`
	RatingsLayout                 *string  `json:"ratingsLayout"`
	BadgeStyle                    *string  `json:"badgeStyle"`
	BadgeTheme                    *string  `json:"badgeTheme"`
	Badges                        []string `json:"badges"`
	AgeRating                     *bool    `json:"ageRating"`
	AgeRatingPos                  *string  `json:"ageRatingPos"`
	Genre                         *bool    `json:"genre"`
	GenrePos                      *string  `json:"genrePos"`
	Providers                     *bool    `json:"providers"`
	ProvidersCountry              *string  `json:"providersCountry"`
	NetworkTileColor              *string  `json:"networkTileColor"`
	NoBackgroundBadgeOutlineColor *string  `json:"noBackgroundBadgeOutlineColor"`
	NoBackgroundBadgeOutlineWidth *int     `json:"noBackgroundBadgeOutlineWidth"`
	AggregateBar                  *bool    `json:"aggregateBar"`
	AggregateBarPos               *string  `json:"aggregateBarPos"`
	Trending                      *bool    `json:"trending"`
	TrendingStyle                 *string  `json:"trendingStyle"`
	BackdropAsPoster              *bool    `json:"backdropAsPoster"`
	BackdropLogo                  *bool    `json:"backdropLogo"`
	RatingRing                    *bool    `json:"ratingRing"`
	RatingRingPos                 *string  `json:"ratingRingPos"`
	RatingRingColor               *string  `json:"ratingRingColor"`

	rawGenre
	rawQuality
	rawTrending
	rawRating
	rawAggregate
	rawAge
	rawSurface
	rawRing
	rawRandom
}

// rawRandom is the loose parse shape for RandomPosterConfig.
type rawRandom struct {
	RandomPosterText           *string  `json:"randomPosterText"`
	RandomPosterLanguage       *string  `json:"randomPosterLanguage"`
	RandomPosterMinVoteCount   *int     `json:"randomPosterMinVoteCount"`
	RandomPosterMinVoteAverage *float64 `json:"randomPosterMinVoteAverage"`
	RandomPosterMinWidth       *int     `json:"randomPosterMinWidth"`
	RandomPosterMinHeight      *int     `json:"randomPosterMinHeight"`
	RandomPosterFallback       *string  `json:"randomPosterFallback"`
}

// rawGenre is the loose parse shape for GenreBadgeConfig, embedded in raw so its
// keys unmarshal from the same flat object.
type rawGenre struct {
	GenreBadgeMode              *string  `json:"genreBadgeMode"`
	GenreBadgeStyle             *string  `json:"genreBadgeStyle"`
	GenreBadgeScale             *int     `json:"genreBadgeScale"`
	GenreBadgeOffsetX           *int     `json:"genreBadgeOffsetX"`
	GenreBadgeOffsetY           *int     `json:"genreBadgeOffsetY"`
	GenreBadgeBorderWidth       *float64 `json:"genreBadgeBorderWidth"`
	GenreBadgeBackgroundOpacity *int     `json:"genreBadgeBackgroundOpacity"`
	GenreBadgeTileAccentColor   *string  `json:"genreBadgeTileAccentColor"`
}

// rawQuality and rawTrending mirror their config groups for parsing.
type rawQuality struct {
	QualityBadgesPos             *string `json:"qualityBadgesPos"`
	QualityBadgeScale            *int    `json:"qualityBadgeScale"`
	QualityBadgeOffsetX          *int    `json:"qualityBadgeOffsetX"`
	QualityBadgeOffsetY          *int    `json:"qualityBadgeOffsetY"`
	QualityBadgesStyle           *string `json:"qualityBadgesStyle"`
	QualityBadgesMax             *int    `json:"qualityBadgesMax"`
	QualityBadgesTileAccentColor *string `json:"qualityBadgesTileAccentColor"`
}

type rawTrending struct {
	TrendingPos       *string `json:"trendingPos"`
	TrendingTextColor *string `json:"trendingTextColor"`
}

type rawAge struct {
	AgeRatingBadgeStyle *string `json:"ageRatingBadgeStyle"`
	AgeRatingTileColor  *string `json:"ageRatingTileColor"`
}

type rawSurface struct {
	LogoBackground     *string `json:"logoBackground"`
	EpisodeArtworkMode *string `json:"episodeArtworkMode"`
}

type rawRing struct {
	RingCenterOpacity  *int    `json:"ringCenterOpacity"`
	RingValueSource    *string `json:"ringValueSource"`
	RingProgressSource *string `json:"ringProgressSource"`
}

type rawRating struct {
	RatingBadgeScale        *int              `json:"ratingBadgeScale"`
	RatingsMax              *int              `json:"ratingsMax"`
	RatingBadgeOffsetX      *int              `json:"ratingBadgeOffsetX"`
	RatingBadgeOffsetY      *int              `json:"ratingBadgeOffsetY"`
	RatingPresentation      *string           `json:"ratingPresentation"`
	SideRatingsPosition     *string           `json:"sideRatingsPosition"`
	SideRatingsOffset       *int              `json:"sideRatingsOffset"`
	RatingsMaxPerSide       *int              `json:"ratingsMaxPerSide"`
	RatingProviderOverrides map[string]string `json:"ratingProviderOverrides"`
}

type rawAggregate struct {
	AggregateAccentColor  *string  `json:"aggregateAccentColor"`
	AggregateValueColor   *string  `json:"aggregateValueColor"`
	AggregateBarOffset    *int     `json:"aggregateBarOffset"`
	AggregateRatingSource *string  `json:"aggregateRatingSource"`
	ScorebarStyle         *string  `json:"scorebarStyle"`
	ScorebarLowColor      *string  `json:"scorebarLowColor"`
	ScorebarMidColor      *string  `json:"scorebarMidColor"`
	ScorebarHighColor     *string  `json:"scorebarHighColor"`
	ScorebarLowThreshold  *float64 `json:"scorebarLowThreshold"`
	ScorebarHighThreshold *float64 `json:"scorebarHighThreshold"`
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
	if r.NetworkTileColor != nil && isHexColor(*r.NetworkTileColor) {
		cfg.NetworkTileColor = strings.TrimSpace(*r.NetworkTileColor)
	}
	if r.NoBackgroundBadgeOutlineColor != nil && isHexColor(*r.NoBackgroundBadgeOutlineColor) {
		cfg.NoBackgroundBadgeOutlineColor = strings.TrimSpace(*r.NoBackgroundBadgeOutlineColor)
	}
	if r.NoBackgroundBadgeOutlineWidth != nil {
		cfg.NoBackgroundBadgeOutlineWidth = clampInt(*r.NoBackgroundBadgeOutlineWidth, 0, 6)
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
	parseGenre(&cfg, &r)
	parseQuality(&cfg, &r)
	parseTrending(&cfg, &r)
	parseRating(&cfg, &r)
	parseAggregate(&cfg, &r)
	parseAge(&cfg, &r)
	parseSurface(&cfg, &r)
	parseRing(&cfg, &r)
	parseRandom(&cfg, &r)
	cfg.Legacy = collectLegacy(data)
	return cfg
}

// sixPos validates a six-position placement token, returning "" if invalid.
func sixPos(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "tl", "tr", "bl", "br", "tc", "bc":
		return strings.ToLower(strings.TrimSpace(v))
	}
	return ""
}

func parseQuality(cfg *Config, r *raw) {
	if r.QualityBadgesPos != nil {
		if p := sixPos(*r.QualityBadgesPos); p != "" {
			cfg.QualityBadgesPos = p
		}
	}
	if r.QualityBadgeScale != nil && *r.QualityBadgeScale != 0 {
		cfg.QualityBadgeScale = clampInt(*r.QualityBadgeScale, 70, 200)
	}
	if r.QualityBadgeOffsetX != nil {
		cfg.QualityBadgeOffsetX = clampInt(*r.QualityBadgeOffsetX, -320, 320)
	}
	if r.QualityBadgeOffsetY != nil {
		cfg.QualityBadgeOffsetY = clampInt(*r.QualityBadgeOffsetY, -320, 320)
	}
	if r.QualityBadgesStyle != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.QualityBadgesStyle)); v {
		case "glass", "square", "plain", "media", "silver", "tile", "community-badge":
			cfg.QualityBadgesStyle = v
		}
	}
	if r.QualityBadgesMax != nil && *r.QualityBadgesMax >= 0 {
		m := clampInt(*r.QualityBadgesMax, 0, 20)
		cfg.QualityBadgesMax = &m
	}
	if r.QualityBadgesTileAccentColor != nil && isHexColor(*r.QualityBadgesTileAccentColor) {
		cfg.QualityBadgesTileAccentColor = strings.TrimSpace(*r.QualityBadgesTileAccentColor)
	}
}

func parseTrending(cfg *Config, r *raw) {
	if r.TrendingPos != nil {
		if p := sixPos(*r.TrendingPos); p != "" {
			cfg.TrendingPos = p
		}
	}
	if r.TrendingTextColor != nil && isHexColor(*r.TrendingTextColor) {
		cfg.TrendingTextColor = strings.TrimSpace(*r.TrendingTextColor)
	}
}

func parseRating(cfg *Config, r *raw) {
	if r.RatingBadgeScale != nil && *r.RatingBadgeScale != 0 {
		cfg.RatingBadgeScale = clampInt(*r.RatingBadgeScale, 70, 200)
	}
	if r.RatingsMax != nil && *r.RatingsMax >= 0 {
		m := clampInt(*r.RatingsMax, 0, 20)
		cfg.RatingsMax = &m
	}
	if r.RatingBadgeOffsetX != nil {
		cfg.RatingBadgeOffsetX = clampInt(*r.RatingBadgeOffsetX, -320, 320)
	}
	if r.RatingBadgeOffsetY != nil {
		cfg.RatingBadgeOffsetY = clampInt(*r.RatingBadgeOffsetY, -320, 320)
	}
	if r.RatingPresentation != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.RatingPresentation)); v {
		case "standard", "minimal", "average", "dual", "dual-minimal", "editorial", "scorebar", "none":
			cfg.RatingPresentation = v
		}
	}
	if r.SideRatingsPosition != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.SideRatingsPosition)); v {
		case "top", "middle", "bottom", "custom":
			cfg.SideRatingsPosition = v
		}
	}
	if r.SideRatingsOffset != nil {
		cfg.SideRatingsOffset = clampInt(*r.SideRatingsOffset, -400, 400)
	}
	if r.RatingsMaxPerSide != nil {
		cfg.RatingsMaxPerSide = clampInt(*r.RatingsMaxPerSide, 0, 20)
	}
	if len(r.RatingProviderOverrides) > 0 {
		var m map[string]string
		for k, v := range r.RatingProviderOverrides {
			if isHexColor(v) {
				if m == nil {
					m = make(map[string]string, len(r.RatingProviderOverrides))
				}
				m[strings.ToLower(strings.TrimSpace(k))] = strings.TrimSpace(v)
			}
		}
		cfg.RatingProviderOverrides = m
	}
}

func parseRing(cfg *Config, r *raw) {
	if r.RingCenterOpacity != nil && *r.RingCenterOpacity != 0 {
		cfg.RingCenterOpacity = clampInt(*r.RingCenterOpacity, 1, 100)
	}
	if r.RingValueSource != nil && strings.TrimSpace(*r.RingValueSource) != "" {
		cfg.RingValueSource = strings.ToLower(strings.TrimSpace(*r.RingValueSource))
	}
	if r.RingProgressSource != nil && strings.TrimSpace(*r.RingProgressSource) != "" {
		cfg.RingProgressSource = strings.ToLower(strings.TrimSpace(*r.RingProgressSource))
	}
}

func parseSurface(cfg *Config, r *raw) {
	if r.LogoBackground != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.LogoBackground)); v {
		case "transparent", "dark":
			cfg.LogoBackground = v
		}
	}
	if r.EpisodeArtworkMode != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.EpisodeArtworkMode)); v {
		case "still", "series", "streaming":
			cfg.EpisodeArtworkMode = v
		}
	}
}

func parseAge(cfg *Config, r *raw) {
	if r.AgeRatingBadgeStyle != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.AgeRatingBadgeStyle)); v {
		case "glass", "plain", "tile":
			cfg.AgeRatingBadgeStyle = v
		}
	}
	if r.AgeRatingTileColor != nil && isHexColor(*r.AgeRatingTileColor) {
		cfg.AgeRatingTileColor = strings.TrimSpace(*r.AgeRatingTileColor)
	}
}

func parseAggregate(cfg *Config, r *raw) {
	if r.AggregateAccentColor != nil && isHexColor(*r.AggregateAccentColor) {
		cfg.AggregateAccentColor = strings.TrimSpace(*r.AggregateAccentColor)
	}
	if r.AggregateValueColor != nil && isHexColor(*r.AggregateValueColor) {
		cfg.AggregateValueColor = strings.TrimSpace(*r.AggregateValueColor)
	}
	if r.AggregateBarOffset != nil {
		cfg.AggregateBarOffset = clampInt(*r.AggregateBarOffset, -12, 12)
	}
	if r.AggregateRatingSource != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.AggregateRatingSource)); v {
		case "overall", "critics", "audience":
			cfg.AggregateRatingSource = v
		}
	}
	if r.ScorebarStyle != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.ScorebarStyle)); v {
		case "progress", "solid", "gradient":
			cfg.ScorebarStyle = v
		}
	}
	if r.ScorebarLowColor != nil && isHexColor(*r.ScorebarLowColor) {
		cfg.ScorebarLowColor = strings.TrimSpace(*r.ScorebarLowColor)
	}
	if r.ScorebarMidColor != nil && isHexColor(*r.ScorebarMidColor) {
		cfg.ScorebarMidColor = strings.TrimSpace(*r.ScorebarMidColor)
	}
	if r.ScorebarHighColor != nil && isHexColor(*r.ScorebarHighColor) {
		cfg.ScorebarHighColor = strings.TrimSpace(*r.ScorebarHighColor)
	}
	if r.ScorebarLowThreshold != nil && *r.ScorebarLowThreshold > 0 && *r.ScorebarLowThreshold <= 10 {
		cfg.ScorebarLowThreshold = *r.ScorebarLowThreshold
	}
	if r.ScorebarHighThreshold != nil && *r.ScorebarHighThreshold > 0 && *r.ScorebarHighThreshold <= 10 {
		cfg.ScorebarHighThreshold = *r.ScorebarHighThreshold
	}
}

// parseRandom reads the random-poster filters, validating enums and clamping
// numeric floors.
func parseRandom(cfg *Config, r *raw) {
	if r.RandomPosterText != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.RandomPosterText)); v {
		case "any", "text", "textless":
			cfg.RandomPosterText = v
		}
	}
	if r.RandomPosterLanguage != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.RandomPosterLanguage)); v {
		case "any", "requested":
			cfg.RandomPosterLanguage = v
		}
	}
	if r.RandomPosterMinVoteCount != nil {
		cfg.RandomPosterMinVoteCount = clampInt(*r.RandomPosterMinVoteCount, 0, 100000)
	}
	if r.RandomPosterMinVoteAverage != nil && *r.RandomPosterMinVoteAverage >= 0 && *r.RandomPosterMinVoteAverage <= 10 {
		cfg.RandomPosterMinVoteAverage = *r.RandomPosterMinVoteAverage
	}
	if r.RandomPosterMinWidth != nil {
		cfg.RandomPosterMinWidth = clampInt(*r.RandomPosterMinWidth, 0, 10000)
	}
	if r.RandomPosterMinHeight != nil {
		cfg.RandomPosterMinHeight = clampInt(*r.RandomPosterMinHeight, 0, 10000)
	}
	if r.RandomPosterFallback != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.RandomPosterFallback)); v {
		case "best", "original":
			cfg.RandomPosterFallback = v
		}
	}
}

// clampInt bounds v to [lo, hi].
func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// parseGenre reads the genre-badge styling controls, validating enums and
// clamping numeric ranges so a hostile or stale value can't distort a render.
func parseGenre(cfg *Config, r *raw) {
	if r.GenreBadgeMode != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.GenreBadgeMode)); v {
		case "off", "text", "icon", "both":
			cfg.GenreBadgeMode = v
		}
	}
	if r.GenreBadgeStyle != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.GenreBadgeStyle)); v {
		case "glass", "square", "plain", "clean", "tile":
			cfg.GenreBadgeStyle = v
		}
	}
	if r.GenreBadgeScale != nil && *r.GenreBadgeScale != 0 {
		cfg.GenreBadgeScale = clampInt(*r.GenreBadgeScale, 70, 200)
	}
	if r.GenreBadgeOffsetX != nil {
		cfg.GenreBadgeOffsetX = clampInt(*r.GenreBadgeOffsetX, -320, 320)
	}
	if r.GenreBadgeOffsetY != nil {
		cfg.GenreBadgeOffsetY = clampInt(*r.GenreBadgeOffsetY, -320, 320)
	}
	if r.GenreBadgeBorderWidth != nil && *r.GenreBadgeBorderWidth > 0 {
		w := *r.GenreBadgeBorderWidth
		if w > 8 {
			w = 8
		}
		cfg.GenreBadgeBorderWidth = w
	}
	if r.GenreBadgeBackgroundOpacity != nil && *r.GenreBadgeBackgroundOpacity != 0 {
		cfg.GenreBadgeBackgroundOpacity = clampInt(*r.GenreBadgeBackgroundOpacity, 1, 100)
	}
	if r.GenreBadgeTileAccentColor != nil && isHexColor(*r.GenreBadgeTileAccentColor) {
		cfg.GenreBadgeTileAccentColor = strings.TrimSpace(*r.GenreBadgeTileAccentColor)
	}
}

// isHexColor reports whether s is a "#RGB" or "#RRGGBB" color string.
func isHexColor(s string) bool {
	s = strings.TrimSpace(s)
	if len(s) != 4 && len(s) != 7 {
		return false
	}
	if s[0] != '#' {
		return false
	}
	for _, c := range s[1:] {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

// CacheKey returns a deterministic hex string for the config, suitable for use
// as part of a render cache key. The key is stable: same logical config always
// produces the same key regardless of field insertion order.
func CacheKey(cfg Config) string {
	// Canonical serialization: sort ratings and badges, then marshal.
	type canonical struct {
		Size                          MediaSize      `json:"size"`
		ArtworkSource                 ArtworkSource  `json:"artworkSource"`
		Language                      string         `json:"language"`
		TextPreference                TextPreference `json:"textPreference"`
		Ratings                       []string       `json:"ratings"`
		RatingsLayout                 RatingsLayout  `json:"ratingsLayout"`
		BadgeStyle                    BadgeStyle     `json:"badgeStyle"`
		BadgeTheme                    BadgeTheme     `json:"badgeTheme"`
		Badges                        []string       `json:"badges"`
		AgeRating                     bool           `json:"ageRating"`
		AgeRatingPos                  string         `json:"ageRatingPos"`
		Genre                         bool           `json:"genre"`
		GenrePos                      string         `json:"genrePos"`
		Providers                     bool           `json:"providers"`
		ProvidersCountry              string         `json:"providersCountry"`
		NetworkTileColor              string         `json:"networkTileColor"`
		NoBackgroundBadgeOutlineColor string         `json:"noBackgroundBadgeOutlineColor"`
		NoBackgroundBadgeOutlineWidth int            `json:"noBackgroundBadgeOutlineWidth"`
		AggregateBar                  bool           `json:"aggregateBar"`
		AggregateBarPos               string         `json:"aggregateBarPos"`
		Trending                      bool           `json:"trending"`
		TrendingStyle                 TrendingStyle  `json:"trendingStyle"`
		BackdropAsPoster              bool           `json:"backdropAsPoster"`
		BackdropLogo                  bool           `json:"backdropLogo"`
		RatingRing                    bool           `json:"ratingRing"`
		RatingRingPos                 string         `json:"ratingRingPos"`
		RatingRingColor               string         `json:"ratingRingColor"`
		// Grouped components keep their omitempty tags, so a config with none of
		// these set hashes exactly as it did before the fields existed.
		GenreBadgeConfig
		QualityBadgeConfig
		TrendingConfig
		RatingBadgeConfig
		AggregateConfig
		AgeRatingConfig
		PerSurfaceBaseConfig
		RatingRingConfig
		RandomPosterConfig
	}
	ratings := make([]string, len(cfg.Ratings))
	copy(ratings, cfg.Ratings)
	sort.Strings(ratings)
	badges := make([]string, len(cfg.Badges))
	copy(badges, cfg.Badges)
	sort.Strings(badges)

	c := canonical{
		Size:                          cfg.Size,
		ArtworkSource:                 cfg.ArtworkSource,
		Language:                      cfg.Language,
		TextPreference:                cfg.TextPreference,
		Ratings:                       ratings,
		RatingsLayout:                 cfg.RatingsLayout,
		BadgeStyle:                    cfg.BadgeStyle,
		BadgeTheme:                    cfg.BadgeTheme,
		Badges:                        badges,
		AgeRating:                     cfg.AgeRating,
		AgeRatingPos:                  cfg.AgeRatingPos,
		Genre:                         cfg.Genre,
		GenrePos:                      cfg.GenrePos,
		Providers:                     cfg.Providers,
		ProvidersCountry:              cfg.ProvidersCountry,
		NetworkTileColor:              cfg.NetworkTileColor,
		NoBackgroundBadgeOutlineColor: cfg.NoBackgroundBadgeOutlineColor,
		NoBackgroundBadgeOutlineWidth: cfg.NoBackgroundBadgeOutlineWidth,
		AggregateBar:                  cfg.AggregateBar,
		AggregateBarPos:               cfg.AggregateBarPos,
		Trending:                      cfg.Trending,
		TrendingStyle:                 cfg.TrendingStyle,
		BackdropAsPoster:              cfg.BackdropAsPoster,
		BackdropLogo:                  cfg.BackdropLogo,
		RatingRing:                    cfg.RatingRing,
		RatingRingPos:                 cfg.RatingRingPos,
		RatingRingColor:               cfg.RatingRingColor,
		GenreBadgeConfig:              cfg.GenreBadgeConfig,
		QualityBadgeConfig:            cfg.QualityBadgeConfig,
		TrendingConfig:                cfg.TrendingConfig,
		RatingBadgeConfig:             cfg.RatingBadgeConfig,
		AggregateConfig:               cfg.AggregateConfig,
		AgeRatingConfig:               cfg.AgeRatingConfig,
		PerSurfaceBaseConfig:          cfg.PerSurfaceBaseConfig,
		RatingRingConfig:              cfg.RatingRingConfig,
		RandomPosterConfig:            cfg.RandomPosterConfig,
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
