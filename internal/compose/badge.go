package compose

import (
	"bytes"
	"embed"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"log/slog"
	"strings"
	"sync"

	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/gobold"
	"golang.org/x/image/font/gofont/goregular"
	"golang.org/x/image/font/opentype"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

//go:embed assets/ratings/*.png
var ratingIconFS embed.FS

//go:embed assets/badges/*.png
var badgeIconFS embed.FS

var (
	onceFaces sync.Once
	faceValue font.Face // 22pt bold — rating value (normal scale)
	faceLabel font.Face // 17pt regular — overlay labels (normal scale)

	onceIcons   sync.Once
	ratingIcons map[string]image.Image

	onceBadgeLogos sync.Once
	badgeLogos     map[string]*image.NRGBA // quality-badge brand logos (white on transparent)

	fontBoldParsed    *opentype.Font
	fontRegularParsed *opentype.Font

	// scaledValueFaces / scaledLabelFaces / scaledBadgeFaces cache faces keyed
	// by int(scale*100) to avoid float64 map key precision issues.
	scaledValueFaces sync.Map
	scaledLabelFaces sync.Map
	scaledBadgeFaces sync.Map
)

func ensureFaces() {
	onceFaces.Do(func() {
		if tt, err := opentype.Parse(gobold.TTF); err != nil {
			slog.Warn("Failed to parse the bold font", "error", err)
		} else {
			fontBoldParsed = tt
			if f, err := opentype.NewFace(tt, &opentype.FaceOptions{
				Size: 22, DPI: 96, Hinting: font.HintingFull,
			}); err != nil {
				slog.Warn("Failed to create the bold font face", "error", err)
			} else {
				faceValue = f
			}
		}
		if tt, err := opentype.Parse(goregular.TTF); err != nil {
			slog.Warn("Failed to parse the regular font", "error", err)
		} else {
			fontRegularParsed = tt
			if f, err := opentype.NewFace(tt, &opentype.FaceOptions{
				Size: 17, DPI: 96, Hinting: font.HintingFull,
			}); err != nil {
				slog.Warn("Failed to create the regular font face", "error", err)
			} else {
				faceLabel = f
			}
		}
	})
}

func ensureIcons() {
	onceIcons.Do(func() {
		ratingIcons = make(map[string]image.Image)
		entries, err := ratingIconFS.ReadDir("assets/ratings")
		if err != nil {
			slog.Warn("Failed to read the rating icons", "error", err)
			return
		}
		for _, e := range entries {
			data, err := ratingIconFS.ReadFile("assets/ratings/" + e.Name())
			if err != nil {
				continue
			}
			img, err := png.Decode(bytes.NewReader(data))
			if err != nil {
				continue
			}
			ratingIcons[strings.TrimSuffix(e.Name(), ".png")] = img
		}
	})
}

// valueFaceFor returns a bold face scaled for the output size.
func valueFaceFor(scale float64) font.Face {
	if scale == 1 || fontBoldParsed == nil {
		return faceValue
	}
	key := int(scale * 100)
	if f, ok := scaledValueFaces.Load(key); ok {
		return f.(font.Face)
	}
	f, err := opentype.NewFace(fontBoldParsed, &opentype.FaceOptions{
		Size: 22 * scale, DPI: 96, Hinting: font.HintingFull,
	})
	if err != nil {
		return faceValue
	}
	scaledValueFaces.Store(key, f)
	return f
}

// labelFaceFor returns a regular face scaled for the output size.
// Used by badge_overlay.go for quality/provider/genre label text.
func labelFaceFor(scale float64) font.Face {
	if scale == 1 || fontRegularParsed == nil {
		return faceLabel
	}
	key := int(scale * 100)
	if f, ok := scaledLabelFaces.Load(key); ok {
		return f.(font.Face)
	}
	f, err := opentype.NewFace(fontRegularParsed, &opentype.FaceOptions{
		Size: 17 * scale, DPI: 96, Hinting: font.HintingFull,
	})
	if err != nil {
		return faceLabel
	}
	scaledLabelFaces.Store(key, f)
	return f
}

// ensureBadgeLogos lazily loads the quality-badge brand logos (IMAX, Dolby
// Vision/Atmos, HDR10, HDR10+). They are white-on-transparent PNGs keyed by
// badge token (e.g. "dv", "atmos", "imax", "hdr10", "hdr10plus").
func ensureBadgeLogos() {
	onceBadgeLogos.Do(func() {
		badgeLogos = make(map[string]*image.NRGBA)
		entries, err := badgeIconFS.ReadDir("assets/badges")
		if err != nil {
			slog.Warn("Failed to read the badge logos", "error", err)
			return
		}
		for _, e := range entries {
			data, err := badgeIconFS.ReadFile("assets/badges/" + e.Name())
			if err != nil {
				continue
			}
			img, err := png.Decode(bytes.NewReader(data))
			if err != nil {
				continue
			}
			badgeLogos[strings.TrimSuffix(e.Name(), ".png")] = toNRGBA(img)
		}
	})
}

// badgeFaceFor returns a bold face sized for quality-badge text fallbacks —
// tokens without a brand logo asset (e.g. "4K", "HDR", "DTS").
func badgeFaceFor(scale float64) font.Face {
	const pt = 15.5
	if fontBoldParsed == nil {
		return faceValue
	}
	key := int(scale * 100)
	if f, ok := scaledBadgeFaces.Load(key); ok {
		return f.(font.Face)
	}
	f, err := opentype.NewFace(fontBoldParsed, &opentype.FaceOptions{
		Size: pt * scale, DPI: 96, Hinting: font.HintingFull,
	})
	if err != nil {
		return faceValue
	}
	scaledBadgeFaces.Store(key, f)
	return f
}

// outputScale maps the configured size to a badge scale factor so overlays
// stay proportional on large/4k renders.
func outputScale(size imageconfig.MediaSize) float64 {
	switch size {
	case imageconfig.SizeLarge:
		return 1.5
	case imageconfig.Size4K:
		return 3
	default:
		return 1
	}
}

// providerAccent returns a provider-specific accent color for the badge strip.
var providerAccent = map[string]color.NRGBA{
	"tmdb":           {R: 1, G: 180, B: 228, A: 255},
	"imdb":           {R: 245, G: 197, B: 24, A: 255},
	"rt":             {R: 250, G: 50, B: 10, A: 255},
	"rtaudience":     {R: 250, G: 130, B: 10, A: 255},
	"metacritic":     {R: 255, G: 204, B: 52, A: 255},
	"metacriticuser": {R: 255, G: 204, B: 52, A: 255},
	"rogerebert":     {R: 193, G: 18, B: 31, A: 255},
	"mdblist":        {R: 139, G: 92, B: 246, A: 255},
	"letterboxd":     {R: 0, G: 169, B: 157, A: 255},
	"trakt":          {R: 237, G: 28, B: 36, A: 255},
	"simkl":          {R: 28, G: 176, B: 246, A: 255},
	"anilist":        {R: 2, G: 169, B: 255, A: 255},
	"mal":            {R: 44, G: 111, B: 187, A: 255},
	"kitsu":          {R: 247, G: 110, B: 24, A: 255},
}

func accentFor(source string) color.NRGBA {
	if c, ok := providerAccent[source]; ok {
		return c
	}
	return color.NRGBA{R: 160, G: 160, B: 160, A: 255}
}

// drawTintedIcon paints icon (a white-on-transparent glyph) into dst at rect,
// recolored to tint, using the glyph's alpha as the mask. The glyph is trimmed
// of transparent padding and scaled with its aspect ratio preserved, so marks
// fill the box instead of being squeezed to its shape.
func drawTintedIcon(dst *image.NRGBA, rect image.Rectangle, icon image.Image, tint color.NRGBA) {
	glyph := trimTransparent(toNRGBA(icon))
	rect = fitRect(glyph.Bounds().Dx(), glyph.Bounds().Dy(), rect)
	if rect.Dx() <= 0 || rect.Dy() <= 0 {
		return
	}
	scaled := image.NewNRGBA(image.Rect(0, 0, rect.Dx(), rect.Dy()))
	xdraw.CatmullRom.Scale(scaled, scaled.Bounds(), glyph, glyph.Bounds(), xdraw.Over, nil)
	draw.DrawMask(dst, rect, &image.Uniform{C: tint}, image.Point{}, scaled, image.Point{}, draw.Over)
}

// badgeChrome bundles the style/theme-resolved drawing parameters.
type badgeChrome struct {
	radius     func(innerH int) int
	bg         color.NRGBA
	border     color.NRGBA // zero alpha = no border
	valueColor color.NRGBA
	iconColor  color.NRGBA
}

func chromeFor(cfg imageconfig.Config) badgeChrome {
	c := badgeChrome{
		radius:     func(int) int { return 4 },
		bg:         color.NRGBA{R: 0, G: 0, B: 0, A: 210},
		valueColor: color.NRGBA{R: 255, G: 255, B: 255, A: 255},
		iconColor:  color.NRGBA{R: 235, G: 235, B: 240, A: 255},
	}
	switch cfg.BadgeStyle {
	case imageconfig.BadgeSquare:
		c.radius = func(int) int { return 0 }
	case imageconfig.BadgeGlass:
		// Outline style: fully transparent fill, rounded capsule, visible border only.
		// Visually distinct from Pill (which has a solid fill).
		c.radius = func(innerH int) int { return innerH / 2 }
		c.bg = color.NRGBA{A: 0}
		c.border = color.NRGBA{R: 255, G: 255, B: 255, A: 200}
	case imageconfig.BadgePill:
		// Solid capsule: fully rounded ends, opaque fill.
		c.radius = func(innerH int) int { return innerH / 2 }
	}
	if cfg.BadgeTheme == imageconfig.ThemeLight {
		if cfg.BadgeStyle == imageconfig.BadgeGlass {
			c.bg = color.NRGBA{A: 0}
			c.border = color.NRGBA{R: 0, G: 0, B: 0, A: 200}
			c.valueColor = color.NRGBA{R: 18, G: 18, B: 24, A: 255}
			c.iconColor = color.NRGBA{R: 30, G: 30, B: 38, A: 255}
		} else {
			c.bg = color.NRGBA{R: 246, G: 246, B: 248, A: 240}
			c.valueColor = color.NRGBA{R: 18, G: 18, B: 24, A: 255}
			c.iconColor = color.NRGBA{R: 30, G: 30, B: 38, A: 255}
		}
	}
	return c
}

// badgeSpec holds pre-computed layout info for a single rating badge.
type badgeSpec struct {
	value  string
	valW   int
	icon   image.Image
	w      int
	accent color.NRGBA
	x      int // resolved x position, set during layout
}

// drawRatingRow renders a horizontal slice of badge specs at row y.
func drawRatingRow(out *image.NRGBA, specs []badgeSpec, y, innerH, padX, iconSize, iconGap, accentW int, face font.Face, chrome badgeChrome) {
	radius := chrome.radius(innerH)
	fm := face.Metrics()
	valAscent := fm.Ascent.Ceil()
	valDescent := fm.Descent.Ceil()
	valH := valAscent + valDescent

	for _, sp := range specs {
		bRect := image.Rect(sp.x, y, sp.x+sp.w, y+innerH)
		if chrome.bg.A > 0 {
			fillRoundedRect(out, bRect, radius, chrome.bg)
		}
		if chrome.border.A > 0 {
			drawRectBorder(out, bRect, radius, chrome.border)
		}

		iconTint := chrome.iconColor
		contentX := sp.x
		if radius < innerH/2 {
			aRect := image.Rect(sp.x, y, sp.x+accentW, y+innerH)
			fillRect(out, aRect.Intersect(bRect), sp.accent)
			contentX += accentW
		} else {
			iconTint = sp.accent
		}
		contentX += padX

		if sp.icon != nil {
			iRect := image.Rect(contentX, y+(innerH-iconSize)/2, contentX+iconSize, y+(innerH-iconSize)/2+iconSize)
			drawTintedIcon(out, iRect, sp.icon, iconTint)
			contentX += iconSize + iconGap
		}

		valY := y + (innerH-valH)/2 + valAscent
		drawText(out, face, contentX, valY, chrome.valueColor, sp.value)
	}
}

// ratingStripDims holds the scale-resolved layout constants for the rating
// strip, shared by drawBadgesInPlace (which draws it) and ratingsBandHeight
// (which measures it) so the reserved band height always matches the draw.
type ratingStripDims struct {
	accentW, padX, padY, iconSize, iconGap, badgeGap, rowGap, edgeX, edgeY int
}

func ratingStripDimsFor(scale float64) ratingStripDims {
	s := func(v float64) int { return int(v*scale + 0.5) }
	return ratingStripDims{
		accentW:  s(4),
		padX:     s(14),
		padY:     s(10),
		iconSize: s(34),
		iconGap:  s(8),
		badgeGap: s(11),
		rowGap:   s(11),
		edgeX:    s(16),
		edgeY:    s(16),
	}
}

// ratingsBandHeight returns the vertical space (strip plus edge margins) the
// rating strip occupies for a frame of width frameW, so the logo can be
// letterboxed above a clear band.
func ratingsBandHeight(frameW int, ratings []provider.Rating, cfg imageconfig.Config) int {
	if cfg.RatingsLayout == imageconfig.LayoutNone || cfg.RatingsLayout == imageconfig.LayoutSplitSide {
		return 0
	}
	if len(cfg.Ratings) == 0 {
		return 0
	}
	filtered := filterRatings(ratings, cfg.Ratings)
	if len(filtered) == 0 {
		return 0
	}
	ensureFaces()
	ensureIcons()
	if faceValue == nil {
		return 0
	}
	scale := outputScale(cfg.Size)
	face := valueFaceFor(scale)
	fm := face.Metrics()
	valH := fm.Ascent.Ceil() + fm.Descent.Ceil()
	d := ratingStripDimsFor(scale)
	accentW, padX, iconSize, iconGap, badgeGap := d.accentW, d.padX, d.iconSize, d.iconGap, d.badgeGap
	padY, rowGap, edgeX, edgeY := d.padY, d.rowGap, d.edgeX, d.edgeY
	innerH := padY*2 + maxInt(valH, iconSize)
	maxRowW := frameW - edgeX*2
	rowW, rows := 0, 0
	for _, r := range filtered {
		value := r.Label
		if value == "" {
			value = "N/A"
		}
		bw := accentW + padX + textWidth(face, value) + padX
		if ratingIcons[r.Source] != nil {
			bw += iconSize + iconGap
		}
		need := bw
		if rowW > 0 {
			need += badgeGap
		}
		if rowW > 0 && rowW+need > maxRowW {
			rows++
			rowW = bw
		} else {
			rowW += need
		}
	}
	if rowW > 0 {
		rows++
	}
	if rows == 0 {
		return 0
	}
	return rows*innerH + (rows-1)*rowGap + edgeY*2
}

// drawBadgesInPlace composites rating badges onto out according to the render config.
// Returns the pixel height consumed (zero when layout is none).
func drawBadgesInPlace(out *image.NRGBA, ratings []provider.Rating, cfg imageconfig.Config) int {
	if cfg.RatingsLayout == imageconfig.LayoutNone {
		return 0
	}
	if len(ratings) == 0 {
		return 0
	}
	ensureFaces()
	ensureIcons()
	if faceValue == nil {
		return 0
	}

	filtered := filterRatings(ratings, cfg.Ratings)
	if len(filtered) == 0 {
		return 0
	}
	// A per-config cap keeps only the first N badges (already provider-ordered).
	if cfg.RatingsMax != nil && len(filtered) > *cfg.RatingsMax {
		filtered = filtered[:*cfg.RatingsMax]
	}

	scale := outputScale(cfg.Size)
	// A per-config scale multiplier (percent) sizes the whole rating strip.
	if cfg.RatingBadgeScale != 0 {
		scale *= float64(cfg.RatingBadgeScale) / 100
	}

	face := valueFaceFor(scale)
	fm := face.Metrics()
	valAscent := fm.Ascent.Ceil()
	valDescent := fm.Descent.Ceil()
	valH := valAscent + valDescent

	d := ratingStripDimsFor(scale)
	accentW, padX, padY, iconSize := d.accentW, d.padX, d.padY, d.iconSize
	iconGap, badgeGap, rowGap, edgeX, edgeY := d.iconGap, d.badgeGap, d.rowGap, d.edgeX, d.edgeY

	innerH := padY*2 + maxInt(valH, iconSize)
	chrome := chromeFor(cfg)

	bounds := out.Bounds()
	maxRowW := bounds.Dx() - edgeX*2

	specs := make([]badgeSpec, 0, len(filtered))
	for _, r := range filtered {
		value := r.Label
		if value == "" {
			value = "N/A"
		}
		vw := textWidth(face, value)
		icon := ratingIcons[r.Source]
		bw := accentW + padX + vw + padX
		if icon != nil {
			bw += iconSize + iconGap
		}
		specs = append(specs, badgeSpec{
			value:  value,
			valW:   vw,
			icon:   icon,
			w:      bw,
			accent: accentFor(r.Source),
		})
	}

	if cfg.RatingsLayout == imageconfig.LayoutSplitSide {
		return drawBadgesSplitSide(out, specs, innerH, rowGap, edgeX, edgeY, padX, iconSize, iconGap, accentW, face, chrome, bounds)
	}

	// Greedy row wrap for top/bottom layouts.
	var rows [][]badgeSpec
	var row []badgeSpec
	rowW := 0
	for _, sp := range specs {
		need := sp.w
		if len(row) > 0 {
			need += badgeGap
		}
		if len(row) > 0 && rowW+need > maxRowW {
			rows = append(rows, row)
			row = nil
			rowW = 0
			need = sp.w
		}
		row = append(row, sp)
		rowW += need
	}
	if len(row) > 0 {
		rows = append(rows, row)
	}

	totalH := len(rows)*innerH + (len(rows)-1)*rowGap

	startY := bounds.Max.Y - edgeY - totalH
	if cfg.RatingsLayout == imageconfig.LayoutTop {
		startY = bounds.Min.Y + edgeY
	}
	if startY < bounds.Min.Y+edgeY {
		startY = bounds.Min.Y + edgeY
	}

	y := startY
	for _, r := range rows {
		rw := 0
		for i, sp := range r {
			rw += sp.w
			if i > 0 {
				rw += badgeGap
			}
		}
		x := bounds.Min.X + (bounds.Dx()-rw)/2
		if x < bounds.Min.X+edgeX {
			x = bounds.Min.X + edgeX
		}
		for i := range r {
			r[i].x = x
			x += r[i].w + badgeGap
		}
		drawRatingRow(out, r, y, innerH, padX, iconSize, iconGap, accentW, face, chrome)
		y += innerH + rowGap
	}

	return totalH
}

// drawBadgesSplitSide renders the first half of badges vertically on the left
// edge and the second half on the right edge, both centered vertically.
func drawBadgesSplitSide(out *image.NRGBA, specs []badgeSpec, innerH, rowGap, edgeX, edgeY, padX, iconSize, iconGap, accentW int, face font.Face, chrome badgeChrome, bounds image.Rectangle) int {
	if len(specs) == 0 {
		return 0
	}
	mid := (len(specs) + 1) / 2
	left := specs[:mid]
	right := specs[mid:]

	leftH := len(left)*innerH + (len(left)-1)*rowGap
	rightH := len(right)*innerH + (len(right)-1)*rowGap
	totalH := maxInt(leftH, rightH)

	midY := bounds.Min.Y + bounds.Dy()/2
	minY := bounds.Min.Y + edgeY
	maxYLeft := bounds.Max.Y - edgeY - leftH
	maxYRight := bounds.Max.Y - edgeY - rightH
	if maxYLeft < minY {
		maxYLeft = minY
	}
	if maxYRight < minY {
		maxYRight = minY
	}

	y := midY - leftH/2
	if y < minY {
		y = minY
	}
	if y > maxYLeft {
		y = maxYLeft
	}
	for i := range left {
		left[i].x = bounds.Min.X + edgeX
		drawRatingRow(out, left[i:i+1], y, innerH, padX, iconSize, iconGap, accentW, face, chrome)
		y += innerH + rowGap
	}

	y = midY - rightH/2
	if y < minY {
		y = minY
	}
	if y > maxYRight {
		y = maxYRight
	}
	for i := range right {
		right[i].x = bounds.Max.X - edgeX - right[i].w
		drawRatingRow(out, right[i:i+1], y, innerH, padX, iconSize, iconGap, accentW, face, chrome)
		y += innerH + rowGap
	}

	return totalH
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// filterRatings returns only the ratings whose source is in the want list.
// If want is empty, all ratings are returned.
func filterRatings(ratings []provider.Rating, want []string) []provider.Rating {
	if len(want) == 0 {
		return ratings
	}
	wantSet := make(map[string]bool, len(want))
	for _, w := range want {
		wantSet[w] = true
	}
	out := make([]provider.Rating, 0, len(ratings))
	for _, r := range ratings {
		if wantSet[r.Source] {
			out = append(out, r)
		}
	}
	return out
}
