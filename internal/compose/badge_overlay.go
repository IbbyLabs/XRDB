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
	fill   color.NRGBA
	border color.NRGBA // zero alpha = no border
	shadow color.NRGBA // zero alpha = no shadow
}

// drawSoftTile draws a rounded "frosted" tile: an offset drop shadow, a fill,
// and an optional 1px border. Callers draw content inside r afterwards.
func drawSoftTile(base *image.NRGBA, r image.Rectangle, radius int, ch tileChrome) {
	if ch.shadow.A > 0 {
		off := maxInt(1, r.Dy()/18)
		fillRoundedRect(base, r.Add(image.Pt(0, off)), radius, ch.shadow)
	}
	fillRoundedRect(base, r, radius, ch.fill)
	if ch.border.A > 0 {
		drawRectBorder(base, r, radius, ch.border)
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
func drawQualityBadges(base *image.NRGBA, tokens []string, scale float64, occ *occupancy) int {
	if len(tokens) == 0 {
		return 0
	}
	tokens = dedupeQualityTokens(tokens)
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

		r := occ.place("tr", tileW, tileH, edgeX, edgeY, gap)
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
func drawAgeRatingBadge(base *image.NRGBA, rating string, pos string, scale float64, occ *occupancy) {
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
	drawSoftTile(base, r, radius, tileChrome{
		fill:   color.NRGBA{R: 22, G: 24, B: 30, A: 225},
		border: color.NRGBA{R: 235, G: 235, B: 240, A: 150},
		shadow: color.NRGBA{R: 0, G: 0, B: 0, A: 80},
	})
	drawText(base, face, r.Min.X+padX, r.Min.Y+padY+ascent, color.White, rating)
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
	bgOpacity    int // 0 = default (200/255); else 1-100 mapped to alpha
}

// genreOptsFromConfig extracts the genre-badge styling from a resolved Config.
func genreOptsFromConfig(cfg imageconfig.Config) genreBadgeOpts {
	return genreBadgeOpts{
		scalePercent: cfg.GenreBadgeScale,
		offsetX:      cfg.GenreBadgeOffsetX,
		offsetY:      cfg.GenreBadgeOffsetY,
		bgOpacity:    cfg.GenreBadgeBackgroundOpacity,
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
	fill := color.NRGBA{R: 8, G: 9, B: 12, A: 200}
	if opts.bgOpacity != 0 {
		fill.A = uint8(opts.bgOpacity * 255 / 100)
	}
	drawSoftTile(base, r, radius, tileChrome{
		fill:   fill,
		border: color.NRGBA{R: 255, G: 255, B: 255, A: 28},
		shadow: color.NRGBA{R: 0, G: 0, B: 0, A: 70},
	})
	drawText(base, face, r.Min.X+padX, r.Min.Y+padY+ascent, color.NRGBA{R: 225, G: 225, B: 228, A: 255}, label)
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
		fillColor = color.NRGBA{R: 39, G: 174, B: 96, A: 230} // green
	case avg >= 5.0:
		fillColor = color.NRGBA{R: 230, G: 126, B: 34, A: 230} // amber
	default:
		fillColor = color.NRGBA{R: 192, G: 57, B: 43, A: 230} // red
	}

	fillRect(base, image.Rect(bounds.Min.X, barY, bounds.Min.X+fillW, barY+barH), fillColor)
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
	drawTrendingBadgeStyled(base, scale, occ, defaultTrendingStyle)
}

// drawTrendingBadgeStyled renders the trending badge in the given composition.
// The public drawTrendingBadge wraps it with defaultTrendingStyle; the extra
// seam lets the visual-preview harness render every option from one code path.
func drawTrendingBadgeStyled(base *image.NRGBA, scale float64, occ *occupancy, style trendingStyle) {
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

	r := occ.place("tl", bw, bh, edgeX, edgeY, s(7))

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
		drawText(base, face, tx, ty, color.NRGBA{R: 255, G: 244, B: 238, A: 255}, label)
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

	fillColor := ratingRingFillColor(avg, cfg.RatingRingColor)

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
	label := strconv.Itoa(int(math.Round(avg * 10)))
	drawProgressRing(base, cx, cy, outerR, avg/10.0, fillColor, valueFace, label)
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
func drawProgressRing(base *image.NRGBA, cx, cy, outerR int, sweepFrac float64, fillColor color.NRGBA, face font.Face, label string) {
	size := float64(outerR) * 2
	stroke := math.Max(7, size*0.11)
	halfW := stroke / 2
	ringR := (size - stroke) / 2 // arc stroke centreline radius
	diskR := ringR - stroke*0.38 // centre disk tucks just under the arc's inner edge

	trackColor := color.NRGBA{R: 255, G: 255, B: 255, A: 46}
	diskColor := color.NRGBA{R: 8, G: 11, B: 16, A: 219}

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
