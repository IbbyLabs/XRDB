package compose

import (
	"image"
	"image/color"
	"strings"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// ── Quality badges (4K, HDR, DV, etc.) ───────────────────────────────────────

// qualityBadgeColors maps badge token → background color.
var qualityBadgeColors = map[string]color.NRGBA{
	"4k":        {R: 0, G: 180, B: 228, A: 255},  // teal-blue
	"hdr":       {R: 255, G: 165, B: 0, A: 255},   // amber
	"hdr10":     {R: 255, G: 165, B: 0, A: 255},
	"hdr10plus": {R: 255, G: 140, B: 0, A: 255},
	"dv":        {R: 0, G: 140, B: 255, A: 255},   // Dolby blue
	"dts":       {R: 80, G: 80, B: 80, A: 255},
	"atmos":     {R: 30, G: 30, B: 120, A: 255},
	"imax":      {R: 20, G: 20, B: 20, A: 255},
}

func qualityBadgeColor(token string) color.NRGBA {
	if c, ok := qualityBadgeColors[strings.ToLower(token)]; ok {
		return c
	}
	return color.NRGBA{R: 60, G: 60, B: 60, A: 255}
}

// qualityBadgeLabel returns the display string for a badge token.
func qualityBadgeLabel(token string) string {
	switch strings.ToLower(token) {
	case "4k":
		return "4K"
	case "hdr":
		return "HDR"
	case "hdr10":
		return "HDR10"
	case "hdr10plus":
		return "HDR10+"
	case "dv":
		return "DOLBY VISION"
	case "dts":
		return "DTS"
	case "atmos":
		return "ATMOS"
	case "imax":
		return "IMAX"
	default:
		return strings.ToUpper(token)
	}
}

// drawQualityBadges renders quality/format badges (4K, HDR, DV, …) stacked
// in the top-right corner of the image.
func drawQualityBadges(base *image.NRGBA, tokens []string) {
	if len(tokens) == 0 {
		return
	}
	ensureFaces()
	if faceLabel == nil {
		return
	}

	const (
		padX     = 6
		padY     = 4
		badgeGap = 4
		edgeX    = 10
		edgeY    = 10
		radius   = 3
	)

	lm := faceLabel.Metrics()
	lAscent := lm.Ascent.Ceil()
	lDescent := lm.Descent.Ceil()
	badgeH := padY*2 + lAscent + lDescent

	bounds := base.Bounds()

	y := bounds.Min.Y + edgeY
	for _, tok := range tokens {
		label := qualityBadgeLabel(tok)
		lw := textWidth(faceLabel, label)
		bw := padX*2 + lw
		x := bounds.Max.X - edgeX - bw
		bRect := image.Rect(x, y, x+bw, y+badgeH)
		fillRoundedRect(base, bRect, radius, qualityBadgeColor(tok))
		tx := x + padX
		ty := y + padY + lAscent
		drawText(base, faceLabel, tx, ty, color.White, label)
		y += badgeH + badgeGap
	}
}

// ── Age rating badge ──────────────────────────────────────────────────────────

// drawAgeRatingBadge renders a content rating badge (e.g. "TV-MA", "R")
// in the corner specified by pos ("tl", "tr", "bl", "br", "inherit").
// "inherit" defaults to "tl".
func drawAgeRatingBadge(base *image.NRGBA, rating string, pos string) {
	if rating == "" {
		return
	}
	ensureFaces()
	face := faceLabel
	if face == nil {
		return
	}

	const (
		padX   = 7
		padY   = 4
		edgeX  = 10
		edgeY  = 10
		radius = 3
	)

	fm := face.Metrics()
	ascent := fm.Ascent.Ceil()
	descent := fm.Descent.Ceil()
	bh := padY*2 + ascent + descent
	bw := padX*2 + textWidth(face, rating)

	bounds := base.Bounds()

	resolvedPos := pos
	if resolvedPos == "" || resolvedPos == "inherit" {
		resolvedPos = "tl"
	}

	var x, y int
	switch resolvedPos {
	case "tr":
		x = bounds.Max.X - edgeX - bw
		y = bounds.Min.Y + edgeY
	case "bl":
		x = bounds.Min.X + edgeX
		y = bounds.Max.Y - edgeY - bh
	case "br":
		x = bounds.Max.X - edgeX - bw
		y = bounds.Max.Y - edgeY - bh
	default: // "tl"
		x = bounds.Min.X + edgeX
		y = bounds.Min.Y + edgeY
	}

	bg := color.NRGBA{R: 30, G: 30, B: 30, A: 220}
	bRect := image.Rect(x, y, x+bw, y+bh)
	fillRoundedRect(base, bRect, radius, bg)

	borderColor := color.NRGBA{R: 200, G: 200, B: 200, A: 180}
	drawRectBorder(base, bRect, radius, borderColor)

	tx := x + padX
	ty := y + padY + ascent
	drawText(base, face, tx, ty, color.White, rating)
}

// ── Provider icon badges ──────────────────────────────────────────────────────

// providerColors maps well-known TMDB provider_id values → brand color.
var providerColors = map[int]color.NRGBA{
	8:   {R: 229, G: 9, B: 20, A: 255},    // Netflix
	9:   {R: 0, G: 168, B: 225, A: 255},   // Amazon Prime
	337: {R: 17, G: 23, B: 65, A: 255},    // Disney+
	384: {R: 0, G: 40, B: 160, A: 255},    // HBO Max / Max
	15:  {R: 240, G: 120, B: 0, A: 255},   // Hulu
	531: {R: 2, G: 144, B: 208, A: 255},   // Paramount+
	350: {R: 0, G: 100, B: 220, A: 255},   // Apple TV+
	386: {R: 120, G: 0, B: 200, A: 255},   // Peacock
	43:  {R: 230, G: 50, B: 30, A: 255},   // Starz
}

func providerColor(id int) color.NRGBA {
	if c, ok := providerColors[id]; ok {
		return c
	}
	return color.NRGBA{R: 50, G: 50, B: 50, A: 255}
}

// shortProviderName returns a compact display name for the badge.
func shortProviderName(name string) string {
	switch name {
	case "Amazon Prime Video", "Amazon Video":
		return "Prime"
	case "Apple TV Plus", "Apple TV+":
		return "Apple TV"
	case "Disney Plus", "Disney+":
		return "Disney+"
	case "HBO Max", "Max":
		return "Max"
	case "Peacock Premium", "Peacock":
		return "Peacock"
	case "Paramount Plus", "Paramount+":
		return "Paramount+"
	default:
		if len(name) > 12 {
			return name[:12]
		}
		return name
	}
}

// drawProviderBadges renders streaming provider chips as a horizontal row
// along the bottom of the image, above any ratings strip.
// At most 4 providers are shown to avoid crowding.
func drawProviderBadges(base *image.NRGBA, providers []provider.WatchProvider) {
	if len(providers) == 0 {
		return
	}
	ensureFaces()
	face := faceLabel
	if face == nil {
		return
	}

	shown := providers
	if len(shown) > 4 {
		shown = shown[:4]
	}

	const (
		padX     = 6
		padY     = 3
		badgeGap = 5
		edgeX    = 10
		edgeY    = 55 // above ratings strip
		radius   = 3
	)

	fm := face.Metrics()
	ascent := fm.Ascent.Ceil()
	descent := fm.Descent.Ceil()
	badgeH := padY*2 + ascent + descent

	bounds := base.Bounds()

	type spec struct {
		label string
		w     int
		color color.NRGBA
		prov  provider.WatchProvider
	}
	specs := make([]spec, 0, len(shown))
	totalW := 0
	for i, p := range shown {
		lbl := shortProviderName(p.Name)
		lw := padX*2 + textWidth(face, lbl)
		specs = append(specs, spec{label: lbl, w: lw, color: providerColor(p.ID), prov: p})
		totalW += lw
		if i > 0 {
			totalW += badgeGap
		}
	}

	x := (bounds.Dx() - totalW) / 2
	if x < edgeX {
		x = edgeX
	}
	y := bounds.Max.Y - edgeY - badgeH

	for _, s := range specs {
		bRect := image.Rect(x, y, x+s.w, y+badgeH)
		fillRoundedRect(base, bRect, radius, s.color)
		tx := x + padX
		ty := y + padY + ascent
		drawText(base, face, tx, ty, color.White, s.label)
		x += s.w + badgeGap
	}
}

// ── Genre badge ───────────────────────────────────────────────────────────────

// drawGenreBadge renders a genre pill at the bottom-left corner (or pos).
// Shows at most 3 genres separated by " · ".
func drawGenreBadge(base *image.NRGBA, genres []string, pos string) {
	if len(genres) == 0 {
		return
	}
	ensureFaces()
	face := faceLabel
	if face == nil {
		return
	}

	shown := genres
	if len(shown) > 3 {
		shown = shown[:3]
	}
	label := strings.Join(shown, " · ")

	const (
		padX   = 8
		padY   = 4
		edgeX  = 10
		edgeY  = 10
		radius = 3
	)

	fm := face.Metrics()
	ascent := fm.Ascent.Ceil()
	descent := fm.Descent.Ceil()
	bh := padY*2 + ascent + descent
	bw := padX*2 + textWidth(face, label)

	bounds := base.Bounds()

	resolvedPos := pos
	if resolvedPos == "" || resolvedPos == "inherit" {
		resolvedPos = "bl"
	}

	var x, y int
	switch resolvedPos {
	case "tl":
		x = bounds.Min.X + edgeX
		y = bounds.Min.Y + edgeY
	case "tr":
		x = bounds.Max.X - edgeX - bw
		y = bounds.Min.Y + edgeY
	case "br":
		x = bounds.Max.X - edgeX - bw
		y = bounds.Max.Y - edgeY - bh
	default: // "bl"
		x = bounds.Min.X + edgeX
		y = bounds.Max.Y - edgeY - bh
	}

	bg := color.NRGBA{R: 0, G: 0, B: 0, A: 190}
	bRect := image.Rect(x, y, x+bw, y+bh)
	fillRoundedRect(base, bRect, radius, bg)

	tx := x + padX
	ty := y + padY + ascent
	drawText(base, face, tx, ty, color.NRGBA{R: 220, G: 220, B: 220, A: 255}, label)
}

// ── Aggregate rating bar ──────────────────────────────────────────────────────

// drawAggregateBar draws a full-width score bar on top or bottom of the image.
// The bar fill is colored green/amber/red based on the normalised average score (0–10).
// Filtered by the config.Ratings allowlist so only visible sources contribute.
func drawAggregateBar(base *image.NRGBA, ratings []provider.Rating, cfg imageconfig.Config) {
	if len(ratings) == 0 {
		return
	}
	ensureFaces()

	allowed := make(map[string]bool, len(cfg.Ratings))
	for _, r := range cfg.Ratings {
		allowed[r] = true
	}

	var sum float64
	var n int
	for _, r := range ratings {
		if len(cfg.Ratings) > 0 && !allowed[r.Source] {
			continue
		}
		if r.Value > 0 {
			sum += r.Value
			n++
		}
	}
	if n == 0 {
		return
	}
	avg := sum / float64(n) // 0–10 scale

	bounds := base.Bounds()
	w := bounds.Dx()

	const barH = 10
	var barY int
	pos := strings.ToLower(cfg.AggregateBarPos)
	if pos == "top" {
		barY = bounds.Min.Y
	} else {
		barY = bounds.Max.Y - barH
	}

	trackColor := color.NRGBA{R: 0, G: 0, B: 0, A: 120}
	trackRect := image.Rect(bounds.Min.X, barY, bounds.Max.X, barY+barH)
	fillRect(base, trackRect, trackColor)

	fillW := int(float64(w) * (avg / 10.0))
	if fillW < 1 {
		fillW = 1
	}
	if fillW > w {
		fillW = w
	}

	var fillColor color.NRGBA
	switch {
	case avg >= 8.0:
		fillColor = color.NRGBA{R: 39, G: 174, B: 96, A: 230}  // green
	case avg >= 5.0:
		fillColor = color.NRGBA{R: 230, G: 126, B: 34, A: 230} // amber
	default:
		fillColor = color.NRGBA{R: 192, G: 57, B: 43, A: 230}  // red
	}

	fillRect(base, image.Rect(bounds.Min.X, barY, bounds.Min.X+fillW, barY+barH), fillColor)
}

// ── Trending badge ────────────────────────────────────────────────────────────

// drawTrendingBadge draws a small "TRENDING" label badge at the top-left corner.
func drawTrendingBadge(base *image.NRGBA) {
	ensureFaces()
	if faceLabel == nil {
		return
	}

	const (
		label  = "TRENDING"
		padX   = 7
		padY   = 4
		edgeX  = 8
		edgeY  = 8
		radius = 3
	)

	fm := faceLabel.Metrics()
	ascent := fm.Ascent.Ceil()
	descent := fm.Descent.Ceil()
	bh := padY*2 + ascent + descent
	bw := padX*2 + textWidth(faceLabel, label)

	bounds := base.Bounds()
	x := bounds.Min.X + edgeX
	y := bounds.Min.Y + edgeY

	bg := color.NRGBA{R: 231, G: 76, B: 60, A: 230}
	fillRoundedRect(base, image.Rect(x, y, x+bw, y+bh), radius, bg)
	drawText(base, faceLabel, x+padX, y+padY+ascent, color.NRGBA{R: 255, G: 255, B: 255, A: 255}, label)
}
