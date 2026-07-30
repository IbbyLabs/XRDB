package compose

import (
	"bytes"
	"embed"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"log/slog"
	"math"
	"strconv"
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
	// ratingIconColored marks the sources whose icon carries its own brand
	// colors, so it is drawn as it is rather than recolored to match the badge.
	ratingIconColored map[string]bool

	onceBadgeLogos sync.Once
	badgeLogos     map[string]*image.NRGBA // quality-badge brand logos (white on transparent)

	fontBoldParsed    *opentype.Font
	fontRegularParsed *opentype.Font

	// scaledValueFaces / scaledLabelFaces / scaledBadgeFaces cache faces keyed
	// by int(scale*100) to avoid float64 map key precision issues.
	scaledValueFaces   sync.Map
	scaledLabelFaces   sync.Map
	scaledBadgeFaces   sync.Map
	scaledEyebrowFaces sync.Map
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
		ratingIconColored = make(map[string]bool)
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
			source := strings.TrimSuffix(e.Name(), ".png")
			ratingIcons[source] = img
			ratingIconColored[source] = isBrandColored(img)
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

// eyebrowFaceFor returns a small bold face for the "AGE" kicker above a media
// certification badge value. Roughly half the value face size.
func eyebrowFaceFor(scale float64) font.Face {
	ensureFaces()
	if fontBoldParsed == nil {
		return faceLabel
	}
	key := int(scale * 100)
	if f, ok := scaledEyebrowFaces.Load(key); ok {
		return f.(font.Face)
	}
	f, err := opentype.NewFace(fontBoldParsed, &opentype.FaceOptions{
		Size: 11 * scale, DPI: 96, Hinting: font.HintingFull,
	})
	if err != nil {
		return faceLabel
	}
	scaledEyebrowFaces.Store(key, f)
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
	"allocine":       {R: 254, G: 204, B: 0, A: 255},
	"allocinepress":  {R: 245, G: 158, B: 11, A: 255},
	"filmweb":        {R: 236, G: 176, B: 20, A: 255},
}

// iconOutlineColor returns the configured outline color for provider marks, or
// a zero color when none is set.
func iconOutlineColor(cfg imageconfig.Config) color.NRGBA {
	if cfg.IconOutlineColor == "" {
		return color.NRGBA{}
	}
	c, err := parseHexColor(cfg.IconOutlineColor)
	if err != nil {
		return color.NRGBA{}
	}
	return c
}

// resolveProviderAccent returns the per-config override color for a provider if
// one is set, otherwise the built-in accent.
func resolveProviderAccent(cfg imageconfig.Config, source string) color.NRGBA {
	if hex, ok := cfg.RatingProviderOverrides[source]; ok {
		if c, err := parseHexColor(hex); err == nil {
			return c
		}
	}
	return accentFor(source)
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
func drawTintedIcon(dst *image.NRGBA, rect image.Rectangle, icon image.Image, tint color.NRGBA, shape string, accent color.NRGBA, outline color.NRGBA, outlineWidth int) {
	drawIconPlate(dst, rect, shape, accent)
	rect = insetForPlate(rect, shape)
	scaled, rect := scaleIconToFit(icon, rect)
	if scaled == nil {
		return
	}
	clipIconToShape(scaled, shape)
	drawIconOutline(dst, rect, scaled, outline, outlineWidth)
	draw.DrawMask(dst, rect, &image.Uniform{C: tint}, image.Point{}, scaled, image.Point{}, draw.Over)
}

// insetForPlate shrinks the icon box so a mark sits inside its plate instead of
// running to the edge.
func insetForPlate(rect image.Rectangle, shape string) image.Rectangle {
	if iconShapeRadius(shape) == 0 {
		return rect
	}
	side := rect.Dx()
	if rect.Dy() < side {
		side = rect.Dy()
	}
	pad := maxInt(1, side*18/100)
	inset := rect.Inset(pad)
	if inset.Dx() <= 0 || inset.Dy() <= 0 {
		return rect
	}
	return inset
}

// drawBrandIcon paints a full-color brand mark as it is, so marks built from
// several colors (Letterboxd's three dots, IMDb's black-on-yellow wordmark)
// keep them instead of flattening to one silhouette.
func drawBrandIcon(dst *image.NRGBA, rect image.Rectangle, icon image.Image, shape string, accent color.NRGBA, outline color.NRGBA, outlineWidth int) {
	drawIconPlate(dst, rect, shape, accent)
	rect = insetForPlate(rect, shape)
	scaled, rect := scaleIconToFit(icon, rect)
	if scaled == nil {
		return
	}
	clipIconToShape(scaled, shape)
	drawIconOutline(dst, rect, scaled, outline, outlineWidth)
	draw.Draw(dst, rect, scaled, image.Point{}, draw.Over)
}

// iconShapeRadius maps a shape name to its corner radius as a fraction of the
// icon box. Zero means no shape was requested.
func iconShapeRadius(shape string) float64 {
	switch shape {
	case "circle":
		return 0.5
	case "squircle":
		return 0.3
	case "rounded":
		return 0.15
	default:
		return 0
	}
}

// drawIconPlate fills the requested shape behind a mark. Clipping alone cannot
// show a shape, because the marks already sit inside one; the plate is what
// makes circle, squircle and rounded tell apart. accent tints its edge so the
// plate reads as part of the source rather than a grey box.
func drawIconPlate(dst *image.NRGBA, rect image.Rectangle, shape string, accent color.NRGBA) {
	frac := iconShapeRadius(shape)
	if frac == 0 {
		return
	}
	r := int(frac*math.Min(float64(rect.Dx()), float64(rect.Dy())) + 0.5)
	fillRoundedRect(dst, rect, r, color.NRGBA{R: 15, G: 23, B: 42, A: 235})
	if accent.A > 0 {
		drawRectBorder(dst, rect, r, color.NRGBA{R: accent.R, G: accent.G, B: accent.B, A: 200})
	}
}

// clipIconToShape clears the alpha outside the requested shape, trimming a mark
// to a circle or a rounded tile. An unrecognised shape leaves the mark alone.
func clipIconToShape(img *image.NRGBA, shape string) {
	var radiusFraction float64
	switch shape {
	case "circle":
		radiusFraction = 0.5
	case "squircle":
		radiusFraction = 0.3
	case "rounded":
		radiusFraction = 0.15
	default:
		return
	}
	b := img.Bounds()
	w, h := float64(b.Dx()), float64(b.Dy())
	r := radiusFraction * math.Min(w, h)
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if insideRoundedRect(float64(x-b.Min.X)+0.5, float64(y-b.Min.Y)+0.5, w, h, r) {
				continue
			}
			c := img.NRGBAAt(x, y)
			c.A = 0
			img.SetNRGBA(x, y, c)
		}
	}
}

// insideRoundedRect reports whether a point sits inside a w by h rectangle whose
// corners are rounded by r. A radius of half the shorter side gives a circle or
// a stadium, matching how the shapes are named.
func insideRoundedRect(x, y, w, h, r float64) bool {
	if r <= 0 {
		return x >= 0 && y >= 0 && x <= w && y <= h
	}
	if x < 0 || y < 0 || x > w || y > h {
		return false
	}
	cx := math.Min(math.Max(x, r), w-r)
	cy := math.Min(math.Max(y, r), h-r)
	dx, dy := x-cx, y-cy
	return dx*dx+dy*dy <= r*r
}

// scaleIconToFit trims an icon's transparent padding and scales it into rect
// with its aspect ratio kept, returning the scaled image and the rect it fills.
// A nil image means there is nothing worth drawing.
func scaleIconToFit(icon image.Image, rect image.Rectangle) (*image.NRGBA, image.Rectangle) {
	glyph := trimTransparent(toNRGBA(icon))
	rect = fitRect(glyph.Bounds().Dx(), glyph.Bounds().Dy(), rect)
	if rect.Dx() <= 0 || rect.Dy() <= 0 {
		return nil, rect
	}
	scaled := image.NewNRGBA(image.Rect(0, 0, rect.Dx(), rect.Dy()))
	xdraw.CatmullRom.Scale(scaled, scaled.Bounds(), glyph, glyph.Bounds(), xdraw.Over, nil)
	return scaled, rect
}

// isBrandColored reports whether an icon carries color of its own. The bundled
// marks come in two kinds: white-on-transparent glyphs meant to be recolored to
// match the badge, and full-color brand marks meant to be drawn as they are.
// Deciding from the pixels means a mark starts rendering in color as soon as a
// color asset replaces a white one, with no list to keep in step.
func isBrandColored(icon image.Image) bool {
	img := toNRGBA(icon)
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			c := img.NRGBAAt(x, y)
			if c.A < 24 {
				continue
			}
			// Anti-aliased edges of a white glyph stay near-white, so allow a
			// little drift before calling a mark colored.
			if c.R < 232 || c.G < 232 || c.B < 232 {
				return true
			}
		}
	}
	return false
}

// badgeChrome bundles the style/theme-resolved drawing parameters.
type badgeChrome struct {
	radius     func(innerH int) int
	bg         color.NRGBA
	border     color.NRGBA // zero alpha = no border
	valueColor color.NRGBA
	iconColor  color.NRGBA
	// outline is drawn behind the value when there is no tile to separate it
	// from the artwork. Zero alpha = no outline.
	outline      color.NRGBA
	outlineWidth int
	// hideAccentBar suppresses the leading accent stripe for styles that have
	// no tile for it to sit against; the provider colour goes on the mark.
	hideAccentBar bool
	// hideIcon draws the value on its own, with no provider mark.
	hideIcon bool
	// hideStackRail drops the accent rail above the mark in the stacked style.
	hideStackRail bool
	// stacked draws the badge as an accent rail above a centred mark with the
	// value beneath. The remaining fields are its vertical metrics, filled in
	// once the strip's scale is known.
	stacked bool
	// squared keeps the corners on one edge square, for the anchored strip.
	squared       squaredCorners
	stackRailH    int
	stackRailGap  int
	stackValueGap int
	stackPadY     int
}

// stackedBadgeInnerH is the height of a stacked badge: padding, accent rail,
// the mark, then the value.
func stackedBadgeInnerH(d ratingStripDims, valH int, hideIcon, hideRail bool) int {
	h := d.padY*2 + stackedValueGap(d) + valH
	if !hideRail {
		h += d.accentW + d.iconGap
	}
	if !hideIcon {
		h += d.iconSize
	}
	return h
}

// stackedBadgeWidth sizes a stacked badge around whichever of the mark or the
// value is wider, since both are centred rather than sitting side by side.
func stackedBadgeWidth(d ratingStripDims, valW int, hideIcon bool) int {
	content := valW
	if !hideIcon {
		content = maxInt(d.iconSize, valW)
	}
	return content + d.padX*2
}

func stackedValueGap(d ratingStripDims) int { return maxInt(6, d.padY*3/5) }

func chromeFor(cfg imageconfig.Config) badgeChrome {
	c := badgeChrome{
		radius:     func(int) int { return 4 },
		bg:         color.NRGBA{R: 0, G: 0, B: 0, A: 210},
		valueColor: color.NRGBA{R: 255, G: 255, B: 255, A: 255},
		iconColor:  color.NRGBA{R: 235, G: 235, B: 240, A: 255},
	}
	c.hideIcon = cfg.RatingIconHidden
	c.hideStackRail = cfg.StackedLineHidden
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
	case imageconfig.BadgePlain:
		// No tile at all, so the value carries its own outline or it disappears
		// against light artwork.
		c.radius = func(int) int { return 0 }
		c.bg = color.NRGBA{A: 0}
		c.outline = color.NRGBA{A: 180}
		c.outlineWidth = 1
		c.hideAccentBar = true
		if w := cfg.NoBackgroundBadgeOutlineWidth; w > 0 {
			c.outlineWidth = w
		}
		if o, err := parseHexColor(cfg.NoBackgroundBadgeOutlineColor); cfg.NoBackgroundBadgeOutlineColor != "" && err == nil {
			o.A = 255
			c.outline = o
		}
	case imageconfig.BadgeTile:
		// Dark rounded tile, squarer than the pill.
		c.radius = func(innerH int) int { return maxInt(2, innerH/5) }
		c.bg = color.NRGBA{R: 16, G: 18, B: 24, A: 220}
	case imageconfig.BadgeStacked:
		c.radius = func(innerH int) int { return maxInt(3, innerH/8) }
		c.bg = color.NRGBA{R: 16, G: 18, B: 24, A: 215}
		c.stacked = true
		c.hideAccentBar = true
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
	// An explicit value colour overrides whatever the style and theme picked.
	if v, err := parseHexColor(cfg.AggregateValueColor); cfg.AggregateValueColor != "" && err == nil {
		v.A = 255
		c.valueColor = v
	}
	// Last, so it reaches every style including the ones that draw no border of
	// their own.
	if b, err := parseHexColor(cfg.RatingBadgeBorderColor); cfg.RatingBadgeBorderColor != "" && err == nil {
		b.A = 255
		if o := cfg.RatingBadgeBorderOpacity; o > 0 {
			b.A = uint8(maxInt(1, o*255/100))
		}
		c.border = b
	}
	return c
}

// badgeSpec holds pre-computed layout info for a single rating badge.
type badgeSpec struct {
	value string
	valW  int
	icon  image.Image
	// colored marks an icon that carries its own brand colors, so it is drawn
	// as it is instead of being recolored to match the badge.
	colored bool
	// iconShape clips the mark to a circle or rounded tile when set.
	iconShape string
	// iconScale sizes the mark within the badge box, as a percent; 0 = 100.
	iconScale int
	// iconOutline traces the mark's own edge; zero alpha or width draws none.
	iconOutline      color.NRGBA
	iconOutlineWidth int
	w                int
	accent           color.NRGBA
	x                int // resolved x position, set during layout
}

// drawIconOutline traces mask's silhouette in col by stamping it around the
// mark, so the stroke follows the logo rather than boxing it.
func drawIconOutline(dst *image.NRGBA, rect image.Rectangle, mask *image.NRGBA, col color.NRGBA, width int) {
	if width <= 0 || col.A == 0 {
		return
	}
	for dy := -width; dy <= width; dy++ {
		for dx := -width; dx <= width; dx++ {
			if (dx == 0 && dy == 0) || dx*dx+dy*dy > width*width {
				continue
			}
			draw.DrawMask(dst, rect.Add(image.Point{X: dx, Y: dy}),
				&image.Uniform{C: col}, image.Point{}, mask, image.Point{}, draw.Over)
		}
	}
}

// anchoredEdges zeroes the inset on the edge the strip hangs from, leaving the
// other axis alone. A top row loses its top gap, a side column its side gap.
func anchoredEdges(cfg imageconfig.Config, edgeX, edgeY int) (int, int) {
	switch cfg.RatingsLayout {
	case imageconfig.LayoutTop, imageconfig.LayoutBottom, imageconfig.LayoutTopBottom:
		return edgeX, 0
	case imageconfig.LayoutLeft, imageconfig.LayoutRight, imageconfig.LayoutSplitSide:
		return 0, edgeY
	}
	return edgeX, edgeY
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
			fillRoundedRectSquared(out, bRect, radius, chrome.squared, chrome.bg)
		}
		if chrome.border.A > 0 {
			drawRectBorder(out, bRect, radius, chrome.border)
		}

		if chrome.stacked {
			drawStackedBadge(out, sp, y, innerH, iconSize, face, chrome, valAscent, valH)
			continue
		}

		iconTint := chrome.iconColor
		contentX := sp.x
		if radius < innerH/2 && !chrome.hideAccentBar {
			aRect := image.Rect(sp.x, y, sp.x+accentW, y+innerH)
			fillRect(out, aRect.Intersect(bRect), sp.accent)
			contentX += accentW
		} else {
			iconTint = sp.accent
		}
		contentX += padX

		if sp.icon != nil && !chrome.hideIcon {
			// The mark scales within the shared box, so the row height holds even
			// when one provider's mark is grown or shrunk.
			drawSize := iconSize
			if sp.iconScale > 0 {
				drawSize = iconSize * sp.iconScale / 100
				if lo := iconSize / 2; drawSize < lo {
					drawSize = lo
				}
				if drawSize > innerH {
					drawSize = innerH
				}
			}
			iconTop := y + (innerH-drawSize)/2
			iRect := image.Rect(contentX, iconTop, contentX+drawSize, iconTop+drawSize)
			if sp.colored {
				drawBrandIcon(out, iRect, sp.icon, sp.iconShape, sp.accent, sp.iconOutline, sp.iconOutlineWidth)
			} else {
				drawTintedIcon(out, iRect, sp.icon, iconTint, sp.iconShape, sp.accent, sp.iconOutline, sp.iconOutlineWidth)
			}
			contentX += iconSize + iconGap
		}

		valY := y + (innerH-valH)/2 + valAscent
		if chrome.outline.A > 0 && chrome.outlineWidth > 0 {
			// Ring the glyphs rather than offsetting once, so the value stays
			// legible whichever way the artwork is bright behind it.
			for dy := -chrome.outlineWidth; dy <= chrome.outlineWidth; dy++ {
				for dx := -chrome.outlineWidth; dx <= chrome.outlineWidth; dx++ {
					if dx == 0 && dy == 0 {
						continue
					}
					drawText(out, face, contentX+dx, valY+dy, chrome.outline, sp.value)
				}
			}
		}
		drawText(out, face, contentX, valY, chrome.valueColor, sp.value)
	}
}

// ratingStripDims holds the scale-resolved layout constants for the rating
// strip, shared by drawBadgesInPlace (which draws it) and ratingsBandHeight
// (which measures it) so the reserved band height always matches the draw.
type ratingStripDims struct {
	accentW, padX, padY, iconSize, iconGap, badgeGap, rowGap, edgeX, edgeY int
}

func ratingStripDimsFor(scale float64, cfg imageconfig.Config) ratingStripDims {
	s := func(v float64) int { return int(v*scale + 0.5) }
	// Density moves the space inside a badge, not the mark or the type, so a
	// tighter setting hugs the same contents rather than shrinking them.
	dens := scale
	if cfg.RatingBadgeDensity != 0 {
		dens *= float64(cfg.RatingBadgeDensity) / 100
	}
	d := func(v float64) int { return maxInt(1, int(v*dens+0.5)) }
	return ratingStripDims{
		accentW:  s(4),
		padX:     d(14),
		padY:     d(10),
		iconSize: s(34),
		iconGap:  d(8),
		badgeGap: s(11),
		rowGap:   s(11),
		edgeX:    s(16),
		edgeY:    s(16),
	}
}

// resolveBadgeScale returns the scale the rating strip draws at: output scale
// for the size, the configured percentage, then reduced to fit the frame.
// Measuring and drawing share it so a reserved band matches its contents.
func resolveBadgeScale(cfg imageconfig.Config, frameW, frameH int, ratings []provider.Rating) float64 {
	scale := outputScale(cfg.Size)
	if cfg.RatingBadgeScale != 0 {
		scale *= float64(cfg.RatingBadgeScale) / 100
	}
	return fitBadgeScale(scale, frameW, frameH, ratings, cfg)
}

// ratingsBandHeight returns the vertical space (strip plus edge margins) the
// rating strip occupies for a frameW x frameH frame, so the logo can be
// letterboxed above a clear band.
func ratingsBandHeight(frameW, frameH int, ratings []provider.Rating, cfg imageconfig.Config) int {
	// Side-anchored layouts sit in a column against one edge, so they clear no
	// full-width band for the logo to be letterboxed above.
	if cfg.RatingsLayout == imageconfig.LayoutNone || isSideRatingsLayout(cfg.RatingsLayout) {
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
	scale := resolveBadgeScale(cfg, frameW, frameH, filtered)
	face := valueFaceFor(scale)
	fm := face.Metrics()
	valH := fm.Ascent.Ceil() + fm.Descent.Ceil()
	d := ratingStripDimsFor(scale, cfg)
	accentW, padX, iconSize, iconGap, badgeGap := d.accentW, d.padX, d.iconSize, d.iconGap, d.badgeGap
	padY, rowGap, edgeX, edgeY := d.padY, d.rowGap, d.edgeX, d.edgeY
	// The configured edge offset pushes the strip further in from the edge it
	// sits against, on top of the built-in inset.
	edgeInset := int(float64(cfg.PosterEdgeOffset)*scale + 0.5)
	edgeX += edgeInset
	edgeY += edgeInset
	if cfg.RatingsAnchored {
		edgeX, edgeY = anchoredEdges(cfg, edgeX, edgeY)
	}
	innerH := padY*2 + maxInt(valH, iconSize)
	stacked := cfg.BadgeStyle == imageconfig.BadgeStacked
	hideIcon := cfg.RatingIconHidden
	if stacked {
		innerH = stackedBadgeInnerH(d, valH, hideIcon, cfg.StackedLineHidden)
	}
	maxRowW := frameW - edgeX*2
	rowW, rows := 0, 0
	for _, r := range filtered {
		value := ratingBadgeLabel(r, cfg)
		if value == "" {
			value = "N/A"
		}
		bw := accentW + padX + textWidth(face, value) + padX
		if ratingIcons[r.Source] != nil && !hideIcon {
			bw += iconSize + iconGap
		}
		if stacked {
			bw = stackedBadgeWidth(d, textWidth(face, value), hideIcon)
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
	// A per-config cap keeps the first N of the sources that returned a value,
	// in the configured order.
	if cfg.RatingsMax != nil && len(filtered) > *cfg.RatingsMax {
		filtered = filtered[:*cfg.RatingsMax]
	}

	scale := resolveBadgeScale(cfg, out.Bounds().Dx(), out.Bounds().Dy(), filtered)

	face := valueFaceFor(scale)
	fm := face.Metrics()
	valAscent := fm.Ascent.Ceil()
	valDescent := fm.Descent.Ceil()
	valH := valAscent + valDescent

	d := ratingStripDimsFor(scale, cfg)
	accentW, padX, padY, iconSize := d.accentW, d.padX, d.padY, d.iconSize
	iconGap, badgeGap, rowGap, edgeX, edgeY := d.iconGap, d.badgeGap, d.rowGap, d.edgeX, d.edgeY
	if cfg.RatingsAnchored {
		edgeX, edgeY = anchoredEdges(cfg, edgeX, edgeY)
	}

	innerH := padY*2 + maxInt(valH, iconSize)
	chrome := chromeFor(cfg)
	if cfg.RatingsAnchored {
		chrome.squared = squaredCornersFor(string(cfg.RatingsLayout))
	}
	if chrome.stacked {
		innerH = stackedBadgeInnerH(d, valH, chrome.hideIcon, chrome.hideStackRail)
		chrome.stackRailH = d.accentW
		chrome.stackRailGap = d.iconGap
		chrome.stackValueGap = stackedValueGap(d)
		chrome.stackPadY = d.padY
	}

	bounds := out.Bounds()
	maxRowW := bounds.Dx() - edgeX*2

	specs := make([]badgeSpec, 0, len(filtered))
	for _, r := range filtered {
		value := ratingBadgeLabel(r, cfg)
		if value == "" {
			value = "N/A"
		}
		vw := textWidth(face, value)
		icon := ratingIcons[r.Source]
		bw := accentW + padX + vw + padX
		if icon != nil && !chrome.hideIcon {
			bw += iconSize + iconGap
		}
		if chrome.stacked {
			bw = stackedBadgeWidth(d, vw, chrome.hideIcon)
		}
		specs = append(specs, badgeSpec{
			value:            value,
			valW:             vw,
			icon:             icon,
			colored:          ratingIconColored[r.Source],
			iconShape:        cfg.IconShape,
			iconScale:        cfg.RatingProviderIconScale[r.Source],
			iconOutline:      iconOutlineColor(cfg),
			iconOutlineWidth: cfg.IconOutlineWidth,
			w:                bw,
			accent:           resolveProviderAccent(cfg, r.Source),
		})
	}

	if isSideRatingsLayout(cfg.RatingsLayout) {
		left, right := splitBadgesForSideLayout(specs, cfg.RatingsLayout)
		return drawBadgesSideColumns(out, left, right, innerH, rowGap, edgeX, edgeY, padX, iconSize, iconGap, accentW, face, chrome, bounds, sideRatingsOpts{
			position:   cfg.SideRatingsPosition,
			offset:     int(float64(cfg.SideRatingsOffset)*scale + 0.5),
			maxPerSide: cfg.RatingsMaxPerSide,
		})
	}

	if cfg.RatingsLayout == imageconfig.LayoutTopBottom {
		offsetX, offsetY := ratingStripOffsets(cfg)
		return drawBadgesTopBottom(out, specs, innerH, badgeGap, edgeX, edgeY, padX, iconSize, iconGap, accentW, face, chrome, bounds, offsetX, offsetY)
	}

	// One bottom row keeps every badge on a single line along the bottom edge, so
	// the strip reads as one band rather than wrapping into a block.
	var rows [][]badgeSpec
	if cfg.BottomRatingsRow {
		rows = [][]badgeSpec{specs}
	} else {
		// Greedy row wrap for top/bottom layouts.
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
	}

	totalH := len(rows)*innerH + (len(rows)-1)*rowGap

	startY := bounds.Max.Y - edgeY - totalH
	if cfg.RatingsLayout == imageconfig.LayoutTop && !cfg.BottomRatingsRow {
		startY = bounds.Min.Y + edgeY
	}
	if startY < bounds.Min.Y+edgeY {
		startY = bounds.Min.Y + edgeY
	}
	offsetX, offsetY := ratingStripOffsets(cfg)
	startY += offsetY

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
		x += offsetX
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
// sideRatingsOpts controls the split-side layout's vertical anchoring and the
// per-side badge cap. Its zero value keeps the original centred, uncapped layout.
type sideRatingsOpts struct {
	position   string // top | middle | bottom | custom; "" = middle
	offset     int    // px vertical offset for the custom position (already scaled)
	maxPerSide int    // cap badges per side; 0 = no cap
}

// drawBadgesTopBottom puts the first half of the badges in a row against the
// top edge and the rest against the bottom. It returns the height of one row,
// which is the band each edge gives up.
func drawBadgesTopBottom(out *image.NRGBA, specs []badgeSpec, innerH, badgeGap, edgeX, edgeY, padX, iconSize, iconGap, accentW int, face font.Face, chrome badgeChrome, bounds image.Rectangle, offsetX, offsetY int) int {
	if len(specs) == 0 {
		return 0
	}
	mid := (len(specs) + 1) / 2
	drawRow := func(row []badgeSpec, y int) {
		if len(row) == 0 {
			return
		}
		rowW := 0
		for i := range row {
			rowW += row[i].w
			if i > 0 {
				rowW += badgeGap
			}
		}
		x := bounds.Min.X + (bounds.Dx()-rowW)/2
		if x < bounds.Min.X+edgeX {
			x = bounds.Min.X + edgeX
		}
		x += offsetX
		for i := range row {
			row[i].x = x
			x += row[i].w + badgeGap
		}
		drawRatingRow(out, row, y, innerH, padX, iconSize, iconGap, accentW, face, chrome)
	}
	drawRow(specs[:mid], bounds.Min.Y+edgeY+offsetY)
	drawRow(specs[mid:], bounds.Max.Y-edgeY-innerH+offsetY)
	return innerH
}

// isSideRatingsLayout reports whether the layout anchors badges to a vertical
// column against the left or right edge rather than a horizontal band.
func isSideRatingsLayout(l imageconfig.RatingsLayout) bool {
	return l == imageconfig.LayoutSplitSide || l == imageconfig.LayoutLeft || l == imageconfig.LayoutRight
}

// splitBadgesForSideLayout assigns badges to the left and right columns. The
// single-sided layouts put every badge in one column, which is the point of
// choosing them over split-side.
func splitBadgesForSideLayout(specs []badgeSpec, l imageconfig.RatingsLayout) (left, right []badgeSpec) {
	switch l {
	case imageconfig.LayoutLeft:
		return specs, nil
	case imageconfig.LayoutRight:
		return nil, specs
	}
	mid := (len(specs) + 1) / 2
	return specs[:mid], specs[mid:]
}

func drawBadgesSideColumns(out *image.NRGBA, left, right []badgeSpec, innerH, rowGap, edgeX, edgeY, padX, iconSize, iconGap, accentW int, face font.Face, chrome badgeChrome, bounds image.Rectangle, opts sideRatingsOpts) int {
	if len(left)+len(right) == 0 {
		return 0
	}
	if opts.maxPerSide > 0 {
		if len(left) > opts.maxPerSide {
			left = left[:opts.maxPerSide]
		}
		if len(right) > opts.maxPerSide {
			right = right[:opts.maxPerSide]
		}
	}

	// An empty column has no height: the arithmetic below would otherwise read
	// one row gap as negative height, which a single-sided layout always hits.
	columnHeight := func(n int) int {
		if n == 0 {
			return 0
		}
		return n*innerH + (n-1)*rowGap
	}
	leftH := columnHeight(len(left))
	rightH := columnHeight(len(right))
	totalH := maxInt(leftH, rightH)

	midY := bounds.Min.Y + bounds.Dy()/2
	minY := bounds.Min.Y + edgeY

	// anchorY resolves a column's top based on the configured vertical position,
	// then clamps it inside the safe [minY, maxY] band.
	anchorY := func(colH int) int {
		var y int
		switch opts.position {
		case "top":
			y = minY
		case "bottom":
			y = bounds.Max.Y - edgeY - colH
		case "custom":
			y = midY - colH/2 + opts.offset
		default: // middle
			y = midY - colH/2
		}
		maxY := bounds.Max.Y - edgeY - colH
		if maxY < minY {
			maxY = minY
		}
		if y < minY {
			y = minY
		}
		if y > maxY {
			y = maxY
		}
		return y
	}

	y := anchorY(leftH)
	for i := range left {
		left[i].x = bounds.Min.X + edgeX
		drawRatingRow(out, left[i:i+1], y, innerH, padX, iconSize, iconGap, accentW, face, chrome)
		y += innerH + rowGap
	}

	y = anchorY(rightH)
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

// formatRatingValue renders a 0-10 score on the scale mode asks for. Every
// provider already reports its score normalized to ten, so this is the one
// place that decides how a combined or normalized value reads.
func formatRatingValue(value float64, mode string) string {
	if mode == "normalized100" {
		hundred := int(math.Round(value * 10))
		if hundred < 0 {
			hundred = 0
		}
		if hundred > 100 {
			hundred = 100
		}
		return strconv.Itoa(hundred)
	}
	text := strconv.FormatFloat(value, 'f', 1, 64)
	if mode == "normalizedclean" {
		text = strings.TrimSuffix(text, ".0")
	}
	return text
}

// ratingBadgeValue returns the text drawn on a provider's badge. The native
// mode keeps the provider's own label, so Letterboxd stays out of five and
// Rotten Tomatoes keeps its percent sign; the normalized modes put every source
// on one scale so the badges in a row can be read against each other.
func ratingBadgeValue(r provider.Rating, mode string) string {
	switch mode {
	case "normalized", "normalizedclean", "normalized100":
		return formatRatingValue(r.Value, mode)
	default:
		return r.Label
	}
}

// ratingBadgeLabel is the text drawn on a rating badge: the value, optionally
// followed by the vote count. Only three of the sources report a count, so a
// badge without one is left alone rather than padded with a zero that would
// read as "nobody voted".
func ratingBadgeLabel(r provider.Rating, cfg imageconfig.Config) string {
	value := ratingBadgeValue(r, cfg.RatingValueMode)
	if !cfg.RatingVoteCounts || r.Votes <= 0 {
		return value
	}
	return value + " " + formatVoteCount(r.Votes)
}

// formatVoteCount abbreviates a vote count to something that fits on a badge.
// Precision is deliberately low: the order of magnitude is the information, and
// "2.9M" earns its space on a poster where "2,914,772" does not.
func formatVoteCount(n int) string {
	switch {
	case n >= 1_000_000:
		return strconv.FormatFloat(float64(n)/1_000_000, 'f', 1, 64) + "M"
	case n >= 10_000:
		return strconv.Itoa(n/1000) + "K"
	case n >= 1_000:
		return strconv.FormatFloat(float64(n)/1000, 'f', 1, 64) + "K"
	default:
		return strconv.Itoa(n)
	}
}

// ratingStripOffsets returns the total px nudge for the badge strip: the strip's
// own offset plus the one kept for the active badge style.
func ratingStripOffsets(cfg imageconfig.Config) (int, int) {
	x, y := cfg.RatingBadgeOffsetX, cfg.RatingBadgeOffsetY
	switch cfg.BadgeStyle {
	case imageconfig.BadgeSquare:
		x += cfg.RatingOffsetXSquare
		y += cfg.RatingOffsetYSquare
	default:
		// Pill and glass share one nudge, as they did in the config this reads.
		x += cfg.RatingOffsetXPillGlass
		y += cfg.RatingOffsetYPillGlass
	}
	return x, y
}

// filterRatings returns only the ratings whose source is in the want list.
// If want is empty, all ratings are returned.
func filterRatings(ratings []provider.Rating, want []string) []provider.Rating {
	if len(want) == 0 {
		return ratings
	}
	// Walk want, not ratings: providers answer in parallel, so arrival order
	// varies per render. Configured order also drives the RatingsMax cap.
	bySource := make(map[string]provider.Rating, len(ratings))
	for _, r := range ratings {
		if _, seen := bySource[r.Source]; !seen {
			bySource[r.Source] = r
		}
	}
	out := make([]provider.Rating, 0, len(want))
	for _, w := range want {
		if r, ok := bySource[w]; ok {
			out = append(out, r)
		}
	}
	return out
}

// drawStackedBadge renders one badge as an accent rail above a centred mark
// with the value beneath. The tile itself is already drawn by the caller.
func drawStackedBadge(out *image.NRGBA, sp badgeSpec, y, innerH, iconSize int, face font.Face, chrome badgeChrome, valAscent, valH int) {
	// The rail reads as a heading for the badge, so it is a fraction of the
	// tile rather than its full width.
	railY := y + chrome.stackPadY
	if !chrome.hideStackRail {
		railW := maxInt(12, sp.w*42/100)
		railX := sp.x + (sp.w-railW)/2
		fillRect(out, image.Rect(railX, railY, railX+railW, railY+chrome.stackRailH), sp.accent)
	}

	drawSize := iconSize
	if sp.iconScale > 0 {
		drawSize = iconSize * sp.iconScale / 100
		if lo := iconSize / 2; drawSize < lo {
			drawSize = lo
		}
		if drawSize > iconSize*2 {
			drawSize = iconSize * 2
		}
	}
	// With the rail hidden the mark moves up into the space it left.
	iconTop := railY
	if !chrome.hideStackRail {
		iconTop = railY + chrome.stackRailH + chrome.stackRailGap
	}
	if sp.icon != nil && !chrome.hideIcon {
		iRect := image.Rect(sp.x+(sp.w-drawSize)/2, iconTop, sp.x+(sp.w+drawSize)/2, iconTop+drawSize)
		if sp.colored {
			drawBrandIcon(out, iRect, sp.icon, sp.iconShape, sp.accent, sp.iconOutline, sp.iconOutlineWidth)
		} else {
			drawTintedIcon(out, iRect, sp.icon, chrome.iconColor, sp.iconShape, sp.accent, sp.iconOutline, sp.iconOutlineWidth)
		}
	}

	valTop := iconTop
	if !chrome.hideIcon {
		valTop += iconSize
	}
	valY := valTop + chrome.stackValueGap + valAscent
	// Keep the value inside the tile when a grown mark has pushed it down.
	if bottom := y + innerH - chrome.stackPadY; valY+valH-valAscent > bottom {
		valY = bottom - (valH - valAscent)
	}
	drawText(out, face, sp.x+(sp.w-sp.valW)/2, valY, chrome.valueColor, sp.value)
}

// widestBadgeAt measures the widest single badge the strip would draw at scale.
func widestBadgeAt(scale float64, ratings []provider.Rating, cfg imageconfig.Config) int {
	face := valueFaceFor(scale)
	d := ratingStripDimsFor(scale, cfg)
	stacked := cfg.BadgeStyle == imageconfig.BadgeStacked
	widest := 0
	for _, r := range ratings {
		value := ratingBadgeLabel(r, cfg)
		if value == "" {
			value = "N/A"
		}
		vw := textWidth(face, value)
		var bw int
		if stacked {
			bw = stackedBadgeWidth(d, vw, cfg.RatingIconHidden)
		} else {
			bw = d.accentW + d.padX + vw + d.padX
			if ratingIcons[r.Source] != nil && !cfg.RatingIconHidden {
				bw += d.iconSize + d.iconGap
			}
		}
		widest = maxInt(widest, bw)
	}
	return widest
}

// Badge dimensions are absolute for a given scale: one badge is 5% of a
// 780x1170 poster but 31% of a 320x180 thumbnail. Posters and backdrops sit
// inside both caps.
const (
	maxBadgeHeightShare = 0.12
	maxBadgeWidthShare  = 0.33
)

// nominalOverlayTileH is the height of a corner-overlay tile at scale 1.
const nominalOverlayTileH = 34.0

// overlayScale caps the corner-overlay scale against the frame. The tiles are
// absolute like the rating strip, so one is 3% of a 780x1170 poster and 19% of
// a 320x180 thumbnail. Posters and backdrops sit inside the cap.
func overlayScale(scale float64, frameH int) float64 {
	if frameH <= 0 {
		return scale
	}
	if capped := float64(frameH) * maxBadgeHeightShare / nominalOverlayTileH; capped < scale {
		return capped
	}
	return scale
}

// fitBadgeScale reduces scale until the widest badge fits inside the frame.
// It never grows the scale, so a strip that already fits is left alone.
func fitBadgeScale(scale float64, frameW, frameH int, ratings []provider.Rating, cfg imageconfig.Config) float64 {
	if frameW <= 0 || frameH <= 0 || len(ratings) == 0 {
		return scale
	}
	// A few passes is enough to bring any requested size inside the frame, and
	// bounds the work.
	for i := 0; i < 6; i++ {
		d := ratingStripDimsFor(scale, cfg)
		availW := frameW - d.edgeX*2
		if share := int(float64(frameW)*maxBadgeWidthShare + 0.5); share < availW {
			availW = share
		}
		// A badge taller than the artwork pushes its own value off the edge, so
		// height is checked alongside width. One row is the floor: below that
		// there is nothing left to show.
		availH := frameH - d.edgeY*2
		if share := int(float64(frameH)*maxBadgeHeightShare + 0.5); share < availH {
			availH = share
		}
		widest := widestBadgeAt(scale, ratings, cfg)
		tallest := badgeHeightAt(scale, cfg)
		if availW <= 0 || availH <= 0 {
			return scale
		}
		overW := widest > availW
		overH := tallest > availH
		if !overW && !overH {
			return scale
		}
		ratio := 1.0
		if overW && widest > 0 {
			ratio = float64(availW) / float64(widest)
		}
		if overH && tallest > 0 {
			if r := float64(availH) / float64(tallest); r < ratio {
				ratio = r
			}
		}
		reduced := scale * ratio
		if reduced < 0.2 {
			return 0.2
		}
		if reduced >= scale {
			return scale
		}
		scale = reduced
	}
	return scale
}

// badgeHeightAt measures the height of a single badge at scale.
func badgeHeightAt(scale float64, cfg imageconfig.Config) int {
	face := valueFaceFor(scale)
	fm := face.Metrics()
	valH := fm.Ascent.Ceil() + fm.Descent.Ceil()
	d := ratingStripDimsFor(scale, cfg)
	if cfg.BadgeStyle == imageconfig.BadgeStacked {
		return stackedBadgeInnerH(d, valH, cfg.RatingIconHidden, cfg.StackedLineHidden)
	}
	return d.padY*2 + maxInt(valH, d.iconSize)
}
