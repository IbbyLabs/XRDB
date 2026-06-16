package compose

import (
	"image"
	"image/color"
	"strings"
	"sync"

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
			base.SetNRGBA(px, py, sheenC)
		}
	}

	drawText(base, face, x+padX, y+padY+ascent, color.NRGBA{R: 255, G: 255, B: 255, A: 255}, label)
}
