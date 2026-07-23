package migrate

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	"xrdb_rewrite/internal/imageconfig"
)

// Translating a v2 profile config into something XRDB renders.
//
// v2 stored one flat object with a surface prefix on every key
// ("posterRatingBadgeScale", "backdropGenreBadgeStyle"). XRDB stores a
// "surfaces" envelope instead, with each surface holding the same keys without
// the prefix. Nothing here rewrites or drops the original: the converted
// envelope is added alongside it, so a migrated profile still carries every byte
// the user had, and anything this cannot translate stays exactly where it was.

// v2Surfaces are the prefixes v2 put on a per-surface key.
var v2Surfaces = []string{"poster", "backdrop", "thumbnail", "logo"}

// v2BaseRenames covers the keys v2 and XRDB both model but under different
// names. Only entries whose value shape is identical belong here; a key that
// needs its value reinterpreted is converted explicitly instead, and anything
// uncertain is left untranslated rather than guessed at.
var v2BaseRenames = map[string]string{
	"ratingPreferences":        "ratings",
	"aggregateProviderWeights": "ratingProviderWeights",
	"lang":                     "language",
	"imageSize":                "size",
	"imageText":                "textPreference",
	// v2's genreBadge held the mode (text/icon/both/off); XRDB splits that into a
	// genre flag and a genreBadgeMode, handled after the rename.
	"genreBadge":             "genreBadgeMode",
	"genreBadgePosition":     "genrePos",
	"ageRatingBadgePosition": "ageRatingPos",
	"qualityBadgesPosition":  "qualityBadgesPos",
	"trendingTagPosition":    "trendingPos",
	"trendingTagTextColor":   "trendingTextColor",
	"episodeArtwork":         "episodeArtworkMode",
	// v2's rating styles were glass/square/plain/stacked/tile; XRDB reads
	// glass and square and ignores the three it has no layout for, which
	// leaves those profiles on the default rather than on something wrong.
	"ratingStyle": "badgeStyle",
	// v2 switched streaming badges with a word, XRDB with a flag.
	"streamBadges": "providers",
}

// v2WordFlags are keys v2 spelled as a word and XRDB models as a flag. Only
// "off" and "none" turn the feature off; every other v2 value turned it on in
// some form.
var v2WordFlags = map[string]bool{"providers": true}

// v2DecodeSourceKeys are v2 keys XRDB does not model directly but decodes into
// keys it does. They are seeded into each surface so the per-surface decoders
// can read them, then removed again so only the decoded result remains.
var v2DecodeSourceKeys = map[string]bool{"providerAppearance": true, "qualityBadgesSide": true}

// v2SourceRenames maps v2's rating source ids to XRDB's. Every other id is
// shared between the two, including the AlloCiné and Filmweb sources.
var v2SourceRenames = map[string]string{
	"tomatoes":         "rt",
	"tomatoesaudience": "rtaudience",
	"myanimelist":      "mal",
}

// ConvertStats records what a conversion did, so the migration report can show
// the user which of their settings now render and which are only carried.
type ConvertStats struct {
	// Converted counts v2 keys translated into the surfaces envelope.
	Converted int `json:"converted"`
	// ConvertedFields lists the distinct v2 keys that were translated.
	ConvertedFields []string `json:"convertedFields,omitempty"`
	// UnreadableFields lists XRDB keys a v2 value could not be carried into
	// because its shape differs between the versions. The original value stays
	// on the profile; it just does not drive the render.
	UnreadableFields []string `json:"unreadableFields,omitempty"`
}

// ConvertConfig translates a v2 profile config into one XRDB renders, keeping
// every original key untouched. Returns the config unchanged when there is
// nothing to translate.
func ConvertConfig(raw json.RawMessage) (json.RawMessage, ConvertStats, error) {
	var stats ConvertStats
	var original map[string]json.RawMessage
	if err := json.Unmarshal(raw, &original); err != nil {
		return raw, stats, fmt.Errorf("config is not an object: %w", err)
	}
	// A config that already carries an envelope is XRDB's own shape, not v2's.
	if _, ok := original["surfaces"]; ok {
		return raw, stats, nil
	}

	converted := make(map[string]string) // v2 key -> surface it landed on
	seededDecodeSource := false
	surfaces := make(map[string]map[string]json.RawMessage, len(v2Surfaces))
	for _, s := range v2Surfaces {
		surfaces[s] = make(map[string]json.RawMessage)
	}

	for key, value := range original {
		surface, base := splitSurfaceKey(key)
		if surface == "" {
			// An unprefixed key applied to every surface in v2, so it has to
			// apply to every surface here too.
			if target, ok := translateBase(base); ok {
				for _, s := range v2Surfaces {
					surfaces[s][target] = value
				}
				converted[key] = "all"
			} else if v2DecodeSourceKeys[base] {
				for _, s := range v2Surfaces {
					surfaces[s][base] = value
				}
				seededDecodeSource = true
			}
			continue
		}
		if target, ok := translateBase(base); ok {
			surfaces[surface][target] = value
			converted[key] = surface
		} else if v2DecodeSourceKeys[base] {
			surfaces[surface][base] = value
			seededDecodeSource = true
		}
	}

	if len(converted) == 0 && !seededDecodeSource {
		return raw, stats, nil
	}

	// Rating source ids and provider weights carry v2 spellings and v2 meaning,
	// so they need more than a new key name.
	dropped := make(map[string]bool)
	for _, s := range v2Surfaces {
		renameSourceList(surfaces[s])
		convertWordFlags(surfaces[s])
		convertGenreBadge(surfaces[s])
		convertProviderAppearance(surfaces[s])
		convertQualityBadgesSide(surfaces[s])
		convertWeights(surfaces[s])
		for _, key := range pruneUnreadable(surfaces[s]) {
			dropped[key] = true
		}
	}
	// A converted key that XRDB cannot read is left out of the envelope and off
	// the converted list, so it reports as carried rather than as applied. The
	// original is still on the profile either way.
	for key, surface := range converted {
		base := key
		if _, b := splitSurfaceKey(key); b != "" {
			base = b
		}
		if target, ok := translateBase(base); ok && dropped[target] {
			delete(converted, key)
			_ = surface
		}
	}

	out := make(map[string]json.RawMessage, len(original)+1)
	for k, v := range original {
		out[k] = v
	}
	envelope := make(map[string]json.RawMessage, len(v2Surfaces))
	for _, s := range v2Surfaces {
		encoded, err := json.Marshal(surfaces[s])
		if err != nil {
			return raw, stats, fmt.Errorf("encode surface %q: %w", s, err)
		}
		envelope[s] = encoded
	}
	encodedEnvelope, err := json.Marshal(envelope)
	if err != nil {
		return raw, stats, fmt.Errorf("encode surfaces: %w", err)
	}
	out["surfaces"] = encodedEnvelope

	result, err := json.Marshal(out)
	if err != nil {
		return raw, stats, fmt.Errorf("encode config: %w", err)
	}

	stats.Converted = len(converted)
	stats.ConvertedFields = make([]string, 0, len(converted))
	for k := range converted {
		stats.ConvertedFields = append(stats.ConvertedFields, k)
	}
	sort.Strings(stats.ConvertedFields)
	for k := range dropped {
		stats.UnreadableFields = append(stats.UnreadableFields, k)
	}
	sort.Strings(stats.UnreadableFields)
	return result, stats, nil
}

// splitSurfaceKey separates a v2 key into its surface prefix and base name.
// Returns an empty surface for a key that applied to every surface.
func splitSurfaceKey(key string) (surface, base string) {
	// A key XRDB already knows by this exact name is a whole name, not a
	// surface plus a base: "logoBackground" is its own setting rather than
	// "background" on the logo surface.
	if _, renamed := v2BaseRenames[key]; renamed || imageconfig.IsModeledKey(key) {
		return "", key
	}
	for _, s := range v2Surfaces {
		if !strings.HasPrefix(key, s) || len(key) <= len(s) {
			continue
		}
		rest := key[len(s):]
		if rest[0] < 'A' || rest[0] > 'Z' {
			continue
		}
		return s, strings.ToLower(rest[:1]) + rest[1:]
	}
	return "", key
}

// translateBase reports the XRDB key for a v2 base name, and whether XRDB models
// it at all. A name XRDB does not model is left alone rather than invented.
func translateBase(base string) (string, bool) {
	if renamed, ok := v2BaseRenames[base]; ok {
		return renamed, imageconfig.IsModeledKey(renamed)
	}
	if imageconfig.IsModeledKey(base) {
		return base, true
	}
	return "", false
}

// renameSourceList rewrites the selected rating sources into XRDB's spellings.
func renameSourceList(surface map[string]json.RawMessage) {
	raw, ok := surface["ratings"]
	if !ok {
		return
	}
	var ids []string
	if err := json.Unmarshal(raw, &ids); err != nil {
		return
	}
	for i, id := range ids {
		if renamed, ok := v2SourceRenames[id]; ok {
			ids[i] = renamed
		}
	}
	if encoded, err := json.Marshal(ids); err == nil {
		surface["ratings"] = encoded
	}
}

// convertGenreBadge splits v2's single genreBadge mode into XRDB's genre flag
// plus a genreBadgeMode. "off" turns the badge off and carries no mode; any
// other value turns it on and keeps the mode, so a v2 profile with genre badges
// keeps them instead of losing them for want of the flag.
func convertGenreBadge(surface map[string]json.RawMessage) {
	raw, ok := surface["genreBadgeMode"]
	if !ok {
		return
	}
	var mode string
	if err := json.Unmarshal(raw, &mode); err != nil {
		return
	}
	on := true
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "off", "none", "false", "":
		on = false
	}
	if encoded, err := json.Marshal(on); err == nil {
		surface["genre"] = encoded
	}
	if !on {
		delete(surface, "genreBadgeMode")
	}
}

// convertQualityBadgesSide maps v2's left/right quality-badge side onto XRDB's
// six-position quality-badge placement, which supersedes it. It only fills a
// position the config did not set, so an explicit qualityBadgesPos wins.
func convertQualityBadgesSide(surface map[string]json.RawMessage) {
	raw, ok := surface["qualityBadgesSide"]
	if !ok {
		return
	}
	var side string
	if err := json.Unmarshal(raw, &side); err != nil {
		return
	}
	pos := ""
	switch strings.ToLower(strings.TrimSpace(side)) {
	case "left":
		pos = "bl"
	case "right":
		pos = "br"
	}
	delete(surface, "qualityBadgesSide")
	if pos == "" {
		return
	}
	if _, set := surface["qualityBadgesPos"]; set {
		return
	}
	if encoded, err := json.Marshal(pos); err == nil {
		surface["qualityBadgesPos"] = encoded
	}
}

// convertProviderAppearance decodes v2's providerAppearance string into the
// per-provider fields XRDB renders. v2 packed several settings per source into a
// dot record, "source.accent.iconScale.width.height.mode.line.opacity", with
// records joined by commas. Only the accent colour and the icon scale have a
// home here; the rest described v2's stacked badge, which XRDB does not draw, so
// they are left behind. The original string stays untouched in the config.
func convertProviderAppearance(surface map[string]json.RawMessage) {
	raw, ok := surface["providerAppearance"]
	if !ok {
		return
	}
	var encoded string
	if err := json.Unmarshal(raw, &encoded); err != nil {
		return
	}
	overrides := map[string]string{}
	scales := map[string]int{}
	for _, record := range strings.Split(encoded, ",") {
		parts := strings.Split(strings.TrimSpace(record), ".")
		if len(parts) < 2 {
			continue
		}
		source := strings.ToLower(strings.TrimSpace(parts[0]))
		if source == "" {
			continue
		}
		if hex := normalizeHexToken(parts[1]); hex != "" {
			overrides[source] = hex
		}
		if len(parts) >= 3 {
			if n, err := strconv.Atoi(strings.TrimSpace(parts[2])); err == nil && n > 0 {
				scales[source] = n
			}
		}
	}
	mergeStringMapKey(surface, "ratingProviderOverrides", overrides)
	mergeIntMapKey(surface, "ratingProviderIconScale", scales)
	// The decoded result replaces the raw string, which stays preserved at the
	// top level; leaving it in the surface would make it an unreadable field.
	delete(surface, "providerAppearance")
}

// normalizeHexToken turns v2's bare 3- or 6-digit hex (no leading #) into a
// "#rrggbb" string, or "" when it is not a colour.
func normalizeHexToken(token string) string {
	t := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(token, "#")))
	if len(t) != 3 && len(t) != 6 {
		return ""
	}
	for _, c := range t {
		isDigit := c >= '0' && c <= '9'
		isHex := c >= 'a' && c <= 'f'
		if !isDigit && !isHex {
			return ""
		}
	}
	if len(t) == 3 {
		t = string([]byte{t[0], t[0], t[1], t[1], t[2], t[2]})
	}
	return "#" + t
}

// mergeStringMapKey folds decoded values into a surface key that may already
// hold a map, without overwriting an entry the config set directly.
func mergeStringMapKey(surface map[string]json.RawMessage, key string, add map[string]string) {
	if len(add) == 0 {
		return
	}
	existing := map[string]string{}
	if raw, ok := surface[key]; ok {
		_ = json.Unmarshal(raw, &existing)
	}
	for k, v := range add {
		if _, set := existing[k]; !set {
			existing[k] = v
		}
	}
	if encoded, err := json.Marshal(existing); err == nil {
		surface[key] = encoded
	}
}

func mergeIntMapKey(surface map[string]json.RawMessage, key string, add map[string]int) {
	if len(add) == 0 {
		return
	}
	existing := map[string]int{}
	if raw, ok := surface[key]; ok {
		_ = json.Unmarshal(raw, &existing)
	}
	for k, v := range add {
		if _, set := existing[k]; !set {
			existing[k] = v
		}
	}
	if encoded, err := json.Marshal(existing); err == nil {
		surface[key] = encoded
	}
}

// convertWeights turns v2's provider weights into XRDB's percent shares.
//
// The two mean different things. In v2 a weight was a multiplier and a source
// with no entry counted once, so {imdb: 3} against three selected sources meant
// 3:1:1. XRDB splits 100 between the selected sources instead. Reading the
// implicit ones back in and normalising keeps the balance the user chose, which
// is the only reading that leaves their posters looking the same.
func convertWeights(surface map[string]json.RawMessage) {
	raw, ok := surface["ratingProviderWeights"]
	if !ok {
		return
	}
	weights := parseV2Weights(raw)
	if len(weights) == 0 {
		delete(surface, "ratingProviderWeights")
		return
	}

	sources := selectedSources(surface)
	if len(sources) == 0 {
		// Without a source list the weighted ones are all that is known, so
		// they keep their proportions and anything else takes what is left.
		sources = sortedKeys(weights)
	}

	effective := make([]float64, len(sources))
	var total float64
	for i, s := range sources {
		w, ok := weights[s]
		if !ok {
			w = 1 // v2 counted an unweighted source once
		}
		effective[i] = w
		total += w
	}
	if total <= 0 {
		// Every source weighted to zero meant "ignore the weights" in v2, so
		// carrying it over as an all-zero split would blank the score instead.
		delete(surface, "ratingProviderWeights")
		return
	}

	shares := wholeShares(effective, total)
	out := make(map[string]float64, len(sources))
	for i, s := range sources {
		out[s] = shares[i]
	}
	if encoded, err := json.Marshal(out); err == nil {
		surface["ratingProviderWeights"] = encoded
	}
}

// convertWordFlags turns v2's word settings into the flags XRDB models. A value
// that is already a flag is left as it is, so re-running this changes nothing.
func convertWordFlags(surface map[string]json.RawMessage) {
	for key := range v2WordFlags {
		raw, ok := surface[key]
		if !ok {
			continue
		}
		var word string
		if err := json.Unmarshal(raw, &word); err != nil {
			continue // already a flag, or something else entirely
		}
		on := true
		switch strings.ToLower(strings.TrimSpace(word)) {
		case "off", "none", "false", "":
			on = false
		}
		if encoded, err := json.Marshal(on); err == nil {
			surface[key] = encoded
		}
	}
}

// pruneUnreadable drops the keys XRDB cannot read from a surface, returning
// their names.
//
// XRDB falls back to defaults for a whole config when one value carries the
// wrong JSON type, so a single v2 value that changed shape between versions
// would otherwise take every other setting on that surface down with it. Losing
// one setting is a gap; losing the surface is the thing this must never do.
func pruneUnreadable(surface map[string]json.RawMessage) []string {
	if encoded, err := json.Marshal(surface); err == nil && imageconfig.Accepts(encoded) {
		return nil
	}
	var dropped []string
	for key, value := range surface {
		one, err := json.Marshal(map[string]json.RawMessage{key: value})
		if err == nil && imageconfig.Accepts(one) {
			continue
		}
		delete(surface, key)
		dropped = append(dropped, key)
	}
	sort.Strings(dropped)
	return dropped
}

// selectedSources reads the surface's rating source list, already renamed.
func selectedSources(surface map[string]json.RawMessage) []string {
	raw, ok := surface["ratings"]
	if !ok {
		return nil
	}
	var ids []string
	if err := json.Unmarshal(raw, &ids); err != nil {
		return nil
	}
	return ids
}

// parseV2Weights reads either shape v2 stored weights in: an object, or the
// "imdb:3,tmdb:1" string its config links used. Source ids are renamed on the
// way in.
func parseV2Weights(raw json.RawMessage) map[string]float64 {
	out := make(map[string]float64)

	var asObject map[string]json.Number
	if err := json.Unmarshal(raw, &asObject); err == nil {
		for k, v := range asObject {
			if f, err := v.Float64(); err == nil {
				addWeight(out, k, f)
			}
		}
		return out
	}

	var asString string
	if err := json.Unmarshal(raw, &asString); err != nil {
		return out
	}
	for _, part := range strings.Split(asString, ",") {
		id, value, found := strings.Cut(part, ":")
		if !found {
			continue
		}
		if f, err := strconv.ParseFloat(strings.TrimSpace(value), 64); err == nil {
			addWeight(out, strings.TrimSpace(id), f)
		}
	}
	return out
}

func addWeight(out map[string]float64, id string, value float64) {
	if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
		return
	}
	if renamed, ok := v2SourceRenames[id]; ok {
		id = renamed
	}
	out[id] = value
}

// wholeShares scales weights to percentages that are whole numbers and still
// add up to exactly 100, handing the rounding remainder to the largest shares.
func wholeShares(weights []float64, total float64) []float64 {
	shares := make([]float64, len(weights))
	assigned := 0.0
	for i, w := range weights {
		shares[i] = math.Floor(w / total * 100)
		assigned += shares[i]
	}
	order := make([]int, len(weights))
	for i := range order {
		order[i] = i
	}
	sort.SliceStable(order, func(a, b int) bool { return weights[order[a]] > weights[order[b]] })
	for i := 0; assigned < 100 && len(order) > 0; i++ {
		shares[order[i%len(order)]]++
		assigned++
	}
	return shares
}

func sortedKeys(m map[string]float64) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
