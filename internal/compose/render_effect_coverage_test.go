package compose

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"reflect"
	"sort"
	"strings"
	"sync"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/provider/animemap"
)

// A user-settable render config key that changes no pixels on any surface is the
// "setting exists but does nothing" bug: the parser accepts it, the UI offers it,
// the cache key even moves for it, yet the compositor never reads it, so the
// image is identical whatever the user picks (e.g. genreBadgeBackgroundOpacity
// was inert on the glass style; ratingBadgeScale was inert on the logo surface).
//
// TestEveryRenderFieldAffectsTheImage renders a maximal config on every surface,
// then mutates each config key in turn and re-renders. A key whose mutation
// leaves every surface byte-identical is inert and reported. This complements the
// two static guards one and two layers down: TestEveryConfigFieldReachesTheCacheKey
// (the key moves the cache key) and TestEveryRenderFieldReachesTheConfigurator
// (the key has a UI control). Those prove the key is reachable; this proves it
// actually draws.

// metaOnlyRenderField mirrors imageconfig.metaOnlyField: a key that changes a
// served response other than the image, so it correctly draws nothing.
var metaOnlyRenderField = map[string]bool{
	"hideCinemetaRating": true, // strips the IMDb rating from the Stremio meta JSON, not the image
}

// fixtureLimitedField is a key whose pixel effect this offline harness cannot
// exercise, for a reason unrelated to whether the render engine honours it. Each
// entry names the concrete missing fixture, not "hard to test". These are not a
// general escape hatch: a field only belongs here once its effect is shown to
// require machinery the stub pipeline has no equivalent for.
var fixtureLimitedField = map[string]string{
	// Only read on the series-episode still path (fetchEpisode), which needs a
	// concrete *provider.TMDB episode-still source and an episode id; the stub
	// registry has no episode-still provider to switch between.
	"episodeArtworkMode": "needs a series-episode request against a TMDB episode-still source",
}

// ── Fixture ──────────────────────────────────────────────────────────────────

// richMeta returns metadata with every overlay-driving field populated, so each
// feature the maximal config turns on has something to draw.
func richMeta() provider.MediaMeta {
	return provider.MediaMeta{
		Title:          "The Guard Title",
		OriginalTitle:  "Le Titre Gardien",
		Year:           2014,
		Overview:       "A synthetic title carrying every field an overlay might read.",
		PosterURL:      "http://art/tmdb/poster",
		BackdropURL:    "http://art/tmdb/backdrop",
		LogoURL:        "http://art/tmdb/logo",
		IMDbID:         "tt1375666",
		TMDBID:         "27205",
		ContentRating:  "PG-13",
		ReleaseStatus:  "digital",
		Genres:         []string{"Science Fiction", "Drama", "Thriller", "Animation"},
		IsAnime:        true,
		PosterTextless: true,
		TopRatedRank:   7,
		Awards:         provider.AwardSummary{Kind: "oscar", Won: true},
		Stinger:        provider.StingerInfo{MidCredits: true, PostCredits: true},
		WatchProviders: []provider.WatchProvider{
			{ID: 8, Name: "Netflix"},
			{ID: 9, Name: "Amazon Prime Video"},
			{ID: 337, Name: "Disney Plus"},
		},
		Ratings: []provider.Rating{
			{Source: "imdb", Value: 8.6, Votes: 1500000, Label: "8.6"},
			{Source: "tmdb", Value: 8.3, Votes: 32000, Label: "8.3"},
			{Source: "rt", Value: 7.2, Votes: 0, Label: "72%"},
			{Source: "metacritic", Value: 7.4, Votes: 0, Label: "74"},
			{Source: "letterboxd", Value: 4.1, Votes: 0, Label: "4.1"},
			{Source: "trakt", Value: 8.0, Votes: 0, Label: "8.0"},
		},
	}
}

// maximalConfig is imageconfig.Default() with every overlay family enabled and
// positioned, so each styling field has a live surface to affect. Output is PNG
// so any pixel change moves the bytes; the badge strip stays in the standard
// presentation so the rating-badge styling fields are all live.
func maximalConfig() imageconfig.Config {
	c := imageconfig.Default()
	c.Size = imageconfig.SizeNormal
	c.OutputFormat = imageconfig.OutputPNG
	c.OutputQuality = 100

	c.Ratings = []string{"imdb", "tmdb", "rt", "metacritic", "letterboxd", "trakt"}
	c.RatingsLayout = imageconfig.LayoutBottom
	c.BadgeStyle = imageconfig.BadgePill
	c.BadgeTheme = imageconfig.ThemeDark
	c.Badges = []string{"4k", "hdr", "dv", "atmos", "imax"}

	c.AgeRating = true
	c.AgeRatingPos = "tl"
	c.ReleaseStatus = true
	c.ReleaseStatusPos = "bl"
	c.TopRated = true
	c.TopRatedPos = "tc"
	c.Awards = true
	c.AwardsPos = "bc"
	c.Stinger = true
	c.StingerPos = "br"
	c.Genre = true
	c.GenrePos = "bl"
	c.GenreBadgeMode = "both"
	c.Providers = true
	c.ProvidersPos = "bc"

	c.MetaLine = true
	c.AggregateBar = true
	c.AggregateBarPos = "bottom"
	c.Trending = true
	c.TrendingStyle = imageconfig.TrendingArrowWord
	c.TrendingPos = "tr"
	c.RatingRing = true
	c.RatingRingPos = "br"
	c.BackdropLogo = true
	return c
}

// ── Providers / fetcher stubs ────────────────────────────────────────────────

// effectProvider returns richMeta and, through FetchArtwork, folds the
// artwork-selection options into the image URLs it hands back. The distinct
// fetcher then returns different bytes for a different URL, so a config key that
// only steers which source/variant/language is fetched still moves the rendered
// pixels — proving the key reaches ArtworkOptions rather than being dropped.
type effectProvider struct{ name string }

func (e *effectProvider) Name() string { return e.name }

func (e *effectProvider) Fetch(_ context.Context, _, _ string) (*provider.MediaMeta, error) {
	m := richMeta()
	return &m, nil
}

func (e *effectProvider) FetchArtwork(_ context.Context, _, _ string, opts provider.ArtworkOptions) (*provider.MediaMeta, error) {
	m := richMeta()
	fp := fmt.Sprintf("%s|lang=%s|fb=%s|txt=%s|sz=%s|cc=%s|rt=%s|rl=%s|rvc=%d|rva=%g|rw=%d|rh=%d|rfb=%s",
		e.name, opts.Language, opts.FallbackLanguage, opts.TextPreference, opts.Size,
		opts.WatchProvidersCountry, opts.RandomText, opts.RandomLanguage,
		opts.RandomMinVoteCount, opts.RandomMinVoteAvg, opts.RandomMinWidth,
		opts.RandomMinHeight, opts.RandomFallback)
	m.PosterURL = "http://art/poster?" + fp
	m.BackdropURL = "http://art/backdrop?" + fp
	m.LogoURL = "http://art/logo?" + fp
	return &m, nil
}

// distinctFetcher returns a decodable PNG whose pixels are seeded by the URL, so
// two different URLs yield two different images and the same URL is stable.
// Encoded bytes are cached by URL: the same URL is fetched many times across the
// key sweep, and re-encoding a PNG each time dominates the render cost.
type distinctFetcher struct {
	cache sync.Map // url -> []byte
}

func (d *distinctFetcher) Fetch(_ context.Context, url string) ([]byte, error) {
	if v, ok := d.cache.Load(url); ok {
		return v.([]byte), nil
	}
	b := seededPNG(560, 820, url)
	d.cache.Store(url, b)
	return b, nil
}

func seededPNG(w, h int, seed string) []byte {
	sum := sha256.Sum256([]byte(seed))
	s0 := binary.LittleEndian.Uint32(sum[0:4]) | 1
	s1 := binary.LittleEndian.Uint32(sum[4:8]) | 1
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			v := (uint32(x)*2654435761 ^ uint32(y)*2246822519 ^ s0*374761393 ^ s1)
			img.SetNRGBA(x, y, color.NRGBA{uint8(v >> 3), uint8(v >> 11), uint8(v >> 19), 255})
		}
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}

// alwaysAnime resolves every id, so meta.IsAnime is true and the anime-only
// fields (genreBadgeAnimeGrouping, ratingsAnime, artworkSourceAnime) are live.
type alwaysAnime struct{}

func (alwaysAnime) Resolve(_ context.Context, _, _ string) (animemap.IDs, bool) {
	return animemap.IDs{}, true
}

// alwaysTrending marks every title trending, so the trending badge draws.
type alwaysTrending struct{}

func (alwaysTrending) IsTrending(_ context.Context, _ ...string) bool { return true }

func effectPipeline() *Pipeline {
	reg := provider.NewRegistry()
	// Register the artwork-capable stub under every source name a mutation may
	// select, so switching artworkSource actually reaches a different provider.
	for _, name := range []string{"tmdb", "fanart", "cinemeta", "omdb"} {
		reg.Register(&effectProvider{name: name})
	}
	p := &Pipeline{providers: reg, fetcher: &distinctFetcher{}}
	p.SetAnimeResolver(alwaysAnime{})
	p.SetTrendingResolver(alwaysTrending{})
	return p
}

// ── Key enumeration + generic mutation ───────────────────────────────────────

type configKey struct {
	json  string
	index []int
}

// renderConfigKeys walks the exported imageconfig.Config, descending into the
// anonymously embedded *Config sub-structs, and returns every json key with the
// field index path to reach it. This is the exported mirror of the parser's own
// key set, so a newly added field is enumerated here automatically.
func renderConfigKeys() []configKey {
	var keys []configKey
	var walk func(t reflect.Type, prefix []int)
	walk = func(t reflect.Type, prefix []int) {
		for i := 0; i < t.NumField(); i++ {
			f := t.Field(i)
			idx := append(append([]int{}, prefix...), i)
			if f.Anonymous && f.Type.Kind() == reflect.Struct {
				walk(f.Type, idx)
				continue
			}
			name := strings.Split(f.Tag.Get("json"), ",")[0]
			if name == "" || name == "-" {
				continue
			}
			keys = append(keys, configKey{json: name, index: idx})
		}
	}
	walk(reflect.TypeOf(imageconfig.Config{}), nil)
	return keys
}

// genericMutate flips a field to a value distinct from the maximal config's, for
// the kinds where any distinct value is unambiguous. String and map kinds return
// false: they need a known-valid alternate from keyMutation, since a blind value
// would be rejected by the parser or the render switch and read as inert.
func genericMutate(cfg *imageconfig.Config, index []int) bool {
	v := reflect.ValueOf(cfg).Elem().FieldByIndex(index)
	switch v.Kind() {
	case reflect.Bool:
		v.SetBool(!v.Bool())
	case reflect.Int, reflect.Int64:
		if v.Int() == 0 {
			v.SetInt(200)
		} else {
			v.SetInt(0)
		}
	case reflect.Float64:
		if v.Float() == 0 {
			v.SetFloat(5)
		} else {
			v.SetFloat(0)
		}
	case reflect.Slice:
		if v.Type().Elem().Kind() != reflect.String {
			return false
		}
		v.Set(reflect.ValueOf([]string{"xrdb-probe"}))
	case reflect.Pointer:
		et := v.Type().Elem()
		n := reflect.New(et)
		switch et.Kind() {
		case reflect.Int:
			n.Elem().SetInt(1)
		case reflect.Bool:
			n.Elem().SetBool(false)
		default:
			return false
		}
		v.Set(n)
	default:
		return false
	}
	return true
}

// ── Per-key mutation map ─────────────────────────────────────────────────────

type keyOverride struct {
	contentType string                    // request content type this key needs to be live
	pre         func(*imageconfig.Config) // applied to BOTH base and mutated to make the field live
	mut         func(*imageconfig.Config) // applied to mutated only; nil = genericMutate
}

func setColor(set func(*imageconfig.Config, string)) func(*imageconfig.Config) {
	return func(c *imageconfig.Config) { set(c, "#ff3366") }
}

// preset preconditions.
func presMinimal(c *imageconfig.Config)  { c.RatingPresentation = "minimal" }
func presDual(c *imageconfig.Config)     { c.RatingPresentation = "dual" }
func presScorebar(c *imageconfig.Config) { c.RatingPresentation = "scorebar" }

func scorebarGradient(c *imageconfig.Config) {
	c.RatingPresentation = "scorebar"
	c.ScorebarStyle = "gradient"
}
func scorebarDynamic(c *imageconfig.Config) {
	c.RatingPresentation = "scorebar"
	c.AggregateAccentMode = "dynamic"
	c.ScorebarStyle = "dynamic"
}

// aggregate-pill presets. The pill fields are only live under a pill
// presentation (minimal/average draw a single pill, dual draws two), and the
// accent-colour fields additionally need a custom accent mode, which is what
// routes a configured hex onto the pill's accent instead of the built-in one.
func aggMinimalCustom(c *imageconfig.Config) {
	c.RatingPresentation = "minimal"
	c.AggregateAccentMode = "custom"
	c.AggregateAccentColor = "#3366ff"
}
func aggDual(c *imageconfig.Config) { c.RatingPresentation = "dual" }
func aggDualCustom(c *imageconfig.Config) {
	c.RatingPresentation = "dual"
	c.AggregateAccentMode = "custom"
	c.AggregateAccentColor = "#3366ff"
}

// scorebar-band presets. The single aggregate score only crosses the band a
// threshold defines when it sits near that threshold, so each threshold key
// narrows the ratings to land the average in the band being moved, and uses the
// solid style so the whole bar carries the band colour.
func scorebarLowBand(c *imageconfig.Config) {
	c.ScorebarStyle = "solid"
	c.Ratings = []string{"letterboxd"} // ~4.1, in the low band
}
func scorebarHighBand(c *imageconfig.Config) {
	c.ScorebarStyle = "solid"
	c.Ratings = []string{"imdb", "tmdb"} // ~8.45, in the high band
}
func styleSquare(c *imageconfig.Config)  { c.BadgeStyle = imageconfig.BadgeSquare }
func styleStacked(c *imageconfig.Config) { c.BadgeStyle = imageconfig.BadgeStacked }
func stylePlain(c *imageconfig.Config)   { c.BadgeStyle = imageconfig.BadgePlain }
func splitSide(c *imageconfig.Config)    { c.RatingsLayout = imageconfig.LayoutSplitSide }
func genreTile(c *imageconfig.Config)    { c.GenreBadgeStyle = "tile" }
func ageTile(c *imageconfig.Config)      { c.AgeRatingBadgeStyle = "tile" }
func topTile(c *imageconfig.Config)      { c.TopRatedBadgeStyle = "tile" }
func releaseTile(c *imageconfig.Config)  { c.ReleaseStatusBadgeStyle = "tile" }
func qualityTile(c *imageconfig.Config)  { c.QualityBadgesStyle = "tile" }
func priorityCritics(c *imageconfig.Config) {
	c.RingValueSource = "priority-critics"
	c.RingCriticsPriority = []string{"rt", "metacritic"}
}
func priorityAudience(c *imageconfig.Config) {
	c.RingValueSource = "priority-audience"
	c.RingAudiencePriority = []string{"imdb", "tmdb"}
}

// keyMutation supplies per-key overrides for keys the generic path cannot handle
// (enum/string/map values) or that need a precondition to be live. The chosen
// value is a known-valid alternate found in the parser and render switches.
func keyMutations() map[string]keyOverride {
	str := func(set func(*imageconfig.Config)) keyOverride { return keyOverride{mut: set} }
	return map[string]keyOverride{
		// Base-artwork selection: distinct valid value, exercised through the fake
		// ArtworkFetcher's option-encoded URLs.
		"size":                 {mut: func(c *imageconfig.Config) { c.Size = imageconfig.SizeLarge }},
		"artworkSource":        {mut: func(c *imageconfig.Config) { c.ArtworkSource = imageconfig.ArtworkCinemeta }},
		"artworkSourceMovie":   {contentType: "movie", mut: func(c *imageconfig.Config) { c.ArtworkSourceMovie = imageconfig.ArtworkCinemeta }},
		"artworkSourceSeries":  {contentType: "series", mut: func(c *imageconfig.Config) { c.ArtworkSourceSeries = imageconfig.ArtworkCinemeta }},
		"artworkSourceAnime":   {mut: func(c *imageconfig.Config) { c.ArtworkSourceAnime = imageconfig.ArtworkCinemeta }},
		"language":             {mut: func(c *imageconfig.Config) { c.Language = "ja" }},
		"fallbackLanguage":     {mut: func(c *imageconfig.Config) { c.FallbackLanguage = "de" }},
		"textPreference":       {mut: func(c *imageconfig.Config) { c.TextPreference = imageconfig.TextTextless }},
		"providersCountry":     {mut: func(c *imageconfig.Config) { c.ProvidersCountry = "GB" }},
		"randomPosterText":     {mut: func(c *imageconfig.Config) { c.RandomPosterText = "textless" }},
		"randomPosterLanguage": {mut: func(c *imageconfig.Config) { c.RandomPosterLanguage = "requested" }},
		"randomPosterFallback": {mut: func(c *imageconfig.Config) { c.RandomPosterFallback = "original" }},

		// Layout / theme / style enums.
		"ratingsLayout": {mut: func(c *imageconfig.Config) { c.RatingsLayout = imageconfig.LayoutTop }},
		"badgeStyle":    {mut: func(c *imageconfig.Config) { c.BadgeStyle = imageconfig.BadgeSquare }},
		"badgeTheme":    {mut: func(c *imageconfig.Config) { c.BadgeTheme = imageconfig.ThemeLight }},
		"outputFormat":  {mut: func(c *imageconfig.Config) { c.OutputFormat = imageconfig.OutputJPEG }},

		// outputQuality only moves JPEG bytes, so both sides render as JPEG here.
		"outputQuality": {
			pre: func(c *imageconfig.Config) { c.OutputFormat = imageconfig.OutputJPEG; c.OutputQuality = 100 },
			mut: func(c *imageconfig.Config) { c.OutputQuality = 40 },
		},

		// Corner/edge placements (badgePos/sixPos tokens).
		"ageRatingPos":     {mut: func(c *imageconfig.Config) { c.AgeRatingPos = "br" }},
		"releaseStatusPos": {mut: func(c *imageconfig.Config) { c.ReleaseStatusPos = "tr" }},
		"topRatedPos":      {mut: func(c *imageconfig.Config) { c.TopRatedPos = "br" }},
		"awardsPos":        {mut: func(c *imageconfig.Config) { c.AwardsPos = "tr" }},
		"stingerPos":       {mut: func(c *imageconfig.Config) { c.StingerPos = "tl" }},
		"genrePos":         {mut: func(c *imageconfig.Config) { c.GenrePos = "tr" }},
		"providersPos":     {mut: func(c *imageconfig.Config) { c.ProvidersPos = "tl" }},
		"aggregateBarPos":  {mut: func(c *imageconfig.Config) { c.AggregateBarPos = "top" }},
		"ratingRingPos":    {mut: func(c *imageconfig.Config) { c.RatingRingPos = "bl" }},
		"qualityBadgesPos": {mut: func(c *imageconfig.Config) { c.QualityBadgesPos = "bl" }},
		"trendingPos":      {mut: func(c *imageconfig.Config) { c.TrendingPos = "br" }},
		"logoAnchor":       {mut: func(c *imageconfig.Config) { c.LogoAnchor = "bottom" }},

		// Trending styling.
		"trendingStyle":       {mut: func(c *imageconfig.Config) { c.TrendingStyle = imageconfig.TrendingFlame }},
		"trendingTextColor":   str(setColor(func(c *imageconfig.Config, v string) { c.TrendingTextColor = v })),
		"trendingTagStyle":    {mut: func(c *imageconfig.Config) { c.TrendingTagStyle = "square" }},
		"trendingAccentColor": str(setColor(func(c *imageconfig.Config, v string) { c.TrendingAccentColor = v })),

		// Logo background is only meaningful on the logo surface.
		"logoBackground": {mut: func(c *imageconfig.Config) { c.LogoBackground = "dark" }},

		// Genre badge family.
		"genreBadgeAnimeGrouping":   {mut: func(c *imageconfig.Config) { c.GenreBadgeAnimeGrouping = "animation" }},
		"genreBadgeMode":            {mut: func(c *imageconfig.Config) { c.GenreBadgeMode = "icon" }},
		"genreBadgeStyle":           {mut: func(c *imageconfig.Config) { c.GenreBadgeStyle = "tile" }},
		"genreBadgeTileAccentColor": {pre: genreTile, mut: setColor(func(c *imageconfig.Config, v string) { c.GenreBadgeTileAccentColor = v })},
		"genreBadgeAccent":          {mut: func(c *imageconfig.Config) { c.GenreBadgeAccent = "left" }},
		// The colour keys need a real hex; a blind mutation is rejected by the
		// parser and reads as an inert control (FR-148).
		"genreBadgeLabelColor":  {mut: setColor(func(c *imageconfig.Config, v string) { c.GenreBadgeLabelColor = v })},
		"genreBadgeBorderColor": {mut: setColor(func(c *imageconfig.Config, v string) { c.GenreBadgeBorderColor = v })},
		// In the icon/both modes the drawn label is the resolved genre-family name,
		// which overrides the primary/list choice; the text mode is where it shows.
		"genreBadgeLabel":      {pre: func(c *imageconfig.Config) { c.GenreBadgeMode = "text" }, mut: func(c *imageconfig.Config) { c.GenreBadgeLabel = "primary" }},
		"genreBadgeCase":       {pre: func(c *imageconfig.Config) { c.GenreBadgeMode = "text" }, mut: func(c *imageconfig.Config) { c.GenreBadgeCase = "upper" }},
		"genreBadgeMaxGenres":  {pre: func(c *imageconfig.Config) { c.GenreBadgeMode = "text" }, mut: func(c *imageconfig.Config) { c.GenreBadgeMaxGenres = 1 }},
		"genreBadgeShortNames": {pre: func(c *imageconfig.Config) { c.GenreBadgeMode = "text" }, mut: func(c *imageconfig.Config) { c.GenreBadgeShortNames = true }},

		// Quality badge family.
		"qualityBadgesStyle":           {mut: func(c *imageconfig.Config) { c.QualityBadgesStyle = "plain" }},
		"qualityBadgesTileAccentColor": {pre: qualityTile, mut: setColor(func(c *imageconfig.Config, v string) { c.QualityBadgesTileAccentColor = v })},

		// Rating badge family.
		"ratingPresentation": {mut: func(c *imageconfig.Config) { c.RatingPresentation = "minimal" }},
		"ratingValueMode":    {mut: func(c *imageconfig.Config) { c.RatingValueMode = "normalized100" }},
		"iconShape":          {mut: func(c *imageconfig.Config) { c.IconShape = "circle" }},
		"iconPlateFilled":    {pre: func(c *imageconfig.Config) { c.IconShape = "circle" }},
		// The rating-badge border only draws when a border colour is set; opacity
		// tunes that border's alpha, so it needs the colour present to be visible.
		"ratingBadgeBorderColor":      str(setColor(func(c *imageconfig.Config, v string) { c.RatingBadgeBorderColor = v })),
		"ratingBadgeBorderOpacity":    {pre: func(c *imageconfig.Config) { c.RatingBadgeBorderColor = "#00ffff" }, mut: func(c *imageconfig.Config) { c.RatingBadgeBorderOpacity = 50 }},
		"ratingBadgeBorderSourceTint": {mut: func(c *imageconfig.Config) { c.RatingBadgeBorderSourceTint = true }},
		// The icon outline is a colour + a width; each is inert without the other,
		// so each key sets its partner as the precondition.
		"iconOutlineColor": {pre: func(c *imageconfig.Config) { c.IconOutlineWidth = 4 }, mut: setColor(func(c *imageconfig.Config, v string) { c.IconOutlineColor = v })},
		"iconOutlineWidth": {pre: func(c *imageconfig.Config) { c.IconOutlineColor = "#00ffff" }, mut: func(c *imageconfig.Config) { c.IconOutlineWidth = 5 }},
		// The glow softens an outline that is already being drawn, so it needs a
		// plain-style badge with a colour and width set before it shows.
		"noBackgroundBadgeOutlineGlow": {pre: func(c *imageconfig.Config) {
			c.GenreBadgeStyle = "plain"
			c.NoBackgroundBadgeOutlineColor = "#00ffff"
			c.NoBackgroundBadgeOutlineWidth = 4
		}, mut: func(c *imageconfig.Config) { c.NoBackgroundBadgeOutlineGlow = true }},
		"noBackgroundBadgeOutlineColor": {pre: stylePlain, mut: setColor(func(c *imageconfig.Config, v string) { c.NoBackgroundBadgeOutlineColor = v })},
		"noBackgroundBadgeOutlineWidth": {pre: stylePlain, mut: func(c *imageconfig.Config) { c.NoBackgroundBadgeOutlineWidth = 5 }},
		"stackedLineHidden":             {pre: styleStacked},
		"ratingAccentBarHidden":         {pre: func(c *imageconfig.Config) { c.BadgeStyle = imageconfig.BadgeTile }},
		"ratingXOffsetSquare":           {pre: styleSquare},
		"ratingYOffsetSquare":           {pre: styleSquare},
		"sideRatingsPosition":           {pre: splitSide, mut: func(c *imageconfig.Config) { c.SideRatingsPosition = "top" }},
		// The custom-position vertical offset only moves the strip in the custom
		// side position.
		"sideRatingsOffset": {pre: func(c *imageconfig.Config) { splitSide(c); c.SideRatingsPosition = "custom" }},
		"ratingsMaxPerSide": {pre: splitSide, mut: func(c *imageconfig.Config) { c.RatingsMaxPerSide = 1 }},
		// The provider override recolours a badge's accent rail, which the stacked
		// style paints prominently.
		"ratingProviderOverrides": {pre: styleStacked, mut: func(c *imageconfig.Config) { c.RatingProviderOverrides = map[string]string{"imdb": "#ff3366"} }},
		"ratingProviderIconScale": {mut: func(c *imageconfig.Config) { c.RatingProviderIconScale = map[string]int{"imdb": 150} }},
		"ratingProviderWeights":   {mut: func(c *imageconfig.Config) { c.RatingProviderWeights = map[string]float64{"imdb": 100} }},

		// Per-kind rating overrides need the matching content type.
		"ratingsMovie":  {contentType: "movie"},
		"ratingsSeries": {contentType: "series"},
		"ratingsAnime":  {},

		// Aggregate bar / pill / scorebar family.
		"aggregateAccentColor":         str(setColor(func(c *imageconfig.Config, v string) { c.AggregateAccentColor = v })),
		"aggregateAccentMode":          {mut: func(c *imageconfig.Config) { c.AggregateAccentMode = "genre" }},
		"aggregateValueColor":          str(setColor(func(c *imageconfig.Config, v string) { c.AggregateValueColor = v })),
		"aggregateRatingSource":        {mut: func(c *imageconfig.Config) { c.AggregateRatingSource = "critics" }},
		"aggregateAccentWidth":         {pre: aggMinimalCustom},
		"aggregatePillPos":             {pre: presMinimal, mut: func(c *imageconfig.Config) { c.AggregatePillPos = "br" }},
		"aggregateAccentShape":         {pre: aggMinimalCustom, mut: func(c *imageconfig.Config) { c.AggregateAccentShape = "strip" }},
		"aggregateFillByScore":         {pre: aggMinimalCustom},
		"aggregatePillBodyTint":        {pre: aggMinimalCustom},
		"aggregatePillIcon":            {pre: presMinimal, mut: func(c *imageconfig.Config) { c.AggregatePillIcon = "imdb" }},
		"aggregateAccentBarVisible":    {pre: aggDual, mut: func(c *imageconfig.Config) { f := false; c.AggregateAccentBarVisible = &f }},
		"aggregateAccentBarOffset":     {pre: aggDual},
		"aggregateDualIcons":           {pre: presDual},
		"aggregateCriticsAccentColor":  {pre: aggDualCustom, mut: setColor(func(c *imageconfig.Config, v string) { c.AggregateCriticsAccentColor = v })},
		"aggregateAudienceAccentColor": {pre: aggDualCustom, mut: setColor(func(c *imageconfig.Config, v string) { c.AggregateAudienceAccentColor = v })},
		"aggregateCriticsValueColor":   {pre: presDual, mut: setColor(func(c *imageconfig.Config, v string) { c.AggregateCriticsValueColor = v })},
		"aggregateAudienceValueColor":  {pre: presDual, mut: setColor(func(c *imageconfig.Config, v string) { c.AggregateAudienceValueColor = v })},
		"aggregateDynamicStops":        {pre: scorebarDynamic, mut: func(c *imageconfig.Config) { c.AggregateDynamicStops = "0:#7f1d1d,50:#dc2626,100:#84cc16" }},
		"scorebarStyle":                {pre: presScorebar, mut: func(c *imageconfig.Config) { c.ScorebarStyle = "solid" }},
		"scorebarLowColor":             {pre: scorebarGradient, mut: setColor(func(c *imageconfig.Config, v string) { c.ScorebarLowColor = v })},
		"scorebarMidColor":             {pre: scorebarGradient, mut: setColor(func(c *imageconfig.Config, v string) { c.ScorebarMidColor = v })},
		"scorebarHighColor":            {pre: scorebarGradient, mut: setColor(func(c *imageconfig.Config, v string) { c.ScorebarHighColor = v })},
		"scorebarLowThreshold":         {pre: scorebarLowBand, mut: func(c *imageconfig.Config) { c.ScorebarLowThreshold = 3 }},
		"scorebarHighThreshold":        {pre: scorebarHighBand, mut: func(c *imageconfig.Config) { c.ScorebarHighThreshold = 9.5 }},

		// Age / release / top-rated badge styling. "plain" (no background) reads
		// clearly different from the default plate, whatever the default is.
		// A bloomed border only shows where a border is drawn at all.
		"ratingBadgeBorderGlow": {pre: func(c *imageconfig.Config) {
			c.BadgeStyle = imageconfig.BadgeTile
			c.RatingBadgeBorderColor = "#22d3ee"
			c.RatingBadgeBorderWidth = 2
		}, mut: func(c *imageconfig.Config) { c.RatingBadgeBorderGlow = true }},

		"ageRatingBadgeStyle": {mut: func(c *imageconfig.Config) { c.AgeRatingBadgeStyle = "plain" }},
		"ageRatingTileColor":  {pre: ageTile, mut: setColor(func(c *imageconfig.Config, v string) { c.AgeRatingTileColor = v })},
		// The colour keys need a valid value: a blind mutation is rejected by the
		// parser and reads as the key doing nothing.
		"ageRatingBorderColor":    {mut: setColor(func(c *imageconfig.Config, v string) { c.AgeRatingBorderColor = v })},
		"ageRatingLabelColor":     {mut: setColor(func(c *imageconfig.Config, v string) { c.AgeRatingLabelColor = v })},
		"topRatedBadgeStyle":      {mut: func(c *imageconfig.Config) { c.TopRatedBadgeStyle = "plain" }},
		"topRatedTileColor":       {pre: topTile, mut: setColor(func(c *imageconfig.Config, v string) { c.TopRatedTileColor = v })},
		"releaseStatusBadgeStyle": {mut: func(c *imageconfig.Config) { c.ReleaseStatusBadgeStyle = "plain" }},
		"releaseStatusTileColor":  {pre: releaseTile, mut: setColor(func(c *imageconfig.Config, v string) { c.ReleaseStatusTileColor = v })},

		// Network tile behind provider chips.
		"networkTileColor": str(setColor(func(c *imageconfig.Config, v string) { c.NetworkTileColor = v })),

		// Rating ring value/progress sources and priority orders.
		"ringValueSource":      {mut: func(c *imageconfig.Config) { c.RingValueSource = "imdb" }},
		"ringProgressSource":   {mut: func(c *imageconfig.Config) { c.RingProgressSource = "imdb" }},
		"ringCriticsPriority":  {pre: priorityCritics, mut: func(c *imageconfig.Config) { c.RingCriticsPriority = []string{"metacritic", "rt"} }},
		"ringAudiencePriority": {pre: priorityAudience, mut: func(c *imageconfig.Config) { c.RingAudiencePriority = []string{"tmdb", "imdb"} }},

		// Rating ring color.
		"ratingRingColor": str(setColor(func(c *imageconfig.Config, v string) { c.RatingRingColor = v })),

		// The logo overlay scales to fit the smaller of the width/height caps. A
		// tall logo image is height-bound, so widening the height cap lets the width
		// cap bind and LogoWidth take effect.
		"logoWidth": {pre: func(c *imageconfig.Config) { c.LogoHeight = 90 }, mut: func(c *imageconfig.Config) { c.LogoWidth = 40 }},

		// Title-logo shadow. The style and colour need a known-valid alternate;
		// the offsets take the generic 0 -> 200 flip, which carries the shadow
		// clear of where it started.
		"logoShadowStyle": {mut: func(c *imageconfig.Config) { c.LogoShadowStyle = "extrude" }},
		"logoShadowColor": str(setColor(func(c *imageconfig.Config, v string) { c.LogoShadowColor = v })),
	}
}

// ── The test ─────────────────────────────────────────────────────────────────

// effectSurfaces are tried in this order. The poster carries almost every
// overlay, so a field that moves any pixel usually moves the poster; checking it
// first lets most keys short-circuit after a single mutated render instead of
// four.
var effectSurfaces = []string{"poster", "logo", "backdrop", "thumbnail"}

func renderOne(t *testing.T, p *Pipeline, cfg imageconfig.Config, contentType, surface string) []byte {
	t.Helper()
	res, err := p.Render(context.Background(), Request{
		MediaType:   surface,
		ContentType: contentType,
		MediaID:     "tt1375666",
		Config:      cfg,
	})
	if err != nil {
		t.Errorf("render %s: %v", surface, err)
		return nil
	}
	if res.Placeholder {
		t.Errorf("render %s produced a placeholder; the fixture is not drawing real artwork", surface)
		return nil
	}
	return res.ImageBytes
}

func renderAllSurfaces(t *testing.T, p *Pipeline, cfg imageconfig.Config, contentType string) map[string][]byte {
	t.Helper()
	out := make(map[string][]byte, len(effectSurfaces))
	for _, surface := range effectSurfaces {
		out[surface] = renderOne(t, p, cfg, contentType, surface)
	}
	return out
}

func TestEveryRenderFieldAffectsTheImage(t *testing.T) {
	// A full render per config key per surface, base against mutated. Same
	// reason as the sweep in default_agreement_test: too slow to run under the
	// race detector, and it exercises no concurrency, so -short drops it there
	// and the ordinary pass keeps it.
	if testing.Short() {
		t.Skip("render sweep: skipped under -short, runs in the ordinary test pass")
	}
	p := effectPipeline()

	// The whole test is meaningless unless a render is deterministic for a fixed
	// config: nondeterminism would make every mutation look like it "had an
	// effect" and the guard would never fire.
	base := renderAllSurfaces(t, p, maximalConfig(), "movie")
	again := renderAllSurfaces(t, p, maximalConfig(), "movie")
	for _, s := range effectSurfaces {
		if !bytes.Equal(base[s], again[s]) {
			t.Fatalf("render is not deterministic on surface %s; cannot detect inert settings", s)
		}
	}

	muts := keyMutations()

	var keys []configKey
	for _, key := range renderConfigKeys() {
		if metaOnlyRenderField[key.json] {
			continue
		}
		if _, ok := fixtureLimitedField[key.json]; ok {
			continue
		}
		keys = append(keys, key)
	}

	var inert []string
	var needsValue []string

	// Renders run sequentially: the text drawer's font faces carry a mutable glyph
	// cache and are shared package-wide, so concurrent renders race on it. The
	// lazy per-surface comparison below keeps a serial sweep quick — most keys
	// settle on the poster after one mutated render.
	for _, key := range keys {
		ov := muts[key.json]

		mutCfg := maximalConfig()
		baseCfg := maximalConfig()
		if ov.pre != nil {
			ov.pre(&baseCfg)
			ov.pre(&mutCfg)
		}
		if ov.mut != nil {
			ov.mut(&mutCfg)
		} else if !genericMutate(&mutCfg, key.index) {
			needsValue = append(needsValue, key.json)
			continue
		}
		ct := ov.contentType
		if ct == "" {
			ct = "movie"
		}
		shareBase := ov.pre == nil && ct == "movie"

		// Lazily render each surface, stopping at the first that differs. Base
		// surfaces are the shared maximal render unless this key carries a
		// precondition or a non-movie content type, in which case its own base is
		// rendered only for the surfaces actually compared.
		localBase := map[string][]byte{}
		baseFor := func(s string) []byte {
			if shareBase {
				return base[s]
			}
			if b, ok := localBase[s]; ok {
				return b
			}
			b := renderOne(t, p, baseCfg, ct, s)
			localBase[s] = b
			return b
		}
		changed := false
		for _, s := range effectSurfaces {
			if !bytes.Equal(baseFor(s), renderOne(t, p, mutCfg, ct, s)) {
				changed = true
				break
			}
		}
		if !changed {
			inert = append(inert, key.json)
		}
	}

	sort.Strings(needsValue)
	sort.Strings(inert)
	if len(needsValue) > 0 {
		t.Errorf("these keys need a known-valid alternate in keyMutations (a blind mutation is rejected by the parser/render, reading as inert): %s",
			strings.Join(needsValue, ", "))
	}
	if len(inert) > 0 {
		t.Errorf("these render config keys changed no surface, so setting them has no visible effect (a real inert-setting bug, or a fixture gap to close in richMeta/maximalConfig): %s",
			strings.Join(inert, ", "))
	}
}

// artworkOnlyProvider is a non-TMDB artwork source as one really behaves: it
// hands back art and nothing else. Overlay metadata (age rating, genres, watch
// providers, stinger) is TMDB's, so a render sourcing art from here has to top
// it up or the badge silently disappears — which is exactly how the stinger
// badge went missing for anyone who set artworkSource away from TMDB.
type artworkOnlyProvider struct{ name string }

func (a *artworkOnlyProvider) Name() string { return a.name }

func (a *artworkOnlyProvider) artOnly() *provider.MediaMeta {
	m := richMeta()
	stripped := provider.MediaMeta{
		Title: m.Title, Year: m.Year, IMDbID: m.IMDbID, TMDBID: m.TMDBID,
		PosterURL:   "http://art/" + a.name + "/poster",
		BackdropURL: "http://art/" + a.name + "/backdrop",
		LogoURL:     "http://art/" + a.name + "/logo",
	}
	return &stripped
}

func (a *artworkOnlyProvider) Fetch(_ context.Context, _, _ string) (*provider.MediaMeta, error) {
	return a.artOnly(), nil
}

func (a *artworkOnlyProvider) FetchArtwork(_ context.Context, _, _ string, _ provider.ArtworkOptions) (*provider.MediaMeta, error) {
	return a.artOnly(), nil
}

// A setting must keep working when the artwork comes from somewhere other than
// TMDB. The guard's other sweep renders from one source, so a badge that depends
// on metadata only TMDB supplies can pass there and still be dead in the field.
func TestOverlayMetadataSurvivesEveryArtworkSource(t *testing.T) {
	if testing.Short() {
		t.Skip("render sweep: skipped under -short, runs in the ordinary test pass")
	}
	reg := provider.NewRegistry()
	reg.Register(&effectProvider{name: "tmdb"}) // the metadata source, art included
	for _, name := range []string{"fanart", "cinemeta", "omdb"} {
		reg.Register(&artworkOnlyProvider{name: name})
	}
	p := &Pipeline{providers: reg, fetcher: &distinctFetcher{}}
	p.SetAnimeResolver(alwaysAnime{})
	p.SetTrendingResolver(alwaysTrending{})

	// Each toggle draws from metadata the artwork source does not carry.
	toggles := map[string]func(*imageconfig.Config, bool){
		"ageRating": func(c *imageconfig.Config, on bool) { c.AgeRating = on },
		"genre":     func(c *imageconfig.Config, on bool) { c.Genre = on },
		"providers": func(c *imageconfig.Config, on bool) { c.Providers = on },
		"stinger":   func(c *imageconfig.Config, on bool) { c.Stinger = on },
	}

	for _, src := range []string{"fanart", "cinemeta", "omdb"} {
		for name, set := range toggles {
			off, on := maximalConfig(), maximalConfig()
			off.ArtworkSource = imageconfig.ArtworkSource(src)
			on.ArtworkSource = imageconfig.ArtworkSource(src)
			set(&off, false)
			set(&on, true)
			if bytes.Equal(
				renderOne(t, p, off, "movie", "poster"),
				renderOne(t, p, on, "movie", "poster"),
			) {
				t.Errorf("%s draws nothing when artwork comes from %q, so the setting is dead for anyone not on TMDB", name, src)
			}
		}
	}
}
