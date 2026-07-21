package compose

import (
	"encoding/hex"
	"fmt"
	"image"
	"image/color"
	"math"
	"strconv"
	"strings"
	"sync"

	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/font"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// ── Quality badges (4K, HDR, DV, etc.) ───────────────────────────────────────

// tileChrome bundles the colors used to draw an overlay tile.
type tileChrome struct {
	fill        color.NRGBA
	border      color.NRGBA // zero alpha = no border
	borderWidth int         // px; 0/1 = single hairline
	shadow      color.NRGBA // zero alpha = no shadow
}

// drawSoftTile draws a rounded "frosted" tile: an offset drop shadow, a fill,
// and an optional border (1px by default, thicker via borderWidth). Callers
// draw content inside r afterwards.
func drawSoftTile(base *image.NRGBA, r image.Rectangle, radius int, ch tileChrome) {
	if ch.shadow.A > 0 {
		off := maxInt(1, r.Dy()/18)
		fillRoundedRect(base, r.Add(image.Pt(0, off)), radius, ch.shadow)
	}
	fillRoundedRect(base, r, radius, ch.fill)
	if ch.border.A > 0 {
		bw := maxInt(1, ch.borderWidth)
		// Thicken inward with concentric 1px strokes so corners stay rounded.
		for i := 0; i < bw; i++ {
			rr := r.Inset(i)
			if rr.Dx() <= 0 || rr.Dy() <= 0 {
				break
			}
			drawRectBorder(base, rr, maxInt(0, radius-i), ch.border)
		}
	}
}

// meanLuminance returns the average perceived luminance (0..1) of the opaque
// pixels of img, or 0.5 if there are none. Used to choose a contrasting tile
// color behind a provider logo (light logos get a dark tile, and vice versa).
func meanLuminance(img *image.NRGBA) float64 {
	b := img.Bounds()
	if b.Dx() == 0 || b.Dy() == 0 {
		return 0.5
	}
	stepX := maxInt(1, b.Dx()/48)
	stepY := maxInt(1, b.Dy()/48)
	var sum, n float64
	for y := b.Min.Y; y < b.Max.Y; y += stepY {
		for x := b.Min.X; x < b.Max.X; x += stepX {
			p := img.NRGBAAt(x, y)
			if p.A < 40 {
				continue
			}
			sum += (0.299*float64(p.R) + 0.587*float64(p.G) + 0.114*float64(p.B)) / 255
			n++
		}
	}
	if n == 0 {
		return 0.5
	}
	return sum / n
}

// opaqueFraction returns the fraction of sampled pixels that are (near-)opaque.
// A value near 1 means the logo carries a baked-in rectangular background
// rather than a transparent cut-out mark.
func opaqueFraction(img *image.NRGBA) float64 {
	b := img.Bounds()
	if b.Dx() == 0 || b.Dy() == 0 {
		return 0
	}
	stepX := maxInt(1, b.Dx()/48)
	stepY := maxInt(1, b.Dy()/48)
	var opaque, total float64
	for y := b.Min.Y; y < b.Max.Y; y += stepY {
		for x := b.Min.X; x < b.Max.X; x += stepX {
			total++
			if img.NRGBAAt(x, y).A > 200 {
				opaque++
			}
		}
	}
	if total == 0 {
		return 0
	}
	return opaque / total
}

// nonTransparentBounds returns the bounding box of the non-transparent pixels
// of img, or the empty rectangle if it is fully transparent. Used to reserve a
// logo's wordmark region so overlays never draw over it.
func nonTransparentBounds(img *image.NRGBA) image.Rectangle {
	b := img.Bounds()
	minX, minY := b.Max.X, b.Max.Y
	maxX, maxY := b.Min.X, b.Min.Y
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if img.NRGBAAt(x, y).A > 12 {
				if x < minX {
					minX = x
				}
				if y < minY {
					minY = y
				}
				if x+1 > maxX {
					maxX = x + 1
				}
				if y+1 > maxY {
					maxY = y + 1
				}
			}
		}
	}
	if minX >= maxX || minY >= maxY {
		return image.Rectangle{}
	}
	return image.Rect(minX, minY, maxX, maxY)
}

// trimTransparent returns img cropped to its non-transparent bounding box, so a
// logo with transparent padding fills its chip. Returns img unchanged if it is
// fully transparent or already tight.
func trimTransparent(img *image.NRGBA) *image.NRGBA {
	b := img.Bounds()
	minX, minY := b.Max.X, b.Max.Y
	maxX, maxY := b.Min.X, b.Min.Y
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if img.NRGBAAt(x, y).A > 12 {
				if x < minX {
					minX = x
				}
				if y < minY {
					minY = y
				}
				if x+1 > maxX {
					maxX = x + 1
				}
				if y+1 > maxY {
					maxY = y + 1
				}
			}
		}
	}
	if minX >= maxX || minY >= maxY {
		return img
	}
	if minX == b.Min.X && minY == b.Min.Y && maxX == b.Max.X && maxY == b.Max.Y {
		return img
	}
	out := image.NewNRGBA(image.Rect(0, 0, maxX-minX, maxY-minY))
	for y := minY; y < maxY; y++ {
		for x := minX; x < maxX; x++ {
			out.SetNRGBA(x-minX, y-minY, img.NRGBAAt(x, y))
		}
	}
	return out
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

// drawQualityBadges renders quality/format badges as a right-aligned stack of
// frosted tiles in the top-right corner. Tokens with a brand logo asset (IMAX,
// Dolby Vision/Atmos, HDR10, HDR10+) show the white logo; others (4K, HDR, …)
// fall back to bold text. Tiles are placed via occ so they never overlap other
// overlays. Returns the number of badges drawn.
// qualityBadgeOpts carries per-config quality-badge styling. Its zero value
// keeps the original fixed appearance (top-right, no extra scale or offset).
type qualityBadgeOpts struct {
	pos          string // "" = tr
	scalePercent int    // 0 = 100
	offsetX      int
	offsetY      int
	max          *int   // cap on badge count; nil = no cap
	style        string // "" | glass | plain | tile
	tileColor    string // "#RRGGBB" for the tile style
}

func qualityOptsFromConfig(cfg imageconfig.Config) qualityBadgeOpts {
	return qualityBadgeOpts{
		pos:          cfg.QualityBadgesPos,
		scalePercent: cfg.QualityBadgeScale,
		offsetX:      cfg.QualityBadgeOffsetX,
		offsetY:      cfg.QualityBadgeOffsetY,
		max:          cfg.QualityBadgesMax,
		style:        cfg.QualityBadgesStyle,
		tileColor:    cfg.QualityBadgesTileAccentColor,
	}
}

func drawQualityBadges(base *image.NRGBA, tokens []string, scale float64, occ *occupancy, opts qualityBadgeOpts) int {
	if len(tokens) == 0 {
		return 0
	}
	tokens = dedupeQualityTokens(tokens)
	if opts.max != nil && len(tokens) > *opts.max {
		tokens = tokens[:*opts.max]
	}
	if opts.scalePercent != 0 {
		scale *= float64(opts.scalePercent) / 100
	}
	pos := opts.pos
	if pos == "" {
		pos = "tr"
	}
	ensureFaces()
	ensureBadgeLogos()
	face := badgeFaceFor(scale)
	if face == nil {
		return 0
	}

	s := func(v float64) int { return int(v*scale + 0.5) }
	tileH := s(34)
	logoH := s(18)
	padX := s(11)
	gap := s(7)
	edgeX := s(12)
	edgeY := s(12)
	radius := s(7)

	fm := face.Metrics()
	ascent := fm.Ascent.Ceil()
	descent := fm.Descent.Ceil()

	chrome := tileChrome{
		fill:   color.NRGBA{R: 16, G: 18, B: 24, A: 180},
		border: color.NRGBA{R: 255, G: 255, B: 255, A: 38},
		shadow: color.NRGBA{R: 0, G: 0, B: 0, A: 90},
	}
	switch opts.style {
	case "tile":
		if c, err := parseHexColor(opts.tileColor); opts.tileColor != "" && err == nil {
			c.A = 220
			chrome.fill = c
		}
	case "plain":
		// A lighter, near-transparent tile so the white logos and text stay
		// legible without the full frosted chrome.
		chrome.fill.A = 70
		chrome.border.A = 60
	}

	drawn := 0
	for _, tok := range tokens {
		logo := badgeLogos[strings.ToLower(tok)]
		var tileW, contentW int
		if logo != nil {
			lb := logo.Bounds()
			contentW = int(float64(lb.Dx())*float64(logoH)/float64(lb.Dy()) + 0.5)
		} else {
			contentW = textWidth(face, qualityBadgeLabel(tok))
		}
		tileW = padX*2 + contentW

		r := occ.place(pos, tileW, tileH, edgeX, edgeY, gap)
		if opts.offsetX != 0 || opts.offsetY != 0 {
			r = r.Add(image.Pt(opts.offsetX, opts.offsetY))
		}
		drawSoftTile(base, r, radius, chrome)

		if logo != nil {
			lb := logo.Bounds()
			band := image.Rect(r.Min.X+padX, r.Min.Y+(tileH-logoH)/2, r.Max.X-padX, r.Min.Y+(tileH-logoH)/2+logoH)
			drawLogoScaled(base, logo, fitRect(lb.Dx(), lb.Dy(), band))
		} else {
			label := qualityBadgeLabel(tok)
			tx := r.Min.X + padX
			ty := r.Min.Y + (tileH-(ascent+descent))/2 + ascent
			drawText(base, face, tx, ty, color.White, label)
		}
		drawn++
	}
	return drawn
}

// ── Age rating badge ──────────────────────────────────────────────────────────

// drawAgeRatingBadge renders a content rating badge (e.g. "TV-MA", "R")
// in the corner specified by pos ("tl", "tr", "bl", "br", "inherit").
// "inherit" defaults to "br" so it does not conflict with the trending badge (TL)
// or quality badges (TR).
// ageRatingOpts carries the age-rating badge styling. Zero value = default.
type ageRatingOpts struct {
	style     string // "" | glass | plain | tile
	tileColor string // "#RRGGBB" for the tile style
}

func ageOptsFromConfig(cfg imageconfig.Config) ageRatingOpts {
	return ageRatingOpts{style: cfg.AgeRatingBadgeStyle, tileColor: cfg.AgeRatingTileColor}
}

func drawAgeRatingBadge(base *image.NRGBA, rating string, pos string, scale float64, occ *occupancy, opts ageRatingOpts) {
	if rating == "" {
		return
	}
	ensureFaces()
	face := labelFaceFor(scale)
	if face == nil {
		return
	}

	s := func(v float64) int { return int(v*scale + 0.5) }
	padX := s(8)
	padY := s(5)
	edgeX := s(12)
	edgeY := s(12)
	radius := s(5)

	fm := face.Metrics()
	ascent := fm.Ascent.Ceil()
	descent := fm.Descent.Ceil()
	bh := padY*2 + ascent + descent
	bw := padX*2 + textWidth(face, rating)

	resolvedPos := pos
	if resolvedPos == "" || resolvedPos == "inherit" {
		resolvedPos = "br"
	}

	r := occ.place(resolvedPos, bw, bh, edgeX, edgeY, s(7))
	tx, ty := r.Min.X+padX, r.Min.Y+padY+ascent
	if opts.style == "plain" {
		drawText(base, face, tx+maxInt(1, s(1)), ty+maxInt(1, s(1)), color.NRGBA{R: 0, G: 0, B: 0, A: 180}, rating)
		drawText(base, face, tx, ty, color.White, rating)
		return
	}
	chrome := tileChrome{
		fill:   color.NRGBA{R: 22, G: 24, B: 30, A: 225},
		border: color.NRGBA{R: 235, G: 235, B: 240, A: 150},
		shadow: color.NRGBA{R: 0, G: 0, B: 0, A: 80},
	}
	if opts.style == "tile" {
		if c, err := parseHexColor(opts.tileColor); opts.tileColor != "" && err == nil {
			c.A = 235
			chrome.fill = c
			chrome.border = color.NRGBA{}
		}
	}
	drawSoftTile(base, r, radius, chrome)
	drawText(base, face, tx, ty, color.White, rating)
}

// ── Provider icon badges ──────────────────────────────────────────────────────

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

// providerStorefrontSuffixes are storefront/plan qualifiers TMDB appends to a
// base brand, producing near-duplicate entries with distinct provider IDs
// (e.g. "MGM Plus", "MGM Plus Amazon Channel", "MGM+ Roku Premium Channel").
var providerStorefrontSuffixes = []string{
	"amazon channel",
	"apple tv channel",
	"roku premium channel",
	"prime video channel",
	"standard with ads",
	"basic with ads",
	"with ads",
	"premium",
}

// providerBrandKey canonicalises a provider name so storefront variants of the
// same service collapse to one brand: lowercase, storefront suffixes stripped,
// "plus" folded into "+", and everything but letters, digits and '+' dropped.
func providerBrandKey(name string) string {
	n := strings.ToLower(strings.TrimSpace(name))
	for changed := true; changed; {
		changed = false
		for _, suffix := range providerStorefrontSuffixes {
			if trimmed := strings.TrimSuffix(strings.TrimSpace(n), suffix); trimmed != n {
				n = strings.TrimSpace(trimmed)
				changed = true
			}
		}
	}
	fields := strings.Fields(n)
	for i, f := range fields {
		if f == "plus" {
			fields[i] = "+"
		}
	}
	n = strings.Join(fields, "")
	var b strings.Builder
	for _, r := range n {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '+' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// dedupeProviders keeps the first occurrence of each brand, collapsing
// storefront variants that TMDB lists under separate provider IDs.
func dedupeProviders(providers []provider.WatchProvider) []provider.WatchProvider {
	seen := make(map[string]bool, len(providers))
	out := make([]provider.WatchProvider, 0, len(providers))
	for _, p := range providers {
		key := providerBrandKey(p.Name)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, p)
	}
	return out
}

// drawProviderBadges renders streaming provider chips as a horizontal row
// along the bottom of the image, above any ratings strip. When TMDB logo
// images are available they are composited as square icons; otherwise the
// provider name is rendered as text. Storefront duplicates are collapsed and
// at most 5 brands are shown. The strip is placed through occ so it stacks
// clear of the ratings band and any corner badges already reserved.
func drawProviderBadges(base *image.NRGBA, providers []provider.WatchProvider, scale float64, occ *occupancy) {
	if len(providers) == 0 {
		return
	}
	ensureFaces()
	face := labelFaceFor(scale)
	if face == nil {
		return
	}

	shown := dedupeProviders(providers)
	if len(shown) > 5 {
		shown = shown[:5]
	}

	s := func(v float64) int { return int(v*scale + 0.5) }
	tileH := s(44)
	logoH := s(31)
	padIn := s(8)
	textPadX := s(11)
	gap := s(8)
	edgeX := s(12)
	edgeY := s(16) // clearance above the bottom edge / poster title text
	radius := s(9)
	maxLogoW := s(88)
	bezel := s(3)

	fm := face.Metrics()
	ascent := fm.Ascent.Ceil()
	descent := fm.Descent.Ceil()

	// Pre-fetch logos in parallel to avoid blocking serially on each request.
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

	type chip struct {
		logo   *image.NRGBA
		label  string // used when logo is nil
		w      int
		innerW int
		innerH int
		baked  bool // logo has a baked-in background → render as app-icon tile
		dark   bool // for transparent marks: dark tile (light logo) vs light tile
	}

	chips := make([]chip, 0, len(shown))
	totalW := 0
	for i, p := range shown {
		var c chip
		if raw := logos[i]; raw != nil {
			logo := trimTransparent(raw)
			c.logo = logo
			c.baked = opaqueFraction(logo) > 0.82
			lb := logo.Bounds()
			aspect := float64(lb.Dx()) / float64(lb.Dy())
			ih := logoH
			if c.baked {
				ih = tileH - 2*bezel
			}
			iw := int(aspect*float64(ih) + 0.5)
			if iw > maxLogoW {
				iw = maxLogoW
				ih = int(float64(iw)/aspect + 0.5)
			}
			c.innerW, c.innerH = iw, ih
			if c.baked {
				c.w = iw + 2*bezel
			} else {
				c.w = iw + 2*padIn
				c.dark = meanLuminance(logo) > 0.6
			}
		} else {
			c.label = shortProviderName(p.Name)
			c.w = textPadX*2 + textWidth(face, c.label)
			c.dark = true
		}
		chips = append(chips, c)
		totalW += c.w
		if i > 0 {
			totalW += gap
		}
	}

	// Place the whole strip through the occupancy tracker so it stacks above
	// the ratings band and clears corner badges instead of drawing over them.
	strip := occ.placeCentered(totalW, tileH, edgeX, edgeY, s(8))
	x, y := strip.Min.X, strip.Min.Y

	shadow := color.NRGBA{R: 0, G: 0, B: 0, A: 80}
	shOff := maxInt(1, tileH/16)
	for _, c := range chips {
		r := image.Rect(x, y, x+c.w, y+tileH)
		fillRoundedRect(base, r.Add(image.Pt(0, shOff)), radius, shadow)

		switch {
		case c.baked:
			// Logo fills the tile as a rounded app-icon; a neutral backing
			// shows through any internal transparency, and corners are clipped.
			fillRoundedRect(base, r, radius, color.NRGBA{R: 18, G: 20, B: 26, A: 255})
			inner := image.Rect(r.Min.X+bezel, r.Min.Y+bezel, r.Max.X-bezel, r.Max.Y-bezel)
			drawLogoRoundClipped(base, c.logo, inner, radius-bezel)
			drawRectBorder(base, r, radius, color.NRGBA{R: 255, G: 255, B: 255, A: 38})
		case c.logo != nil:
			// Transparent mark centered on a contrasting tile.
			fill := color.NRGBA{R: 20, G: 22, B: 28, A: 235}
			border := color.NRGBA{R: 255, G: 255, B: 255, A: 30}
			if !c.dark {
				fill = color.NRGBA{R: 245, G: 246, B: 248, A: 240}
				border = color.NRGBA{R: 0, G: 0, B: 0, A: 28}
			}
			fillRoundedRect(base, r, radius, fill)
			drawRectBorder(base, r, radius, border)
			band := image.Rect(r.Min.X+padIn, r.Min.Y+(tileH-c.innerH)/2, r.Max.X-padIn, r.Min.Y+(tileH-c.innerH)/2+c.innerH)
			drawLogoScaled(base, c.logo, fitRect(c.logo.Bounds().Dx(), c.logo.Bounds().Dy(), band))
		default:
			// Text fallback chip.
			fillRoundedRect(base, r, radius, color.NRGBA{R: 20, G: 22, B: 28, A: 235})
			drawRectBorder(base, r, radius, color.NRGBA{R: 255, G: 255, B: 255, A: 30})
			ty := r.Min.Y + (tileH-(ascent+descent))/2 + ascent
			drawText(base, face, r.Min.X+textPadX, ty, color.NRGBA{R: 240, G: 240, B: 245, A: 255}, c.label)
		}
		x += c.w + gap
	}
}

// drawLogoScaled composites src into dst rectangle using CatmullRom
// resampling for sharp, high-quality scaling. Alpha is composited over
// the existing destination pixels.
func drawLogoScaled(dst *image.NRGBA, src *image.NRGBA, dstRect image.Rectangle) {
	if dstRect.Dx() <= 0 || dstRect.Dy() <= 0 || src.Bounds().Dx() <= 0 || src.Bounds().Dy() <= 0 {
		return
	}
	scaled := image.NewNRGBA(image.Rect(0, 0, dstRect.Dx(), dstRect.Dy()))
	xdraw.CatmullRom.Scale(scaled, scaled.Bounds(), src, src.Bounds(), xdraw.Over, nil)
	sb := scaled.Bounds()
	for py := dstRect.Min.Y; py < dstRect.Max.Y; py++ {
		sy := sb.Min.Y + (py - dstRect.Min.Y)
		for px := dstRect.Min.X; px < dstRect.Max.X; px++ {
			sx := sb.Min.X + (px - dstRect.Min.X)
			sp := scaled.NRGBAAt(sx, sy)
			if sp.A == 0 {
				continue
			}
			if !image.Pt(px, py).In(dst.Bounds()) {
				continue
			}
			if sp.A == 255 {
				dst.SetNRGBA(px, py, sp)
				continue
			}
			dp := dst.NRGBAAt(px, py)
			a := uint32(sp.A)
			ia := 255 - a
			dst.SetNRGBA(px, py, color.NRGBA{
				R: uint8((uint32(sp.R)*a + uint32(dp.R)*uint32(dp.A)*ia/255) / 255),
				G: uint8((uint32(sp.G)*a + uint32(dp.G)*uint32(dp.A)*ia/255) / 255),
				B: uint8((uint32(sp.B)*a + uint32(dp.B)*uint32(dp.A)*ia/255) / 255),
				A: uint8(a + uint32(dp.A)*ia/255),
			})
		}
	}
}

// drawLogoRoundClipped scales src to fill dstRect (src's aspect should already
// match dstRect's) and composites it clipped to the rounded rectangle, so a
// provider logo with a baked-in background reads as a clean "app-icon" tile.
func drawLogoRoundClipped(dst, src *image.NRGBA, dstRect image.Rectangle, radius int) {
	if dstRect.Dx() <= 0 || dstRect.Dy() <= 0 || src.Bounds().Dx() <= 0 || src.Bounds().Dy() <= 0 {
		return
	}
	scaled := image.NewNRGBA(image.Rect(0, 0, dstRect.Dx(), dstRect.Dy()))
	xdraw.CatmullRom.Scale(scaled, scaled.Bounds(), src, src.Bounds(), xdraw.Over, nil)
	for py := dstRect.Min.Y; py < dstRect.Max.Y; py++ {
		for px := dstRect.Min.X; px < dstRect.Max.X; px++ {
			cov, skip := cornerCoverage(px, py, dstRect, radius)
			if skip {
				continue
			}
			sp := scaled.NRGBAAt(px-dstRect.Min.X, py-dstRect.Min.Y)
			if sp.A == 0 {
				continue
			}
			a := sp.A
			if cov < 1 {
				a = uint8(float64(sp.A) * cov)
			}
			blendPixel(dst, px, py, color.NRGBA{R: sp.R, G: sp.G, B: sp.B, A: a})
		}
	}
}

// ── Genre badge ───────────────────────────────────────────────────────────────

// drawGenreBadge renders a genre pill at the bottom-left corner (or pos).
// Shows at most 3 genres separated by " · ".
// genreBadgeOpts carries the per-config genre-badge styling. Its zero value
// reproduces the original fixed appearance, so an unconfigured render is
// unchanged.
type genreBadgeOpts struct {
	scalePercent int // 0 = 100 (no extra scaling)
	offsetX      int // px nudge from the resolved corner
	offsetY      int
	bgOpacity    int     // 0 = default (200/255); else 1-100 mapped to alpha
	style        string  // "" | glass | square | plain | clean | tile
	tileColor    string  // "#RRGGBB" for the tile style
	borderWidth  float64 // px border on the tile; 0 = default hairline
}

// genreOptsFromConfig extracts the genre-badge styling from a resolved Config.
func genreOptsFromConfig(cfg imageconfig.Config) genreBadgeOpts {
	return genreBadgeOpts{
		scalePercent: cfg.GenreBadgeScale,
		offsetX:      cfg.GenreBadgeOffsetX,
		offsetY:      cfg.GenreBadgeOffsetY,
		bgOpacity:    cfg.GenreBadgeBackgroundOpacity,
		style:        cfg.GenreBadgeStyle,
		tileColor:    cfg.GenreBadgeTileAccentColor,
		borderWidth:  cfg.GenreBadgeBorderWidth,
	}
}

func drawGenreBadge(base *image.NRGBA, genres []string, pos string, scale float64, occ *occupancy, opts genreBadgeOpts) {
	if len(genres) == 0 {
		return
	}
	// A per-config scale multiplier (percent) rides on top of the output scale.
	if opts.scalePercent != 0 {
		scale *= float64(opts.scalePercent) / 100
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
	padX := s(10)
	padY := s(5)
	edgeX := s(12)
	edgeY := s(12)
	radius := s(5)

	fm := face.Metrics()
	ascent := fm.Ascent.Ceil()
	descent := fm.Descent.Ceil()
	bh := padY*2 + ascent + descent
	bw := padX*2 + textWidth(face, label)

	resolvedPos := pos
	if resolvedPos == "" || resolvedPos == "inherit" {
		resolvedPos = "bl"
	}

	r := occ.place(resolvedPos, bw, bh, edgeX, edgeY, s(7))
	// Manual offset nudge, applied after corner placement.
	if opts.offsetX != 0 || opts.offsetY != 0 {
		r = r.Add(image.Pt(opts.offsetX, opts.offsetY))
	}
	textColor := color.NRGBA{R: 225, G: 225, B: 228, A: 255}
	tx, ty := r.Min.X+padX, r.Min.Y+padY+ascent
	switch opts.style {
	case "plain":
		// No tile: draw the label with a dark shadow so it stays legible on any
		// background, matching v2's outlined "plain" treatment.
		drawText(base, face, tx+maxInt(1, s(1)), ty+maxInt(1, s(1)), color.NRGBA{R: 0, G: 0, B: 0, A: 180}, label)
		drawText(base, face, tx, ty, color.White, label)
		return
	case "tile":
		fill := color.NRGBA{R: 8, G: 9, B: 12, A: 235}
		if c, err := parseHexColor(opts.tileColor); opts.tileColor != "" && err == nil {
			c.A = 235
			fill = c
		}
		drawSoftTile(base, r, radius, tileChrome{fill: fill, shadow: color.NRGBA{R: 0, G: 0, B: 0, A: 70}})
		drawText(base, face, tx, ty, color.White, label)
		return
	}
	fill := color.NRGBA{R: 8, G: 9, B: 12, A: 200}
	if opts.bgOpacity != 0 {
		fill.A = uint8(opts.bgOpacity * 255 / 100)
	}
	border := color.NRGBA{R: 255, G: 255, B: 255, A: 28}
	borderW := 0
	if opts.borderWidth > 0 {
		// A configured border reads as a deliberate outline, so make it opaque
		// enough to see and scale its width with the output.
		border.A = 150
		borderW = maxInt(1, int(opts.borderWidth*scale+0.5))
	}
	drawSoftTile(base, r, radius, tileChrome{
		fill:        fill,
		border:      border,
		borderWidth: borderW,
		shadow:      color.NRGBA{R: 0, G: 0, B: 0, A: 70},
	})
	drawText(base, face, tx, ty, textColor, label)
}

// drawEditorialRating renders the magazine-style "editorial" presentation: the
// first genre in an accent color above a large average score, anchored top-left.
// It mirrors v2's editorial mode (e.g. "Crime" over "9.0").
func drawEditorialRating(base *image.NRGBA, ratings []provider.Rating, genres []string, cfg imageconfig.Config, scale float64, occ *occupancy) {
	avg, ok := ratingRingAverage(ratings, cfg.Ratings)
	if !ok {
		return
	}
	ensureFaces()
	s := func(v float64) int { return int(v*scale + 0.5) }
	x := base.Bounds().Min.X + s(16)
	y := base.Bounds().Min.Y + s(14)

	accent := color.NRGBA{R: 232, G: 146, B: 42, A: 255} // warm editorial orange
	if cfg.RatingRingColor != "" {
		if c, err := parseHexColor(cfg.RatingRingColor); err == nil {
			accent = c
		}
	}

	if len(genres) > 0 {
		gf := labelFaceFor(scale)
		gm := gf.Metrics()
		drawText(base, gf, x, y+gm.Ascent.Ceil(), accent, genres[0])
		y += gm.Height.Ceil() + s(2)
	}

	bigFace := valueFaceFor(scale * 2.4)
	bm := bigFace.Metrics()
	label := strconv.FormatFloat(avg, 'f', 1, 64)
	// Soft shadow for legibility on bright artwork, then the value.
	drawText(base, bigFace, x+maxInt(1, s(1)), y+bm.Ascent.Ceil()+maxInt(1, s(1)), color.NRGBA{A: 150}, label)
	drawText(base, bigFace, x, y+bm.Ascent.Ceil(), color.White, label)

	// Reserve the region so other overlays avoid it.
	occ.reserve(image.Rect(x, base.Bounds().Min.Y, x+s(120), y+bm.Height.Ceil()))
}

// ── Minimal / dual score pills ────────────────────────────────────────────────

// criticsSources are the professional-critic rating providers. Everything else
// (user/audience votes) is treated as an audience score by the dual split.
var criticsSources = map[string]bool{
	"rt": true, "metacritic": true, "rogerebert": true,
}

// splitCriticsAudience averages the allowed ratings into a critics score and an
// audience score, following the provider classification above. Sources with no
// value are skipped; ok flags report which halves have data.
func splitCriticsAudience(ratings []provider.Rating, allowed []string) (critics, audience float64, hasCritics, hasAudience bool) {
	allow := make(map[string]bool, len(allowed))
	for _, a := range allowed {
		allow[a] = true
	}
	var cs, as float64
	var cn, an int
	for _, r := range ratings {
		if len(allowed) > 0 && !allow[r.Source] {
			continue
		}
		if r.Value <= 0 {
			continue
		}
		if criticsSources[r.Source] {
			cs += r.Value
			cn++
		} else {
			as += r.Value
			an++
		}
	}
	if cn > 0 {
		critics = cs / float64(cn)
		hasCritics = true
	}
	if an > 0 {
		audience = as / float64(an)
		hasAudience = true
	}
	return
}

// scorePillHeight is the capsule height for the minimal/dual score pills at the
// given scale. Kept as a helper so top and bottom pills can be positioned before
// they are drawn.
func scorePillHeight(scale float64) int {
	ensureFaces()
	return valueFaceFor(scale*1.25).Metrics().Height.Ceil() + int(8*scale+0.5)
}

// drawScorePill draws a centered rounded capsule with an optional accent label
// segment ("CRITICS") followed by a score ("9.4"). cx is the horizontal centre;
// topY is the top edge. The drawn rect is reserved in occ when non-nil.
func drawScorePill(base *image.NRGBA, cx, topY int, label, score string, accent color.NRGBA, scale float64, occ *occupancy) {
	ensureFaces()
	s := func(v float64) int { return int(v*scale + 0.5) }
	labelFace := labelFaceFor(scale)
	valueFace := valueFaceFor(scale * 1.25)

	padX := s(12)
	innerGap := s(9)
	labelPad := s(9)
	capH := scorePillHeight(scale)

	labelW := 0
	if label != "" {
		labelW = textWidth(labelFace, label) + labelPad*2
	}
	scoreW := textWidth(valueFace, score)
	contentW := labelW + scoreW
	if label != "" {
		contentW += innerGap
	}
	capW := contentW + padX*2
	x0 := cx - capW/2
	rect := image.Rect(x0, topY, x0+capW, topY+capH)

	// Drop shadow, then the dark frosted capsule.
	shadow := rect.Add(image.Pt(0, s(2)))
	fillRoundedRect(base, shadow, capH/2, color.NRGBA{A: 90})
	fillRoundedRect(base, rect, capH/2, color.NRGBA{R: 22, G: 22, B: 26, A: 226})
	drawRectBorder(base, rect, capH/2, color.NRGBA{R: 255, G: 255, B: 255, A: 28})

	cursor := x0 + padX
	if label != "" {
		segInset := s(4)
		segRect := image.Rect(cursor, topY+segInset, cursor+labelW, topY+capH-segInset)
		fillRoundedRect(base, segRect, segRect.Dy()/2, accent)
		lm := labelFace.Metrics()
		ly := segRect.Min.Y + (segRect.Dy()-lm.Height.Ceil())/2 + lm.Ascent.Ceil()
		drawText(base, labelFace, cursor+labelPad, ly, color.White, label)
		cursor += labelW + innerGap
	}

	vm := valueFace.Metrics()
	vy := topY + (capH-vm.Height.Ceil())/2 + vm.Ascent.Ceil()
	drawText(base, valueFace, cursor+s(1), vy+s(1), color.NRGBA{A: 150}, score)
	drawText(base, valueFace, cursor, vy, color.White, score)

	if occ != nil {
		occ.reserve(rect)
	}
}

// drawMinimalRating shows a single centred pill with the overall average score
// at the top of the artwork. The pill carries no label segment, so it stays a
// clean dark capsule regardless of accent config.
func drawMinimalRating(base *image.NRGBA, ratings []provider.Rating, cfg imageconfig.Config, scale float64, occ *occupancy) {
	avg, ok := ratingRingAverage(ratings, cfg.Ratings)
	if !ok {
		return
	}
	b := base.Bounds()
	drawScorePill(base, b.Min.X+b.Dx()/2, b.Min.Y+int(14*scale+0.5),
		"", strconv.FormatFloat(avg, 'f', 1, 64), color.NRGBA{}, scale, occ)
}

// drawDualRating shows a critics pill at the top and an audience pill at the
// bottom, each an averaged score for its provider group.
func drawDualRating(base *image.NRGBA, ratings []provider.Rating, cfg imageconfig.Config, scale float64, occ *occupancy) {
	critics, audience, hasC, hasA := splitCriticsAudience(ratings, cfg.Ratings)
	b := base.Bounds()
	cx := b.Min.X + b.Dx()/2
	pad := int(14*scale + 0.5)
	criticsAccent := color.NRGBA{R: 39, G: 174, B: 96, A: 255}   // green
	audienceAccent := color.NRGBA{R: 52, G: 152, B: 219, A: 255} // blue
	if hasC {
		drawScorePill(base, cx, b.Min.Y+pad, "CRITICS",
			strconv.FormatFloat(critics, 'f', 1, 64), criticsAccent, scale, occ)
	}
	if hasA {
		topY := b.Max.Y - scorePillHeight(scale) - pad
		drawScorePill(base, cx, topY, "AUDIENCE",
			strconv.FormatFloat(audience, 'f', 1, 64), audienceAccent, scale, occ)
	}
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

	// The bar can average all allowed sources (overall) or just the critics /
	// audience half of them.
	var avg float64
	switch strings.ToLower(cfg.AggregateRatingSource) {
	case "critics":
		c, _, hasC, _ := splitCriticsAudience(ratings, cfg.Ratings)
		if !hasC {
			return
		}
		avg = c
	case "audience":
		_, a, _, hasA := splitCriticsAudience(ratings, cfg.Ratings)
		if !hasA {
			return
		}
		avg = a
	default:
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
		avg = sum / float64(n) // 0–10 scale
	}

	scale := outputScale(cfg.Size)
	barH := int(10*scale + 0.5)
	if barH < 4 {
		barH = 4
	}

	bounds := base.Bounds()
	w := bounds.Dx()

	var barY int
	pos := strings.ToLower(cfg.AggregateBarPos)
	// A positive offset nudges the bar inward from its edge; negative pushes it
	// toward (and off) the edge. Scaled with the output so it reads the same
	// across sizes.
	off := int(float64(cfg.AggregateBarOffset)*scale + 0.5)
	if pos == "top" {
		barY = bounds.Min.Y + off
	} else {
		barY = bounds.Max.Y - barH - off
	}

	trackColor := color.NRGBA{R: 0, G: 0, B: 0, A: 120}
	trackRect := image.Rect(bounds.Min.X, barY, bounds.Max.X, barY+barH)
	fillRect(base, trackRect, trackColor)

	// Resolve the three band colours up front (honouring overrides): the gradient
	// style needs all three, and the single fill picks one by score.
	lowT, highT := 5.0, 8.0
	if cfg.ScorebarLowThreshold > 0 {
		lowT = cfg.ScorebarLowThreshold
	}
	if cfg.ScorebarHighThreshold > 0 {
		highT = cfg.ScorebarHighThreshold
	}
	bandColor := func(override string, def color.NRGBA) color.NRGBA {
		if c, err := parseHexColor(override); override != "" && err == nil {
			c.A = 230
			return c
		}
		return def
	}
	lowC := bandColor(cfg.ScorebarLowColor, color.NRGBA{R: 192, G: 57, B: 43, A: 230})   // red
	midC := bandColor(cfg.ScorebarMidColor, color.NRGBA{R: 230, G: 126, B: 34, A: 230})  // amber
	highC := bandColor(cfg.ScorebarHighColor, color.NRGBA{R: 39, G: 174, B: 96, A: 230}) // green

	// A custom accent overrides the score-band colour for the single-fill styles.
	fillColor := highC
	switch {
	case cfg.AggregateAccentColor != "":
		if custom, err := parseHexColor(cfg.AggregateAccentColor); err == nil {
			custom.A = 230
			fillColor = custom
		}
	case avg >= highT:
		fillColor = highC
	case avg >= lowT:
		fillColor = midC
	default:
		fillColor = lowC
	}

	switch strings.ToLower(cfg.ScorebarStyle) {
	case "solid":
		// The whole bar carries the single score-band colour.
		fillRect(base, image.Rect(bounds.Min.X, barY, bounds.Max.X, barY+barH), fillColor)
	case "gradient":
		// A low→mid→high gradient runs the full width, independent of the score.
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			t := float64(x-bounds.Min.X) / float64(w)
			var c color.NRGBA
			if t < 0.5 {
				c = lerpColor(lowC, midC, t/0.5)
			} else {
				c = lerpColor(midC, highC, (t-0.5)/0.5)
			}
			fillRect(base, image.Rect(x, barY, x+1, barY+barH), c)
		}
	default: // progress — a partial fill proportional to the score
		fillW := int(float64(w) * (avg / 10.0))
		if fillW < 1 {
			fillW = 1
		}
		if fillW > w {
			fillW = w
		}
		fillRect(base, image.Rect(bounds.Min.X, barY, bounds.Min.X+fillW, barY+barH), fillColor)
	}
}

// lerpColor linearly interpolates between a and b by t in [0,1].
func lerpColor(a, b color.NRGBA, t float64) color.NRGBA {
	if t < 0 {
		t = 0
	} else if t > 1 {
		t = 1
	}
	mix := func(x, y uint8) uint8 { return uint8(float64(x) + (float64(y)-float64(x))*t) }
	return color.NRGBA{R: mix(a.R, b.R), G: mix(a.G, b.G), B: mix(a.B, b.B), A: mix(a.A, b.A)}
}

// ── Trending badge ────────────────────────────────────────────────────────────

// trendingStyle selects the composition of the trending badge: which accent
// glyph it carries and whether the "TRENDING" wordmark is shown.
type trendingStyle int

const (
	trendingArrowWord trendingStyle = iota // ↗ rising arrow + TRENDING
	trendingFlameWord                      // flame + TRENDING
	trendingWordOnly                       // TRENDING only
	trendingArrowOnly                      // ↗ rising arrow only
	trendingFlameOnly                      // flame only
)

// defaultTrendingStyle is the production composition for the trending badge.
const defaultTrendingStyle = trendingArrowWord

// trendingAccent is the warm orange used for the badge's glyph and hairline.
var trendingAccent = color.NRGBA{R: 255, G: 126, B: 42, A: 255}

func (t trendingStyle) hasIcon() bool { return t != trendingWordOnly }
func (t trendingStyle) hasLabel() bool {
	return t != trendingArrowOnly && t != trendingFlameOnly
}
func (t trendingStyle) isArrow() bool {
	return t == trendingArrowWord || t == trendingArrowOnly
}

// trendingStyleFromConfig maps the imageconfig enum to the internal draw style,
// falling back to the arrow+word default for empty or unknown values.
func trendingStyleFromConfig(s imageconfig.TrendingStyle) trendingStyle {
	switch s {
	case imageconfig.TrendingFlameWord:
		return trendingFlameWord
	case imageconfig.TrendingWord:
		return trendingWordOnly
	case imageconfig.TrendingArrow:
		return trendingArrowOnly
	case imageconfig.TrendingFlame:
		return trendingFlameOnly
	default:
		return trendingArrowWord
	}
}

// drawTrendingBadge draws a premium "TRENDING" pill at the top-left corner: a
// dark frosted capsule with a warm accent glyph, bold label, and a soft drop
// shadow. Placed via occ so it never overlaps other overlays.
func drawTrendingBadge(base *image.NRGBA, scale float64, occ *occupancy) {
	drawTrendingBadgeStyled(base, scale, occ, defaultTrendingStyle, "", "")
}

// drawTrendingBadgeStyled renders the trending badge in the given composition.
// The public drawTrendingBadge wraps it with defaultTrendingStyle; the extra
// seam lets the visual-preview harness render every option from one code path.
func drawTrendingBadgeStyled(base *image.NRGBA, scale float64, occ *occupancy, style trendingStyle, pos, textColor string) {
	if pos == "" {
		pos = "tl"
	}
	ensureFaces()
	face := badgeFaceFor(scale)
	if face == nil {
		return
	}

	const label = "TRENDING"

	s := func(v float64) int { return int(v*scale + 0.5) }
	padX := s(13)
	padY := s(7)
	edgeX := s(12)
	edgeY := s(12)
	iconGap := s(7)

	fm := face.Metrics()
	ascent := fm.Ascent.Ceil()
	descent := fm.Descent.Ceil()
	bh := padY*2 + ascent + descent
	glyphH := ascent

	// The arrow reads best in a near-square box; the flame is narrower.
	iconW := 0
	if style.hasIcon() {
		if style.isArrow() {
			iconW = int(float64(glyphH)*0.92 + 0.5)
		} else {
			iconW = s(12)
		}
	}
	tw := 0
	if style.hasLabel() {
		tw = textWidth(face, label)
	}

	bw := padX * 2
	if style.hasIcon() {
		bw += iconW
	}
	if style.hasIcon() && style.hasLabel() {
		bw += iconGap
	}
	bw += tw
	radius := bh / 2 // full capsule

	r := occ.place(pos, bw, bh, edgeX, edgeY, s(7))

	// Dark frosted capsule that matches the quality-badge tiles — understated,
	// not a loud bright pill. The warmth comes from the accent glyph, not the
	// fill, so it reads as a refined callout rather than an eyesore.
	off := maxInt(1, bh/12)
	fillRoundedRect(base, r.Add(image.Pt(0, off)), radius, color.NRGBA{R: 0, G: 0, B: 0, A: 105})
	fillRoundedRect(base, r, radius, color.NRGBA{R: 18, G: 20, B: 26, A: 233})
	drawRectBorder(base, r, radius, color.NRGBA{R: 255, G: 150, B: 92, A: 66}) // warm hairline

	// Warm accent glyph, vertically centered to the cap height.
	ax := r.Min.X + padX
	atop := r.Min.Y + (bh-glyphH)/2
	if style.hasIcon() {
		if style.isArrow() {
			halfW := math.Max(1.1, float64(glyphH)/8.5)
			fillTrendArrow(base, ax, atop, iconW, glyphH, halfW, trendingAccent)
		} else {
			fillFlameSharp(base, ax+iconW/2, atop, iconW/2, glyphH, trendingAccent)
		}
	}

	// Label in a warm off-white.
	if style.hasLabel() {
		tx := ax
		if style.hasIcon() {
			tx += iconW + iconGap
		}
		ty := r.Min.Y + padY + ascent
		labelCol := color.NRGBA{R: 255, G: 244, B: 238, A: 255}
		if c, err := parseHexColor(textColor); textColor != "" && err == nil {
			labelCol = c
		}
		drawText(base, face, tx, ty, labelCol, label)
	}
}

// ── Average rating ring ───────────────────────────────────────────────────────

// drawAverageRatingRing renders a circular progress ring in the configured
// corner. The ring shows the average of the selected rating sources as a
// progress arc coloured green/amber/red or a custom hex colour.
func drawAverageRatingRing(base *image.NRGBA, ratings []provider.Rating, cfg imageconfig.Config, scale float64, occ *occupancy) {
	if !cfg.RatingRing || len(ratings) == 0 || len(cfg.Ratings) == 0 {
		return
	}

	avg, ok := ratingRingAverage(ratings, cfg.Ratings)
	if !ok {
		return
	}

	// The centre value and the arc fill can each draw from a specific provider
	// instead of the overall average, so e.g. the number is IMDb while the fill
	// reflects the aggregate. Unset or "overall" keeps the average for both.
	value := avg
	if v, ok := ratingRingSourceValue(ratings, cfg.RingValueSource); ok {
		value = v
	}
	progress := avg
	if v, ok := ratingRingSourceValue(ratings, cfg.RingProgressSource); ok {
		progress = v
	}

	fillColor := ratingRingFillColor(value, cfg.RatingRingColor)

	s := func(v float64) int { return int(v*scale + 0.5) }
	edgeX := s(12)
	edgeY := s(12)

	pos := cfg.RatingRingPos
	if pos == "" {
		pos = "br"
	}

	ensureFaces()
	valueFace := valueFaceFor(scale * ringValueFontScale)

	outerR := s(32)
	// Place the ring's bounding box, dodging any overlay already reserved in
	// the requested corner (age/genre badges, provider chips, ratings strip).
	d := outerR * 2
	r := occ.place(pos, d, d, edgeX, edgeY, s(8))
	cx := r.Min.X + outerR
	cy := r.Min.Y + outerR
	label := strconv.Itoa(int(math.Round(value * 10)))
	drawProgressRing(base, cx, cy, outerR, progress/10.0, fillColor, valueFace, label, cfg.RingCenterOpacity)
}

// ratingRingSourceValue returns a specific provider's 0-10 value for the ring,
// or (0,false) when source is empty/"overall" (the caller keeps the average) or
// that provider has no value.
func ratingRingSourceValue(ratings []provider.Rating, source string) (float64, bool) {
	source = strings.ToLower(strings.TrimSpace(source))
	if source == "" || source == "overall" || source == "average" {
		return 0, false
	}
	for _, r := range ratings {
		if strings.ToLower(r.Source) == source && r.Value > 0 {
			return r.Value, true
		}
	}
	return 0, false
}

// ringValueFontScale shrinks the ring's value label relative to the standard
// badge value face so the digits sit comfortably inside the centre disk.
const ringValueFontScale = 0.85

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
// otherwise a five-band score palette (deep red → red → amber → lime → green).
func ratingRingFillColor(avg float64, hexColor string) color.NRGBA {
	if hexColor != "" {
		if c, err := parseHexColor(hexColor); err == nil {
			return c
		}
	}
	switch {
	case avg >= 8.5:
		return color.NRGBA{R: 22, G: 163, B: 74, A: 255} // #16a34a
	case avg >= 7.5:
		return color.NRGBA{R: 132, G: 204, B: 22, A: 255} // #84cc16
	case avg >= 6.0:
		return color.NRGBA{R: 245, G: 158, B: 11, A: 255} // #f59e0b
	case avg >= 4.0:
		return color.NRGBA{R: 220, G: 38, B: 38, A: 255} // #dc2626
	default:
		return color.NRGBA{R: 127, G: 29, B: 29, A: 255} // #7f1d1d
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

// drawProgressRing draws the score ring: a faint full-circle track, a glowing
// accent arc with rounded caps sweeping clockwise from the top, and a dark
// centre disk holding the value label. sweepFrac is in [0, 1]; near 100% the
// arc snaps to a seamless full circle so no cap seam shows.
func drawProgressRing(base *image.NRGBA, cx, cy, outerR int, sweepFrac float64, fillColor color.NRGBA, face font.Face, label string, centerOpacity int) {
	size := float64(outerR) * 2
	stroke := math.Max(7, size*0.11)
	halfW := stroke / 2
	ringR := (size - stroke) / 2 // arc stroke centreline radius
	diskR := ringR - stroke*0.38 // centre disk tucks just under the arc's inner edge

	trackColor := color.NRGBA{R: 255, G: 255, B: 255, A: 46}
	diskColor := color.NRGBA{R: 8, G: 11, B: 16, A: 219}
	if centerOpacity != 0 {
		diskColor.A = uint8(centerOpacity * 255 / 100)
	}

	// Two-layer halo around the arc — a wide soft wash plus a tight bright
	// core — so the accent reads as lit neon rather than a flat band.
	sigmaWide := math.Max(8, stroke*1.1)
	sigmaTight := math.Max(3, stroke*0.55)

	if sweepFrac < 0 {
		sweepFrac = 0
	}
	if sweepFrac > 1 {
		sweepFrac = 1
	}
	full := sweepFrac >= 0.995
	sweep := sweepFrac * 2 * math.Pi
	startAngle := -math.Pi / 2 // top

	endAngle := startAngle + sweep
	capStartX, capStartY := ringR*math.Cos(startAngle), ringR*math.Sin(startAngle)
	capEndX, capEndY := ringR*math.Cos(endAngle), ringR*math.Sin(endAngle)

	// The halo bleeds a little past the ring's bounding box; clip it to a
	// modest margin so it fades out instead of washing over neighbours.
	pad := int(math.Max(9, size*0.17)) + 1
	for py := cy - outerR - pad; py <= cy+outerR+pad; py++ {
		for px := cx - outerR - pad; px <= cx+outerR+pad; px++ {
			dx := float64(px-cx) + 0.5
			dy := float64(py-cy) + 0.5
			dist := math.Sqrt(dx*dx + dy*dy)

			// Track: faint full circle underneath everything.
			if cov := halfW + 0.5 - math.Abs(dist-ringR); cov > 0 {
				if cov > 1 {
					cov = 1
				}
				blendPixel(base, px, py, color.NRGBA{R: trackColor.R, G: trackColor.G, B: trackColor.B, A: uint8(float64(trackColor.A) * cov)})
			}

			// Distance from the arc's stroke centreline. Outside the swept
			// angle the nearest points are the cap centres, which is what
			// produces the rounded end caps.
			dArc := math.Inf(1)
			if sweepFrac > 0 {
				if full {
					dArc = math.Abs(dist - ringR)
				} else {
					rel := math.Atan2(dy, dx) - startAngle
					for rel < 0 {
						rel += 2 * math.Pi
					}
					if rel <= sweep {
						dArc = math.Abs(dist - ringR)
					} else {
						dArc = math.Min(math.Hypot(dx-capStartX, dy-capStartY), math.Hypot(dx-capEndX, dy-capEndY))
					}
				}
			}

			// Halo outside the stroke, drawn under the arc itself. The
			// amplitude sits just under a Gaussian-blurred stroke's edge
			// intensity (half the peak), keeping the halo subtle and the
			// arc itself crisp.
			if edge := dArc - halfW; edge > 0 {
				glow := 0.3 * (0.58*math.Exp(-edge*edge/(2*sigmaWide*sigmaWide)) +
					0.92*math.Exp(-edge*edge/(2*sigmaTight*sigmaTight)))
				if a := glow * float64(fillColor.A); a >= 1 {
					blendPixel(base, px, py, color.NRGBA{R: fillColor.R, G: fillColor.G, B: fillColor.B, A: uint8(a)})
				}
			}

			// Arc stroke with anti-aliased edges.
			if cov := halfW + 0.5 - dArc; cov > 0 {
				if cov > 1 {
					cov = 1
				}
				blendPixel(base, px, py, color.NRGBA{R: fillColor.R, G: fillColor.G, B: fillColor.B, A: uint8(float64(fillColor.A) * cov)})
			}

			// Centre disk sits over the arc's inner edge and its halo.
			if cov := diskR + 0.5 - dist; cov > 0 {
				if cov > 1 {
					cov = 1
				}
				blendPixel(base, px, py, color.NRGBA{R: diskColor.R, G: diskColor.G, B: diskColor.B, A: uint8(float64(diskColor.A) * cov)})
			}
		}
	}

	// Score label centered in the ring
	if face == nil || label == "" {
		return
	}
	tw := textWidth(face, label)
	fm := face.Metrics()
	ascent := fm.Ascent.Ceil()
	descent := fm.Descent.Ceil()
	tx := cx - tw/2
	ty := cy + (ascent-descent)/2
	drawText(base, face, tx, ty, color.NRGBA{R: 248, G: 250, B: 252, A: 255}, label)
}
