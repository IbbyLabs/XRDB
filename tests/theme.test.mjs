import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampHue,
  clampAccentL,
  clampAccentC,
  clampSurfaceDepth,
  PRESETS_V2,
  DEFAULT_PRESET_V2,
  THEME_FAMILIES,
  DEFAULT_FAMILY_ID,
  getFamily,
  resolveActiveTheme,
  validatePalette,
  parametricToPalette,
  encodePaletteForUrl,
  decodePaletteFromUrl,
  OKLCH_RE,
} from '../lib/theme.ts';

// clampHue
test('clampHue wraps 360 to 0', () => {
  assert.equal(clampHue(360), 0);
});
test('clampHue wraps negative', () => {
  assert.equal(clampHue(-10), 350);
});
test('clampHue passes through valid', () => {
  assert.equal(clampHue(180), 180);
});
test('clampHue wraps beyond 360', () => {
  assert.equal(clampHue(400), 40);
});

// clampAccentL
test('clampAccentL clamps below min', () => {
  assert.equal(clampAccentL(10), 40);
});
test('clampAccentL clamps above max', () => {
  assert.equal(clampAccentL(90), 70);
});
test('clampAccentL passes through valid', () => {
  assert.equal(clampAccentL(55), 55);
});
test('clampAccentL passes through boundary min', () => {
  assert.equal(clampAccentL(40), 40);
});
test('clampAccentL passes through boundary max', () => {
  assert.equal(clampAccentL(70), 70);
});

// clampAccentC
test('clampAccentC clamps below min', () => {
  assert.equal(clampAccentC(0), 0.08);
});
test('clampAccentC clamps above max', () => {
  assert.equal(clampAccentC(1), 0.24);
});
test('clampAccentC passes through valid', () => {
  assert.equal(clampAccentC(0.16), 0.16);
});

// clampSurfaceDepth
test('clampSurfaceDepth clamps below min', () => {
  assert.equal(clampSurfaceDepth(0), 5);
});
test('clampSurfaceDepth clamps above max', () => {
  assert.equal(clampSurfaceDepth(20), 15);
});
test('clampSurfaceDepth passes through valid', () => {
  assert.equal(clampSurfaceDepth(7.5), 7.5);
});

// PRESETS_V2 integrity
test('PRESETS_V2 has at least the baseline preset count', () => {
  assert.ok(PRESETS_V2.length >= 12, `expected at least 12 presets, got ${PRESETS_V2.length}`);
});
test('PRESETS_V2 all have unique ids', () => {
  const ids = PRESETS_V2.map((p) => p.id);
  assert.equal(new Set(ids).size, PRESETS_V2.length);
});
test('PRESETS_V2 all have palette objects with 11 keys', () => {
  const keys = ['bgBase','bgMid','bgSurface','bgElevated','accent','accentDim','accentText','ink','muted','border','scrim'];
  for (const p of PRESETS_V2) {
    for (const k of keys) {
      assert.ok(k in p.palette, `preset ${p.id} missing palette key ${k}`);
    }
  }
});
test('PRESETS_V2 all palette values match OKLCH_RE', () => {
  for (const p of PRESETS_V2) {
    for (const [k, v] of Object.entries(p.palette)) {
      assert.ok(OKLCH_RE.test(v.trim()), `preset ${p.id} palette.${k} failed OKLCH_RE: ${v}`);
    }
  }
});
test('PRESETS_V2 includes midnight', () => {
  assert.ok(PRESETS_V2.some((p) => p.id === 'midnight'));
});
test('PRESETS_V2 includes hoth', () => {
  assert.ok(PRESETS_V2.some((p) => p.id === 'hoth'));
});
test('PRESETS_V2 includes stremio', () => {
  assert.ok(PRESETS_V2.some((p) => p.id === 'stremio'));
});
test('PRESETS_V2 includes torbox', () => {
  assert.ok(PRESETS_V2.some((p) => p.id === 'torbox'));
});
test('DEFAULT_PRESET_V2 is first preset', () => {
  assert.equal(DEFAULT_PRESET_V2.id, PRESETS_V2[0].id);
});
test('DEFAULT_PRESET_V2 is slate', () => {
  assert.equal(DEFAULT_PRESET_V2.id, 'slate');
});

// validatePalette
const VALID_PALETTE = {
  bgBase:     'oklch(7.5% 0.010 238)',
  bgMid:      'oklch(9.5% 0.012 238)',
  bgSurface:  'oklch(11% 0.014 238)',
  bgElevated: 'oklch(16% 0.018 238)',
  accent:     'oklch(54% 0.16 238)',
  accentDim:  'oklch(19% 0.09 238)',
  accentText: 'oklch(76% 0.10 238)',
  ink:        'oklch(93% 0.007 238)',
  muted:      'oklch(51% 0.014 238)',
  border:     'oklch(22% 0.016 238)',
  scrim:      'oklch(4% 0.008 238 / 0.86)',
};
test('validatePalette returns true for valid Slate palette', () => {
  assert.ok(validatePalette(VALID_PALETTE));
});
test('validatePalette returns false for missing key', () => {
  const { scrim: _removed, ...noScrim } = VALID_PALETTE;
  assert.equal(validatePalette(noScrim), false);
});
test('validatePalette returns false for non-string value', () => {
  assert.equal(validatePalette({ ...VALID_PALETTE, bgBase: 123 }), false);
});
test('validatePalette returns false for invalid OKLCH syntax', () => {
  assert.equal(validatePalette({ ...VALID_PALETTE, bgBase: 'hsl(200 50% 10%)' }), false);
});
test('validatePalette returns false for value exceeding 80 chars', () => {
  assert.equal(validatePalette({ ...VALID_PALETTE, bgBase: 'oklch(7.5% 0.010 238)' + ' '.repeat(60) }), false);
});
test('validatePalette returns false for null', () => {
  assert.equal(validatePalette(null), false);
});
test('validatePalette returns false for array', () => {
  assert.equal(validatePalette([]), false);
});

// parametricToPalette
test('parametricToPalette produces bgBase with correct depth', () => {
  const p = parametricToPalette(238, 54, 0.16, 7.5);
  assert.ok(p.bgBase.includes('7.5%'), `expected 7.5% in bgBase: ${p.bgBase}`);
});
test('parametricToPalette produces accent with correct l and c', () => {
  const p = parametricToPalette(238, 54, 0.16, 7.5);
  assert.ok(p.accent.includes('54%'), `expected 54% in accent: ${p.accent}`);
  assert.ok(p.accent.includes('0.16'), `expected 0.16 in accent: ${p.accent}`);
});
test('parametricToPalette output satisfies validatePalette', () => {
  const p = parametricToPalette(238, 54, 0.16, 7.5);
  assert.ok(validatePalette(p));
});

// encodePaletteForUrl / decodePaletteFromUrl
test('encodePaletteForUrl then decodePaletteFromUrl round-trips correctly', () => {
  const encoded = encodePaletteForUrl(VALID_PALETTE);
  const decoded = decodePaletteFromUrl(encoded);
  assert.deepEqual(decoded, VALID_PALETTE);
});
test('decodePaletteFromUrl returns null for garbage string', () => {
  assert.equal(decodePaletteFromUrl('not-valid-base64!!!'), null);
});
test('decodePaletteFromUrl returns null for invalid palette shape', () => {
  const encoded = btoa(JSON.stringify({ foo: 'bar' }));
  assert.equal(decodePaletteFromUrl(encoded), null);
});

// ─── THEME_FAMILIES integrity ─────────────────────────────────────────────────

const PALETTE_KEYS = ['bgBase','bgMid','bgSurface','bgElevated','accent','accentDim','accentText','ink','muted','border','scrim'];

test('THEME_FAMILIES has 13 entries', () => {
  assert.equal(THEME_FAMILIES.length, 13);
});

test('THEME_FAMILIES all ids are unique', () => {
  const ids = THEME_FAMILIES.map((f) => f.id);
  assert.equal(new Set(ids).size, THEME_FAMILIES.length);
});

test('THEME_FAMILIES every family has dark and light modes', () => {
  for (const f of THEME_FAMILIES) {
    assert.ok(f.modes.dark, `${f.id} missing dark mode`);
    assert.ok(f.modes.light, `${f.id} missing light mode`);
  }
});

test('THEME_FAMILIES standard families have midnight mode', () => {
  const standard = THEME_FAMILIES.filter((f) => !f.service);
  for (const f of standard) {
    assert.ok(f.modes.midnight, `${f.id} missing midnight mode`);
  }
});

test('THEME_FAMILIES all palettes have 11 tokens', () => {
  for (const f of THEME_FAMILIES) {
    for (const [modeName, palette] of Object.entries(f.modes)) {
      if (!palette) continue;
      for (const k of PALETTE_KEYS) {
        assert.ok(k in palette, `${f.id}/${modeName} missing palette key ${k}`);
      }
    }
  }
});

test('THEME_FAMILIES all palette values match OKLCH_RE', () => {
  for (const f of THEME_FAMILIES) {
    for (const [modeName, palette] of Object.entries(f.modes)) {
      if (!palette) continue;
      for (const [k, v] of Object.entries(palette)) {
        assert.ok(OKLCH_RE.test(v.trim()), `${f.id}/${modeName} palette.${k} failed OKLCH_RE: ${v}`);
      }
    }
  }
});

test('THEME_FAMILIES midnight border is at least 20% lightness', () => {
  const minL = 20;
  const borderRe = /oklch\((\d+(?:\.\d+)?)%/;
  for (const f of THEME_FAMILIES.filter((ff) => ff.modes.midnight)) {
    const border = f.modes.midnight.border;
    const m = borderRe.exec(border);
    assert.ok(m, `${f.id} midnight border has no lightness: ${border}`);
    assert.ok(parseFloat(m[1]) >= minL, `${f.id} midnight border lightness ${m[1]}% < ${minL}%: ${border}`);
  }
});

test('THEME_FAMILIES 8 standard + 5 service families', () => {
  assert.equal(THEME_FAMILIES.filter((f) => !f.service).length, 8);
  assert.equal(THEME_FAMILIES.filter((f) => f.service).length, 5);
});

// ─── getFamily ────────────────────────────────────────────────────────────────

test('getFamily returns the correct family for slate', () => {
  const f = getFamily('slate');
  assert.equal(f.id, 'slate');
});

test('getFamily throws for unknown id', () => {
  assert.throws(() => getFamily('nonexistent'), /Unknown theme family/);
});

// ─── resolveActiveTheme ───────────────────────────────────────────────────────

test('resolveActiveTheme returns dark palette for dark mode', () => {
  const palette = resolveActiveTheme('slate', 'dark');
  assert.ok(validatePalette(palette));
});

test('resolveActiveTheme returns light palette for light mode', () => {
  const palette = resolveActiveTheme('slate', 'light');
  assert.ok(validatePalette(palette));
  const bgL = parseFloat(palette.bgBase.match(/oklch\((\d+(?:\.\d+)?)%/)[1]);
  assert.ok(bgL > 90, `expected light bgBase > 90% L, got ${bgL}%`);
});

test('resolveActiveTheme returns midnight palette for midnight mode when available', () => {
  const palette = resolveActiveTheme('slate', 'midnight');
  assert.ok(validatePalette(palette));
  const bgL = parseFloat(palette.bgBase.match(/oklch\((\d+(?:\.\d+)?)%/)[1]);
  assert.ok(bgL < 5, `expected midnight bgBase < 5% L, got ${bgL}%`);
});

test('resolveActiveTheme falls back to dark when midnight not available', () => {
  const service = THEME_FAMILIES.find((f) => f.service && !f.modes.midnight);
  if (!service) return;
  const palette = resolveActiveTheme(service.id, 'midnight');
  assert.deepEqual(palette, service.modes.dark);
});

// ─── DEFAULT_FAMILY_ID ────────────────────────────────────────────────────────

test('DEFAULT_FAMILY_ID is slate', () => {
  assert.equal(DEFAULT_FAMILY_ID, 'slate');
});
