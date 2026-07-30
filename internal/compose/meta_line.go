package compose

import (
	"image"
	"image/color"
	"strconv"
	"strings"

	"golang.org/x/image/font"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// The streaming apps put one line under the title — age rating, year, genre —
// rather than three separate badges. It reads as part of the artwork because a
// gradient carries it: the same line on bare art disappears over a bright
// poster, which is the objection raised the first time this was suggested.

// metaLineParts returns the pieces of the line, in order, and whether the first
// is the age rating (which is drawn as a chip rather than plain text).
func metaLineParts(meta provider.MediaMeta) (age string, rest []string) {
	age = strings.TrimSpace(meta.ContentRating)
	if meta.Year > 0 {
		rest = append(rest, strconv.Itoa(meta.Year))
	}
	for _, g := range meta.Genres {
		if g = strings.TrimSpace(g); g != "" {
			rest = append(rest, g)
			break // one genre; the row is a summary, not a list
		}
	}
	return age, rest
}

// drawMetaLine draws "[12A] 2026 • Comedy" centred along the bottom edge.
func drawMetaLine(base *image.NRGBA, meta provider.MediaMeta, cfg imageconfig.Config, scale float64, occ *occupancy) {
	if !cfg.MetaLine {
		return
	}
	age, rest := metaLineParts(meta)
	if age == "" && len(rest) == 0 {
		return
	}

	ensureFaces()
	s := scale
	if cfg.MetaLineScale != 0 {
		s *= float64(cfg.MetaLineScale) / 100
	}
	face := labelFaceFor(s)
	if face == nil {
		return
	}
	px := func(v float64) int { return maxInt(1, int(v*s+0.5)) }

	text := strings.Join(rest, " • ")
	textW := 0
	if text != "" {
		textW = textWidth(face, text)
	}
	chipW, chipH := 0, 0
	if age != "" {
		chipW = textWidth(face, age) + px(10)
		chipH = face.Metrics().Height.Ceil() + px(4)
	}
	gap := 0
	if chipW > 0 && textW > 0 {
		gap = px(7)
	}
	lineW := chipW + gap + textW
	lineH := maxInt(chipH, face.Metrics().Height.Ceil())
	if lineW == 0 {
		return
	}

	b := base.Bounds()
	edgeY := px(16)
	y := b.Max.Y - edgeY - lineH
	x := b.Min.X + (b.Dx()-lineW)/2

	// The scrim is what makes it legible on bright art. It fades upward from the
	// bottom edge so it reads as part of the poster rather than a bar.
	scrimTop := maxInt(b.Min.Y, y-px(28))
	for py := scrimTop; py < b.Max.Y; py++ {
		frac := float64(py-scrimTop) / float64(maxInt(1, b.Max.Y-scrimTop))
		alpha := uint8(frac * 190)
		for pxx := b.Min.X; pxx < b.Max.X; pxx++ {
			base.SetNRGBA(pxx, py, blendScrim(base.NRGBAAt(pxx, py), alpha))
		}
	}

	ink := color.NRGBA{R: 235, G: 235, B: 240, A: 255}
	baseline := y + face.Metrics().Ascent.Ceil() + (lineH-face.Metrics().Height.Ceil())/2
	if age != "" {
		chip := image.Rect(x, y+(lineH-chipH)/2, x+chipW, y+(lineH-chipH)/2+chipH)
		fillRoundedRect(base, chip, px(4), color.NRGBA{R: 0, G: 0, B: 0, A: 170})
		drawText(base, face, x+px(5), baseline, ink, age)
		x += chipW + gap
	}
	if text != "" {
		drawText(base, face, x, baseline, ink, text)
	}

	if occ != nil {
		occ.reserve(image.Rect(b.Min.X, scrimTop, b.Max.X, b.Max.Y))
	}
}

var _ = font.Face(nil)
