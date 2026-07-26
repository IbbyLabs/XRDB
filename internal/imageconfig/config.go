// Package imageconfig defines and normalizes the canonical config for a render request.
package imageconfig

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"math"
	"reflect"
	"sort"
	"strconv"
	"strings"

	"xrdb_rewrite/internal/render"
)

// MediaSize is the requested output resolution variant.
type MediaSize string

const (
	// SizeSmall composes on the same canvas as SizeNormal and downsamples on
	// the way out. It is the only tier that fits Stremio's 100 KB meta-poster
	// limit, so it is the default.
	SizeSmall  MediaSize = "small"
	SizeNormal MediaSize = "normal"
	SizeLarge  MediaSize = "large"
	Size4K     MediaSize = "4k"
)

// OutputFormat is the wire encoding for a delivered render.
type OutputFormat string

const (
	// OutputAuto keeps transparency where a surface needs it (the logo) and
	// uses JPEG everywhere else.
	OutputAuto OutputFormat = "auto"
	OutputJPEG OutputFormat = "jpeg"
	OutputPNG  OutputFormat = "png"
)

// ArtworkSource controls which provider supplies the base artwork.
type ArtworkSource string

const (
	ArtworkTMDB     ArtworkSource = "tmdb"
	ArtworkFanart   ArtworkSource = "fanart"
	ArtworkCinemeta ArtworkSource = "cinemeta"
	ArtworkOMDB     ArtworkSource = "omdb"
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
	// BadgePlain draws the value with no tile behind it, carrying its own
	// outline for legibility. BadgeTile is a dark rounded tile.
	BadgePlain BadgeStyle = "plain"
	BadgeTile  BadgeStyle = "tile"
	// BadgeStacked is the tall badge: an accent rail above a centred mark with
	// the value beneath, rather than a horizontal row of the three.
	BadgeStacked BadgeStyle = "stacked"
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
	LayoutTopBottom RatingsLayout = "top-bottom"
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
	ReleaseStatus    bool           `json:"releaseStatus,omitempty"`
	ReleaseStatusPos string         `json:"releaseStatusPos,omitempty"`
	TopRated         bool           `json:"topRated,omitempty"`
	TopRatedPos      string         `json:"topRatedPos,omitempty"`
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

	OutputFormat  OutputFormat `json:"outputFormat,omitempty"`
	OutputQuality int          `json:"outputQuality,omitempty"` // JPEG quality 40-100; 0 = default

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
	RatingBadgeScale int `json:"ratingBadgeScale,omitempty"` // percent 70-400; 0 = 100
	// StackedLineHidden drops the accent rail above the mark in the stacked
	// style. Named for what it hides so the zero value keeps the rail.
	StackedLineHidden bool `json:"stackedLineHidden,omitempty"`
	// RatingIconHidden draws the value on its own, with no provider mark.
	RatingIconHidden   bool `json:"ratingIconHidden,omitempty"`
	RatingsMax         *int `json:"ratingsMax,omitempty"`         // cap on badge count; nil = no cap
	RatingBadgeOffsetX int  `json:"ratingBadgeOffsetX,omitempty"` // px nudge of the whole strip
	RatingBadgeOffsetY int  `json:"ratingBadgeOffsetY,omitempty"`
	// Per-style nudges, added to the offsets above. Each badge style sits
	// differently on the artwork, so a position tuned for one is wrong for the
	// next; keeping a nudge per style means switching style keeps both.
	RatingOffsetXPillGlass int `json:"ratingXOffsetPillGlass,omitempty"`
	RatingOffsetYPillGlass int `json:"ratingYOffsetPillGlass,omitempty"`
	RatingOffsetXSquare    int `json:"ratingXOffsetSquare,omitempty"`
	RatingOffsetYSquare    int `json:"ratingYOffsetSquare,omitempty"`
	// PosterEdgeOffset pushes the whole badge strip further in from the edge it
	// sits against. 0 keeps the built-in inset.
	PosterEdgeOffset int `json:"posterEdgeOffset,omitempty"`
	// BottomRatingsRow keeps every badge on one row along the bottom edge
	// instead of wrapping them or placing them by the layout's region.
	BottomRatingsRow   bool   `json:"bottomRatingsRow,omitempty"`
	RatingPresentation string `json:"ratingPresentation,omitempty"` // standard|editorial|none (others modeled)
	// RatingValueMode picks the scale rating values are drawn on. "native" (the
	// default) keeps every source on its own scale, so IMDb reads out of ten,
	// Letterboxd out of five and Rotten Tomatoes as a percentage. The normalized
	// modes put every source on one shared scale so badges can be compared:
	// "normalized" is one decimal out of ten, "normalizedclean" drops a trailing
	// ".0", and "normalized100" rounds to a whole number out of a hundred.
	RatingValueMode string `json:"ratingValueMode,omitempty"`
	// RatingVoteCounts appends the vote count to each rating badge. Only IMDb,
	// MDBList and TMDB report one, so the badges that have no count are left
	// unchanged rather than padded with a zero.
	RatingVoteCounts bool `json:"ratingVoteCounts,omitempty"`
	// IconShape clips a provider's mark to a shape: circle, squircle (a softly
	// rounded tile) or rounded (a lightly rounded one). Empty leaves the mark
	// its own outline.
	IconShape string `json:"iconShape,omitempty"`
	// Split-side layout geometry.
	SideRatingsPosition string `json:"sideRatingsPosition,omitempty"` // top|middle|bottom|custom; "" = middle
	SideRatingsOffset   int    `json:"sideRatingsOffset,omitempty"`   // px vertical offset for the custom position
	RatingsMaxPerSide   int    `json:"ratingsMaxPerSide,omitempty"`   // cap badges per side; 0 = no cap
	// RatingProviderOverrides maps a provider source (e.g. "imdb") to a
	// "#RRGGBB" accent color that replaces the built-in one for that badge.
	RatingProviderOverrides map[string]string `json:"ratingProviderOverrides,omitempty"`
	// RatingProviderIconScale maps a provider source to a percent size for its
	// mark within the badge, 50-150, so a mark that reads small (a wordmark) can
	// be grown and a busy one shrunk. The mark scales inside the shared badge
	// box, so the row height stays even.
	RatingProviderIconScale map[string]int `json:"ratingProviderIconScale,omitempty"`
	// RatingProviderWeights maps a provider source to its percent share of any
	// score built from several sources: the rating ring, the aggregate bar, and
	// the averaged presentations. Shares add up to 100 across the selected
	// sources; anything left unset splits whatever remains, so an empty map is
	// an even split. A source on 0 drops out of those scores while its own badge
	// stays. A source with no rating for a title hands its share to the rest.
	RatingProviderWeights map[string]float64 `json:"ratingProviderWeights,omitempty"`
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
	AggregateAccentMode   string `json:"aggregateAccentMode,omitempty"`   // custom | genre | source; "" = auto 3-band
	AggregateValueColor   string `json:"aggregateValueColor,omitempty"`   // "#RRGGBB" value text; "" = default
	AggregateBarOffset    int    `json:"aggregateBarOffset,omitempty"`    // px nudge inward from the edge; 0 = flush
	AggregateRatingSource string `json:"aggregateRatingSource,omitempty"` // overall | critics | audience; "" = overall
	// Critics and audience carry their own accent and value colours, so a dual
	// presentation can tell the two scores apart. Each falls back to the shared
	// colour above when it is unset.
	AggregateCriticsAccentColor  string `json:"aggregateCriticsAccentColor,omitempty"`
	AggregateAudienceAccentColor string `json:"aggregateAudienceAccentColor,omitempty"`
	AggregateCriticsValueColor   string `json:"aggregateCriticsValueColor,omitempty"`
	AggregateAudienceValueColor  string `json:"aggregateAudienceValueColor,omitempty"`
	// AggregateDynamicStops maps scores to colours for the "dynamic" accent
	// mode, as "score:#RRGGBB" pairs on a 0-100 scale, e.g.
	// "0:#7f1d1d,40:#dc2626,75:#84cc16". Colours are interpolated between stops.
	// Empty falls back to the built-in red/amber/green bands.
	AggregateDynamicStops string `json:"aggregateDynamicStops,omitempty"`
	// AggregateFillByScore fills the whole pill with the resolved accent instead
	// of tinting only the accent rail.
	AggregateFillByScore bool `json:"aggregateFillByScore,omitempty"`
	// The accent rail is the colour bar on an aggregate badge. Nil visibility
	// means shown; the offset nudges it along the badge.
	AggregateAccentBarVisible *bool  `json:"aggregateAccentBarVisible,omitempty"`
	AggregateAccentBarOffset  int    `json:"aggregateAccentBarOffset,omitempty"`
	ScorebarStyle             string `json:"scorebarStyle,omitempty"` // progress | solid | gradient | dynamic; "" = progress
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
	// RingCriticsPriority and RingAudiencePriority order the sources the
	// "priority-critics" and "priority-audience" modes walk: the first one with
	// a score wins. Empty keeps the built-in order.
	RingCriticsPriority  []string `json:"ringCriticsPriority,omitempty"`
	RingAudiencePriority []string `json:"ringAudiencePriority,omitempty"`
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
	// The release-status badge takes the same treatments as the age badge, so
	// the two corner plates can be styled to match.
	TopRatedBadgeStyle      string `json:"topRatedBadgeStyle,omitempty"`      // glass|square|plain|tile|silver
	TopRatedTileColor       string `json:"topRatedTileColor,omitempty"`       // "#RRGGBB" for the tile style
	ReleaseStatusBadgeStyle string `json:"releaseStatusBadgeStyle,omitempty"` // glass | plain | tile | square | silver
	ReleaseStatusTileColor  string `json:"releaseStatusTileColor,omitempty"`  // "#RRGGBB" for the tile style
}

// TrendingConfig groups the trending-tag styling not already covered by the
// existing Trending/TrendingStyle fields.
type TrendingConfig struct {
	TrendingPos       string `json:"trendingPos,omitempty"`       // tl|tr|bl|br|tc|bc; "" = tl
	TrendingTextColor string `json:"trendingTextColor,omitempty"` // "#RRGGBB" for the trending label text
	// TrendingTagStyle is the tag's surface treatment, separate from the glyph
	// choice above: glass (the default warm capsule), square (sharp corners) or
	// plain (glyph and label with no surface).
	TrendingTagStyle string `json:"trendingTagStyle,omitempty"`
}

// GenreBadgeConfig groups the genre-badge styling controls. v2 exposed these
// per surface (poster*/backdrop*/thumbnail*/logo*); v3 needs one field each
// because the surfaces envelope already resolves an independent Config per
// surface. Zero values mean "use the built-in default", so an unset config
// renders exactly as before these fields existed.
type GenreBadgeConfig struct {
	GenreBadgeAnimeGrouping     string  `json:"genreBadgeAnimeGrouping,omitempty"`     // split | animation | secondary; "" = split
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
		Size:           SizeSmall,
		OutputFormat:   OutputAuto,
		OutputQuality:  render.DefaultQuality,
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
	OutputFormat                  *string   `json:"outputFormat"`
	OutputQuality                 *int      `json:"outputQuality"`
	Size                          *string   `json:"size"`
	ArtworkSource                 *string   `json:"artworkSource"`
	Language                      *string   `json:"language"`
	TextPreference                *string   `json:"textPreference"`
	Ratings                       *[]string `json:"ratings"`
	RatingsLayout                 *string   `json:"ratingsLayout"`
	BadgeStyle                    *string   `json:"badgeStyle"`
	BadgeTheme                    *string   `json:"badgeTheme"`
	Badges                        []string  `json:"badges"`
	AgeRating                     *bool     `json:"ageRating"`
	AgeRatingPos                  *string   `json:"ageRatingPos"`
	ReleaseStatus                 *bool     `json:"releaseStatus"`
	ReleaseStatusPos              *string   `json:"releaseStatusPos"`
	TopRated                      *bool     `json:"topRated"`
	TopRatedPos                   *string   `json:"topRatedPos"`
	Genre                         *bool     `json:"genre"`
	GenrePos                      *string   `json:"genrePos"`
	Providers                     *bool     `json:"providers"`
	ProvidersCountry              *string   `json:"providersCountry"`
	NetworkTileColor              *string   `json:"networkTileColor"`
	NoBackgroundBadgeOutlineColor *string   `json:"noBackgroundBadgeOutlineColor"`
	NoBackgroundBadgeOutlineWidth *int      `json:"noBackgroundBadgeOutlineWidth"`
	AggregateBar                  *bool     `json:"aggregateBar"`
	AggregateBarPos               *string   `json:"aggregateBarPos"`
	Trending                      *bool     `json:"trending"`
	TrendingStyle                 *string   `json:"trendingStyle"`
	BackdropAsPoster              *bool     `json:"backdropAsPoster"`
	BackdropLogo                  *bool     `json:"backdropLogo"`
	RatingRing                    *bool     `json:"ratingRing"`
	RatingRingPos                 *string   `json:"ratingRingPos"`
	RatingRingColor               *string   `json:"ratingRingColor"`

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
	GenreBadgeAnimeGrouping     *string  `json:"genreBadgeAnimeGrouping"`
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
	TrendingTagStyle  *string `json:"trendingTagStyle"`
	TrendingPos       *string `json:"trendingPos"`
	TrendingTextColor *string `json:"trendingTextColor"`
}

type rawAge struct {
	TopRatedBadgeStyle      *string `json:"topRatedBadgeStyle"`
	TopRatedTileColor       *string `json:"topRatedTileColor"`
	ReleaseStatusBadgeStyle *string `json:"releaseStatusBadgeStyle"`
	ReleaseStatusTileColor  *string `json:"releaseStatusTileColor"`
	AgeRatingBadgeStyle     *string `json:"ageRatingBadgeStyle"`
	AgeRatingTileColor      *string `json:"ageRatingTileColor"`
}

type rawSurface struct {
	LogoBackground     *string `json:"logoBackground"`
	EpisodeArtworkMode *string `json:"episodeArtworkMode"`
}

type rawRing struct {
	RingCenterOpacity    *int     `json:"ringCenterOpacity"`
	RingValueSource      *string  `json:"ringValueSource"`
	RingProgressSource   *string  `json:"ringProgressSource"`
	RingCriticsPriority  []string `json:"ringCriticsPriority"`
	RingAudiencePriority []string `json:"ringAudiencePriority"`
}

type rawRating struct {
	RatingBadgeScale        *int               `json:"ratingBadgeScale"`
	StackedLineHidden       *bool              `json:"stackedLineHidden"`
	RatingIconHidden        *bool              `json:"ratingIconHidden"`
	RatingsMax              *int               `json:"ratingsMax"`
	RatingBadgeOffsetX      *int               `json:"ratingBadgeOffsetX"`
	RatingBadgeOffsetY      *int               `json:"ratingBadgeOffsetY"`
	RatingOffsetXPillGlass  *int               `json:"ratingXOffsetPillGlass"`
	RatingOffsetYPillGlass  *int               `json:"ratingYOffsetPillGlass"`
	RatingOffsetXSquare     *int               `json:"ratingXOffsetSquare"`
	RatingOffsetYSquare     *int               `json:"ratingYOffsetSquare"`
	PosterEdgeOffset        *int               `json:"posterEdgeOffset"`
	BottomRatingsRow        *bool              `json:"bottomRatingsRow"`
	RatingPresentation      *string            `json:"ratingPresentation"`
	RatingValueMode         *string            `json:"ratingValueMode"`
	RatingVoteCounts        *bool              `json:"ratingVoteCounts"`
	IconShape               *string            `json:"iconShape"`
	SideRatingsPosition     *string            `json:"sideRatingsPosition"`
	SideRatingsOffset       *int               `json:"sideRatingsOffset"`
	RatingsMaxPerSide       *int               `json:"ratingsMaxPerSide"`
	RatingProviderOverrides map[string]string  `json:"ratingProviderOverrides"`
	RatingProviderIconScale map[string]int     `json:"ratingProviderIconScale"`
	RatingProviderWeights   map[string]float64 `json:"ratingProviderWeights"`
}

type rawAggregate struct {
	AggregateAccentColor  *string `json:"aggregateAccentColor"`
	AggregateAccentMode   *string `json:"aggregateAccentMode"`
	AggregateValueColor   *string `json:"aggregateValueColor"`
	AggregateBarOffset    *int    `json:"aggregateBarOffset"`
	AggregateRatingSource *string `json:"aggregateRatingSource"`

	AggregateCriticsAccentColor  *string `json:"aggregateCriticsAccentColor"`
	AggregateAudienceAccentColor *string `json:"aggregateAudienceAccentColor"`
	AggregateCriticsValueColor   *string `json:"aggregateCriticsValueColor"`
	AggregateAudienceValueColor  *string `json:"aggregateAudienceValueColor"`
	AggregateDynamicStops        *string `json:"aggregateDynamicStops"`
	AggregateFillByScore         *bool   `json:"aggregateFillByScore"`
	AggregateAccentBarVisible    *bool   `json:"aggregateAccentBarVisible"`
	AggregateAccentBarOffset     *int    `json:"aggregateAccentBarOffset"`

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
// envelope falls back to the poster surface, then to Default(); a flat or empty
// blob is parsed as before.
func ParseSurface(data json.RawMessage, surface string) Config {
	if len(data) == 0 {
		return Default()
	}
	var env surfaceEnvelope
	if err := json.Unmarshal(data, &env); err == nil && len(env.Surfaces) > 0 {
		if sub, ok := env.Surfaces[surface]; ok {
			return Parse(sub)
		}
		// A surface the envelope never named still belongs to this profile, so
		// it takes the poster's look rather than the stock one.
		if sub, ok := env.Surfaces["poster"]; ok {
			slog.Warn("Config has no entry for this surface, so the poster's is used",
				"surface", surface)
			return Parse(sub)
		}
		slog.Warn("Config has no entry for this surface and no poster to fall back on",
			"surface", surface)
		return Default()
	}
	// Flat config — applies to every surface (legacy / live-preview shape).
	return Parse(data)
}

// Accepts reports whether Parse would read this config rather than fall back to
// defaults wholesale. Parse discards the entire blob when any one value carries
// the wrong JSON type, so a caller assembling a config from another source can
// use this to keep a single bad value from taking every other setting with it.
func Accepts(data json.RawMessage) bool {
	if len(data) == 0 {
		return true
	}
	var r raw
	return json.Unmarshal(data, &r) == nil
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
	if r.OutputFormat != nil {
		if v := normalizeOutputFormat(*r.OutputFormat); v != "" {
			cfg.OutputFormat = v
		}
	}
	if r.OutputQuality != nil && *r.OutputQuality > 0 {
		cfg.OutputQuality = clampInt(*r.OutputQuality, 40, 100)
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
	// A pointer so an explicit empty selection is distinguishable from the key
	// being absent. Deselecting every source has to mean no rating badges, not
	// a silent return to the default pair.
	if r.Ratings != nil {
		cfg.Ratings = dedupeStrings(*r.Ratings)
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
		// v2 names these "No Background" and "Tile Dark".
		case "plain", "none", "no-background", "nobackground":
			cfg.BadgeStyle = BadgePlain
		case "tile":
			cfg.BadgeStyle = BadgeTile
		case "stacked":
			cfg.BadgeStyle = BadgeStacked
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
	// A v2 badge list carries features as well as quality tiles; split them so
	// the tiles are drawn and the features raise their own setting instead of
	// being printed as words. A setting the config states explicitly wins.
	var badgeFeatures map[string]bool
	if len(r.Badges) > 0 {
		cfg.Badges, badgeFeatures = normalizeBadges(r.Badges)
	}
	if badgeFeatures[featureAgeRating] && r.AgeRating == nil {
		cfg.AgeRating = true
	}
	if badgeFeatures[featureRelease] && r.ReleaseStatus == nil {
		cfg.ReleaseStatus = true
	}
	if badgeFeatures[featureTrending] && r.Trending == nil {
		cfg.Trending = true
	}
	if badgeFeatures[featureTopRated] && r.TopRated == nil {
		cfg.TopRated = true
	}
	if badgeFeatures[featureProviders] && r.Providers == nil {
		cfg.Providers = true
	}
	if r.AgeRating != nil {
		cfg.AgeRating = *r.AgeRating
	}
	if r.AgeRatingPos != nil {
		if p := badgePos(*r.AgeRatingPos); p != "" {
			cfg.AgeRatingPos = p
		}
	}
	if r.ReleaseStatus != nil {
		cfg.ReleaseStatus = *r.ReleaseStatus
	}
	if r.ReleaseStatusPos != nil {
		if p := badgePos(*r.ReleaseStatusPos); p != "" {
			cfg.ReleaseStatusPos = p
		}
	}
	if r.TopRated != nil {
		cfg.TopRated = *r.TopRated
	}
	if r.TopRatedPos != nil {
		if p := badgePos(*r.TopRatedPos); p != "" {
			cfg.TopRatedPos = p
		}
	}
	if r.Genre != nil {
		cfg.Genre = *r.Genre
	}
	if r.GenrePos != nil {
		if p := badgePos(*r.GenrePos); p != "" {
			cfg.GenrePos = p
		}
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

// sixPosAliases maps the spellings a v2 config uses for a placement onto the
// short token the renderer reads. v2 wrote the same six positions three ways —
// "top-left", "left-top" and "topLeft" — and an unrecognised token falls back
// to the default, which silently moves every badge in a migrated profile.
var sixPosAliases = map[string]string{
	"topleft": "tl", "lefttop": "tl",
	"topright": "tr", "righttop": "tr",
	"topcenter": "tc", "centertop": "tc", "topcentre": "tc",
	"bottomleft": "bl", "leftbottom": "bl",
	"bottomright": "br", "rightbottom": "br",
	"bottomcenter": "bc", "centerbottom": "bc", "bottomcentre": "bc",
}

// badgePos normalizes a corner placement for the badges that also accept
// "inherit" (meaning "wherever the renderer puts you by default"). It returns
// "" for anything it does not recognise, so the caller keeps the default rather
// than handing the renderer a token it will silently ignore.
func badgePos(v string) string {
	if strings.EqualFold(strings.TrimSpace(v), "inherit") {
		return "inherit"
	}
	return sixPos(v)
}

// scoreThreshold reads a score-bar threshold onto the 0-10 scale the renderer
// compares against. v2 writes these on a 0-100 scale, which fell outside the
// accepted range and left the threshold at its default.
func scoreThreshold(v *float64) (float64, bool) {
	if v == nil || *v <= 0 {
		return 0, false
	}
	f := *v
	if f > 10 && f <= 100 {
		f /= 10
	}
	if f <= 0 || f > 10 {
		return 0, false
	}
	return f, true
}

// qualityBadgesPos normalizes the quality-badge placement. v2 offers this one
// as a side rather than a corner — "auto", "left" or "right" — because the
// badges are always top-anchored, so a bare side resolves to the top corner on
// that side.
func qualityBadgesPos(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "left":
		return "tl"
	case "right":
		return "tr"
	case "auto":
		return ""
	}
	return sixPos(v)
}

// sixPos validates a six-position placement token, returning "" if invalid.
func sixPos(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	switch v {
	case "tl", "tr", "bl", "br", "tc", "bc":
		return v
	}
	// Fold the separators v2 used so one table covers every spelling.
	folded := strings.NewReplacer("-", "", "_", "", " ", "").Replace(v)
	return sixPosAliases[folded]
}

func parseQuality(cfg *Config, r *raw) {
	if r.QualityBadgesPos != nil {
		if p := qualityBadgesPos(*r.QualityBadgesPos); p != "" {
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
	// 0 means "no cap" here too; see RatingsMax.
	if r.QualityBadgesMax != nil && *r.QualityBadgesMax > 0 {
		m := clampInt(*r.QualityBadgesMax, 1, 20)
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
	if r.TrendingTagStyle != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.TrendingTagStyle)); v {
		case "glass", "square", "plain":
			cfg.TrendingTagStyle = v
		}
	}
}

func parseRating(cfg *Config, r *raw) {
	if r.RatingBadgeScale != nil && *r.RatingBadgeScale != 0 {
		cfg.RatingBadgeScale = clampInt(*r.RatingBadgeScale, 70, 400)
	}
	if r.StackedLineHidden != nil {
		cfg.StackedLineHidden = *r.StackedLineHidden
	}
	if r.RatingIconHidden != nil {
		cfg.RatingIconHidden = *r.RatingIconHidden
	}
	// A nil cap means "no cap", and the configurator sends 0 for that, so a
	// stored 0 has to keep every badge rather than drop them all.
	if r.RatingsMax != nil && *r.RatingsMax > 0 {
		m := clampInt(*r.RatingsMax, 1, 20)
		cfg.RatingsMax = &m
	}
	if r.RatingBadgeOffsetX != nil {
		cfg.RatingBadgeOffsetX = clampInt(*r.RatingBadgeOffsetX, -320, 320)
	}
	if r.RatingBadgeOffsetY != nil {
		cfg.RatingBadgeOffsetY = clampInt(*r.RatingBadgeOffsetY, -320, 320)
	}
	if r.RatingOffsetXPillGlass != nil {
		cfg.RatingOffsetXPillGlass = clampInt(*r.RatingOffsetXPillGlass, -320, 320)
	}
	if r.RatingOffsetYPillGlass != nil {
		cfg.RatingOffsetYPillGlass = clampInt(*r.RatingOffsetYPillGlass, -320, 320)
	}
	if r.RatingOffsetXSquare != nil {
		cfg.RatingOffsetXSquare = clampInt(*r.RatingOffsetXSquare, -320, 320)
	}
	if r.RatingOffsetYSquare != nil {
		cfg.RatingOffsetYSquare = clampInt(*r.RatingOffsetYSquare, -320, 320)
	}
	if r.PosterEdgeOffset != nil {
		cfg.PosterEdgeOffset = clampInt(*r.PosterEdgeOffset, 0, 80)
	}
	if r.BottomRatingsRow != nil {
		cfg.BottomRatingsRow = *r.BottomRatingsRow
	}
	if r.RatingPresentation != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.RatingPresentation)); v {
		case "standard", "minimal", "average", "dual", "dual-minimal", "editorial", "scorebar", "none":
			cfg.RatingPresentation = v
		case "ring":
			// v2's "Compact Ring" shows one ring and no badge strip. v3 draws the
			// ring as its own overlay, so the preset is both settings together.
			cfg.RatingRing = true
			cfg.RatingPresentation = "none"
		}
	}
	if r.RatingVoteCounts != nil {
		cfg.RatingVoteCounts = *r.RatingVoteCounts
	}
	if r.RatingValueMode != nil {
		// v2 wrote several spellings of the same mode, so fold separators away
		// before matching rather than listing every variant.
		v := strings.ToLower(strings.TrimSpace(*r.RatingValueMode))
		v = strings.NewReplacer("-", "", "_", "", " ", "").Replace(v)
		switch v {
		case "native", "normalized", "normalizedclean", "normalized100":
			cfg.RatingValueMode = v
		case "normalizedcleanten":
			cfg.RatingValueMode = "normalizedclean"
		case "normalizedhundred":
			cfg.RatingValueMode = "normalized100"
		}
	}
	if r.IconShape != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.IconShape)); v {
		case "circle", "squircle", "rounded":
			cfg.IconShape = v
		case "original":
			cfg.IconShape = ""
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
	if len(r.RatingProviderIconScale) > 0 {
		var m map[string]int
		for k, v := range r.RatingProviderIconScale {
			if v <= 0 {
				continue
			}
			if m == nil {
				m = make(map[string]int, len(r.RatingProviderIconScale))
			}
			m[strings.ToLower(strings.TrimSpace(k))] = clampInt(v, 50, 150)
		}
		cfg.RatingProviderIconScale = m
	}
	if len(r.RatingProviderWeights) > 0 {
		var m map[string]float64
		for k, v := range r.RatingProviderWeights {
			// NaN and infinities would poison every average that reads the
			// weight, so they're dropped rather than clamped to a guess.
			if math.IsNaN(v) || math.IsInf(v, 0) || v < 0 {
				continue
			}
			if m == nil {
				m = make(map[string]float64, len(r.RatingProviderWeights))
			}
			m[strings.ToLower(strings.TrimSpace(k))] = math.Min(v, maxProviderWeight)
		}
		cfg.RatingProviderWeights = m
	}
}

// maxProviderWeight is a full share: one source carrying the whole score.
const maxProviderWeight = 100

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
	if v := normalizeSourceOrder(r.RingCriticsPriority); len(v) > 0 {
		cfg.RingCriticsPriority = v
	}
	if v := normalizeSourceOrder(r.RingAudiencePriority); len(v) > 0 {
		cfg.RingAudiencePriority = v
	}
}

// normalizeSourceOrder cleans a provider-priority list: lowercased, trimmed,
// blanks dropped, first mention of a source wins.
func normalizeSourceOrder(in []string) []string {
	if len(in) == 0 {
		return nil
	}
	lowered := make([]string, 0, len(in))
	for _, s := range in {
		lowered = append(lowered, strings.ToLower(s))
	}
	return dedupeStrings(lowered)
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
		case "glass", "square", "plain", "tile", "media", "silver":
			cfg.AgeRatingBadgeStyle = v
		}
	}
	if r.AgeRatingTileColor != nil && isHexColor(*r.AgeRatingTileColor) {
		cfg.AgeRatingTileColor = strings.TrimSpace(*r.AgeRatingTileColor)
	}
	if r.TopRatedBadgeStyle != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.TopRatedBadgeStyle)); v {
		case "glass", "square", "plain", "tile", "silver":
			cfg.TopRatedBadgeStyle = v
		}
	}
	if r.TopRatedTileColor != nil && isHexColor(*r.TopRatedTileColor) {
		cfg.TopRatedTileColor = strings.TrimSpace(*r.TopRatedTileColor)
	}
	if r.ReleaseStatusBadgeStyle != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.ReleaseStatusBadgeStyle)); v {
		case "glass", "square", "plain", "tile", "silver":
			cfg.ReleaseStatusBadgeStyle = v
		}
	}
	if r.ReleaseStatusTileColor != nil && isHexColor(*r.ReleaseStatusTileColor) {
		cfg.ReleaseStatusTileColor = strings.TrimSpace(*r.ReleaseStatusTileColor)
	}
}

func parseAggregate(cfg *Config, r *raw) {
	if r.AggregateAccentMode != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.AggregateAccentMode)); v {
		// "dynamic" colours the bar by score, which is what the score bands
		// already do, so it is accepted and falls through to them.
		case "custom", "genre", "source", "dynamic":
			cfg.AggregateAccentMode = v
		}
	}
	if r.AggregateAccentColor != nil && isHexColor(*r.AggregateAccentColor) {
		cfg.AggregateAccentColor = strings.TrimSpace(*r.AggregateAccentColor)
	}
	if r.AggregateValueColor != nil && isHexColor(*r.AggregateValueColor) {
		cfg.AggregateValueColor = strings.TrimSpace(*r.AggregateValueColor)
	}
	if r.AggregateBarOffset != nil {
		cfg.AggregateBarOffset = clampInt(*r.AggregateBarOffset, -12, 12)
	}
	if r.AggregateCriticsAccentColor != nil && isHexColor(*r.AggregateCriticsAccentColor) {
		cfg.AggregateCriticsAccentColor = strings.TrimSpace(*r.AggregateCriticsAccentColor)
	}
	if r.AggregateAudienceAccentColor != nil && isHexColor(*r.AggregateAudienceAccentColor) {
		cfg.AggregateAudienceAccentColor = strings.TrimSpace(*r.AggregateAudienceAccentColor)
	}
	if r.AggregateCriticsValueColor != nil && isHexColor(*r.AggregateCriticsValueColor) {
		cfg.AggregateCriticsValueColor = strings.TrimSpace(*r.AggregateCriticsValueColor)
	}
	if r.AggregateAudienceValueColor != nil && isHexColor(*r.AggregateAudienceValueColor) {
		cfg.AggregateAudienceValueColor = strings.TrimSpace(*r.AggregateAudienceValueColor)
	}
	if r.AggregateDynamicStops != nil {
		if stops := strings.TrimSpace(*r.AggregateDynamicStops); ParseDynamicStops(stops) != nil {
			cfg.AggregateDynamicStops = stops
		}
	}
	if r.AggregateFillByScore != nil {
		cfg.AggregateFillByScore = *r.AggregateFillByScore
	}
	if r.AggregateAccentBarVisible != nil {
		visible := *r.AggregateAccentBarVisible
		cfg.AggregateAccentBarVisible = &visible
	}
	if r.AggregateAccentBarOffset != nil {
		cfg.AggregateAccentBarOffset = clampInt(*r.AggregateAccentBarOffset, -40, 40)
	}
	if r.AggregateRatingSource != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.AggregateRatingSource)); v {
		case "overall", "critics", "audience":
			cfg.AggregateRatingSource = v
		}
	}
	if r.ScorebarStyle != nil {
		switch v := strings.ToLower(strings.TrimSpace(*r.ScorebarStyle)); v {
		case "progress", "solid", "gradient", "dynamic":
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
	if v, ok := scoreThreshold(r.ScorebarLowThreshold); ok {
		cfg.ScorebarLowThreshold = v
	}
	if v, ok := scoreThreshold(r.ScorebarHighThreshold); ok {
		cfg.ScorebarHighThreshold = v
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
		case "fallback":
			// v2's "fallback" prefers the requested language but takes any when
			// nothing matches, which is what "requested" already does here.
			cfg.RandomPosterLanguage = "requested"
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
	if r.GenreBadgeAnimeGrouping != nil {
		// The aliases are v2's own: it folded several spellings onto these three.
		switch v := strings.ToLower(strings.TrimSpace(*r.GenreBadgeAnimeGrouping)); v {
		case "grouped", "group", "merge", "animationonly":
			cfg.GenreBadgeAnimeGrouping = "animation"
		case "replace", "secondarygenre", "replacesecondary":
			cfg.GenreBadgeAnimeGrouping = "secondary"
		case "split", "animation", "secondary":
			cfg.GenreBadgeAnimeGrouping = v
		}
	}
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
// DynamicStop is one point on the score-to-colour ramp the dynamic aggregate
// accent mode follows.
type DynamicStop struct {
	Score float64 // 0-100
	Color string  // "#RRGGBB"
}

// ParseDynamicStops reads a v2 stop list such as
// "0:#7f1d1d,40:#dc2626,75:#84cc16" into stops ordered by score. It returns nil
// when nothing usable is present, so a malformed value falls back to the
// built-in bands rather than rendering an arbitrary colour.
func ParseDynamicStops(raw string) []DynamicStop {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var stops []DynamicStop
	for _, part := range strings.Split(raw, ",") {
		scoreText, colorText, ok := strings.Cut(strings.TrimSpace(part), ":")
		if !ok {
			continue
		}
		score, err := strconv.ParseFloat(strings.TrimSpace(scoreText), 64)
		if err != nil || score < 0 || score > 100 {
			continue
		}
		colorText = strings.TrimSpace(colorText)
		if !isHexColor(colorText) {
			continue
		}
		stops = append(stops, DynamicStop{Score: score, Color: colorText})
	}
	if len(stops) == 0 {
		return nil
	}
	sort.Slice(stops, func(i, j int) bool { return stops[i].Score < stops[j].Score })
	return stops
}

func isHexColor(s string) bool {
	s = strings.TrimSpace(s)
	if len(s) != 4 && len(s) != 7 {
		return false
	}
	if s[0] != '#' {
		return false
	}
	for _, c := range s[1:] {
		isDigit := c >= '0' && c <= '9'
		isLowerHex := c >= 'a' && c <= 'f'
		isUpperHex := c >= 'A' && c <= 'F'
		if !isDigit && !isLowerHex && !isUpperHex {
			return false
		}
	}
	return true
}

// renderVersion invalidates every cached render when the compositor's output
// changes for a config that itself did not change. Without it a fix to how an
// existing setting is drawn keeps serving the old image until the cache TTL
// expires, which reads as the fix not having shipped.
//
// Bump this whenever a change alters rendered pixels for an unchanged config.
// It costs a full re-render, so it is not for changes that only affect configs
// whose own key already moved.
const renderVersion = "r6"

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
		ReleaseStatus                 bool           `json:"releaseStatus"`
		TopRated                      bool           `json:"topRated,omitempty"`
		TopRatedPos                   string         `json:"topRatedPos,omitempty"`
		ReleaseStatusPos              string         `json:"releaseStatusPos"`
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
		OutputFormat                  OutputFormat   `json:"outputFormat,omitempty"`
		OutputQuality                 int            `json:"outputQuality,omitempty"`
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
		ReleaseStatus:                 cfg.ReleaseStatus,
		TopRated:                      cfg.TopRated,
		TopRatedPos:                   cfg.TopRatedPos,
		ReleaseStatusPos:              cfg.ReleaseStatusPos,
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
		OutputFormat:                  cfg.OutputFormat,
		OutputQuality:                 cfg.OutputQuality,
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
	sum := sha256.Sum256(append([]byte(renderVersion+"|"), b...))
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
	case "small", "compact", "stremio":
		return SizeSmall
	case "normal", "standard", "default":
		return SizeNormal
	case "large":
		return SizeLarge
	case "4k", "uhd", "ultra", "verylarge":
		return Size4K
	}
	return ""
}

func normalizeOutputFormat(v string) OutputFormat {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "auto", "":
		return OutputAuto
	case "jpeg", "jpg":
		return OutputJPEG
	case "png":
		return OutputPNG
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
	case "omdb":
		return ArtworkOMDB
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
	// "left-right" is the spelling a v2 config carries for the same layout.
	case "split-side", "splittside", "split_side", "left-right", "leftright", "left_right":
		return LayoutSplitSide
	case "top-bottom", "topbottom", "top_bottom":
		return LayoutTopBottom
	// v2 gave the backdrop and thumbnail their own layout names. "center" is a
	// horizontally centred row, which is what the bottom strip already draws;
	// "right vertical" is the single right-hand column.
	case "center", "centre", "centered", "centred":
		return LayoutBottom
	case "right-vertical", "rightvertical", "right_vertical", "right vertical":
		return LayoutRight
	case "left-vertical", "leftvertical", "left_vertical", "left vertical":
		return LayoutLeft
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
