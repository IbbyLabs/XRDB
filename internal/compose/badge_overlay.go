package compose

import (
	"encoding/hex"
	"fmt"
	"image"
	"image/color"
	"math"
	"strings"
	"sync"

	"golang.org/x/image/font"

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

// hdrHierarchy lists badge tokens that are implied by a superior token.
// When the superior is present, the implied badges are removed to avoid
// redundant stacking (e.g. HDR10+ already implies HDR10 and HDR).
var hdrHierarchy = []struct {
	superior string
	drops    []string
}{
	{"dv", []string{"hdr10plus", "hdr10", "hdr"}},
	{"hdr10plus", []string{"hdr10", "hdr"}},
	{"hdr10", []string{"hdr"}},
}

// dedupeQualityTokens removes badges that are implied by a higher-tier badge
// already in the list.
func dedupeQualityTokens(tokens []string) []string {
	present := make(map[string]bool, len(tokens))
	for _, t := range tokens {
		present[strings.ToLower(t)] = true
	}
	drop := make(map[string]bool)
	for _, rule := range hdrHierarchy {
		if present[rule.superior] {
			for _, d := range rule.drops {
				drop[d] = true
			}
		}
	}
	if len(drop) == 0 {
		return tokens
	}
	out := make([]string, 0, len(tokens))
	for _, t := range tokens {
		if !drop[strings.ToLower(t)] {
			out = append(out, t)
		}
	}
	return out
}

// drawQualityBadges renders quality/format badges (4K, HDR, DV, …) stacked
// in the top-right corner. Returns the total pixel height consumed.
func drawQualityBadges(base *image.NRGBA, tokens []string, scale float64) int {
	if len(tokens) == 0 {
		return 0
	}
	tokens = dedupeQualityTokens(tokens)
	ensureFaces()
	face := labelFaceFor(scale)
	if face == nil {
		return 0
	}

	s := func(v float64) int { return int(v*scale + 0.5) }
	padX := s(8)
	padY := s(5)
	badgeGap := s(4)
	edgeX := s(10)
	edgeY := s(10)
	radius := s(4)

	lm := face.Metrics()
	lAscent := lm.Ascent.Ceil()
	lDescent := lm.Descent.Ceil()
	badgeH := padY*2 + lAscent + lDescent

	bounds := base.Bounds()

	y := bounds.Min.Y + edgeY
	for _, tok := range tokens {
		label := qualityBadgeLabel(tok)
		lw := textWidth(face, label)
		bw := padX*2 + lw
		x := bounds.Max.X - edgeX - bw
		bRect := image.Rect(x, y, x+bw, y+badgeH)
		fillRoundedRect(base, bRect, radius, qualityBadgeColor(tok))
		tx := x + padX
		ty := y + padY + lAscent
		drawText(base, face, tx, ty, color.White, label)
		y += badgeH + badgeGap
	}

	return len(tokens)*badgeH + (len(tokens)-1)*badgeGap
}

// ── Age rating badge ──────────────────────────────────────────────────────────

// drawAgeRatingBadge renders a content rating badge (e.g. "TV-MA", "R")
// in the corner specified by pos ("tl", "tr", "bl", "br", "inherit").
// "inherit" defaults to "br" so it does not conflict with the trending badge (TL)
// or quality badges (TR).
func drawAgeRatingBadge(base *image.NRGBA, rating string, pos string, scale float64) {
	if rating == "" {
		return
	}
	ensureFaces()
	face := labelFaceFor(scale)
	if face == nil {
		return
	}

	s := func(v float64) int { return int(v*scale + 0.5) }
	padX := s(7)
	padY := s(4)
	edgeX := s(10)
	edgeY := s(10)
	radius := s(3)

	fm := face.Metrics()
	ascent := fm.Ascent.Ceil()
	descent := fm.Descent.Ceil()
	bh := padY*2 + ascent + descent
	bw := padX*2 + textWidth(face, rating)

	bounds := base.Bounds()

	resolvedPos := pos
	if resolvedPos == "" || resolvedPos == "inherit" {
		resolvedPos = "br"
	}

	var x, y int
	switch resolvedPos {
	case "tl":
		x = bounds.Min.X + edgeX
		y = bounds.Min.Y + edgeY
	case "tr":
		x = bounds.Max.X - edgeX - bw
		y = bounds.Min.Y + edgeY
	case "bl":
		x = bounds.Min.X + edgeX
		y = bounds.Max.Y - edgeY - bh
	default: // "br"
		x = bounds.Max.X - edgeX - bw
		y = bounds.Max.Y - edgeY - bh
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
		if len([]rune(name)) > 12 {
			return string([]rune(name)[:12])
		}
		return name
	}
}

// drawProviderBadges renders streaming provider chips as a horizontal row
// along the bottom of the image, above any ratings strip. When TMDB logo
// images are available they are composited as square icons; otherwise the
// provider name is rendered as text. At most 4 providers are shown.
// ratingsH is the pixel height consumed by the ratings overlay so provider
// badges sit above it rather than overlapping.
func drawProviderBadges(base *image.NRGBA, providers []provider.WatchProvider, scale float64, ratingsH int) {
	if len(providers) == 0 {
		return
	}
	ensureFaces()
	face := labelFaceFor(scale)
	if face == nil {
		return
	}

	shown := providers
	if len(shown) > 4 {
		shown = shown[:4]
	}

	s := func(v float64) int { return int(v*scale + 0.5) }
	padX := s(7)
	padY := s(4)
	badgeGap := s(6)
	edgeX := s(10)
	edgeY := ratingsH + s(18) // extra clearance above ratings / poster title text
	radius := s(4)

	fm := face.Metrics()
	ascent := fm.Ascent.Ceil()
	descent := fm.Descent.Ceil()
	badgeH := padY*2 + ascent + descent

	bounds := base.Bounds()

	// Pre-fetch logos in parallel to avoid blocking serially on each HTTP request.
	logos := make([]*image.NRGBA, len(shown))
	var wg sync.WaitGroup
	for i, p := range shown {
		wg.Add(1)
		go func(i int, path string) {
			defer wg.Done()
			logos[i] = fetchProviderLogo(path)
		}(i, p.LogoPath)
	}
	wg.Wait()

	type spec struct {
		label string
		logo  *image.NRGBA // nil = use text
		w     int
		bg    color.NRGBA
	}

	specs := make([]spec, 0, len(shown))
	totalW := 0
	for i, p := range shown {
		logo := logos[i]
		var w int
		if logo != nil {
			// Square icon badge: badgeH × badgeH
			w = badgeH
		} else {
			lbl := shortProviderName(p.Name)
			w = padX*2 + textWidth(face, lbl)
		}
		var lbl string
		if logo == nil {
			lbl = shortProviderName(p.Name)
		}
		specs = append(specs, spec{label: lbl, logo: logo, w: w, bg: providerColor(p.ID)})
		totalW += w
		if i > 0 {
			totalW += badgeGap
		}
	}

	x := (bounds.Dx() - totalW) / 2
	if x < edgeX {
		x = edgeX
	}
	y := bounds.Max.Y - edgeY - badgeH

	for _, sp := range specs {
		bRect := image.Rect(x, y, x+sp.w, y+badgeH)
		fillRoundedRect(base, bRect, radius, sp.bg)

		if sp.logo != nil {
			// Scale logo to fit inside the badge with 2px padding.
			pad := s(2)
			inner := badgeH - 2*pad
			if inner > 0 {
				drawLogoScaled(base, sp.logo, image.Rect(x+pad, y+pad, x+pad+inner, y+pad+inner))
			}
		} else {
			tx := x + padX
			ty := y + padY + ascent
			drawText(base, face, tx, ty, color.White, sp.label)
		}
		x += sp.w + badgeGap
	}
}

// drawLogoScaled composites src into dst rectangle using nearest-neighbour
// scaling. Transparent logo pixels are skipped (src has straight alpha).
func drawLogoScaled(dst *image.NRGBA, src *image.NRGBA, dstRect image.Rectangle) {
	sb := src.Bounds()
	dw := dstRect.Dx()
	dh := dstRect.Dy()
	if dw <= 0 || dh <= 0 || sb.Dx() <= 0 || sb.Dy() <= 0 {
		return
	}
	for dy := 0; dy < dh; dy++ {
		sy := sb.Min.Y + dy*sb.Dy()/dh
		for dx := 0; dx < dw; dx++ {
			sx := sb.Min.X + dx*sb.Dx()/dw
			sp := src.NRGBAAt(sx, sy)
			if sp.A == 0 {
				continue
			}
			px := dstRect.Min.X + dx
			py := dstRect.Min.Y + dy
			if !image.Pt(px, py).In(dst.Bounds()) {
				continue
			}
			if sp.A == 255 {
				dst.SetNRGBA(px, py, sp)
				continue
			}
			// Alpha blend over existing pixel.
			dp := dst.NRGBAAt(px, py)
			a := uint32(sp.A)
			ia := 255 - a
			dst.SetNRGBA(px, py, color.NRGBA{
				R: uint8((uint32(sp.R)*a + uint32(dp.R)*ia) / 255),
				G: uint8((uint32(sp.G)*a + uint32(dp.G)*ia) / 255),
				B: uint8((uint32(sp.B)*a + uint32(dp.B)*ia) / 255),
				A: uint8((a*255 + uint32(dp.A)*ia) / 255),
			})
		}
	}
}

// ── Genre badge ───────────────────────────────────────────────────────────────

// drawGenreBadge renders a genre pill at the bottom-left corner (or pos).
// Shows at most 3 genres separated by " · ".
func drawGenreBadge(base *image.NRGBA, genres []string, pos string, scale float64) {
	if len(genres) == 0 {
		return
	}
	ensureFaces()
	face := labelFaceFor(scale)
	if face == nil {
		return
	}

	shown := genres
	if len(shown) > 3 {
		shown = shown[:3]
	}
	label := strings.Join(shown, " · ")

	s := func(v float64) int { return int(v*scale + 0.5) }
	padX := s(8)
	padY := s(4)
	edgeX := s(10)
	edgeY := s(10)
	radius := s(3)

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

	scale := outputScale(cfg.Size)
	barH := int(10*scale + 0.5)
	if barH < 4 {
		barH = 4
	}

	bounds := base.Bounds()
	w := bounds.Dx()

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

// drawTrendingBadge draws a "↑ TRENDING" pill badge at the top-left corner.
// It uses a capsule shape with a subtle gradient effect via two layered fills.
func drawTrendingBadge(base *image.NRGBA, scale float64) {
	ensureFaces()
	face := labelFaceFor(scale)
	if face == nil {
		return
	}

	const label = "↑ TRENDING"

	s := func(v float64) int { return int(v*scale + 0.5) }
	padX := s(9)
	padY := s(4)
	edgeX := s(8)
	edgeY := s(8)

	fm := face.Metrics()
	ascent := fm.Ascent.Ceil()
	descent := fm.Descent.Ceil()
	bh := padY*2 + ascent + descent
	bw := padX*2 + textWidth(face, label)
	radius := bh / 2 // full capsule

	bounds := base.Bounds()
	x := bounds.Min.X + edgeX
	y := bounds.Min.Y + edgeY
	rect := image.Rect(x, y, x+bw, y+bh)

	// Shadow layer for depth.
	shadowRect := image.Rect(x+1, y+1, x+bw+1, y+bh+1)
	fillRoundedRect(base, shadowRect, radius, color.NRGBA{R: 0, G: 0, B: 0, A: 80})

	// Main fill: vivid red-orange gradient approximated by two fills.
	fillRoundedRect(base, rect, radius, color.NRGBA{R: 220, G: 50, B: 40, A: 245})
	// Lighter top-half sheen. We clip to the badge's own corner circles (using
	// rect + radius) rather than rounding topHalf's corners, which would create
	// a visible curved line at the midpoint ("double bubble" artefact).
	sheenC := color.NRGBA{R: 255, G: 80, B: 60, A: 60}
	cr2 := float64(radius) * float64(radius)
	for py := y; py < y+bh/2; py++ {
		for px := x; px < x+bw; px++ {
			if inCornerZone(px, py, rect, radius) {
				cx, cy := cornerCenter(px, py, rect, radius)
				ddx := float64(px) - cx + 0.5
				ddy := float64(py) - cy + 0.5
				if ddx*ddx+ddy*ddy > cr2 {
					continue
				}
			}
			dp := base.NRGBAAt(px, py)
			a := uint32(sheenC.A)
			ia := 255 - a
			base.SetNRGBA(px, py, color.NRGBA{
				R: uint8((uint32(sheenC.R)*a + uint32(dp.R)*ia) / 255),
				G: uint8((uint32(sheenC.G)*a + uint32(dp.G)*ia) / 255),
				B: uint8((uint32(sheenC.B)*a + uint32(dp.B)*ia) / 255),
				A: uint8((a*255 + uint32(dp.A)*ia) / 255),
			})
		}
	}

	drawText(base, face, x+padX, y+padY+ascent, color.NRGBA{R: 255, G: 255, B: 255, A: 255}, label)
}

// ── Average rating ring ───────────────────────────────────────────────────────

// drawAverageRatingRing renders a circular rating ring (or compact wings) in
// the configured corner. The ring shows the average of the selected rating
// sources as a progress arc coloured green/amber/red or a custom hex colour.
func drawAverageRatingRing(base *image.NRGBA, ratings []provider.Rating, cfg imageconfig.Config, scale float64) {
	if !cfg.RatingRing || len(ratings) == 0 || len(cfg.Ratings) == 0 {
		return
	}

	avg, ok := ratingRingAverage(ratings, cfg.Ratings)
	if !ok {
		return
	}

	fillColor := ratingRingFillColor(avg, cfg.RatingRingColor)

	s := func(v float64) int { return int(v*scale + 0.5) }
	bounds := base.Bounds()
	edgeX := s(12)
	edgeY := s(12)

	style := cfg.RatingRingStyle
	if style == "" {
		style = "ring"
	}
	pos := cfg.RatingRingPos
	if pos == "" {
		pos = "br"
	}

	ensureFaces()
	valueFace := valueFaceFor(scale)

	switch style {
	case "compact":
		drawCompactWings(base, avg, fillColor, pos, bounds, edgeX, edgeY, scale, valueFace)
	default: // "ring"
		outerR := s(32)
		innerR := s(22)
		cx, cy := ringCenter(pos, bounds, edgeX, edgeY, outerR)
		drawProgressRing(base, cx, cy, outerR, innerR, avg/10.0, fillColor, valueFace)
	}
}

// ratingRingAverage computes the normalised (0–10) average of ratings whose
// source is in the allowlist. Returns (avg, true) or (0, false) if no data.
func ratingRingAverage(ratings []provider.Rating, allowed []string) (float64, bool) {
	allowSet := make(map[string]bool, len(allowed))
	for _, r := range allowed {
		allowSet[r] = true
	}
	var sum float64
	var n int
	for _, r := range ratings {
		if !allowSet[r.Source] {
			continue
		}
		if r.Value > 0 {
			sum += r.Value
			n++
		}
	}
	if n == 0 {
		return 0, false
	}
	return sum / float64(n), true
}

// ratingRingFillColor returns the arc fill colour: a custom hex when provided,
// otherwise green/amber/red thresholds matching the aggregate bar.
func ratingRingFillColor(avg float64, hexColor string) color.NRGBA {
	if hexColor != "" {
		if c, err := parseHexColor(hexColor); err == nil {
			return c
		}
	}
	switch {
	case avg >= 8.0:
		return color.NRGBA{R: 39, G: 174, B: 96, A: 230}
	case avg >= 5.0:
		return color.NRGBA{R: 230, G: 126, B: 34, A: 230}
	default:
		return color.NRGBA{R: 192, G: 57, B: 43, A: 230}
	}
}

// parseHexColor parses "#RRGGBB" or "#RGB" into color.NRGBA with A=255.
func parseHexColor(s string) (color.NRGBA, error) {
	s = strings.TrimPrefix(strings.TrimSpace(s), "#")
	if len(s) == 3 {
		// Expand shorthand
		s = string([]byte{s[0], s[0], s[1], s[1], s[2], s[2]})
	}
	if len(s) != 6 {
		return color.NRGBA{}, fmt.Errorf("invalid hex color")
	}
	b, err := hex.DecodeString(s)
	if err != nil {
		return color.NRGBA{}, err
	}
	return color.NRGBA{R: b[0], G: b[1], B: b[2], A: 255}, nil
}

// ringCenter returns the pixel center of a ring placed at the given corner.
func ringCenter(pos string, bounds image.Rectangle, edgeX, edgeY, radius int) (int, int) {
	switch pos {
	case "tl":
		return bounds.Min.X + edgeX + radius, bounds.Min.Y + edgeY + radius
	case "tr":
		return bounds.Max.X - edgeX - radius, bounds.Min.Y + edgeY + radius
	case "bl":
		return bounds.Min.X + edgeX + radius, bounds.Max.Y - edgeY - radius
	default: // "br"
		return bounds.Max.X - edgeX - radius, bounds.Max.Y - edgeY - radius
	}
}

// drawProgressRing draws a circular progress arc onto base.
// sweepFrac is in [0, 1]; the arc starts at the top and goes clockwise.
func drawProgressRing(base *image.NRGBA, cx, cy, outerR, innerR int, sweepFrac float64, fillColor color.NRGBA, face font.Face) {
	trackColor := color.NRGBA{R: 0, G: 0, B: 0, A: 140}
	bgColor := color.NRGBA{R: 0, G: 0, B: 0, A: 160}

	outerRf := float64(outerR)
	innerRf := float64(innerR)
	innerBgRf := float64(innerR - 1)

	sweep := sweepFrac * 2 * math.Pi
	startAngle := -math.Pi / 2 // top

	for py := cy - outerR - 1; py <= cy+outerR+1; py++ {
		for px := cx - outerR - 1; px <= cx+outerR+1; px++ {
			dx := float64(px) - float64(cx) + 0.5
			dy := float64(py) - float64(cy) + 0.5
			dist := math.Sqrt(dx*dx + dy*dy)

			// Outer edge coverage: fade out beyond outerR.
			outerCov := outerRf + 0.5 - dist
			if outerCov <= 0 {
				continue
			}
			if outerCov > 1 {
				outerCov = 1
			}

			// Inner background disk (full solid fill inside innerR-1).
			bgCov := innerBgRf + 0.5 - dist
			if bgCov > 1 {
				bgCov = 1
			}
			if bgCov > 0 {
				blendPixel(base, px, py, color.NRGBA{R: bgColor.R, G: bgColor.G, B: bgColor.B, A: uint8(float64(bgColor.A) * bgCov * outerCov)})
				continue
			}

			// Annular ring zone. Skip pixels fully inside the inner hole.
			innerCov := dist - (innerRf - 0.5)
			if innerCov <= 0 {
				continue
			}
			if innerCov > 1 {
				innerCov = 1
			}

			ringAlpha := outerCov * innerCov
			angle := math.Atan2(dy, dx)
			rel := angle - startAngle
			for rel < 0 {
				rel += 2 * math.Pi
			}
			var c color.NRGBA
			if rel <= sweep {
				c = fillColor
			} else {
				c = trackColor
			}
			blendPixel(base, px, py, color.NRGBA{R: c.R, G: c.G, B: c.B, A: uint8(float64(c.A) * ringAlpha)})
		}
	}

	// Score label centered in the ring
	if face == nil {
		return
	}
	label := strings.TrimSuffix(fmt.Sprintf("%.1f", sweepFrac*10), ".0")
	tw := textWidth(face, label)
	fm := face.Metrics()
	ascent := fm.Ascent.Ceil()
	descent := fm.Descent.Ceil()
	tx := cx - tw/2
	ty := cy + (ascent-descent)/2
	drawText(base, face, tx, ty, color.NRGBA{R: 255, G: 255, B: 255, A: 240}, label)
}

// drawCompactWings draws two small curved arcs flanking the score number,
// positioned in the requested corner — a compact "wings" style indicator.
func drawCompactWings(base *image.NRGBA, avg float64, fillColor color.NRGBA, pos string, bounds image.Rectangle, edgeX, edgeY int, scale float64, face font.Face) {
	if face == nil {
		return
	}
	s := func(v float64) int { return int(v*scale + 0.5) }

	label := strings.TrimSuffix(fmt.Sprintf("%.1f", avg), ".0")
	tw := textWidth(face, label)
	fm := face.Metrics()
	ascent := fm.Ascent.Ceil()
	descent := fm.Descent.Ceil()
	textH := ascent + descent

	wingR := s(14) // arc radius
	padX := s(6)   // gap between text and wing center
	padY := s(5)
	totalW := wingR + padX + tw + padX + wingR
	totalH := textH + padY*2

	// Compute top-left of the widget bounding box
	var ox, oy int
	switch pos {
	case "tl":
		ox = bounds.Min.X + edgeX
		oy = bounds.Min.Y + edgeY
	case "tr":
		ox = bounds.Max.X - edgeX - totalW
		oy = bounds.Min.Y + edgeY
	case "bl":
		ox = bounds.Min.X + edgeX
		oy = bounds.Max.Y - edgeY - totalH
	default: // "br"
		ox = bounds.Max.X - edgeX - totalW
		oy = bounds.Max.Y - edgeY - totalH
	}

	// Background pill behind the whole widget
	bgRect := image.Rect(ox, oy, ox+totalW, oy+totalH)
	fillRoundedRect(base, bgRect, totalH/2, color.NRGBA{R: 0, G: 0, B: 0, A: 160})

	cy := oy + totalH/2
	sweep := (avg / 10.0) * math.Pi * 1.5 // up to 270° per wing at max score

	// Left wing: arc centered left of text, opening rightward (right half of circle)
	lx := ox + wingR
	drawArcOnly(base, lx, cy, wingR-s(3), wingR, math.Pi/2, sweep, fillColor)

	// Right wing: arc centered right of text, opening leftward (left half of circle)
	rx := ox + totalW - wingR
	drawArcOnly(base, rx, cy, wingR-s(3), wingR, -math.Pi/2, sweep, fillColor)

	// Score text
	tx := ox + wingR + padX
	ty := oy + padY + ascent
	drawText(base, face, tx, ty, color.NRGBA{R: 255, G: 255, B: 255, A: 240}, label)
}

// drawArcOnly paints pixels in the annular sector defined by [innerR, outerR]
// and a symmetric sweep of sweepRad radians centred on startAngle.
func drawArcOnly(base *image.NRGBA, cx, cy, innerR, outerR int, startAngle, sweepRad float64, c color.NRGBA) {
	outer2 := float64(outerR * outerR)
	inner2 := float64(innerR * innerR)
	halfSweep := sweepRad / 2
	endA := startAngle + halfSweep
	startA := startAngle - halfSweep

	for py := cy - outerR; py <= cy+outerR; py++ {
		for px := cx - outerR; px <= cx+outerR; px++ {
			dx := float64(px) - float64(cx) + 0.5
			dy := float64(py) - float64(cy) + 0.5
			d2 := dx*dx + dy*dy
			if d2 < inner2 || d2 > outer2 {
				continue
			}
			angle := math.Atan2(dy, dx)
			if angleBetween(angle, startA, endA) {
				blendPixel(base, px, py, c)
			}
		}
	}
}

// angleBetween returns true if angle lies in [lo, hi] with wrap-around handling.
func angleBetween(angle, lo, hi float64) bool {
	// Normalise both bounds to (-π, π] range that Atan2 returns.
	for lo > math.Pi {
		lo -= 2 * math.Pi
	}
	for lo < -math.Pi {
		lo += 2 * math.Pi
	}
	for hi > math.Pi {
		hi -= 2 * math.Pi
	}
	for hi < -math.Pi {
		hi += 2 * math.Pi
	}
	if lo <= hi {
		return angle >= lo && angle <= hi
	}
	// Wraps around
	return angle >= lo || angle <= hi
}
