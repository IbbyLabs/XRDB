package compose

import (
	"embed"
	"image"
	"log/slog"
	"sync"

	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
)

// badgeFontFS holds the typefaces a profile can pick for the genre and rating
// badges. They are embedded so nothing is fetched at render time. The
// Liberation faces are licensed under the SIL OFL (LiberationSans-LICENSE.txt),
// Bebas Neue under the same licence (BebasNeue-OFL.txt).
//
//go:embed assets/fonts/*.ttf
var badgeFontFS embed.FS

const cleanLabelFile = "LiberationSans-Bold.ttf"

// badgeFontFiles lists the regular and bold file of each choosable family.
// Bebas Neue has a single weight and only capitals.
var badgeFontFiles = map[string][2]string{
	"sans":    {"LiberationSans-Regular.ttf", cleanLabelFile},
	"serif":   {"LiberationSerif-Regular.ttf", "LiberationSerif-Bold.ttf"},
	"mono":    {"LiberationMono-Regular.ttf", "LiberationMono-Bold.ttf"},
	"display": {"BebasNeue-Regular.ttf", "BebasNeue-Regular.ttf"},
}

type lazyBadgeFont struct {
	once sync.Once
	font *opentype.Font
}

var parsedBadgeFonts sync.Map // file name -> *lazyBadgeFont

// parsedBadgeFont returns the parsed font in file, or nil when it cannot be read.
func parsedBadgeFont(file string) *opentype.Font {
	v, _ := parsedBadgeFonts.LoadOrStore(file, &lazyBadgeFont{})
	lf := v.(*lazyBadgeFont)
	lf.once.Do(func() {
		raw, err := badgeFontFS.ReadFile("assets/fonts/" + file)
		if err != nil {
			slog.Warn("Failed to read an embedded badge font", "file", file, "error", err)
			return
		}
		f, err := opentype.Parse(raw)
		if err != nil {
			slog.Warn("Failed to parse an embedded badge font", "file", file, "error", err)
			return
		}
		lf.font = f
	})
	return lf.font
}

// fallbackFace draws from primary and hands any rune the primary font has no
// glyph for to fallback, so a label in a script the chosen family lacks is drawn
// the way the built-in face draws it. It is not safe for concurrent use; the
// cached faces wrap it in a lockedFace.
type fallbackFace struct {
	primary  font.Face
	fallback font.Face
}

func (f fallbackFace) Close() error {
	err := f.primary.Close()
	if ferr := f.fallback.Close(); err == nil {
		err = ferr
	}
	return err
}

func (f fallbackFace) Glyph(dot fixed.Point26_6, r rune) (image.Rectangle, image.Image, image.Point, fixed.Int26_6, bool) {
	if _, ok := f.primary.GlyphAdvance(r); ok {
		return f.primary.Glyph(dot, r)
	}
	return f.fallback.Glyph(dot, r)
}

func (f fallbackFace) GlyphBounds(r rune) (fixed.Rectangle26_6, fixed.Int26_6, bool) {
	if _, ok := f.primary.GlyphAdvance(r); ok {
		return f.primary.GlyphBounds(r)
	}
	return f.fallback.GlyphBounds(r)
}

func (f fallbackFace) GlyphAdvance(r rune) (fixed.Int26_6, bool) {
	if adv, ok := f.primary.GlyphAdvance(r); ok {
		return adv, true
	}
	return f.fallback.GlyphAdvance(r)
}

// Kern pairs only runes drawn from the same face; across the two there is no
// shared kerning table.
func (f fallbackFace) Kern(r0, r1 rune) fixed.Int26_6 {
	_, ok0 := f.primary.GlyphAdvance(r0)
	_, ok1 := f.primary.GlyphAdvance(r1)
	switch {
	case ok0 && ok1:
		return f.primary.Kern(r0, r1)
	case !ok0 && !ok1:
		return f.fallback.Kern(r0, r1)
	}
	return 0
}

func (f fallbackFace) Metrics() font.Metrics { return f.primary.Metrics() }

type badgeFaceKey struct {
	family string
	role   string // value | label | clean
	scale  int
}

var scaledBadgeFontFaces sync.Map // badgeFaceKey -> font.Face

// builtinFallback returns a fresh, unshared face of the built-in font for the
// role, to stand in for runes the chosen family lacks. nil when the built-in
// font did not load.
func builtinFallback(bold bool, size, dpi float64) font.Face {
	ensureFaces()
	tt := fontRegularParsed
	if bold {
		tt = fontBoldParsed
	}
	if tt == nil {
		return nil
	}
	f, err := opentype.NewFace(tt, &opentype.FaceOptions{Size: size, DPI: dpi, Hinting: font.HintingFull})
	if err != nil {
		slog.Warn("Failed to create the fallback font face", "error", err)
		return nil
	}
	return f
}

// customBadgeFace builds, once per family, role and scale, the face for a
// chosen family, or nil when it is unavailable and the caller keeps the
// built-in one. wrap adds the clean label's tracking around the fallback pair.
func customBadgeFace(family, role string, scale float64, bold bool, size, dpi float64, wrap func(font.Face) font.Face) font.Face {
	files, ok := badgeFontFiles[family]
	if !ok {
		return nil
	}
	key := badgeFaceKey{family: family, role: role, scale: int(scale * 100)}
	if f, ok := scaledBadgeFontFaces.Load(key); ok {
		return f.(font.Face)
	}
	file := files[0]
	if bold {
		file = files[1]
	}
	tt := parsedBadgeFont(file)
	if tt == nil {
		return nil
	}
	primary, err := opentype.NewFace(tt, &opentype.FaceOptions{Size: size, DPI: dpi, Hinting: font.HintingFull})
	if err != nil {
		slog.Warn("Failed to create a badge font face", "family", family, "error", err)
		return nil
	}
	face := primary
	if fb := builtinFallback(bold, size, dpi); fb != nil {
		face = fallbackFace{primary: primary, fallback: fb}
	}
	if wrap != nil {
		face = wrap(face)
	}
	actual, _ := scaledBadgeFontFaces.LoadOrStore(key, &lockedFace{inner: face})
	return actual.(font.Face)
}

// valueFaceIn is valueFaceFor in the chosen family: bold, for score text.
func valueFaceIn(family string, scale float64) font.Face {
	if family != "" {
		if f := customBadgeFace(family, "value", scale, true, 22*scale, 96, nil); f != nil {
			return f
		}
	}
	return valueFaceFor(scale)
}

// labelFaceIn is labelFaceFor in the chosen family: regular weight.
func labelFaceIn(family string, scale float64) font.Face {
	if family != "" {
		if f := customBadgeFace(family, "label", scale, false, 17*scale, 96, nil); f != nil {
			return f
		}
	}
	return labelFaceFor(scale)
}

// cleanLabelFaceIn is cleanLabelFaceFor in the chosen family. With no family
// the clean style keeps its own face.
func cleanLabelFaceIn(family string, scale float64) font.Face {
	if family != "" {
		size := cleanLabelSize * scale
		track := fixed.Int26_6(cleanLabelTracking * size * 64)
		wrap := func(f font.Face) font.Face { return trackedFace{Face: f, track: track} }
		if f := customBadgeFace(family, "clean", scale, true, size, 72, wrap); f != nil {
			return f
		}
	}
	return cleanLabelFaceFor(scale)
}
