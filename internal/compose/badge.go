package compose

import (
	"image"
	"image/color"
	"strings"
	"sync"

	"golang.org/x/image/font"
	"golang.org/x/image/font/gofont/gobold"
	"golang.org/x/image/font/gofont/goregular"
	"golang.org/x/image/font/opentype"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

var (
	onceFaces   sync.Once
	faceValue   font.Face // 14px bold — rating value
	faceLabel   font.Face // 9px regular — provider name
)

func ensureFaces() {
	onceFaces.Do(func() {
		if tt, err := opentype.Parse(gobold.TTF); err == nil {
			faceValue, _ = opentype.NewFace(tt, &opentype.FaceOptions{
				Size: 14, DPI: 72, Hinting: font.HintingFull,
			})
		}
		if tt, err := opentype.Parse(goregular.TTF); err == nil {
			faceLabel, _ = opentype.NewFace(tt, &opentype.FaceOptions{
				Size: 9, DPI: 72, Hinting: font.HintingFull,
			})
		}
	})
}

// providerAccent returns a provider-specific accent color for the badge strip.
var providerAccent = map[string]color.NRGBA{
	"tmdb":       {R: 1, G: 180, B: 228, A: 255},
	"imdb":       {R: 245, G: 197, B: 24, A: 255},
	"rt":         {R: 250, G: 50, B: 10, A: 255},
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

// drawBadgesInPlace composites rating badges onto out according to the render config.
// out must be a pre-populated *image.NRGBA of the correct size.
func drawBadgesInPlace(out *image.NRGBA, ratings []provider.Rating, cfg imageconfig.Config) {
	if len(ratings) == 0 {
		return
	}
	ensureFaces()
	if faceValue == nil {
		return
	}

	filtered := filterRatings(ratings, cfg.Ratings)
	if len(filtered) == 0 {
		return
	}

	bounds := out.Bounds()

	const (
		accentW = 3  // left accent strip width in px
		padX    = 8  // horizontal content padding (after accent)
		padTop  = 5  // top inner padding
		padBot  = 5  // bottom inner padding
		lblGap  = 2  // gap between value and label text
		badgeGap = 6 // horizontal gap between badges
		edgeX   = 10 // minimum distance from image edge
		edgeY   = 10 // distance from image top/bottom edge
		radius  = 4  // corner radius in px
	)

	valM := faceValue.Metrics()
	valAscent := valM.Ascent.Ceil()
	valDescent := valM.Descent.Ceil()
	valH := valAscent + valDescent

	lblAscent, lblDescent, lblH := 0, 0, 0
	if faceLabel != nil {
		lm := faceLabel.Metrics()
		lblAscent = lm.Ascent.Ceil()
		lblDescent = lm.Descent.Ceil()
		lblH = lblAscent + lblDescent
	}

	innerH := padTop + valH + padBot
	if lblH > 0 {
		innerH += lblGap + lblH
	}

	type badgeSpec struct {
		rating  provider.Rating
		value   string
		label   string
		valW    int
		lblW    int
		w       int
		accent  color.NRGBA
	}

	specs := make([]badgeSpec, 0, len(filtered))
	totalW := 0
	for i, r := range filtered {
		value := r.Label
		if value == "" {
			value = "N/A"
		}
		label := strings.ToUpper(r.Source)
		vw := textWidth(faceValue, value)
		lw := 0
		if faceLabel != nil {
			lw = textWidth(faceLabel, label)
		}
		contentW := vw
		if lw > contentW {
			contentW = lw
		}
		bw := accentW + padX + contentW + padX
		specs = append(specs, badgeSpec{
			rating: r,
			value:  value,
			label:  label,
			valW:   vw,
			lblW:   lw,
			w:      bw,
			accent: accentFor(r.Source),
		})
		totalW += bw
		if i > 0 {
			totalW += badgeGap
		}
	}

	startX := (bounds.Dx() - totalW) / 2
	if startX < edgeX {
		startX = edgeX
	}

	startY := bounds.Max.Y - innerH - edgeY
	if cfg.RatingsLayout == imageconfig.LayoutTop {
		startY = bounds.Min.Y + edgeY
	}

	bgColor := color.NRGBA{R: 0, G: 0, B: 0, A: 210}

	x := startX
	for _, s := range specs {
		bRect := image.Rect(x, startY, x+s.w, startY+innerH)

		// Badge background (rounded)
		fillRoundedRect(out, bRect, radius, bgColor)

		// Left accent strip (straight left edge, rounded on right only at corners)
		aRect := image.Rect(x, startY, x+accentW, startY+innerH)
		fillRect(out, aRect.Intersect(bRect), s.accent)

		// Value text — centered horizontally in content area
		contentX := x + accentW + padX
		contentW := s.w - accentW - padX*2
		valX := contentX + (contentW-s.valW)/2
		if valX < contentX {
			valX = contentX
		}
		valY := startY + padTop + valAscent
		drawText(out, faceValue, valX, valY, color.White, s.value)

		// Label text below value
		if faceLabel != nil && s.lblW > 0 {
			lblX := contentX + (contentW-s.lblW)/2
			if lblX < contentX {
				lblX = contentX
			}
			lblY := valY + valDescent + lblGap + lblAscent
			labelColor := color.NRGBA{R: 176, G: 176, B: 176, A: 255}
			drawText(out, faceLabel, lblX, lblY, labelColor, s.label)
		}

		x += s.w + badgeGap
	}
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
