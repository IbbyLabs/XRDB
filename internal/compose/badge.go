package compose

import (
	"embed"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"log"
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

var (
	onceFaces sync.Once
	faceValue font.Face // 14px bold — rating value (normal scale)
	faceLabel font.Face // 9px regular — small labels (overlays)

	onceIcons   sync.Once
	ratingIcons map[string]image.Image

	fontBoldParsed    *opentype.Font
	fontRegularParsed *opentype.Font

	// scaledFaces caches value faces for non-1 output scales (large/4k).
	scaledFaces sync.Map // float64 → font.Face
)

func ensureFaces() {
	onceFaces.Do(func() {
		if tt, err := opentype.Parse(gobold.TTF); err != nil {
			log.Printf("compose: parse bold font: %v", err)
		} else {
			fontBoldParsed = tt
			if f, err := opentype.NewFace(tt, &opentype.FaceOptions{
				Size: 14, DPI: 72, Hinting: font.HintingFull,
			}); err != nil {
				log.Printf("compose: create bold face: %v", err)
			} else {
				faceValue = f
			}
		}
		if tt, err := opentype.Parse(goregular.TTF); err != nil {
			log.Printf("compose: parse regular font: %v", err)
		} else {
			fontRegularParsed = tt
			if f, err := opentype.NewFace(tt, &opentype.FaceOptions{
				Size: 9, DPI: 72, Hinting: font.HintingFull,
			}); err != nil {
				log.Printf("compose: create regular face: %v", err)
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
			log.Printf("compose: read rating icons: %v", err)
			return
		}
		for _, e := range entries {
			data, err := ratingIconFS.ReadFile("assets/ratings/" + e.Name())
			if err != nil {
				continue
			}
			img, err := png.Decode(strings.NewReader(string(data)))
			if err != nil {
				continue
			}
			ratingIcons[strings.TrimSuffix(e.Name(), ".png")] = img
		}
	})
}

// valueFaceFor returns a bold value face sized for the output scale.
func valueFaceFor(scale float64) font.Face {
	if scale == 1 || fontBoldParsed == nil {
		return faceValue
	}
	if f, ok := scaledFaces.Load(scale); ok {
		return f.(font.Face)
	}
	f, err := opentype.NewFace(fontBoldParsed, &opentype.FaceOptions{
		Size: 14 * scale, DPI: 72, Hinting: font.HintingFull,
	})
	if err != nil {
		return faceValue
	}
	scaledFaces.Store(scale, f)
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
	"tmdb":       {R: 1, G: 180, B: 228, A: 255},
	"imdb":       {R: 245, G: 197, B: 24, A: 255},
	"rt":         {R: 250, G: 50, B: 10, A: 255},
	"rtaudience":  {R: 250, G: 130, B: 10, A: 255},
	"metacritic": {R: 255, G: 204, B: 52, A: 255},
	"mdblist":    {R: 139, G: 92, B: 246, A: 255},
	"letterboxd": {R: 0, G: 169, B: 157, A: 255},
	"trakt":      {R: 237, G: 28, B: 36, A: 255},
	"simkl":      {R: 28, G: 176, B: 246, A: 255},
	"anilist":    {R: 2, G: 169, B: 255, A: 255},
	"mal":        {R: 44, G: 111, B: 187, A: 255},
	"kitsu":      {R: 247, G: 110, B: 24, A: 255},
}

func accentFor(source string) color.NRGBA {
	if c, ok := providerAccent[source]; ok {
		return c
	}
	return color.NRGBA{R: 160, G: 160, B: 160, A: 255}
}

// drawTintedIcon paints icon (a white-on-transparent glyph) into dst at rect,
// recolored to tint, using the glyph's alpha as the mask.
func drawTintedIcon(dst *image.NRGBA, rect image.Rectangle, icon image.Image, tint color.NRGBA) {
	scaled := image.NewNRGBA(image.Rect(0, 0, rect.Dx(), rect.Dy()))
	xdraw.CatmullRom.Scale(scaled, scaled.Bounds(), icon, icon.Bounds(), xdraw.Over, nil)
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
		// Capsule shape, see-through fill, hairline edge.
		c.radius = func(innerH int) int { return innerH / 2 }
		c.bg = color.NRGBA{R: 16, G: 16, B: 24, A: 110}
		c.border = color.NRGBA{R: 255, G: 255, B: 255, A: 70}
	case imageconfig.BadgePill:
		// True capsule: fully rounded ends.
		c.radius = func(innerH int) int { return innerH / 2 }
	}
	if cfg.BadgeTheme == imageconfig.ThemeLight {
		c.bg = color.NRGBA{R: 246, G: 246, B: 248, A: 240}
		c.valueColor = color.NRGBA{R: 18, G: 18, B: 24, A: 255}
		c.iconColor = color.NRGBA{R: 30, G: 30, B: 38, A: 255}
		if cfg.BadgeStyle == imageconfig.BadgeGlass {
			c.bg = color.NRGBA{R: 246, G: 246, B: 248, A: 165}
			c.border = color.NRGBA{R: 0, G: 0, B: 0, A: 60}
		}
	}
	return c
}

// drawBadgesInPlace composites rating badges onto out according to the render config.
// Badges carry the provider's official glyph plus the score, wrap onto
// multiple rows when they would overflow, and scale with the output size.
func drawBadgesInPlace(out *image.NRGBA, ratings []provider.Rating, cfg imageconfig.Config) {
	if len(ratings) == 0 {
		return
	}
	ensureFaces()
	ensureIcons()
	if faceValue == nil {
		return
	}

	filtered := filterRatings(ratings, cfg.Ratings)
	if len(filtered) == 0 {
		return
	}

	scale := outputScale(cfg.Size)
	s := func(v float64) int { return int(v*scale + 0.5) }

	face := valueFaceFor(scale)
	fm := face.Metrics()
	valAscent := fm.Ascent.Ceil()
	valDescent := fm.Descent.Ceil()
	valH := valAscent + valDescent

	var (
		accentW  = s(3)
		padX     = s(8)
		padY     = s(5)
		iconSize = s(15)
		iconGap  = s(5)
		badgeGap = s(6)
		rowGap   = s(6)
		edgeX    = s(10)
		edgeY    = s(10)
	)

	innerH := padY*2 + maxInt(valH, iconSize)
	chrome := chromeFor(cfg)
	radius := chrome.radius(innerH)

	type badgeSpec struct {
		value  string
		valW   int
		icon   image.Image
		w      int
		accent color.NRGBA
	}

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

	// Greedy row wrap: keep badge order, start a new row when the next badge
	// would overflow the drawable width.
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
		for _, sp := range r {
			bRect := image.Rect(x, y, x+sp.w, y+innerH)
			fillRoundedRect(out, bRect, radius, chrome.bg)
			if chrome.border.A > 0 {
				drawRectBorder(out, bRect, radius, chrome.border)
			}

			// Accent strip hugs the left edge. Skip it on capsule shapes
			// where a straight strip would poke out of the round end —
			// tint the icon with the provider accent instead.
			iconTint := chrome.iconColor
			contentX := x
			if radius < innerH/2 {
				aRect := image.Rect(x, y, x+accentW, y+innerH)
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

			x += sp.w + badgeGap
		}
		y += innerH + rowGap
	}
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
