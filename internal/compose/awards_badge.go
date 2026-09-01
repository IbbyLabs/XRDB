package compose

import (
	"image"
	"image/color"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// awardGold is the accent for a win; a nomination uses a quieter silver so the
// two read apart at a glance.
var (
	awardGold   = color.NRGBA{R: 214, G: 178, B: 94, A: 255}
	awardSilver = color.NRGBA{R: 200, G: 202, B: 208, A: 255}
)

// drawAwardsBadge places a small "OSCAR WINNER" / "EMMY NOMINEE" chip in a
// corner. A win is gold, a nomination silver, so the distinction survives a
// thumbnail where the words are too small to read.
type awardsBadgeOpts struct {
	lang         string // config language for the wording this badge draws
	scalePercent int
	offsetX      int
	offsetY      int
}

func awardsOptsFromConfig(cfg imageconfig.Config) awardsBadgeOpts {
	return awardsBadgeOpts{lang: cfg.Language, scalePercent: cfg.AwardsScale, offsetX: cfg.AwardsOffsetX, offsetY: cfg.AwardsOffsetY}
}

func drawAwardsBadge(base *image.NRGBA, a provider.AwardSummary, pos string, scale float64, occ *occupancy, opts awardsBadgeOpts) {
	label := awardsLabel(a, opts.lang)
	if label == "" {
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

	accent := awardGold
	if !a.Won {
		accent = awardSilver
	}
	border := accent
	border.A = 230
	drawSoftTile(base, r, s(5), tileChrome{
		fill:   color.NRGBA{R: 12, G: 12, B: 16, A: 230},
		border: border,
		shadow: color.NRGBA{R: 0, G: 0, B: 0, A: 90},
	})
	drawText(base, face, tx, ty, accent, label)
}

// awardsLabel names an award and its outcome as one string. Portuguese puts the
// outcome first and changes the preposition with it — DO for a win, AO for a
// nomination — so a name joined to an outcome word cannot produce it.
func awardsLabel(a provider.AwardSummary, lang string) string {
	if !a.Has() {
		return ""
	}
	id := "oscar_"
	if a.Kind == "emmy" {
		id = "emmy_"
	}
	if a.Won {
		return UIString(id+"winner", lang, a.Label())
	}
	return UIString(id+"nominee", lang, a.Label())
}
