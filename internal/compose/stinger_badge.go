package compose

import (
	"image"
	"image/color"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// stingerAccent is a warm amber, distinct from the awards gold, so a stinger
// badge is not mistaken for an award.
var stingerAccent = color.NRGBA{R: 245, G: 158, B: 66, A: 255}

// drawStingerBadge marks a title that has a scene during or after the credits.
// "MID-CREDITS", "POST-CREDITS", or "STINGER" when both, so a viewer knows to
// stay. The data is TMDB's stinger keywords, not a scrape.
type stingerBadgeOpts struct {
	lang         string // config language for the wording this badge draws
	scalePercent int
	offsetX      int
	offsetY      int
}

func stingerOptsFromConfig(cfg imageconfig.Config) stingerBadgeOpts {
	return stingerBadgeOpts{lang: cfg.Language, scalePercent: cfg.StingerScale, offsetX: cfg.StingerOffsetX, offsetY: cfg.StingerOffsetY}
}

func drawStingerBadge(base *image.NRGBA, s provider.StingerInfo, pos string, scale float64, occ *occupancy, opts stingerBadgeOpts) {
	label := stingerLabel(s, opts.lang)
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
	px := func(v float64) int { return int(v*scale + 0.5) }
	padX, padY := px(9), px(5)

	fm := face.Metrics()
	ascent, descent := fm.Ascent.Ceil(), fm.Descent.Ceil()
	bh := padY*2 + ascent + descent
	bw := padX*2 + textWidth(face, label)

	resolvedPos := pos
	if resolvedPos == "" || resolvedPos == "inherit" {
		resolvedPos = "bl"
	}
	r := occ.placeNudged(resolvedPos, bw, bh, px(12), px(12), px(7), opts.offsetX, opts.offsetY)
	tx, ty := r.Min.X+padX, r.Min.Y+padY+ascent

	border := stingerAccent
	border.A = 230
	drawSoftTile(base, r, px(5), tileChrome{
		fill:   color.NRGBA{R: 12, G: 12, B: 16, A: 230},
		border: border,
		shadow: color.NRGBA{R: 0, G: 0, B: 0, A: 90},
	})
	drawText(base, face, tx, ty, stingerAccent, label)
}

func stingerLabel(s provider.StingerInfo, lang string) string {
	switch {
	case s.MidCredits && s.PostCredits:
		return UIString("stinger_both", lang, "STINGER")
	case s.MidCredits:
		return UIString("stinger_mid", lang, "MID-CREDITS")
	case s.PostCredits:
		return UIString("stinger_post", lang, "POST-CREDITS")
	}
	return ""
}
