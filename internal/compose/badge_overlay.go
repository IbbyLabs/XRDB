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
	borderGlow  bool        // bloom the border outward instead of a hard edge
	// borderGlowStrength is 0-100; 0 = the built-in default reach and intensity.
	borderGlowStrength int
	shadow             color.NRGBA // zero alpha = no shadow
}

// shadowAlphaPerRow is the largest alpha a tile shadow may drop in one row.
const shadowAlphaPerRow = 16

// drawTileShadow draws a drop shadow below r, fading to nothing over its last
// rows. Zero alpha draws nothing.
func drawTileShadow(base *image.NRGBA, r image.Rectangle, radius int, col color.NRGBA) {
	if col.A == 0 {
		return
	}
	body := r.Add(image.Pt(0, maxInt(1, r.Dy()/18)))
	blendRoundedRect(base, body, radius, col)

	// The fade takes its width from the same rect shifted below the body, so the
	// bottom arcs keep their shape as the alpha falls away. Every row drops by
	// col.A/(feather+1), so a darker shadow needs more rows to land on the same
	// step as a fainter one.
	feather := maxInt(maxInt(3, int(col.A)/shadowAlphaPerRow), r.Dy()/12)
	smear := body.Add(image.Pt(0, feather)).Intersect(base.Bounds())
	for k := 0; k < feather; k++ {
		y := body.Max.Y + k
		if y < smear.Min.Y || y >= smear.Max.Y {
			continue
		}
		a := float64(col.A) * float64(feather-k) / float64(feather+1)
		for x := smear.Min.X; x < smear.Max.X; x++ {
			cov, skip := cornerCoverage(x, y, smear, radius)
			if skip {
				continue
			}
			blendPixel(base, x, y, color.NRGBA{R: col.R, G: col.G, B: col.B, A: uint8(a * cov)})
		}
	}
}

// drawSoftTile draws a rounded "frosted" tile: a drop shadow, a fill, and an
// optional border (1px by default, thicker via borderWidth). Callers draw
// content inside r afterwards.
func drawSoftTile(base *image.NRGBA, r image.Rectangle, radius int, ch tileChrome) {
	drawTileShadow(base, r, radius, ch.shadow)
	// A translucent fill has to composite over the artwork. Writing the pixel
	// outright discarded what was underneath, so lowering the opacity darkened
	// the badge towards black instead of letting the poster through.
	if ch.fill.A < 255 {
		blendRoundedRect(base, r, radius, ch.fill)
	} else {
		fillRoundedRect(base, r, radius, ch.fill)
	}
	if ch.border.A > 0 {
		strokeRoundedBorder(base, r, radius, ch.borderWidth, ch.border, ch.borderGlow, ch.borderGlowStrength)
	}
}

const (
	// strokeBloomRings and strokeBloomAlpha are the default reach and intensity
	// of a bloomed border.
	strokeBloomRings = 4
	strokeBloomAlpha = 0.55
	// strokeBloomDefaultStrength is the dial position the defaults correspond
	// to, so a strength set to it renders exactly as an unset one.
	strokeBloomDefaultStrength = 50
	strokeBloomMaxRings        = 12
)

// bloomFor resolves a 0-100 strength to a reach and an intensity. Zero means
// the built-in default, as it does for every other 0-100 key here.
//
// Both move together: alpha alone at a fixed reach reads as a fatter smudge
// rather than as more glow.
func bloomFor(strength int) (rings int, alpha float64) {
	if strength <= 0 {
		return strokeBloomRings, strokeBloomAlpha
	}
	f := float64(strength) / strokeBloomDefaultStrength
	rings = int(math.Round(float64(strokeBloomRings) * f))
	if rings < 1 {
		rings = 1
	}
	if rings > strokeBloomMaxRings {
		rings = strokeBloomMaxRings
	}
	if alpha = strokeBloomAlpha * f; alpha > 1 {
		alpha = 1
	}
	return rings, alpha
}

// strokeRoundedBorder draws a rounded-rect border, thickening inward with
// concentric 1px strokes so the corners stay rounded. A bloom adds fainter
// strokes outward from the edge, so a tinted border reads as a halo around the
// badge rather than a thicker line.
func strokeRoundedBorder(dst *image.NRGBA, r image.Rectangle, radius, width int, col color.NRGBA, bloom bool, strength int) {
	if bloom {
		rings, intensity := bloomFor(strength)
		for i := 1; i <= rings; i++ {
			d := float64(i) / float64(rings+1)
			c := col
			c.A = uint8(float64(col.A) * (1 - d) * intensity)
			if c.A == 0 {
				continue
			}
			drawRectBorder(dst, r.Inset(-i), radius+i, c)
		}
	}
	for i := 0; i < maxInt(1, width); i++ {
		rr := r.Inset(i)
		if rr.Dx() <= 0 || rr.Dy() <= 0 {
			break
		}
		drawRectBorder(dst, rr, maxInt(0, radius-i), col)
	}
}

// contrastingInk picks dark or light text for a filled badge body.
func contrastingInk(bg color.NRGBA) color.NRGBA {
	lum := (0.299*float64(bg.R) + 0.587*float64(bg.G) + 0.114*float64(bg.B)) / 255
	if lum > 0.6 {
		return color.NRGBA{R: 18, G: 18, B: 24, A: 255}
	}
	return color.NRGBA{R: 255, G: 255, B: 255, A: 255}
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
	case "hd":
		return "HD"
	case "bluray":
		return "BLU-RAY"
	case "remux":
		return "REMUX"
	case "bdremux":
		return "BD REMUX"
	default:
		// Anything else is not a quality badge. Drawing its name in capitals is
		// how a token that stood for some other feature ends up printed across
		// the artwork, so it is left out instead.
		return ""
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
	accent, accentErr := parseHexColor(opts.tileColor)
	hasAccent := opts.tileColor != "" && accentErr == nil
	switch opts.style {
	case "tile":
		if hasAccent {
			accent.A = 220
			chrome.fill = accent
		}
	case "plain":
		// A lighter, near-transparent tile so the white logos and text stay
		// legible without the full frosted chrome.
		chrome.fill.A = 70
		chrome.border.A = 60
		if hasAccent {
			chrome.border = color.NRGBA{R: accent.R, G: accent.G, B: accent.B, A: chrome.border.A}
		}
	case "square":
		// Sharp corners, frosted chrome otherwise.
		radius = 0
		if hasAccent {
			chrome.border = color.NRGBA{R: accent.R, G: accent.G, B: accent.B, A: chrome.border.A}
		}
	case "pill":
		// A fully rounded capsule.
		radius = tileH / 2
		if hasAccent {
			chrome.border = color.NRGBA{R: accent.R, G: accent.G, B: accent.B, A: chrome.border.A}
		}
	case "glass":
		// A lighter, more translucent body under a brighter edge, so it reads as
		// frosted glass rather than the solid default plate.
		chrome.fill = color.NRGBA{R: 40, G: 44, B: 54, A: 120}
		chrome.border = color.NRGBA{R: 255, G: 255, B: 255, A: 96}
		if hasAccent {
			chrome.border = color.NRGBA{R: accent.R, G: accent.G, B: accent.B, A: 200}
		}
	case "clean":
		// No border or shadow and only a whisper of fill, so the marks sit nearly
		// on the artwork itself.
		chrome.fill.A = 40
		chrome.border.A = 0
		chrome.shadow.A = 0
		if hasAccent {
			chrome.fill = color.NRGBA{R: accent.R, G: accent.G, B: accent.B, A: 48}
		}
	default:
		// The frosted default keeps its own fixed fill, but the hairline border
		// answers the same accent the tile style's fill does.
		if hasAccent {
			chrome.border = color.NRGBA{R: accent.R, G: accent.G, B: accent.B, A: chrome.border.A}
		}
	}

	type tile struct {
		logo  *image.NRGBA
		label string
		w     int
	}
	tiles := make([]tile, 0, len(tokens))
	for _, tok := range tokens {
		t := tile{logo: badgeLogos[strings.ToLower(tok)]}
		var contentW int
		if t.logo != nil {
			lb := t.logo.Bounds()
			contentW = int(float64(lb.Dx())*float64(logoH)/float64(lb.Dy()) + 0.5)
		} else {
			t.label = qualityBadgeLabel(tok)
			if t.label == "" {
				continue
			}
			contentW = textWidth(face, t.label)
		}
		t.w = padX*2 + contentW
		tiles = append(tiles, t)
	}

	paint := func(t tile, r image.Rectangle) {
		drawSoftTile(base, r, radius, chrome)
		if t.logo != nil {
			lb := t.logo.Bounds()
			band := image.Rect(r.Min.X+padX, r.Min.Y+(tileH-logoH)/2, r.Max.X-padX, r.Min.Y+(tileH-logoH)/2+logoH)
			drawLogoScaled(base, t.logo, fitRect(lb.Dx(), lb.Dy(), band))
			return
		}
		tx := r.Min.X + padX
		ty := r.Min.Y + (tileH-(ascent+descent))/2 + ascent
		drawText(base, face, tx, ty, color.White, t.label)
	}

	// Centre anchors lay out as a row: per-tile placement puts every tile on the
	// same x, which collision resolution stacks into a column.
	if pos == "tc" || pos == "bc" {
		availW := base.Bounds().Dx() - edgeX*2
		var rows [][]tile
		for i := 0; i < len(tiles); {
			w, n := tiles[i].w, 1
			for i+n < len(tiles) && w+gap+tiles[i+n].w <= availW {
				w += gap + tiles[i+n].w
				n++
			}
			rows = append(rows, tiles[i:i+n])
			i += n
		}
		// Rows stack away from their edge, so a bottom anchor is filled last row
		// first to keep the first row topmost.
		for k := range rows {
			row := rows[k]
			if pos == "bc" {
				row = rows[len(rows)-1-k]
			}
			w := -gap
			for _, t := range row {
				w += gap + t.w
			}
			r := occ.placeNudged(pos, w, tileH, edgeX, edgeY, gap, opts.offsetX, opts.offsetY)
			x := r.Min.X
			for _, t := range row {
				paint(t, image.Rect(x, r.Min.Y, x+t.w, r.Min.Y+tileH))
				x += t.w + gap
			}
		}
		return len(tiles)
	}

	for _, t := range tiles {
		paint(t, occ.placeNudged(pos, t.w, tileH, edgeX, edgeY, gap, opts.offsetX, opts.offsetY))
	}
	return len(tiles)
}

// ── Age rating badge ──────────────────────────────────────────────────────────

// drawAgeRatingBadge renders a content rating badge (e.g. "TV-MA", "R")
// in the corner specified by pos ("tl", "tr", "bl", "br", "inherit").
// "inherit" defaults to "br" so it does not conflict with the trending badge (TL)
// or quality badges (TR).
// ageRatingOpts carries the age-rating badge styling. Zero value = default.
type ageRatingOpts struct {
	style        string // "" | glass | plain | tile | silver | square | media
	tileColor    string // "#RRGGBB"; fills the tile style, tints the border on glass/square/silver
	offsetX      int
	offsetY      int
	scale        int    // percent; 0 = 100
	outlineColor string // "#RRGGBB" outline for the plain style; "" = drop shadow
	outlineWidth int    // px outline width for the plain style; 0 = 1
	outlineGlow  bool   // fade the outline outward instead of a hard edge

	bgOpacity     int     // 0-100; 0 = the style's own
	borderWidth   float64 // px; 0 = the style's own, <0 = no border
	borderColor   string  // "#RRGGBB"; "" = the style's own
	borderOpacity int     // 0-100; 0 = the style's own
	labelColor    string  // "#RRGGBB"; "" = the style's own
}

// applyAgeChrome lays the styling controls over whatever the chosen style built.
// Both the standard plate and the taller media plate go through here, so a
// control cannot reach one and miss the other.
func applyAgeChrome(ch tileChrome, textCol color.NRGBA, opts ageRatingOpts, scale float64) (tileChrome, color.NRGBA) {
	if opts.bgOpacity > 0 {
		ch.fill.A = uint8(opts.bgOpacity * 255 / 100)
	}
	if c, err := parseHexColor(opts.borderColor); opts.borderColor != "" && err == nil {
		ch.border = color.NRGBA{R: c.R, G: c.G, B: c.B, A: ch.border.A}
		if ch.border.A == 0 {
			ch.border.A = 255
		}
	}
	if opts.borderOpacity > 0 {
		ch.border.A = uint8(opts.borderOpacity * 255 / 100)
	}
	switch {
	case opts.borderWidth < 0:
		ch.border = color.NRGBA{}
	case opts.borderWidth > 0:
		ch.borderWidth = maxInt(1, int(opts.borderWidth*scale+0.5))
		if ch.border.A == 0 {
			ch.border = color.NRGBA{R: 235, G: 235, B: 240, A: 150}
		}
	}
	if c, err := parseHexColor(opts.labelColor); opts.labelColor != "" && err == nil {
		textCol = color.NRGBA{R: c.R, G: c.G, B: c.B, A: textCol.A}
	}
	return ch, textCol
}

func ageOptsFromConfig(cfg imageconfig.Config) ageRatingOpts {
	return ageRatingOpts{style: cfg.AgeRatingBadgeStyle, tileColor: cfg.AgeRatingTileColor,
		offsetX: cfg.AgeRatingOffsetX, offsetY: cfg.AgeRatingOffsetY, scale: cfg.AgeRatingScale,
		outlineColor: cfg.NoBackgroundBadgeOutlineColor, outlineWidth: cfg.NoBackgroundBadgeOutlineWidth,
		outlineGlow: cfg.NoBackgroundBadgeOutlineGlow,
		bgOpacity:   cfg.AgeRatingBackgroundOpacity, borderWidth: cfg.AgeRatingBorderWidth,
		borderColor: cfg.AgeRatingBorderColor, borderOpacity: cfg.AgeRatingBorderOpacity,
		labelColor: cfg.AgeRatingLabelColor}
}

func drawAgeRatingBadge(base *image.NRGBA, rating string, pos string, scale float64, occ *occupancy, opts ageRatingOpts) {
	if rating == "" {
		return
	}
	if opts.scale > 0 {
		scale *= float64(opts.scale) / 100
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

	// The "media" certification plate is a two-line badge — an "AGE" kicker over
	// the value — so it needs its own taller geometry placed before the others.
	if opts.style == "media" {
		ef := eyebrowFaceFor(scale)
		efm := ef.Metrics()
		eAsc, eDesc := efm.Ascent.Ceil(), efm.Descent.Ceil()
		gap := s(2)
		bhM := padY*2 + eAsc + eDesc + gap + ascent + descent
		bwM := maxInt(padX*2+textWidth(face, rating), padX*2+textWidth(ef, "AGE"))
		r := occ.placeNudged(resolvedPos, bwM, bhM, edgeX, edgeY, s(7), opts.offsetX, opts.offsetY)
		mediaChrome, mediaText := applyAgeChrome(tileChrome{
			fill:   color.NRGBA{R: 17, G: 24, B: 39, A: 214},
			border: color.NRGBA{R: 255, G: 247, B: 237, A: 240},
			shadow: color.NRGBA{R: 0, G: 0, B: 0, A: 90},
		}, color.NRGBA{R: 255, G: 250, B: 245, A: 255}, opts, scale)
		drawSoftTile(base, r, s(6), mediaChrome)
		// A thin sheen along the very top edge of the plate.
		hlInset := s(3)
		fillRect(base, image.Rect(r.Min.X+hlInset, r.Min.Y+hlInset,
			r.Max.X-hlInset, r.Min.Y+bhM*16/100), color.NRGBA{R: 255, G: 255, B: 255, A: 16})
		cx := r.Min.X + bwM/2
		eyebrowCol := color.NRGBA{R: 255, G: 250, B: 245, A: 220}
		valueCol := mediaText
		ey := r.Min.Y + padY + eAsc
		// A soft shadow keeps the kicker legible over the sheen.
		drawText(base, ef, cx-textWidth(ef, "AGE")/2+1, ey+1, color.NRGBA{A: 150}, "AGE")
		drawText(base, ef, cx-textWidth(ef, "AGE")/2, ey, eyebrowCol, "AGE")
		vy := ey + eDesc + gap + ascent
		drawText(base, face, cx-textWidth(face, rating)/2, vy, valueCol, rating)
		return
	}

	r := occ.placeNudged(resolvedPos, bw, bh, edgeX, edgeY, s(7), opts.offsetX, opts.offsetY)
	tx, ty := r.Min.X+padX, r.Min.Y+padY+ascent
	if opts.style == "plain" {
		// The plain style answers the same outline controls the other plain
		// badges do. Without one it keeps its drop shadow.
		if c, err := parseHexColor(opts.outlineColor); opts.outlineColor != "" && err == nil {
			w := opts.outlineWidth
			if w <= 0 {
				w = 1
			}
			drawLabelOutlined(base, face, tx, ty, color.White, c, maxInt(1, s(float64(w))), opts.outlineGlow, rating)
			return
		}
		drawText(base, face, tx+maxInt(1, s(1)), ty+maxInt(1, s(1)), color.NRGBA{R: 0, G: 0, B: 0, A: 180}, rating)
		drawText(base, face, tx, ty, color.White, rating)
		return
	}
	chrome := tileChrome{
		fill:   color.NRGBA{R: 22, G: 24, B: 30, A: 225},
		border: color.NRGBA{R: 235, G: 235, B: 240, A: 150},
		shadow: color.NRGBA{R: 0, G: 0, B: 0, A: 80},
	}
	textCol := color.NRGBA{R: 255, G: 255, B: 255, A: 255}
	if opts.style == "silver" {
		// A light bordered plate with an almost-transparent fill and silver text.
		chrome.fill = color.NRGBA{R: 20, G: 22, B: 28, A: 45}
		chrome.border = color.NRGBA{R: 244, G: 244, B: 245, A: 230}
		textCol = color.NRGBA{R: 244, G: 244, B: 245, A: 245}
	}
	if opts.style == "tile" {
		// A tile is a solid borderless plate, whether or not a colour was named.
		// Deriving it only from the colour left the style identical to glass until
		// a second setting was found, so picking it appeared to do nothing.
		chrome.fill = color.NRGBA{R: 22, G: 24, B: 30, A: 235}
		chrome.border = color.NRGBA{}
		if c, err := parseHexColor(opts.tileColor); opts.tileColor != "" && err == nil {
			c.A = 235
			chrome.fill = c
		}
	} else if c, err := parseHexColor(opts.tileColor); opts.tileColor != "" && err == nil {
		// Every bordered style (glass, square, silver) answers the same accent
		// the tile style's fill does, tinting its own border instead.
		chrome.border = color.NRGBA{R: c.R, G: c.G, B: c.B, A: chrome.border.A}
	}
	chrome, textCol = applyAgeChrome(chrome, textCol, opts, scale)
	rad := radius
	if opts.style == "square" {
		rad = 0 // sharp-cornered tile
	}
	drawSoftTile(base, r, rad, chrome)
	drawText(base, face, tx, ty, textCol, rating)
}

// releaseStatusLabel maps a title's release state to its badge label and accent.
// An unrecognised state draws nothing.
func releaseStatusLabel(status string) (string, color.NRGBA, bool) {
	switch status {
	case "digital":
		return "DIGITAL RELEASE", color.NRGBA{R: 56, G: 189, B: 248, A: 255}, true
	case "cinemas":
		return "IN CINEMAS", color.NRGBA{R: 249, G: 115, B: 22, A: 255}, true
	}
	return "", color.NRGBA{}, false
}

// releaseStatusOpts carries the release-status badge styling. Zero value keeps
// the accent-bordered plate the badge has always drawn.
type releaseStatusOpts struct {
	scalePercent int
	offsetX      int
	offsetY      int
	style        string // "" | glass | square | plain | tile | silver
	tileColor    string // "#RRGGBB"; fills the tile style, tints the border on glass/square/silver
	outlineColor string // "#RRGGBB" outline for the plain style; "" = drop shadow
	outlineWidth int    // px outline width for the plain style; 0 = 1
	outlineGlow  bool   // fade the outline outward instead of a hard edge
}

func releaseStatusOptsFromConfig(cfg imageconfig.Config) releaseStatusOpts {
	return releaseStatusOpts{scalePercent: cfg.ReleaseStatusScale, offsetX: cfg.ReleaseStatusOffsetX, offsetY: cfg.ReleaseStatusOffsetY,
		style: cfg.ReleaseStatusBadgeStyle, tileColor: cfg.ReleaseStatusTileColor,
		outlineColor: cfg.NoBackgroundBadgeOutlineColor, outlineWidth: cfg.NoBackgroundBadgeOutlineWidth,
		outlineGlow: cfg.NoBackgroundBadgeOutlineGlow}
}

// drawReleaseStatusBadge marks whether a title is in cinemas or out on digital.
func drawReleaseStatusBadge(base *image.NRGBA, status string, pos string, scale float64, occ *occupancy, opts releaseStatusOpts) {
	label, accent, ok := releaseStatusLabel(status)
	if !ok {
		return
	}
	if opts.scalePercent != 0 {
		scale *= float64(opts.scalePercent) / 100
	}
	ensureFaces()
	face := labelFaceFor(scale)
	if face == nil {
		return
	}

	s := func(v float64) int { return int(v*scale + 0.5) }
	padX, padY := s(9), s(5)

	fm := face.Metrics()
	ascent, descent := fm.Ascent.Ceil(), fm.Descent.Ceil()
	bh := padY*2 + ascent + descent
	bw := padX*2 + textWidth(face, label)

	resolvedPos := pos
	if resolvedPos == "" || resolvedPos == "inherit" {
		resolvedPos = "tr"
	}

	r := occ.placeNudged(resolvedPos, bw, bh, s(12), s(12), s(7), opts.offsetX, opts.offsetY)
	tx, ty := r.Min.X+padX, r.Min.Y+padY+ascent

	if opts.style == "plain" {
		// The plain style answers the same outline controls the other plain
		// badges do. Without one it keeps its drop shadow.
		if c, err := parseHexColor(opts.outlineColor); opts.outlineColor != "" && err == nil {
			w := opts.outlineWidth
			if w <= 0 {
				w = 1
			}
			drawLabelOutlined(base, face, tx, ty, accent, c, maxInt(1, s(float64(w))), opts.outlineGlow, label)
			return
		}
		drawText(base, face, tx+maxInt(1, s(1)), ty+maxInt(1, s(1)), color.NRGBA{R: 0, G: 0, B: 0, A: 180}, label)
		drawText(base, face, tx, ty, accent, label)
		return
	}

	border := accent
	border.A = 220
	chrome := tileChrome{
		fill:   color.NRGBA{R: 10, G: 12, B: 18, A: 225},
		border: border,
		shadow: color.NRGBA{R: 0, G: 0, B: 0, A: 80},
	}
	textCol := accent
	switch opts.style {
	case "silver":
		chrome.fill = color.NRGBA{R: 20, G: 22, B: 28, A: 45}
		chrome.border = color.NRGBA{R: 244, G: 244, B: 245, A: 230}
		textCol = color.NRGBA{R: 244, G: 244, B: 245, A: 245}
	case "tile":
		if c, err := parseHexColor(opts.tileColor); opts.tileColor != "" && err == nil {
			c.A = 235
			chrome.fill = c
			chrome.border = color.NRGBA{}
			textCol = color.NRGBA{R: 255, G: 255, B: 255, A: 255}
		}
	}
	if opts.style != "tile" {
		// Every bordered style (glass, square, silver) answers the same accent
		// the tile style's fill does, tinting its own border instead.
		if c, err := parseHexColor(opts.tileColor); opts.tileColor != "" && err == nil {
			chrome.border = color.NRGBA{R: c.R, G: c.G, B: c.B, A: chrome.border.A}
		}
	}
	radius := s(5)
	if opts.style == "square" {
		radius = 0
	}
	drawSoftTile(base, r, radius, chrome)
	drawText(base, face, tx, ty, textCol, label)
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
// providerBadgeOpts carries per-config streaming-chip styling. Its zero value
// keeps the original look: a strip centred along the bottom edge, unscaled.
type providerBadgeOpts struct {
	pos          string // "" = the centred bottom strip
	scalePercent int    // 0 = 100
	offsetX      int
	offsetY      int
	tileColor    string // "#RRGGBB" behind the chips
}

func providerOptsFromConfig(cfg imageconfig.Config) providerBadgeOpts {
	return providerBadgeOpts{
		pos:          cfg.ProvidersPos,
		scalePercent: cfg.ProviderBadgeScale,
		offsetX:      cfg.ProviderBadgeOffsetX,
		offsetY:      cfg.ProviderBadgeOffsetY,
		tileColor:    cfg.NetworkTileColor,
	}
}

func drawProviderBadges(base *image.NRGBA, providers []provider.WatchProvider, scale float64, occ *occupancy, opts providerBadgeOpts) {
	if len(providers) == 0 {
		return
	}
	if opts.scalePercent != 0 {
		scale *= float64(opts.scalePercent) / 100
	}
	tileColor := opts.tileColor
	ensureFaces()
	face := labelFaceFor(scale)
	if face == nil {
		return
	}

	// An optional custom tile colour behind the chips.
	netTile, hasNetTile := color.NRGBA{}, false
	if c, err := parseHexColor(tileColor); tileColor != "" && err == nil {
		netTile, hasNetTile = c, true
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
	// Unplaced it keeps the wide centred strip, which is not one of the six
	// anchors; a chosen position hands it to the shared corner placement.
	// The centred and corner forms both reserve what they hand back, so exactly
	// one of them runs.
	var strip image.Rectangle
	if opts.pos == "" {
		strip = occ.placeCenteredNudged(totalW, tileH, edgeX, edgeY, s(8), opts.offsetX, opts.offsetY)
	} else {
		strip = occ.placeNudged(opts.pos, totalW, tileH, edgeX, edgeY, s(8), opts.offsetX, opts.offsetY)
	}
	x, y := strip.Min.X, strip.Min.Y

	shadow := color.NRGBA{R: 0, G: 0, B: 0, A: 80}
	for _, c := range chips {
		r := image.Rect(x, y, x+c.w, y+tileH)
		drawTileShadow(base, r, radius, shadow)

		switch {
		case c.baked:
			// Logo fills the tile as a rounded app-icon; a neutral backing
			// shows through any internal transparency, and corners are clipped.
			bakedFill := color.NRGBA{R: 18, G: 20, B: 26, A: 255}
			if hasNetTile {
				bakedFill = color.NRGBA{R: netTile.R, G: netTile.G, B: netTile.B, A: 255}
			}
			fillRoundedRect(base, r, radius, bakedFill)
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
			if hasNetTile {
				fill = color.NRGBA{R: netTile.R, G: netTile.G, B: netTile.B, A: 235}
			}
			blendRoundedRect(base, r, radius, fill)
			drawRectBorder(base, r, radius, border)
			band := image.Rect(r.Min.X+padIn, r.Min.Y+(tileH-c.innerH)/2, r.Max.X-padIn, r.Min.Y+(tileH-c.innerH)/2+c.innerH)
			drawLogoScaled(base, c.logo, fitRect(c.logo.Bounds().Dx(), c.logo.Bounds().Dy(), band))
		default:
			// Text fallback chip.
			textFill := color.NRGBA{R: 20, G: 22, B: 28, A: 235}
			if hasNetTile {
				textFill = color.NRGBA{R: netTile.R, G: netTile.G, B: netTile.B, A: 235}
			}
			blendRoundedRect(base, r, radius, textFill)
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
	mode         string  // "" | text | icon | both; icon modes label by genre family
	isAnime      bool    // the title matched the anime ID mapping
	grouping     string  // "" | split | animation | secondary
	style        string  // "" | glass | square | pill | plain | clean | tile
	tileColor    string  // "#RRGGBB" for the tile style
	borderWidth  float64 // px border on the tile; 0 = default hairline
	outlineColor string  // "#RRGGBB" outline for the plain style; "" = default shadow
	outlineWidth int     // px outline width for the plain style; 0 = default
	outlineGlow  bool    // fade the outline outward instead of a hard edge
	accent       string  // "" | left | top | none; where the accent sits on the plate
	labelMode    string  // "" | list | primary | family; primary prints the first genre alone
	labelCase    string  // "" | upper | normal; "" keeps what each label mode did alone
	maxGenres    int     // cap on how many genres the list names; 0 = fit decides
	shortNames   bool    // rename the long genres to their short forms
	// One accent used to reach the label and the border together. These aim it
	// per element and fall back to tileColor, so an existing config is unchanged.
	labelColor       string // "#RRGGBB"; "" = the family accent
	borderColor      string // "#RRGGBB"; "" = the style's own border
	borderOpacity    int    // 0-100; 0 = the style's own alpha
	borderSourceTint bool   // the border takes the genre family's colour
}

// drawLabelOutlined traces a label at the given baseline. A hard outline stamps
// the colour at full strength around the glyphs; a glow fades it outward over
// the same radius, so the label lifts off busy art without a drawn edge. With
// outlineW <= 0 it falls back to a single soft drop shadow.
func drawLabelOutlined(base *image.NRGBA, face font.Face, x, y int, textCol, outlineCol color.Color, outlineW int, glow bool, label string) {
	if outlineW <= 0 {
		drawText(base, face, x+1, y+1, color.NRGBA{A: 180}, label)
		drawText(base, face, x, y, textCol, label)
		return
	}
	oc := toNRGBAColor(outlineCol)
	for dx := -outlineW; dx <= outlineW; dx++ {
		for dy := -outlineW; dy <= outlineW; dy++ {
			if dx == 0 && dy == 0 {
				continue
			}
			col := oc
			if glow {
				// Alpha falls with distance, so the ring reads as a halo rather
				// than an edge. The furthest ring is faint, not absent.
				d := math.Hypot(float64(dx), float64(dy)) / (float64(outlineW) + 1)
				if d > 1 {
					continue
				}
				col.A = uint8(float64(oc.A) * (1 - d) * 0.85)
				if col.A == 0 {
					continue
				}
			}
			drawText(base, face, x+dx, y+dy, col, label)
		}
	}
	drawText(base, face, x, y, textCol, label)
}

// toNRGBAColor narrows a color.Color to NRGBA so alpha can be scaled.
func toNRGBAColor(c color.Color) color.NRGBA {
	if n, ok := c.(color.NRGBA); ok {
		return n
	}
	r, g, b, a := c.RGBA()
	if a == 0 {
		return color.NRGBA{}
	}
	return color.NRGBA{
		R: uint8(r * 255 / a), G: uint8(g * 255 / a), B: uint8(b * 255 / a), A: uint8(a >> 8),
	}
}

// genreOptsFromConfig extracts the genre-badge styling from a resolved Config.
func genreOptsFromConfig(cfg imageconfig.Config, isAnime bool) genreBadgeOpts {
	return genreBadgeOpts{
		scalePercent: cfg.GenreBadgeScale,
		offsetX:      cfg.GenreBadgeOffsetX,
		offsetY:      cfg.GenreBadgeOffsetY,
		bgOpacity:    cfg.GenreBadgeBackgroundOpacity,
		mode:         cfg.GenreBadgeMode,
		isAnime:      isAnime,
		grouping:     cfg.GenreBadgeAnimeGrouping,
		style:        cfg.GenreBadgeStyle,
		accent:       cfg.GenreBadgeAccent,
		labelMode:    cfg.GenreBadgeLabel,
		labelCase:    cfg.GenreBadgeCase,
		maxGenres:    cfg.GenreBadgeMaxGenres,
		shortNames:   cfg.GenreBadgeShortNames,
		tileColor:    cfg.GenreBadgeTileAccentColor,
		borderWidth:  cfg.GenreBadgeBorderWidth,

		labelColor:       cfg.GenreBadgeLabelColor,
		borderColor:      cfg.GenreBadgeBorderColor,
		borderOpacity:    cfg.GenreBadgeBorderOpacity,
		borderSourceTint: cfg.GenreBadgeBorderSourceTint,
		outlineColor:     cfg.NoBackgroundBadgeOutlineColor,
		outlineWidth:     cfg.NoBackgroundBadgeOutlineWidth,
		outlineGlow:      cfg.NoBackgroundBadgeOutlineGlow,
	}
}

// applyLabelCase is the one place casing is decided, so a label rebuilt by the
// fit check comes back cased the same way the first one was. An unset value
// keeps what each label mode did on its own.
func applyLabelCase(label, labelCase, labelMode string) string {
	switch labelCase {
	case "upper":
		return strings.ToUpper(label)
	case "normal":
		return label
	}
	if labelMode == "primary" {
		return strings.ToUpper(label)
	}
	return label
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
	// The clean style sets its label larger than the tiled styles.
	labelScale := scale
	if opts.style == "clean" {
		labelScale = scale * 1.2
	}
	face := labelFaceFor(labelScale)
	if face == nil {
		return
	}

	// Lead with the genre the mark is drawn from, so the count trim below can
	// never drop it and leave the words disagreeing with the glyph beside them.
	genres = leadWithFamily(genres, opts.isAnime, opts.grouping)

	// The anime control names families in the glyph modes and genres here.
	named := groupAnimeGenres(genres, opts.isAnime, opts.grouping)
	if opts.shortNames {
		named = shortenGenres(named)
	}
	shown := named
	// A fixed count is an editorial choice, so it is applied before the fit
	// check, which answers a different question: whether what is left fits.
	cap := 3
	if opts.maxGenres > 0 && opts.maxGenres < cap {
		cap = opts.maxGenres
	}
	if len(shown) > cap {
		shown = shown[:cap]
	}
	label := strings.Join(shown, " · ")
	// v2 named the title by its first genre alone.
	if opts.labelMode == "primary" {
		label = named[0]
	}

	// The glyph modes need a family resolved, for the mark itself and its accent.
	// The clean and tile styles have no room for a glyph, so they stay text-only.
	//
	// An unset mode is text, and has to be spelled that way here: the fit check
	// and the glyph branches below both test for "text" by name.
	mode := opts.mode
	if mode == "" || opts.style == "clean" || opts.style == "tile" {
		mode = "text"
	}
	var fam *genreFamily
	if mode == "icon" || mode == "both" {
		if fam = resolveGenreFamilyGrouped(genres, opts.isAnime, opts.grouping); fam == nil {
			mode = "text"
		}
	}
	// What the plate says is the label control's business, not the mode's. The
	// glyph modes used to overwrite it with the family name, so choosing "Genre
	// list" and a glyph gave "SCI FI" instead of the list it named.
	if opts.labelMode == "family" {
		// Resolved here as well as for the glyph: naming the family is a label
		// choice, and it should not depend on whether a mark is shown beside it.
		named := fam
		if named == nil {
			named = resolveGenreFamilyGrouped(genres, opts.isAnime, opts.grouping)
		}
		if named != nil {
			label = named.label
		}
	}
	// Casing is its own control. Picking one genre and shouting it used to be the
	// same switch, so a first-only label could not be had without the capitals.
	// An unset value keeps what each label mode did on its own.
	label = applyLabelCase(label, opts.labelCase, opts.labelMode)

	s := func(v float64) int { return int(v*scale + 0.5) }
	padX := s(10)
	padY := s(5)
	edgeX := s(12)
	edgeY := s(12)
	radius := s(5)

	// Where the accent sits. The square style caps the label by default and the
	// others carry none, so an unset config draws what it always did.
	accentMode := opts.accent
	if accentMode == "" {
		accentMode = "none"
		if opts.style == "square" {
			accentMode = "top"
		}
	}
	capRoom, stripeRoom, stripeW := 0, 0, 0
	switch accentMode {
	case "top":
		capRoom = s(7)
	case "left":
		stripeW = maxInt(2, s(4))
		stripeRoom = stripeW + s(7)
	}

	fm := face.Metrics()
	ascent := fm.Ascent.Ceil()
	descent := fm.Descent.Ceil()
	bh := padY*2 + ascent + descent + capRoom
	bw := padX*2 + textWidth(face, label)

	iconSize, iconGap := 0, 0
	switch mode {
	case "both":
		iconSize = maxInt(1, (ascent+descent)*95/100)
		iconGap = maxInt(s(4), iconSize*16/100)
		bw = padX*2 + iconSize + iconGap + textWidth(face, label)
	case "icon":
		iconSize = maxInt(1, (ascent+descent)*95/100)
		bw = padX*2 + iconSize
	}
	bw += stripeRoom

	// Three genres fit or overflow depending on how long their names are, and
	// nothing measured the result against the artwork, so a wide list ran off
	// both edges. Drop the trailing genre until the plate fits, keeping the
	// first even when it does not.
	//
	// Gated on the label being the genre list, not on the mode: a glyph beside
	// the list still leaves a list to trim, and gating on text alone let Both
	// mode overflow the moment the label control started reaching it.
	resolvedPos := pos
	if resolvedPos == "" || resolvedPos == "inherit" {
		resolvedPos = "bl"
	}

	labelIsList := opts.labelMode != "primary" && opts.labelMode != "family"
	if labelIsList && len(shown) > 1 {
		// The nudge is applied after placement, so the room it eats has to come
		// off here. Measuring without it approves a label that fits at the corner
		// and is then moved past the edge, which is the clipping a nudged badge
		// showed. Trimming one more genre keeps the nudge the user asked for.
		nudge := opts.offsetX
		if nudge < 0 {
			nudge = -nudge
		}
		room := base.Bounds().Dx() - edgeX*2 - nudge
		// The frame is not the only thing in the way. Anything already reserved
		// on this row — the rating ring holds a corner and can neither shrink
		// nor move — leaves the strip a gap rather than the width.
		if free := occ.freeWidthAt(resolvedPos, bh, edgeX, edgeY, s(7), opts.offsetY) - nudge; free < room {
			room = free
		}
		for len(shown) > 1 && bw > room {
			shown = shown[:len(shown)-1]
			label = applyLabelCase(strings.Join(shown, " · "), opts.labelCase, opts.labelMode)
			bw = padX*2 + iconSize + iconGap + textWidth(face, label) + stripeRoom
		}
	}

	// The offset is honoured before the rectangle is reserved and the result is
	// held inside the frame. The label trim above already answers a nudge toward
	// the far edge; this keeps a nudge past the anchored edge from drawing off
	// the poster.
	r := occ.placeNudged(resolvedPos, bw, bh, edgeX, edgeY, s(7), opts.offsetX, opts.offsetY)
	textColor := color.NRGBA{R: 225, G: 225, B: 228, A: 255}
	tx, ty := r.Min.X+padX+stripeRoom, r.Min.Y+capRoom+padY+ascent

	// accentColor is the family accent, overridden by a configured tile colour.
	// accentColorFrom is the family's colour, overridden by a configured tile
	// colour. Passing nil yields the neutral default.
	accentColorFrom := func(f *genreFamily) color.NRGBA {
		c := color.NRGBA{R: 235, G: 235, B: 238, A: 235}
		if f != nil {
			if a, err := parseHexColor(f.accent); err == nil {
				a.A = 235
				c = a
			}
		}
		if h, err := parseHexColor(opts.tileColor); opts.tileColor != "" && err == nil {
			h.A = 235
			c = h
		}
		return c
	}

	// The colour family, resolved even in the text modes, which name the badge by
	// its genres and so leave fam nil. v2 coloured the label and the plate border
	// by genre on every style but clean; both read from here.
	colourFam := fam
	if colourFam == nil {
		colourFam = resolveGenreFamilyGrouped(genres, opts.isAnime, opts.grouping)
	}
	if opts.style != "clean" {
		textColor = accentColorFrom(colourFam)
		textColor.A = 255
	}
	// The tile puts the accent on its own fill, so a label inheriting the same
	// value renders white on white. It takes its contrast instead, the way a
	// filled score pill picks its value colour.
	if opts.style == "tile" && opts.tileColor != "" {
		if fill, err := parseHexColor(opts.tileColor); err == nil {
			textColor = contrastingInk(fill)
		}
	}
	// An explicit label colour beats every fallback, which is the point of
	// splitting them: it aims at the label without moving the border.
	labelOverride, labelSet := color.NRGBA{}, false
	if c, err := parseHexColor(opts.labelColor); opts.labelColor != "" && err == nil {
		c.A = 255
		labelOverride, labelSet = c, true
		textColor = c
	}
	// The icon modes recolour the label from the glyph's accent further down, so
	// the override is re-applied after that rather than before it.
	inkFor := func(c color.NRGBA) color.NRGBA {
		if labelSet {
			return labelOverride
		}
		return c
	}

	// drawLeftStripe runs the accent down the inside of the plate's left edge,
	// which is where v2 put it.
	drawLeftStripe := func() {
		if stripeW <= 0 {
			return
		}
		inset := s(3)
		x0 := r.Min.X + inset
		y0, y1 := r.Min.Y+inset, r.Max.Y-inset
		if y1 <= y0 {
			return
		}
		// The text modes resolve no family for the label, but v2 still coloured
		// this stripe by genre, so look one up for the colour alone.
		f := fam
		if f == nil {
			f = resolveGenreFamilyGrouped(genres, opts.isAnime, opts.grouping)
		}
		drawSoftTile(base, image.Rect(x0, y0, x0+stripeW, y1), stripeW/2,
			tileChrome{fill: accentColorFrom(f)})
	}

	// borderTint recolours a style's own border with the configured accent, so
	// every bordered style answers the same control the pill capsule already
	// did rather than only some of them.
	// The border group is inert on a style that draws no border, which is the
	// BUG-210 shape. Styles carrying none give it something to act on instead:
	// the tile gains a hairline, plain tints the glyph outline, clean tints the
	// strip under the label.
	borderAsked := opts.borderColor != "" || opts.borderSourceTint || opts.borderOpacity > 0

	borderTint := func(base color.NRGBA) color.NRGBA {
		out := base
		// Least specific first, so each one overrides the last: the tile accent
		// is the legacy shared value, a source tint asks for the family's own
		// colour, and an explicit border colour beats both.
		if c, err := parseHexColor(opts.tileColor); opts.tileColor != "" && err == nil {
			out = color.NRGBA{R: c.R, G: c.G, B: c.B, A: 255}
		}
		if opts.borderSourceTint {
			f := accentColorFrom(colourFam)
			out = color.NRGBA{R: f.R, G: f.G, B: f.B, A: 255}
		}
		if c, err := parseHexColor(opts.borderColor); opts.borderColor != "" && err == nil {
			out = color.NRGBA{R: c.R, G: c.G, B: c.B, A: 255}
		}
		if o := opts.borderOpacity; o > 0 {
			out.A = uint8(maxInt(1, o*255/100))
		}
		return out
	}

	// drawIcon paints the family glyph and reports the accent to tint the label.
	drawIcon := func() color.NRGBA {
		if fam == nil || iconSize <= 0 {
			return textColor
		}
		accent, err := parseHexColor(fam.accent)
		if err != nil {
			return textColor
		}
		accent.A = 255
		iconX := r.Min.X + padX + stripeRoom
		if mode == "icon" {
			iconX = r.Min.X + stripeRoom + (bw-stripeRoom-iconSize)/2
		}
		drawGenreIcon(base, fam.id, accent, color.NRGBA{R: 5, G: 7, B: 11, A: 255},
			iconX, r.Min.Y+capRoom+(bh-capRoom-iconSize)/2, iconSize)
		return accent
	}
	if mode == "both" {
		tx = r.Min.X + padX + stripeRoom + iconSize + iconGap
	}
	switch opts.style {
	case "plain":
		// No tile: a configurable outline (or the default drop shadow) keeps the
		// label legible on any background.
		oc, ow := color.NRGBA{}, 0
		if c, err := parseHexColor(opts.outlineColor); opts.outlineColor != "" && err == nil {
			oc = c
			ow = maxInt(1, int(float64(opts.outlineWidth)*scale+0.5))
		}
		if borderAsked {
			oc = borderTint(color.NRGBA{R: 255, G: 255, B: 255, A: 255})
			if ow == 0 {
				ow = maxInt(1, s(1))
			}
		}
		labelCol := textColor
		// The glyph is traced before it is drawn, so a mark on plain gets the
		// same edge the label does rather than sitting bare on the artwork.
		if ow > 0 && fam != nil && iconSize > 0 && mode != "text" {
			iconX := r.Min.X + padX + stripeRoom
			if mode == "icon" {
				iconX = r.Min.X + stripeRoom + (bw-stripeRoom-iconSize)/2
			}
			iconY := r.Min.Y + capRoom + (bh-capRoom-iconSize)/2
			drawGenreIconOutline(base, fam.id, oc, iconX, iconY, iconSize, ow, opts.outlineGlow)
		}
		if accent := drawIcon(); mode != "text" {
			labelCol = accent
		}
		labelCol = inkFor(labelCol)
		if mode != "icon" {
			drawLabelOutlined(base, face, tx, ty, labelCol, oc, ow, opts.outlineGlow, label)
		}
		return
	case "tile":
		tileA := uint8(235)
		if opts.bgOpacity != 0 {
			tileA = uint8(opts.bgOpacity * 255 / 100)
		}
		fill := color.NRGBA{R: 8, G: 9, B: 12, A: tileA}
		if c, err := parseHexColor(opts.tileColor); opts.tileColor != "" && err == nil {
			c.A = tileA
			fill = c
		}
		// The tile carries no border of its own, so one is drawn only where the
		// width asks for it. Colour and weight match the shared plate path, so
		// the same setting reads the same on either style.
		var tileBorder color.NRGBA
		tileBorderW := 0
		if opts.borderWidth == 0 && borderAsked {
			tileBorder = borderTint(color.NRGBA{R: 255, G: 255, B: 255, A: 150})
			tileBorderW = maxInt(1, s(1))
		}
		if opts.borderWidth > 0 {
			tileBorder = accentColorFrom(colourFam)
			tileBorder.A = 150
			tileBorder = borderTint(tileBorder)
			tileBorderW = maxInt(1, int(opts.borderWidth*scale+0.5))
		}
		drawSoftTile(base, r, radius, tileChrome{
			fill:        fill,
			border:      tileBorder,
			borderWidth: tileBorderW,
			shadow:      color.NRGBA{R: 0, G: 0, B: 0, A: 70},
		})
		drawLeftStripe()
		drawText(base, face, tx, ty, textColor, label)
		return
	case "clean":
		// No tile: a soft strip under the label carries it over the artwork.
		// Blended rather than filled: fillRoundedRect replaces pixels, so a
		// translucent fill would cut a hole in the artwork.
		stripH := maxInt(2, s(3))
		stripW := maxInt(s(18), textWidth(face, label)+s(6))
		stripX := tx - s(3)
		stripY := ty + s(4)
		strip := color.NRGBA{A: 110}
		if borderAsked {
			strip = borderTint(color.NRGBA{R: 255, G: 255, B: 255, A: 110})
		}
		for y := stripY; y < stripY+stripH; y++ {
			for x := stripX; x < stripX+stripW; x++ {
				blendPixel(base, x, y, strip)
			}
		}
		drawText(base, face, tx, ty, textColor, label)
		return
	case "pill":
		// A capsule matching the rating badges, so the two rows read as one set.
		// Solid rather than tinted: the pill rating badge is opaque too.
		pillR := bh / 2
		fill := color.NRGBA{R: 8, G: 9, B: 12, A: 235}
		if opts.bgOpacity != 0 {
			fill.A = uint8(opts.bgOpacity * 255 / 100)
		}
		drawSoftTile(base, r, pillR, tileChrome{
			fill:   fill,
			shadow: color.NRGBA{R: 0, G: 0, B: 0, A: 70},
		})
		if opts.borderWidth >= 0 {
			bw := maxInt(1, s(1))
			if opts.borderWidth > 0 {
				bw = maxInt(1, int(opts.borderWidth*scale+0.5))
			}
			// The accent colour, when set, borders the capsule. Without one the
			// pill keeps its faint white hairline.
			border := borderTint(color.NRGBA{R: 255, G: 255, B: 255, A: 48})
			for i := 0; i < bw; i++ {
				rr := r.Inset(i)
				if rr.Dx() <= 0 || rr.Dy() <= 0 {
					break
				}
				drawRectBorder(base, rr, maxInt(0, pillR-i), border)
			}
		}
		drawLeftStripe()
		if accent := drawIcon(); mode != "text" {
			textColor = accent
		}
		textColor = inkFor(textColor)
		if mode != "icon" {
			drawText(base, face, tx, ty, textColor, label)
		}
		return
	case "glass":
		// A translucent dark tint blended over the artwork so the poster reads
		// through it. bgOpacity is the tint's opacity; unset is a middle default.
		tintA := 130
		if opts.bgOpacity != 0 {
			tintA = opts.bgOpacity * 255 / 100
		}
		drawTileShadow(base, r, radius, color.NRGBA{A: 46})
		blendRoundedRect(base, r, radius, color.NRGBA{R: 14, G: 16, B: 22, A: uint8(tintA)})
		if opts.borderWidth >= 0 {
			bw := maxInt(1, s(1))
			if opts.borderWidth > 0 {
				bw = maxInt(1, int(opts.borderWidth*scale+0.5))
			}
			border := borderTint(color.NRGBA{R: 255, G: 255, B: 255, A: 48})
			for i := 0; i < bw; i++ {
				rr := r.Inset(i)
				if rr.Dx() <= 0 || rr.Dy() <= 0 {
					break
				}
				drawRectBorder(base, rr, maxInt(0, radius-i), border)
			}
		}
		drawLeftStripe()
		if accent := drawIcon(); mode != "text" {
			textColor = accent
		}
		textColor = inkFor(textColor)
		if mode != "icon" {
			drawText(base, face, tx, ty, textColor, label)
		}
		return
	case "square":
		fill := color.NRGBA{R: 8, G: 11, B: 16, A: 224}
		if opts.bgOpacity != 0 {
			fill.A = uint8(opts.bgOpacity * 255 / 100)
		}
		sqBorder := color.NRGBA{R: 255, G: 255, B: 255, A: 24}
		sqBorderW := maxInt(1, s(1))
		if opts.borderWidth < 0 {
			sqBorder.A = 0
		} else {
			if opts.borderWidth > 0 {
				sqBorderW = maxInt(1, int(opts.borderWidth*scale+0.5))
			}
			sqBorder = borderTint(sqBorder)
		}
		drawSoftTile(base, r, maxInt(1, s(2)), tileChrome{
			fill:        fill,
			border:      sqBorder,
			borderWidth: sqBorderW,
			shadow:      color.NRGBA{R: 0, G: 0, B: 0, A: 70},
		})
		if capRoom > 0 {
			capW := maxInt(s(16), bw*34/100)
			capH := maxInt(2, capRoom*60/100)
			capX := r.Min.X + (bw-capW)/2
			capY := r.Min.Y + maxInt(1, s(3))
			drawSoftTile(base, image.Rect(capX, capY, capX+capW, capY+capH), capH/2,
				tileChrome{fill: accentColorFrom(fam)})
		}
		drawLeftStripe()
		if accent := drawIcon(); mode != "text" {
			textColor = accent
		}
		textColor = inkFor(textColor)
		if mode != "icon" {
			drawText(base, face, tx, ty, textColor, label)
		}
		return
	}
	fill := color.NRGBA{R: 8, G: 9, B: 12, A: 200}
	if opts.bgOpacity != 0 {
		fill.A = uint8(opts.bgOpacity * 255 / 100)
	}
	// The plate border carries the genre's own colour, as v2's did. Alpha is
	// unchanged: a hairline stays a hairline until a width asks for more.
	border := accentColorFrom(colourFam)
	border.A = 28
	borderW := 0
	if opts.borderWidth < 0 {
		border.A = 0
	} else {
		if opts.borderWidth > 0 {
			// A configured border reads as a deliberate outline, so make it
			// opaque enough to see and scale its width with the output.
			border.A = 150
			borderW = maxInt(1, int(opts.borderWidth*scale+0.5))
		}
		border = borderTint(border)
	}
	drawSoftTile(base, r, radius, tileChrome{
		fill:        fill,
		border:      border,
		borderWidth: borderW,
		shadow:      color.NRGBA{R: 0, G: 0, B: 0, A: 70},
	})
	drawLeftStripe()
	if accent := drawIcon(); mode != "text" {
		textColor = accent
	}
	textColor = inkFor(textColor)
	if mode != "icon" {
		drawText(base, face, tx, ty, textColor, label)
	}
}

// drawEditorialRating renders the magazine-style "editorial" presentation: the
// first genre in an accent color above a large average score, anchored top-left.
// It mirrors v2's editorial mode (e.g. "Crime" over "9.0").
func drawEditorialRating(base *image.NRGBA, ratings []provider.Rating, genres []string, cfg imageconfig.Config, scale float64, occ *occupancy) {
	avg, ok := ratingRingAverage(ratings, cfg)
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
	label := formatRatingValue(avg, cfg.RatingValueMode)
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
	"rt": true, "metacritic": true, "rogerebert": true, "allocinepress": true,
}

// splitCriticsAudience averages the allowed ratings into a critics score and an
// audience score, following the provider classification above. Sources with no
// value are skipped; ok flags report which halves have data.
func splitCriticsAudience(ratings []provider.Rating, cfg imageconfig.Config) (critics, audience float64, hasCritics, hasAudience bool) {
	critics, hasCritics = weightedMean(ratings, cfg, func(source string) bool { return criticsSources[source] })
	audience, hasAudience = weightedMean(ratings, cfg, func(source string) bool { return !criticsSources[source] })
	return
}

// resolveShares gives every selected source its share of a combined score.
//
// A source's share is whatever the config set for it. Sources the config left
// alone divide up whatever is left of the 100, which is what makes an empty
// config an equal split without needing a case of its own, and lets a config
// that only pins one source leave the rest to sort themselves out.
func resolveShares(cfg imageconfig.Config) map[string]float64 {
	shares := make(map[string]float64, len(cfg.Ratings))
	var assigned float64
	var unset []string
	for _, source := range cfg.Ratings {
		if w, ok := cfg.RatingProviderWeights[strings.ToLower(source)]; ok {
			shares[source] = w
			assigned += w
			continue
		}
		unset = append(unset, source)
	}
	if len(unset) > 0 {
		leftover := shareTotal - assigned
		if leftover < 0 {
			leftover = 0
		}
		each := leftover / float64(len(unset))
		for _, source := range unset {
			shares[source] = each
		}
	}
	return shares
}

// shareTotal is what a full set of provider shares adds up to.
const shareTotal = 100

// weightedMean averages the allowed ratings that pass want, each source counted
// by its share. A source on a 0 share contributes nothing and is not counted
// against the total either, so zeroing one out is the same as not selecting it
// as far as the score is concerned. A source with no rating for this title drops
// out the same way, which spreads its share across the ones that do have data.
// Reports ok=false when nothing contributed.
func weightedMean(ratings []provider.Rating, cfg imageconfig.Config, want func(source string) bool) (float64, bool) {
	shares := resolveShares(cfg)
	// With no allow-list there is nothing to divide shares between, so every
	// source that has a score counts once, as the plain mean did.
	unfiltered := len(cfg.Ratings) == 0
	var sum, weight float64
	for _, r := range ratings {
		if r.Value <= 0 {
			continue
		}
		if want != nil && !want(r.Source) {
			continue
		}
		w := shares[r.Source]
		if unfiltered {
			w = 1
		}
		if w <= 0 {
			continue
		}
		sum += r.Value * w
		weight += w
	}
	if weight == 0 {
		return 0, false
	}
	return sum / weight, true
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
// scorePillStyle carries the resolved colours and accent-rail treatment for one
// aggregate pill.
type scorePillStyle struct {
	accent color.NRGBA
	value  color.NRGBA
	// accentShown is false when the config hides the accent rail, leaving a
	// plain dark capsule.
	accentShown  bool
	accentOffset int // px nudge of the rail along the pill
	// accentSet marks an accent resolved from the config rather than the
	// built-in per-role default. A label-less pill has no rail for the accent to
	// fill, so it takes the capsule outline instead.
	accentSet bool
	// accentTopStrip draws the accent as a centred bar along the top edge
	// instead of outlining the capsule.
	accentTopStrip bool
	// accentWidth strokes the capsule outline at this px width at 1x; 0 = 2.
	accentWidth int
	// fill replaces the dark capsule body. Zero alpha keeps the default.
	fill color.NRGBA
	// bodyTint blends the accent into the dark body at this strength (0-100),
	// short of the full fill, so the capsule reads as a dark accent behind a
	// bright rail. Applies only when fill is unset.
	bodyTint int
	// bodyOpacity tunes how much artwork shows through the capsule body, as a
	// percent. 0 keeps whatever the style picked.
	bodyOpacity int
	// valueSet marks an explicitly configured value colour, which wins over the
	// contrast pick made for a filled body.
	valueSet bool
	// radius maps the capsule height to its corner radius. Nil means a capsule.
	radius func(int) int
	// border carries the badge outline group onto the capsule. Zero alpha leaves
	// the hairline the style would draw.
	border color.NRGBA
	// borderSet marks an outline colour typed into the config, which takes the
	// capsule outline from the accent when the two want it.
	borderSet bool
	// borderWidth strokes at this px width at 1x. Negative switches the outline
	// off; 0 keeps whatever the branch would draw.
	borderWidth int
}

// drawPillOutline strokes the capsule edge. A negative width is the outline
// switched off, which beats every rule that would draw one, as it does on the
// per-source badges.
func drawPillOutline(base *image.NRGBA, rect image.Rectangle, radius int, col color.NRGBA, width int, s func(float64) int) {
	if width < 0 || col.A == 0 {
		return
	}
	if width == 0 {
		drawRectBorder(base, rect, radius, col)
		return
	}
	strokeRoundedRect(base, rect, radius, s(float64(width)), col)
}

// pillBorderAlpha is the outline group's opacity as an alpha, matching what the
// per-source badges do with the same control.
func pillBorderAlpha(cfg imageconfig.Config, fallback uint8) uint8 {
	if o := cfg.RatingBadgeBorderOpacity; o > 0 {
		return uint8(maxInt(1, o*255/100))
	}
	return fallback
}

// applyPillBorder carries the badge outline group onto an aggregate pill. The
// pills draw one capsule rather than per-source badges, so without this the
// group is live on Standard and dead on every pill presentation.
func applyPillBorder(style *scorePillStyle, cfg imageconfig.Config) {
	if b, err := parseHexColor(cfg.RatingBadgeBorderColor); cfg.RatingBadgeBorderColor != "" && err == nil {
		b.A = pillBorderAlpha(cfg, 255)
		style.border = b
		style.borderSet = true
	}
	// A pill carries one aggregate score rather than a named site, so the
	// source's colour here is the accent the pill already resolved.
	if cfg.RatingBadgeBorderSourceTint && !style.borderSet {
		tint := style.accent
		tint.A = pillBorderAlpha(cfg, 200)
		style.border = tint
	}
	if w := cfg.RatingBadgeBorderWidth; w != 0 {
		style.borderWidth = w
	}
}

// scorePillRadius maps the configured badge style onto the aggregate pill, so
// one style choice covers both the per-source badges and the aggregate ones.
func scorePillRadius(style imageconfig.BadgeStyle) func(int) int {
	switch style {
	case imageconfig.BadgeSquare:
		return func(int) int { return 0 }
	case imageconfig.BadgeTile, imageconfig.BadgeStacked:
		return func(h int) int { return maxInt(2, h/5) }
	default:
		return func(h int) int { return h / 2 }
	}
}

// aggregateAccentHex resolves the configured accent to a hex for one aggregate
// score. The pills and the scorebar share it so a mode added to one cannot go
// missing from the other, which is how "source" ended up live on the scorebar
// and dead on every pill. An empty return means the mode resolved nothing.
func aggregateAccentHex(cfg imageconfig.Config, role string, genres []string, isAnime bool, score float64) string {
	switch cfg.AggregateAccentMode {
	case "dynamic":
		return dynamicAccentHex(score, cfg.AggregateDynamicStops)
	case "genre":
		if fam := resolveGenreFamilyGrouped(genres, isAnime, cfg.GenreBadgeAnimeGrouping); fam != nil {
			return fam.accent
		}
		return ""
	case "source":
		switch strings.ToLower(role) {
		case "critics":
			return "#22c55e"
		case "audience":
			return "#38bdf8"
		default:
			return "#f59e0b"
		}
	case "custom":
		switch role {
		case "critics":
			if cfg.AggregateCriticsAccentColor != "" {
				return cfg.AggregateCriticsAccentColor
			}
		case "audience":
			if cfg.AggregateAudienceAccentColor != "" {
				return cfg.AggregateAudienceAccentColor
			}
		}
		return cfg.AggregateAccentColor
	}
	// No mode set: a bare accent colour behaves as custom.
	return cfg.AggregateAccentColor
}

// scoreBandColor is the low/mid/high colour for a score, the fallback the
// scorebar has always used when no accent resolves.
func scoreBandColor(cfg imageconfig.Config, score float64, alpha uint8) color.NRGBA {
	lowT, highT := 5.0, 8.0
	if cfg.ScorebarLowThreshold > 0 {
		lowT = cfg.ScorebarLowThreshold
	}
	if cfg.ScorebarHighThreshold > 0 {
		highT = cfg.ScorebarHighThreshold
	}
	band := func(override string, def color.NRGBA) color.NRGBA {
		if c, err := parseHexColor(override); override != "" && err == nil {
			c.A = alpha
			return c
		}
		def.A = alpha
		return def
	}
	switch {
	case score >= highT:
		return band(cfg.ScorebarHighColor, color.NRGBA{R: 39, G: 174, B: 96})
	case score >= lowT:
		return band(cfg.ScorebarMidColor, color.NRGBA{R: 230, G: 126, B: 34})
	default:
		return band(cfg.ScorebarLowColor, color.NRGBA{R: 192, G: 57, B: 43})
	}
}

// aggregatePillStyle resolves how one aggregate pill is coloured. Critics and
// audience take their own colours when set so a dual presentation can tell the
// two apart, and fall back to the shared aggregate colours, then to the
// built-in accent for that source.
func aggregatePillStyle(cfg imageconfig.Config, source string, genres []string, isAnime bool, score float64, fallback color.NRGBA) scorePillStyle {
	style := scorePillStyle{
		accent:         fallback,
		value:          color.NRGBA{R: 255, G: 255, B: 255, A: 255},
		accentShown:    cfg.AggregateAccentBarVisible == nil || *cfg.AggregateAccentBarVisible,
		accentOffset:   cfg.AggregateAccentBarOffset,
		accentTopStrip: cfg.AggregateAccentShape == "strip",
		bodyOpacity:    cfg.RatingBadgeBackgroundOpacity,
		accentWidth:    cfg.AggregateAccentWidth,
		bodyTint:       cfg.AggregatePillBodyTint,
		radius:         scorePillRadius(cfg.BadgeStyle),
	}

	accentHex := aggregateAccentHex(cfg, source, genres, isAnime, score)
	accent, err := parseHexColor(accentHex)
	resolved := accentHex != "" && err == nil
	// Picking a mode and leaving its colour unset resolved nothing, which took
	// the accent, the fill, the body tint and the shape down with it. A chosen
	// mode falls back to the score bands, as the scorebar already did. Choosing
	// no mode still leaves the capsule plain.
	if !resolved && cfg.AggregateAccentMode != "" {
		accent, resolved = scoreBandColor(cfg, score, 255), true
	}
	if resolved {
		style.accent = accent
		style.accentSet = true
		if cfg.AggregateFillByScore {
			accent.A = 235
			style.fill = accent
		}
	}

	valueHex := ""
	switch source {
	case "critics":
		valueHex = cfg.AggregateCriticsValueColor
	case "audience":
		valueHex = cfg.AggregateAudienceValueColor
	}
	if valueHex == "" {
		valueHex = cfg.AggregateValueColor
	}
	if c, err := parseHexColor(valueHex); valueHex != "" && err == nil {
		style.value = c
		style.valueSet = true
	}
	// After the accent, because a source-tinted outline takes its colour.
	applyPillBorder(&style, cfg)
	return style
}

// scorePillWidth is the capsule width for a label/score pair at the given
// scale. Kept alongside scorePillHeight so a pill can be anchored to an edge
// before it is drawn.
func scorePillWidth(label, score string, icon image.Image, scale float64) int {
	ensureFaces()
	s := func(v float64) int { return int(v*scale + 0.5) }
	labelW := 0
	if label != "" {
		labelW = textWidth(labelFaceFor(scale), label) + s(9)*2 + s(9)
	}
	iconW := 0
	if icon != nil {
		iconW = pillIconSize(scale) + s(7)
	}
	return labelW + iconW + textWidth(valueFaceFor(scale*1.25), score) + s(12)*2
}

// pillIconSize is the box a pill mark is fitted into, sized off the capsule so
// it tracks the badge scale.
func pillIconSize(scale float64) int {
	return int(float64(scorePillHeight(scale))*0.52 + 0.5)
}

func drawScorePill(base *image.NRGBA, cx, topY int, label, score string, icon image.Image, style scorePillStyle, scale float64, occ *occupancy) {
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
	capW := scorePillWidth(label, score, icon, scale)
	x0 := cx - capW/2
	rect := image.Rect(x0, topY, x0+capW, topY+capH)

	radius := capH / 2
	if style.radius != nil {
		radius = style.radius(capH)
	}
	body := color.NRGBA{R: 22, G: 22, B: 26, A: 226}
	valueCol := style.value
	if style.fill.A > 0 {
		body = style.fill
		if !style.valueSet {
			valueCol = contrastingInk(body)
		}
	} else if style.bodyTint > 0 && style.accentSet {
		// Blend the accent into the dark body short of the full fill, so the
		// capsule reads as a dark accent while the rail keeps its bright edge.
		// Gated on a resolved accent: with none the accent is zero-value black
		// and the tint would only darken the body.
		t := style.bodyTint
		if t > 100 {
			t = 100
		}
		f := float64(t) / 100 * 0.6
		body = color.NRGBA{
			R: uint8(float64(body.R)*(1-f) + float64(style.accent.R)*f + 0.5),
			G: uint8(float64(body.G)*(1-f) + float64(style.accent.G)*f + 0.5),
			B: uint8(float64(body.B)*(1-f) + float64(style.accent.B)*f + 0.5),
			A: body.A,
		}
	}
	// The same control the badge strip answers. Compositing rather than writing
	// the pixel is what lets the poster through instead of the viewer's
	// background.
	blendBody := false
	if o := style.bodyOpacity; o > 0 && body.A > 0 {
		body.A = uint8(maxInt(1, o*255/100))
		blendBody = true
	}

	// Drop shadow, then the capsule. A capsule you can see through casts a
	// fainter shadow.
	shadowCol := color.NRGBA{A: 90}
	if blendBody {
		shadowCol.A = uint8(maxInt(1, int(shadowCol.A)*style.bodyOpacity/100))
	}
	drawTileShadow(base, rect, radius, shadowCol)
	if blendBody || body.A < 255 {
		blendRoundedRect(base, rect, radius, body)
	} else {
		fillRoundedRect(base, rect, radius, body)
	}
	// With a label the accent fills the rail behind it. Without one there is no
	// rail, so it outlines the capsule and the body stays dark. A filled body
	// already carries the colour.
	accentOwnsOutline := label == "" && style.accentSet && style.accentShown && style.fill.A == 0
	// An outline colour typed into the config takes the capsule from the accent,
	// which then keeps its strip so the score colour is still on the pill.
	accentToStrip := style.accentTopStrip || (accentOwnsOutline && style.borderSet)
	hairline := color.NRGBA{R: 255, G: 255, B: 255, A: 28}
	if style.border.A > 0 {
		hairline = style.border
	}
	switch {
	case accentOwnsOutline && accentToStrip:
		drawPillOutline(base, rect, radius, hairline, style.borderWidth, s)
		barH := s(4)
		barW := capW / 2
		bar := image.Rect(cx-barW/2, topY+s(3), cx+barW/2, topY+s(3)+barH)
		fillRoundedRect(base, bar, barH/2, style.accent)
	case accentOwnsOutline:
		outlineW := 2
		if style.accentWidth > 0 {
			outlineW = style.accentWidth
		}
		if style.borderWidth > 0 {
			outlineW = style.borderWidth
		}
		strokeRoundedRect(base, rect, radius, s(float64(outlineW)), style.accent)
	default:
		drawPillOutline(base, rect, radius, hairline, style.borderWidth, s)
	}

	cursor := x0 + padX
	if label != "" {
		segInset := s(4)
		segRect := image.Rect(cursor, topY+segInset, cursor+labelW, topY+capH-segInset)
		if style.accentShown {
			railOffset := int(float64(style.accentOffset)*scale + 0.5)
			fillRoundedRect(base, segRect.Add(image.Pt(railOffset, 0)), segRect.Dy()/2, style.accent)
		}
		lm := labelFace.Metrics()
		ly := segRect.Min.Y + (segRect.Dy()-lm.Height.Ceil())/2 + lm.Ascent.Ceil()
		drawText(base, labelFace, cursor+labelPad, ly, color.White, label)
		cursor += labelW + innerGap
	}

	if icon != nil {
		box := pillIconSize(scale)
		slot := image.Rect(cursor, topY+(capH-box)/2, cursor+box, topY+(capH-box)/2+box)
		if glyph, at := scaleIconToFit(icon, slot); glyph != nil {
			xdraw.Draw(base, at, glyph, image.Point{}, xdraw.Over)
		}
		cursor += box + s(7)
	}

	vm := valueFace.Metrics()
	vy := topY + (capH-vm.Height.Ceil())/2 + vm.Ascent.Ceil()
	drawText(base, valueFace, cursor+s(1), vy+s(1), color.NRGBA{A: 150}, score)
	drawText(base, valueFace, cursor, vy, valueCol, score)

	if occ != nil {
		occ.reserve(rect)
	}
}

// drawMinimalRating shows a single centred pill with the overall average score
// at the top of the artwork. The pill carries no label segment, so a configured
// accent marks the capsule itself rather than filling a rail.
func drawMinimalRating(base *image.NRGBA, ratings []provider.Rating, genres []string, isAnime bool, cfg imageconfig.Config, scale float64, occ *occupancy) {
	avg, ok := ratingRingAverage(ratings, cfg)
	if !ok {
		return
	}
	style := aggregatePillStyle(cfg, "overall", genres, isAnime, avg, color.NRGBA{})
	drawAggregatePills(base, cfg, scale, occ, false, aggregatePill{
		score: formatRatingValue(avg, cfg.RatingValueMode),
		icon:  pillMark(cfg.AggregatePillIcon), style: style,
	})
}

// drawAverageRating shows a single pill labelled "AVG" with the overall
// average — like minimal, but explicitly named.
func drawAverageRating(base *image.NRGBA, ratings []provider.Rating, genres []string, isAnime bool, cfg imageconfig.Config, scale float64, occ *occupancy) {
	avg, ok := ratingRingAverage(ratings, cfg)
	if !ok {
		return
	}
	accent := color.NRGBA{R: 90, G: 98, B: 112, A: 255} // neutral slate label
	style := aggregatePillStyle(cfg, "overall", genres, isAnime, avg, accent)
	drawAggregatePills(base, cfg, scale, occ, false, aggregatePill{
		label: "AVG", score: formatRatingValue(avg, cfg.RatingValueMode),
		icon: pillMark(cfg.AggregatePillIcon), style: style,
	})
}

// drawDualRating shows a critics pill and an audience pill, each an averaged
// score for its provider group. Unplaced they sit against the top and bottom
// edges; aggregatePillPos stacks them together at one corner instead. When
// labeled is false the pills carry just the score (the "dual-minimal" mode).
func drawDualRating(base *image.NRGBA, ratings []provider.Rating, genres []string, isAnime bool, cfg imageconfig.Config, scale float64, occ *occupancy, labeled bool) {
	critics, audience, hasC, hasA := splitCriticsAudience(ratings, cfg)
	criticsAccent := color.NRGBA{R: 39, G: 174, B: 96, A: 255}   // green
	audienceAccent := color.NRGBA{R: 52, G: 152, B: 219, A: 255} // blue
	criticsLabel, audienceLabel := "", ""
	if labeled {
		criticsLabel, audienceLabel = "CRITICS", "AUDIENCE"
	}
	var pills []aggregatePill
	criticsIcon, audienceIcon := image.Image(nil), image.Image(nil)
	if cfg.AggregateDualIcons {
		criticsIcon, audienceIcon = pillMark("rt"), pillMark("rtaudience")
	}
	if hasC {
		pills = append(pills, aggregatePill{
			label: criticsLabel,
			score: formatRatingValue(critics, cfg.RatingValueMode),
			icon:  criticsIcon,
			style: aggregatePillStyle(cfg, "critics", genres, isAnime, critics, criticsAccent),
		})
	}
	if hasA {
		pills = append(pills, aggregatePill{
			label: audienceLabel,
			score: formatRatingValue(audience, cfg.RatingValueMode),
			icon:  audienceIcon,
			style: aggregatePillStyle(cfg, "audience", genres, isAnime, audience, audienceAccent),
		})
	}
	drawAggregatePills(base, cfg, scale, occ, hasC && hasA, pills...)
}

// pillMark returns the bundled rating mark of that name, or nil when the name
// is empty or unknown.
func pillMark(name string) image.Image {
	if name == "" {
		return nil
	}
	ensureIcons()
	return ratingIcons[name]
}

// aggregatePill is one score capsule awaiting placement.
type aggregatePill struct {
	label string
	score string
	icon  image.Image
	style scorePillStyle
}

// drawAggregatePills places the capsules the minimal, average and dual
// presentations share, honouring the rating strip's scale and offsets. split
// keeps an unplaced pair against opposite edges, which is the dual look.
func drawAggregatePills(base *image.NRGBA, cfg imageconfig.Config, scale float64, occ *occupancy, split bool, pills ...aggregatePill) {
	if len(pills) == 0 {
		return
	}
	if cfg.RatingBadgeScale != 0 {
		scale *= float64(cfg.RatingBadgeScale) / 100
	}
	b := base.Bounds()
	pad := int(14*scale + 0.5)
	gap := int(8*scale + 0.5)
	h := scorePillHeight(scale)

	for i, p := range pills {
		cx, topY := aggregatePillAnchor(b, cfg.AggregatePillPos, split,
			scorePillWidth(p.label, p.score, p.icon, scale), h, pad, gap, i, len(pills))
		drawScorePill(base, cx+cfg.RatingBadgeOffsetX, topY+cfg.RatingBadgeOffsetY,
			p.label, p.score, p.icon, p.style, scale, occ)
	}
}

// aggregatePillAnchor returns the centre x and top y for pill i of n. An empty
// pos centres horizontally and stacks from the top, except for a split pair
// which takes one edge each. A corner pos stacks downward from the top or
// upward from the bottom, so the first pill stays above the last either way.
func aggregatePillAnchor(b image.Rectangle, pos string, split bool, w, h, pad, gap, i, n int) (cx, topY int) {
	switch pos {
	case "tl", "bl":
		cx = b.Min.X + pad + w/2
	case "tr", "br":
		cx = b.Max.X - pad - w/2
	default:
		cx = b.Min.X + b.Dx()/2
	}
	switch {
	case pos == "" && split && i == n-1:
		topY = b.Max.Y - h - pad
	case pos == "bl", pos == "bc", pos == "br":
		topY = b.Max.Y - pad - (n-i)*h - (n-i-1)*gap
	default:
		topY = b.Min.Y + pad + i*(h+gap)
	}
	return cx, topY
}

// ── Aggregate rating bar ──────────────────────────────────────────────────────

// drawAggregateBar draws a full-width score bar on top or bottom of the image.
// The bar fill is colored green/amber/red based on the normalised average score (0–10).
// Filtered by the config.Ratings allowlist so only visible sources contribute.
func drawAggregateBar(base *image.NRGBA, ratings []provider.Rating, cfg imageconfig.Config, genres []string, isAnime bool) {
	if len(ratings) == 0 {
		return
	}

	// The bar can average all allowed sources (overall) or just the critics /
	// audience half of them.
	var avg float64
	switch strings.ToLower(cfg.AggregateRatingSource) {
	case "critics":
		c, _, hasC, _ := splitCriticsAudience(ratings, cfg)
		if !hasC {
			return
		}
		avg = c
	case "audience":
		_, a, _, hasA := splitCriticsAudience(ratings, cfg)
		if !hasA {
			return
		}
		avg = a
	default:
		v, ok := weightedMean(ratings, cfg, nil) // 0–10 scale
		if !ok {
			return
		}
		avg = v
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

	// An accent overrides the score-band colour for the single-fill styles. The
	// mode picks where that accent comes from; a bare accent colour with no mode
	// set behaves as "custom". Dynamic with no stop ramp resolves nothing and
	// takes the score-band fallback below.
	accentHex := aggregateAccentHex(cfg, cfg.AggregateRatingSource, genres, isAnime, avg)

	fillColor := highC
	hasAccent := false
	if accentHex != "" {
		if custom, err := parseHexColor(accentHex); err == nil {
			custom.A = 230
			fillColor = custom
			hasAccent = true
		}
	}
	if !hasAccent {
		switch {
		case avg >= highT:
			fillColor = highC
		case avg >= lowT:
			fillColor = midC
		default:
			fillColor = lowC
		}
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
	case "dynamic":
		// A partial fill proportional to the score, coloured by a continuous
		// low→mid→high interpolation of the score itself (no hard band steps).
		dynC := fillColor
		if !hasAccent {
			t := avg / 10.0
			if t < 0.5 {
				dynC = lerpColor(lowC, midC, t/0.5)
			} else {
				dynC = lerpColor(midC, highC, (t-0.5)/0.5)
			}
		}
		fillW := int(float64(w) * (avg / 10.0))
		if fillW < 1 {
			fillW = 1
		}
		if fillW > w {
			fillW = w
		}
		fillRect(base, image.Rect(bounds.Min.X, barY, bounds.Min.X+fillW, barY+barH), dynC)
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
// dynamicAccentHex picks a colour for a 0-10 score from a configured stop ramp,
// blending between the two stops it falls between. Stops are given on a 0-100
// scale, matching how they are written in the config. An empty string means
// there is no usable ramp, so the caller keeps its own fallback.
func dynamicAccentHex(score float64, stops string) string {
	parsed := imageconfig.ParseDynamicStops(stops)
	if len(parsed) == 0 {
		return ""
	}
	at := score * 10
	if at <= parsed[0].Score {
		return parsed[0].Color
	}
	last := parsed[len(parsed)-1]
	if at >= last.Score {
		return last.Color
	}
	for i := 1; i < len(parsed); i++ {
		lo, hi := parsed[i-1], parsed[i]
		if at > hi.Score {
			continue
		}
		loColor, errLo := parseHexColor(lo.Color)
		hiColor, errHi := parseHexColor(hi.Color)
		if errLo != nil || errHi != nil {
			return lo.Color
		}
		span := hi.Score - lo.Score
		if span <= 0 {
			return hi.Color
		}
		mixed := lerpColor(loColor, hiColor, (at-lo.Score)/span)
		return fmt.Sprintf("#%02x%02x%02x", mixed.R, mixed.G, mixed.B)
	}
	return last.Color
}

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

// trendingBadgeOpts carries the trending-tag styling not already threaded
// through as positional params. Its zero value keeps the original fixed
// hairline and the plain surface's original shadow-free label.
type trendingBadgeOpts struct {
	scalePercent int
	offsetX      int
	offsetY      int
	accentColor  string // "#RRGGBB" border/hairline tint for the capsule/square surfaces
	outlineColor string // "#RRGGBB" outline for the plain surface; "" = none
	outlineWidth int    // px outline width for the plain surface; 0 = none
	outlineGlow  bool   // fade the outline outward instead of a hard edge
}

// trendingOptsFromConfig extracts the trending-badge styling from a resolved
// Config.
func trendingOptsFromConfig(cfg imageconfig.Config) trendingBadgeOpts {
	return trendingBadgeOpts{
		scalePercent: cfg.TrendingScale,
		offsetX:      cfg.TrendingOffsetX,
		offsetY:      cfg.TrendingOffsetY,
		accentColor:  cfg.TrendingAccentColor,
		outlineColor: cfg.NoBackgroundBadgeOutlineColor,
		outlineWidth: cfg.NoBackgroundBadgeOutlineWidth,
		outlineGlow:  cfg.NoBackgroundBadgeOutlineGlow,
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
	drawTrendingBadgeSurfaced(base, scale, occ, style, pos, textColor, "", trendingBadgeOpts{})
}

// drawTrendingBadgeSurfaced adds the tag's surface treatment on top of the glyph
// composition: "square" swaps the capsule for a sharp-cornered tile, "plain"
// drops the surface entirely, and anything else keeps the warm frosted capsule.
func drawTrendingBadgeSurfaced(base *image.NRGBA, scale float64, occ *occupancy, style trendingStyle, pos, textColor, surface string, opts trendingBadgeOpts) {
	if pos == "" {
		pos = "tl"
	}
	if opts.scalePercent != 0 {
		scale *= float64(opts.scalePercent) / 100
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

	r := occ.placeNudged(pos, bw, bh, edgeX, edgeY, s(7), opts.offsetX, opts.offsetY)

	// Dark frosted capsule that matches the quality-badge tiles — understated,
	// not a loud bright pill. The warmth comes from the accent glyph, not the
	// fill, so it reads as a refined callout rather than an eyesore. A square
	// surface uses the same tile with sharp corners; a plain surface skips it.
	if surface == "square" {
		radius = s(5)
	}
	if surface != "plain" {
		drawTileShadow(base, r, radius, color.NRGBA{R: 0, G: 0, B: 0, A: 105})
		blendRoundedRect(base, r, radius, color.NRGBA{R: 18, G: 20, B: 26, A: 233})
		border := color.NRGBA{R: 255, G: 150, B: 92, A: 66} // warm hairline
		if c, err := parseHexColor(opts.accentColor); opts.accentColor != "" && err == nil {
			border = color.NRGBA{R: c.R, G: c.G, B: c.B, A: 220}
		}
		drawRectBorder(base, r, radius, border)
	}

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
		// The plain surface has no tile to separate the label from the artwork,
		// so it answers the same outline controls the other plain badges do.
		if surface == "plain" {
			if c, err := parseHexColor(opts.outlineColor); opts.outlineColor != "" && err == nil {
				w := opts.outlineWidth
				if w <= 0 {
					w = 1
				}
				drawLabelOutlined(base, face, tx, ty, labelCol, c, maxInt(1, s(float64(w))), opts.outlineGlow, label)
				return
			}
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

	avg, ok := ratingRingAverage(ratings, cfg)
	if !ok {
		return
	}

	// The centre value and the arc fill can each draw from a specific provider
	// instead of the overall average, so e.g. the number is IMDb while the fill
	// reflects the aggregate. Unset or "overall" keeps the average for both.
	value := avg
	if v, ok := ratingRingSourceValue(ratings, cfg.RingValueSource, cfg); ok {
		value = v
	}
	progress := avg
	if v, ok := ratingRingSourceValue(ratings, cfg.RingProgressSource, cfg); ok {
		progress = v
	}

	fillColor := ratingRingFillColor(value, cfg.RatingRingColor, cfg.AggregateDynamicStops)

	s := func(v float64) int { return int(v*scale + 0.5) }
	edgeX := s(12)
	edgeY := s(12)

	pos := cfg.RatingRingPos
	if pos == "" {
		pos = "br"
	}

	// The ring and the value inside it scale together; sizing the ring alone
	// leaves the number the same size in a larger circle.
	ringScale := scale
	if cfg.RingScale != 0 {
		ringScale *= float64(cfg.RingScale) / 100
	}

	ensureFaces()
	valueFace := valueFaceFor(ringScale * ringValueFontScale)

	outerR := int(32*ringScale + 0.5)
	// drawProgressRing draws a soft glow pad pixels beyond outerR (matched here),
	// so the reserved box is the full visual extent. Reserving only outerR*2 let
	// the glow spill past the canvas edge in a corner, clipping the ring.
	pad := int(math.Max(9, float64(outerR)*2*0.17)) + 1
	fullR := outerR + pad
	// Place the ring's full bounding box, dodging any overlay already reserved in
	// the requested corner (age/genre badges, provider chips, ratings strip).
	d := fullR * 2
	r := occ.placeNudged(pos, d, d, edgeX, edgeY, s(8), cfg.RingOffsetX, cfg.RingOffsetY)
	cx := r.Min.X + fullR
	cy := r.Min.Y + fullR
	label := strconv.Itoa(int(math.Round(value * 10)))
	drawProgressRing(base, cx, cy, outerR, progress/10.0, fillColor, valueFace, label, cfg.RingCenterOpacity)
}

// ratingRingSourceValue returns a specific provider's 0-10 value for the ring,
// or (0,false) when source is empty/"overall" (the caller keeps the average) or
// that provider has no value.
// firstAvailableRating returns the value of the first source in the priority
// order that is allowed and carries a value.
func firstAvailableRating(ratings []provider.Rating, cfg imageconfig.Config, order []string) (float64, bool) {
	allow := make(map[string]bool, len(cfg.Ratings))
	for _, s := range cfg.Ratings {
		allow[s] = true
	}
	bySource := make(map[string]float64, len(ratings))
	for _, r := range ratings {
		if r.Value > 0 {
			bySource[strings.ToLower(r.Source)] = r.Value
		}
	}
	shares := resolveShares(cfg)
	for _, s := range order {
		if len(cfg.Ratings) > 0 && !allow[s] {
			continue
		}
		// A source on a zero share is one the config has taken out of the
		// scoring, so it should not win the fallback either.
		if len(cfg.Ratings) > 0 && shares[s] <= 0 {
			continue
		}
		if v, ok := bySource[s]; ok {
			return v, true
		}
	}
	return 0, false
}

// The order the "top critic" and "top audience" ring modes walk when a config
// names no order of its own: best-known professional outlets first, then the
// audience sources by breadth of voter base.
var (
	defaultCriticsPriority  = []string{"rt", "metacritic", "rogerebert", "allocinepress"}
	defaultAudiencePriority = []string{
		"imdb", "tmdb", "trakt", "letterboxd", "mdblist", "rtaudience", "simkl", "allocine", "filmweb",
	}
)

// sourceOrder prefers a configured priority list, falling back to the built-in
// one when the config leaves it unset.
func sourceOrder(configured, fallback []string) []string {
	if len(configured) > 0 {
		return configured
	}
	return fallback
}

func ratingRingSourceValue(ratings []provider.Rating, source string, cfg imageconfig.Config) (float64, bool) {
	source = strings.ToLower(strings.TrimSpace(source))
	switch source {
	case "", "overall", "average":
		return 0, false
	case "critics":
		c, _, hasC, _ := splitCriticsAudience(ratings, cfg)
		return c, hasC
	case "audience":
		_, a, _, hasA := splitCriticsAudience(ratings, cfg)
		return a, hasA
	case "highest":
		allow := make(map[string]bool, len(cfg.Ratings))
		for _, s := range cfg.Ratings {
			allow[s] = true
		}
		shares := resolveShares(cfg)
		best, ok := 0.0, false
		for _, r := range ratings {
			if len(cfg.Ratings) > 0 && !allow[r.Source] {
				continue
			}
			// A source on a zero share is out of the scoring entirely, so one of
			// them topping the list must not become the ring's number.
			if len(cfg.Ratings) > 0 && shares[r.Source] <= 0 {
				continue
			}
			if r.Value > best {
				best, ok = r.Value, true
			}
		}
		return best, ok
	case "priority-critics":
		return firstAvailableRating(ratings, cfg, sourceOrder(cfg.RingCriticsPriority, defaultCriticsPriority))
	case "priority-audience":
		return firstAvailableRating(ratings, cfg, sourceOrder(cfg.RingAudiencePriority, defaultAudiencePriority))
	}
	// Otherwise treat it as a specific provider id.
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
// source is in the allowlist, weighted per source. Returns (avg, true) or
// (0, false) if no data.
func ratingRingAverage(ratings []provider.Rating, cfg imageconfig.Config) (float64, bool) {
	// An empty allow-list means nothing is selected rather than everything, so
	// there is no score to show.
	if len(cfg.Ratings) == 0 {
		return 0, false
	}
	return weightedMean(ratings, cfg, nil)
}

// ratingRingFillColor returns the arc fill colour. An explicit hex wins, then the
// configured score stops, then a five-band palette (deep red → red → amber → lime
// → green). The stops already drive the aggregate pill; the ring ignored them, so
// a title could show one colour on the pill and another on the ring beside it.
func ratingRingFillColor(avg float64, hexColor string, stops string) color.NRGBA {
	if hexColor != "" {
		if c, err := parseHexColor(hexColor); err == nil {
			return c
		}
	}
	// Empty stops fall through to the bands, so a config that never set them
	// renders exactly as before.
	if hex := dynamicAccentHex(avg, stops); hex != "" {
		if c, err := parseHexColor(hex); err == nil {
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

// ── Top-rated rank badge ──────────────────────────────────────────────────────

type topRatedOpts struct {
	scalePercent int
	offsetX      int
	offsetY      int
	style        string // "" | glass | square | plain | tile | silver
	tileColor    string // "#RRGGBB"; fills the tile style, tints the border on glass/square/silver
	outlineColor string // "#RRGGBB" outline for the plain style; "" = drop shadow
	outlineWidth int    // px outline width for the plain style; 0 = 1
	outlineGlow  bool   // fade the outline outward instead of a hard edge
}

func topRatedOptsFromConfig(cfg imageconfig.Config) topRatedOpts {
	return topRatedOpts{scalePercent: cfg.TopRatedScale, offsetX: cfg.TopRatedOffsetX, offsetY: cfg.TopRatedOffsetY,
		style: cfg.TopRatedBadgeStyle, tileColor: cfg.TopRatedTileColor,
		outlineColor: cfg.NoBackgroundBadgeOutlineColor, outlineWidth: cfg.NoBackgroundBadgeOutlineWidth,
		outlineGlow: cfg.NoBackgroundBadgeOutlineGlow}
}

// topRatedAccent is the gold this badge is drawn in. Rank is the one badge that
// is a ranking rather than a measurement, and the colour is what separates it
// at a glance from the rating badges next to it.
var topRatedAccent = color.NRGBA{R: 245, G: 197, B: 66, A: 255}

// drawTopRatedBadge marks a title's place in the top-rated ranking. rank is
// 1-based; zero means the title does not place and nothing is drawn.
func drawTopRatedBadge(base *image.NRGBA, rank int, pos string, scale float64, occ *occupancy, opts topRatedOpts) {
	if rank <= 0 {
		return
	}
	if opts.scalePercent != 0 {
		scale *= float64(opts.scalePercent) / 100
	}
	ensureFaces()
	face := labelFaceFor(scale)
	if face == nil {
		return
	}
	// "TOP" carries the meaning; the bare number alone would read as anything.
	label := "TOP #" + strconv.Itoa(rank)

	s := func(v float64) int { return int(v*scale + 0.5) }
	padX, padY := s(9), s(5)

	fm := face.Metrics()
	ascent, descent := fm.Ascent.Ceil(), fm.Descent.Ceil()
	bh := padY*2 + ascent + descent
	bw := padX*2 + textWidth(face, label)

	resolvedPos := pos
	if resolvedPos == "" || resolvedPos == "inherit" {
		resolvedPos = "tl"
	}

	r := occ.placeNudged(resolvedPos, bw, bh, s(12), s(12), s(7), opts.offsetX, opts.offsetY)
	tx, ty := r.Min.X+padX, r.Min.Y+padY+ascent

	if opts.style == "plain" {
		// The plain style answers the same outline controls the other plain
		// badges do. Without one it keeps its drop shadow.
		if c, err := parseHexColor(opts.outlineColor); opts.outlineColor != "" && err == nil {
			w := opts.outlineWidth
			if w <= 0 {
				w = 1
			}
			drawLabelOutlined(base, face, tx, ty, topRatedAccent, c, maxInt(1, s(float64(w))), opts.outlineGlow, label)
			return
		}
		drawText(base, face, tx+maxInt(1, s(1)), ty+maxInt(1, s(1)), color.NRGBA{R: 0, G: 0, B: 0, A: 180}, label)
		drawText(base, face, tx, ty, topRatedAccent, label)
		return
	}

	border := topRatedAccent
	border.A = 220
	chrome := tileChrome{
		fill:   color.NRGBA{R: 10, G: 12, B: 18, A: 225},
		border: border,
		shadow: color.NRGBA{R: 0, G: 0, B: 0, A: 80},
	}
	textCol := topRatedAccent
	switch opts.style {
	case "silver":
		chrome.fill = color.NRGBA{R: 20, G: 22, B: 28, A: 45}
		chrome.border = color.NRGBA{R: 244, G: 244, B: 245, A: 230}
		textCol = color.NRGBA{R: 244, G: 244, B: 245, A: 245}
	case "tile":
		if c, err := parseHexColor(opts.tileColor); opts.tileColor != "" && err == nil {
			c.A = 235
			chrome.fill = c
			chrome.border = color.NRGBA{}
			textCol = color.NRGBA{R: 255, G: 255, B: 255, A: 255}
		}
	}
	if opts.style != "tile" {
		// Every bordered style (glass, square, silver) answers the same accent
		// the tile style's fill does, tinting its own border instead.
		if c, err := parseHexColor(opts.tileColor); opts.tileColor != "" && err == nil {
			chrome.border = color.NRGBA{R: c.R, G: c.G, B: c.B, A: chrome.border.A}
		}
	}
	radius := s(5)
	if opts.style == "square" {
		radius = 0
	}
	drawSoftTile(base, r, radius, chrome)
	drawText(base, face, tx, ty, textCol, label)
}
