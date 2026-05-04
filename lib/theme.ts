// ─── Palette type ────────────────────────────────────────────────────────────

export type XRDBPalette = {
  bgBase: string;
  bgMid: string;
  bgSurface: string;
  bgElevated: string;
  accent: string;
  accentDim: string;
  accentText: string;
  ink: string;
  muted: string;
  border: string;
  scrim: string;
};

export type XRDBThemeV2 = {
  id: string;
  name: string;
  description?: string;
  category: 'preset' | 'community' | 'personal';
  palette: XRDBPalette;
};

export type ThemeSourceV2 = 'preset' | 'community' | 'personal' | 'url';
export type ThemePayloadV2 = XRDBThemeV2 & { source: ThemeSourceV2 };

// ─── Constants ───────────────────────────────────────────────────────────────

export const OKLCH_RE = /^oklch\(\s*[\d.]+%?\s+[\d.]+\s+[\d.]+(\s*\/\s*[\d.]+)?\s*\)$/;

export const STORAGE_KEY_V2 = 'xrdb.theme.v2';
export const PERSONAL_THEMES_KEY = 'xrdb.personal-themes.v1';
export const MAX_PERSONAL_SLOTS = 5;

const PALETTE_KEYS: (keyof XRDBPalette)[] = [
  'bgBase', 'bgMid', 'bgSurface', 'bgElevated',
  'accent', 'accentDim', 'accentText',
  'ink', 'muted', 'border', 'scrim',
];

const PALETTE_CSS_VARS = [
  '--bg-base', '--bg-mid', '--bg-surface', '--bg-elevated',
  '--accent', '--accent-dim', '--accent-text',
  '--ink', '--muted', '--border', '--scrim',
] as const;

const LEGACY_VARS = ['--hue', '--accent-l', '--accent-c', '--surface-depth-l'] as const;

// ─── Clamp helpers (kept for backward compat and parametricToPalette) ────────

export function clampHue(v: number): number {
  return ((v % 360) + 360) % 360;
}

export function clampAccentL(v: number): number {
  return Math.min(70, Math.max(40, v));
}

export function clampAccentC(v: number): number {
  return Math.min(0.24, Math.max(0.08, v));
}

export function clampSurfaceDepth(v: number): number {
  return Math.min(15, Math.max(5, v));
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function validatePalette(obj: unknown): obj is XRDBPalette {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const p = obj as Record<string, unknown>;
  return PALETTE_KEYS.every(
    (k) =>
      typeof p[k] === 'string' &&
      (p[k] as string).length <= 80 &&
      OKLCH_RE.test((p[k] as string).trim()),
  );
}

// ─── Parametric → palette migration util ─────────────────────────────────────

export function parametricToPalette(
  hue: number,
  accentL: number,
  accentC: number,
  surfaceDepth: number,
): XRDBPalette {
  const h = clampHue(hue);
  const l = clampAccentL(accentL);
  const c = clampAccentC(accentC);
  const d = clampSurfaceDepth(surfaceDepth);
  return {
    bgBase:     `oklch(${d}% 0.010 ${h})`,
    bgMid:      `oklch(9.5% 0.012 ${h})`,
    bgSurface:  `oklch(11% 0.014 ${h})`,
    bgElevated: `oklch(16% 0.018 ${h})`,
    accent:     `oklch(${l}% ${c} ${h})`,
    accentDim:  `oklch(19% 0.09 ${h})`,
    accentText: `oklch(76% 0.10 ${h})`,
    ink:        `oklch(93% 0.007 ${h})`,
    muted:      `oklch(51% 0.014 ${h})`,
    border:     `oklch(22% 0.016 ${h})`,
    scrim:      `oklch(4% 0.008 ${h} / 0.86)`,
  };
}

// ─── Built-in presets ─────────────────────────────────────────────────────────

function buildDarkPalette(
  hue: number,
  accentL: number,
  accentC: number,
  opts?: {
    baseL?: number;
    baseC?: number;
    midL?: number;
    midC?: number;
    surfaceL?: number;
    surfaceC?: number;
    elevatedL?: number;
    elevatedC?: number;
    textHue?: number;
    borderHue?: number;
  },
): XRDBPalette {
  const baseL = opts?.baseL ?? 7.5;
  const baseC = opts?.baseC ?? 0.010;
  const midL = opts?.midL ?? 9.5;
  const midC = opts?.midC ?? 0.012;
  const surfaceL = opts?.surfaceL ?? 11;
  const surfaceC = opts?.surfaceC ?? 0.014;
  const elevatedL = opts?.elevatedL ?? 16;
  const elevatedC = opts?.elevatedC ?? 0.018;
  const textHue = opts?.textHue ?? hue;
  const borderHue = opts?.borderHue ?? textHue;
  const accentTextL = Math.min(88, accentL + 22);
  const accentTextC = Math.max(0.08, accentC * 0.52);
  const accentDimC = Math.max(0.07, Math.min(0.11, accentC * 0.55));
  return {
    bgBase:     `oklch(${baseL}% ${baseC.toFixed(3)} ${hue})`,
    bgMid:      `oklch(${midL}% ${midC.toFixed(3)} ${hue})`,
    bgSurface:  `oklch(${surfaceL}% ${surfaceC.toFixed(3)} ${hue})`,
    bgElevated: `oklch(${elevatedL}% ${elevatedC.toFixed(3)} ${hue})`,
    accent:     `oklch(${accentL.toFixed(1)}% ${accentC.toFixed(3)} ${hue})`,
    accentDim:  `oklch(19% ${accentDimC.toFixed(3)} ${hue})`,
    accentText: `oklch(${accentTextL.toFixed(1)}% ${accentTextC.toFixed(3)} ${hue})`,
    ink:        `oklch(93% 0.007 ${textHue})`,
    muted:      `oklch(51% 0.014 ${textHue})`,
    border:     `oklch(22% 0.016 ${borderHue})`,
    scrim:      `oklch(4% 0.008 ${borderHue} / 0.86)`,
  };
}

function buildMidnightPalette(
  surfaceHue: number,
  accentHue: number,
  accentL: number,
  accentC: number,
  opts?: {
    midL?: number;
    midC?: number;
    surfaceL?: number;
    surfaceC?: number;
    elevatedL?: number;
    elevatedC?: number;
  },
): XRDBPalette {
  const midL = opts?.midL ?? 2;
  const midC = opts?.midC ?? 0.006;
  const surfaceL = opts?.surfaceL ?? 4.5;
  const surfaceC = opts?.surfaceC ?? 0.009;
  const elevatedL = opts?.elevatedL ?? 8;
  const elevatedC = opts?.elevatedC ?? 0.012;
  const accentTextL = Math.min(92, accentL + 14);
  const accentTextC = Math.max(0.08, accentC * 0.55);
  const accentDimC = Math.max(0.06, Math.min(0.10, accentC * 0.45));
  return {
    bgBase:     'oklch(0% 0 0)',
    bgMid:      `oklch(${midL}% ${midC.toFixed(3)} ${surfaceHue})`,
    bgSurface:  `oklch(${surfaceL}% ${surfaceC.toFixed(3)} ${surfaceHue})`,
    bgElevated: `oklch(${elevatedL}% ${elevatedC.toFixed(3)} ${surfaceHue})`,
    accent:     `oklch(${accentL.toFixed(1)}% ${accentC.toFixed(3)} ${accentHue})`,
    accentDim:  `oklch(12% ${accentDimC.toFixed(3)} ${accentHue})`,
    accentText: `oklch(${accentTextL.toFixed(1)}% ${accentTextC.toFixed(3)} ${accentHue})`,
    ink:        `oklch(95% 0.005 ${surfaceHue})`,
    muted:      `oklch(48% 0.012 ${surfaceHue})`,
    border:     `oklch(24% 0.018 ${surfaceHue})`,
    scrim:      'oklch(0% 0 0 / 0.92)',
  };
}

function buildLightPalette(
  hue: number,
  accentHue: number,
  accentL: number,
  accentC: number,
  opts?: {
    baseL?: number;
    baseC?: number;
    midL?: number;
    midC?: number;
    surfaceL?: number;
    surfaceC?: number;
    elevatedL?: number;
    elevatedC?: number;
    inkHue?: number;
    inkC?: number;
    mutedHue?: number;
    mutedC?: number;
    borderHue?: number;
    borderC?: number;
  },
): XRDBPalette {
  const baseL = opts?.baseL ?? 98;
  const baseC = opts?.baseC ?? 0.005;
  const midL = opts?.midL ?? 95;
  const midC = opts?.midC ?? 0.008;
  const surfaceL = opts?.surfaceL ?? 97;
  const surfaceC = opts?.surfaceC ?? 0.006;
  const elevatedL = opts?.elevatedL ?? 99.5;
  const elevatedC = opts?.elevatedC ?? 0.004;
  const inkHue = opts?.inkHue ?? hue;
  const inkC = opts?.inkC ?? 0.010;
  const mutedHue = opts?.mutedHue ?? hue;
  const mutedC = opts?.mutedC ?? 0.015;
  const borderHue = opts?.borderHue ?? mutedHue;
  const borderC = opts?.borderC ?? 0.012;
  return {
    bgBase:     `oklch(${baseL}% ${baseC.toFixed(3)} ${hue})`,
    bgMid:      `oklch(${midL}% ${midC.toFixed(3)} ${hue})`,
    bgSurface:  `oklch(${surfaceL}% ${surfaceC.toFixed(3)} ${hue})`,
    bgElevated: `oklch(${elevatedL}% ${elevatedC.toFixed(3)} ${hue})`,
    accent:     `oklch(${accentL.toFixed(1)}% ${accentC.toFixed(3)} ${accentHue})`,
    accentDim:  `oklch(88% ${(accentC * 0.38).toFixed(3)} ${accentHue})`,
    accentText: `oklch(${Math.max(28, accentL - 10).toFixed(1)}% ${Math.max(0.08, accentC * 0.8).toFixed(3)} ${accentHue})`,
    ink:        `oklch(12% ${inkC.toFixed(3)} ${inkHue})`,
    muted:      `oklch(42% ${mutedC.toFixed(3)} ${mutedHue})`,
    border:     `oklch(82% ${borderC.toFixed(3)} ${borderHue})`,
    scrim:      `oklch(6% 0.008 ${borderHue} / 0.42)`,
  };
}

const DARK_PRESETS: XRDBThemeV2[] = [
  { id: 'slate', name: 'Slate', category: 'preset', palette: buildDarkPalette(238, 54, 0.16, { baseL: 8.5, baseC: 0.014, midL: 10.5, midC: 0.017, surfaceL: 13, surfaceC: 0.020, elevatedL: 18, elevatedC: 0.026 }) },
  { id: 'obsidian', name: 'Obsidian', category: 'preset', palette: buildDarkPalette(272, 50, 0.18, { baseL: 6.2, baseC: 0.018, midL: 8.6, midC: 0.022, surfaceL: 10.5, surfaceC: 0.026, elevatedL: 15.5, elevatedC: 0.032 }) },
  { id: 'iron', name: 'Iron', category: 'preset', palette: buildDarkPalette(214, 52, 0.10, { baseL: 10.2, baseC: 0.008, midL: 12.6, midC: 0.010, surfaceL: 15.2, surfaceC: 0.012, elevatedL: 21, elevatedC: 0.016 }) },
  { id: 'ember', name: 'Ember', category: 'preset', palette: buildDarkPalette(30, 62, 0.19, { baseL: 7.2, baseC: 0.015, midL: 9.8, midC: 0.019, surfaceL: 12.2, surfaceC: 0.022, elevatedL: 17.8, elevatedC: 0.027 }) },
  { id: 'verdant', name: 'Verdant', category: 'preset', palette: buildDarkPalette(158, 55, 0.17, { baseL: 8.1, baseC: 0.013, midL: 10.8, midC: 0.017, surfaceL: 13.5, surfaceC: 0.021, elevatedL: 19.2, elevatedC: 0.027 }) },
  { id: 'crimson', name: 'Crimson', category: 'preset', palette: buildDarkPalette(18, 58, 0.22, { baseL: 6.8, baseC: 0.017, midL: 8.9, midC: 0.021, surfaceL: 11.1, surfaceC: 0.025, elevatedL: 16.6, elevatedC: 0.030 }) },
  { id: 'copper', name: 'Copper', category: 'preset', palette: buildDarkPalette(54, 60, 0.18, { baseL: 9.1, baseC: 0.014, midL: 11.5, midC: 0.017, surfaceL: 14.1, surfaceC: 0.021, elevatedL: 19.8, elevatedC: 0.026 }) },
  { id: 'dusk', name: 'Dusk', category: 'preset', palette: buildDarkPalette(302, 51, 0.14, { baseL: 7.0, baseC: 0.016, midL: 9.4, midC: 0.019, surfaceL: 11.8, surfaceC: 0.023, elevatedL: 17.1, elevatedC: 0.028 }) },
];

const MIDNIGHT_COMPANIONS: XRDBThemeV2[] = [
  {
    id: 'midnight',
    name: 'Midnight Slate',
    description: 'Deep black companion for Slate',
    category: 'preset',
    palette: buildMidnightPalette(238, 238, 58, 0.18, { midL: 1.8, midC: 0.008, surfaceL: 4.2, surfaceC: 0.011, elevatedL: 7.6, elevatedC: 0.015 }),
  },
  {
    id: 'midnight-obsidian',
    name: 'Midnight Obsidian',
    description: 'Deep black companion for Obsidian',
    category: 'preset',
    palette: buildMidnightPalette(272, 272, 56, 0.19, { midL: 2.2, midC: 0.009, surfaceL: 4.8, surfaceC: 0.013, elevatedL: 8.4, elevatedC: 0.018 }),
  },
  {
    id: 'midnight-iron',
    name: 'Midnight Iron',
    description: 'Deep black companion for Iron',
    category: 'preset',
    palette: buildMidnightPalette(214, 214, 56, 0.14, { midL: 2.6, midC: 0.007, surfaceL: 5.0, surfaceC: 0.010, elevatedL: 8.8, elevatedC: 0.014 }),
  },
  {
    id: 'midnight-ember',
    name: 'Midnight Ember',
    description: 'Deep black companion for Ember',
    category: 'preset',
    palette: buildMidnightPalette(30, 30, 66, 0.20, { midL: 1.9, midC: 0.010, surfaceL: 4.1, surfaceC: 0.014, elevatedL: 7.5, elevatedC: 0.020 }),
  },
  {
    id: 'midnight-verdant',
    name: 'Midnight Verdant',
    description: 'Deep black companion for Verdant',
    category: 'preset',
    palette: buildMidnightPalette(158, 158, 60, 0.19, { midL: 2.0, midC: 0.009, surfaceL: 4.4, surfaceC: 0.013, elevatedL: 8.0, elevatedC: 0.018 }),
  },
  {
    id: 'midnight-crimson',
    name: 'Midnight Crimson',
    description: 'Deep black companion for Crimson',
    category: 'preset',
    palette: buildMidnightPalette(18, 18, 62, 0.23, { midL: 1.7, midC: 0.010, surfaceL: 4.0, surfaceC: 0.015, elevatedL: 7.3, elevatedC: 0.021 }),
  },
  {
    id: 'midnight-copper',
    name: 'Midnight Copper',
    description: 'Deep black companion for Copper',
    category: 'preset',
    palette: buildMidnightPalette(52, 52, 64, 0.20, { midL: 2.3, midC: 0.009, surfaceL: 4.9, surfaceC: 0.013, elevatedL: 8.6, elevatedC: 0.018 }),
  },
  {
    id: 'midnight-dusk',
    name: 'Midnight Dusk',
    description: 'Deep black companion for Dusk',
    category: 'preset',
    palette: buildMidnightPalette(302, 302, 57, 0.16, { midL: 2.1, midC: 0.010, surfaceL: 4.6, surfaceC: 0.014, elevatedL: 8.2, elevatedC: 0.019 }),
  },
];

const LIGHT_PRESETS: XRDBThemeV2[] = [
  {
    id: 'hoth',
    name: 'Hoth Ice',
    description: 'Cool high-contrast light theme',
    category: 'preset',
    palette: buildLightPalette(228, 238, 41, 0.17, { baseL: 97.5, baseC: 0.012, midL: 93.5, midC: 0.020, surfaceL: 95.8, surfaceC: 0.016, elevatedL: 99.2, elevatedC: 0.010, inkHue: 228, inkC: 0.016, mutedHue: 228, mutedC: 0.020, borderHue: 228, borderC: 0.018 }),
  },
  {
    id: 'aurora',
    name: 'Aurora Mist',
    description: 'Soft cool light theme with violet accent',
    category: 'preset',
    palette: buildLightPalette(286, 288, 48, 0.15, { baseL: 96.8, baseC: 0.016, midL: 92.4, midC: 0.024, surfaceL: 95.0, surfaceC: 0.019, elevatedL: 98.6, elevatedC: 0.013, inkHue: 286, inkC: 0.018, mutedHue: 286, mutedC: 0.022, borderHue: 286, borderC: 0.021 }),
  },
  {
    id: 'parchment',
    name: 'Parchment',
    description: 'Warm editorial light theme',
    category: 'preset',
    palette: buildLightPalette(72, 50, 45, 0.14, { baseL: 95.5, baseC: 0.020, midL: 90.4, midC: 0.030, surfaceL: 93.7, surfaceC: 0.024, elevatedL: 97.8, elevatedC: 0.017, inkHue: 56, inkC: 0.020, mutedHue: 56, mutedC: 0.024, borderHue: 56, borderC: 0.022 }),
  },
  {
    id: 'daylight',
    name: 'Daylight',
    description: 'Neutral daylight light theme with balanced blue',
    category: 'preset',
    palette: buildLightPalette(186, 200, 44, 0.16, { baseL: 97.2, baseC: 0.018, midL: 92.1, midC: 0.028, surfaceL: 94.9, surfaceC: 0.023, elevatedL: 98.8, elevatedC: 0.015, inkHue: 200, inkC: 0.018, mutedHue: 200, mutedC: 0.022, borderHue: 200, borderC: 0.020 }),
  },
];

const SERVICE_PRESETS: XRDBThemeV2[] = [
  {
    id: 'aiostreams',
    name: 'AIOStreams',
    description: 'Based on aiostreams.viren070.me accent color #c7c2ff',
    category: 'preset',
    palette: buildDarkPalette(288, 83.9, 0.085, { baseL: 7.2, baseC: 0.018, midL: 9.1, midC: 0.022, surfaceL: 11.8, surfaceC: 0.028, elevatedL: 17.5, elevatedC: 0.034 }),
  },
  {
    id: 'aiometadata',
    name: 'AIOMetadata',
    description: 'Based on aiometadata.viren070.me accent color #01b4e4',
    category: 'preset',
    palette: buildDarkPalette(226, 71.7, 0.137, { baseL: 8.8, baseC: 0.016, midL: 11.2, midC: 0.020, surfaceL: 14.0, surfaceC: 0.024, elevatedL: 20.1, elevatedC: 0.030 }),
  },
  {
    id: 'stremio',
    name: 'Stremio',
    description: 'Based on stremio.com accent color #1155d9',
    category: 'preset',
    palette: buildDarkPalette(262, 50, 0.212, { baseL: 6.6, baseC: 0.020, midL: 8.7, midC: 0.026, surfaceL: 10.6, surfaceC: 0.031, elevatedL: 16.0, elevatedC: 0.038 }),
  },
  {
    id: 'torbox',
    name: 'TorBox',
    description: 'Based on torbox.app accent color #04bf8a',
    category: 'preset',
    palette: buildDarkPalette(165, 71.3, 0.150, { baseL: 8.2, baseC: 0.017, midL: 10.6, midC: 0.022, surfaceL: 13.3, surfaceC: 0.027, elevatedL: 19.0, elevatedC: 0.034 }),
  },
  {
    id: 'realdebrid',
    name: 'Real Debrid',
    description: 'Based on real-debrid.com accent color #64e0ff',
    category: 'preset',
    palette: buildDarkPalette(205, 84.8, 0.118, { baseL: 7.8, baseC: 0.019, midL: 10.1, midC: 0.025, surfaceL: 12.7, surfaceC: 0.030, elevatedL: 18.6, elevatedC: 0.037 }),
  },
];

export const PRESETS_V2: XRDBThemeV2[] = [
  ...DARK_PRESETS,
  ...MIDNIGHT_COMPANIONS,
  ...LIGHT_PRESETS,
  ...SERVICE_PRESETS,
];

export const DEFAULT_PRESET_V2 = PRESETS_V2[0];

// ─── Apply / reset ────────────────────────────────────────────────────────────

export function applyThemeV2(payload: ThemePayloadV2): void {
  const root = document.documentElement;
  root.dataset.theme = payload.id;
  if (payload.id === 'midnight' || payload.id.startsWith('midnight-')) {
    root.dataset.midnight = 'true';
  } else {
    delete root.dataset.midnight;
  }
  PALETTE_KEYS.forEach((k, i) => {
    root.style.setProperty(PALETTE_CSS_VARS[i], payload.palette[k]);
  });
  LEGACY_VARS.forEach((v) => root.style.removeProperty(v));
}

export function resetThemeV2(): void {
  const root = document.documentElement;
  delete root.dataset.theme;
  PALETTE_KEYS.forEach((_, i) => root.style.removeProperty(PALETTE_CSS_VARS[i]));
  LEGACY_VARS.forEach((v) => root.style.removeProperty(v));
  try {
    localStorage.removeItem(STORAGE_KEY_V2);
  } catch {
  }
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export function saveThemeV2(payload: ThemePayloadV2): void {
  try {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(payload));
  } catch {
  }
}

export function getStoredThemeV2(): ThemePayloadV2 | null {
  try {
    const raw2 = localStorage.getItem(STORAGE_KEY_V2);
    if (raw2) {
      const parsed = JSON.parse(raw2) as unknown;
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        typeof (parsed as Record<string, unknown>).id === 'string' &&
        typeof (parsed as Record<string, unknown>).name === 'string' &&
        validatePalette((parsed as Record<string, unknown>).palette)
      ) {
        return parsed as ThemePayloadV2;
      }
    }
  } catch {
  }

  try {
    const raw1 = localStorage.getItem('xrdb.theme.v1');
    if (raw1) {
      const p1 = JSON.parse(raw1) as unknown;
      if (
        p1 !== null &&
        typeof p1 === 'object' &&
        !Array.isArray(p1) &&
        typeof (p1 as Record<string, unknown>).id === 'string' &&
        typeof (p1 as Record<string, unknown>).hue === 'number'
      ) {
        const v1 = p1 as Record<string, unknown>;
        const palette = parametricToPalette(
          v1.hue as number,
          typeof v1.accentL === 'number' ? v1.accentL : 54,
          typeof v1.accentC === 'number' ? v1.accentC : 0.16,
          typeof v1.surfaceDepth === 'number' ? v1.surfaceDepth : 7.5,
        );
        const source = (v1.source as ThemeSourceV2) ?? 'preset';
        return {
          id: v1.id as string,
          name: typeof v1.name === 'string' ? v1.name : 'Custom',
          category: source === 'community' ? 'community' : source === 'personal' ? 'personal' : 'preset',
          palette,
          source,
        };
      }
    }
  } catch {
  }

  return null;
}

// ─── Personal slots ───────────────────────────────────────────────────────────

export function getPersonalThemes(): XRDBThemeV2[] {
  try {
    const raw = localStorage.getItem(PERSONAL_THEMES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).filter(
      (item): item is XRDBThemeV2 =>
        item !== null &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        typeof (item as Record<string, unknown>).id === 'string' &&
        typeof (item as Record<string, unknown>).name === 'string' &&
        validatePalette((item as Record<string, unknown>).palette),
    );
  } catch {
    return [];
  }
}

export function savePersonalTheme(theme: XRDBThemeV2): void {
  try {
    const existing = getPersonalThemes();
    const idx = existing.findIndex((t) => t.id === theme.id);
    let updated: XRDBThemeV2[];
    if (idx >= 0) {
      updated = [...existing];
      updated[idx] = theme;
    } else {
      updated = [...existing, theme];
      if (updated.length > MAX_PERSONAL_SLOTS) {
        updated = updated.slice(updated.length - MAX_PERSONAL_SLOTS);
      }
    }
    localStorage.setItem(PERSONAL_THEMES_KEY, JSON.stringify(updated));
  } catch {
  }
}

export function deletePersonalTheme(id: string): void {
  try {
    const existing = getPersonalThemes();
    localStorage.setItem(PERSONAL_THEMES_KEY, JSON.stringify(existing.filter((t) => t.id !== id)));
  } catch {
  }
}

// ─── URL encoding ─────────────────────────────────────────────────────────────

export function encodePaletteForUrl(palette: XRDBPalette): string {
  return btoa(JSON.stringify(palette))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodePaletteFromUrl(encoded: string): XRDBPalette | null {
  try {
    const json = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed = JSON.parse(json) as unknown;
    return validatePalette(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ─── Theme family system ──────────────────────────────────────────────────────

export type XRDBThemeMode = 'dark' | 'light' | 'midnight';
export type XRDBModePreference = XRDBThemeMode | 'system';

export type XRDBThemeFamily = {
  id: string;
  name: string;
  description?: string;
  service?: boolean;
  modes: {
    dark: XRDBPalette;
    light: XRDBPalette;
    midnight?: XRDBPalette;
  };
};

export const STORAGE_KEY_FAMILY = 'xrdb.theme.family.v1';
export const STORAGE_KEY_MODE   = 'xrdb.theme.mode.v1';
export const DEFAULT_FAMILY_ID  = 'slate';
export const DEFAULT_FAMILY_MODE: XRDBThemeMode = 'dark';

// ─── THEME_FAMILIES ───────────────────────────────────────────────────────────

export const THEME_FAMILIES: XRDBThemeFamily[] = [
  // ── Standard families ──────────────────────────────────────────────────────
  {
    id: 'slate',
    name: 'Slate',
    description: 'Cool blue-gray foundation',
    modes: {
      dark:     buildDarkPalette(238, 54, 0.16, { baseL: 8.5, baseC: 0.014, midL: 10.5, midC: 0.017, surfaceL: 13, surfaceC: 0.020, elevatedL: 18, elevatedC: 0.026 }),
      midnight: buildMidnightPalette(238, 238, 58, 0.18, { midL: 1.8, midC: 0.008, surfaceL: 4.2, surfaceC: 0.011, elevatedL: 7.6, elevatedC: 0.015 }),
      light:    buildLightPalette(238, 238, 49, 0.16, { baseL: 97.5, baseC: 0.012, midL: 93.5, midC: 0.020, surfaceL: 95.8, surfaceC: 0.016, elevatedL: 99.2, elevatedC: 0.008, inkHue: 238, inkC: 0.016, mutedHue: 238, mutedC: 0.020, borderHue: 238, borderC: 0.018 }),
    },
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    description: 'Deep purple with high contrast',
    modes: {
      dark:     buildDarkPalette(272, 50, 0.18, { baseL: 6.2, baseC: 0.018, midL: 8.6, midC: 0.022, surfaceL: 10.5, surfaceC: 0.026, elevatedL: 15.5, elevatedC: 0.032 }),
      midnight: buildMidnightPalette(272, 272, 56, 0.19, { midL: 2.2, midC: 0.009, surfaceL: 4.8, surfaceC: 0.013, elevatedL: 8.4, elevatedC: 0.018 }),
      light:    buildLightPalette(272, 272, 47, 0.16, { baseL: 97.0, baseC: 0.014, midL: 92.8, midC: 0.022, surfaceL: 95.4, surfaceC: 0.018, elevatedL: 99.0, elevatedC: 0.009, inkHue: 272, inkC: 0.016, mutedHue: 272, mutedC: 0.020, borderHue: 272, borderC: 0.018 }),
    },
  },
  {
    id: 'iron',
    name: 'Iron',
    description: 'Industrial steel blue with muted tones',
    modes: {
      dark:     buildDarkPalette(214, 52, 0.10, { baseL: 10.2, baseC: 0.008, midL: 12.6, midC: 0.010, surfaceL: 15.2, surfaceC: 0.012, elevatedL: 21, elevatedC: 0.016 }),
      midnight: buildMidnightPalette(214, 214, 56, 0.14, { midL: 2.6, midC: 0.007, surfaceL: 5.0, surfaceC: 0.010, elevatedL: 8.8, elevatedC: 0.014 }),
      light:    buildLightPalette(214, 214, 48, 0.10, { baseL: 97.8, baseC: 0.010, midL: 94.0, midC: 0.016, surfaceL: 96.2, surfaceC: 0.013, elevatedL: 99.4, elevatedC: 0.006, inkHue: 214, inkC: 0.014, mutedHue: 214, mutedC: 0.018, borderHue: 214, borderC: 0.014 }),
    },
  },
  {
    id: 'ember',
    name: 'Ember',
    description: 'Warm amber-orange with glowing accents',
    modes: {
      dark:     buildDarkPalette(30, 62, 0.19, { baseL: 7.2, baseC: 0.015, midL: 9.8, midC: 0.019, surfaceL: 12.2, surfaceC: 0.022, elevatedL: 17.8, elevatedC: 0.027 }),
      midnight: buildMidnightPalette(30, 30, 66, 0.20, { midL: 1.9, midC: 0.010, surfaceL: 4.1, surfaceC: 0.014, elevatedL: 7.5, elevatedC: 0.020 }),
      light:    buildLightPalette(30, 30, 50, 0.18, { baseL: 97.4, baseC: 0.016, midL: 93.0, midC: 0.026, surfaceL: 95.6, surfaceC: 0.020, elevatedL: 99.0, elevatedC: 0.010, inkHue: 30, inkC: 0.018, mutedHue: 30, mutedC: 0.022, borderHue: 30, borderC: 0.020 }),
    },
  },
  {
    id: 'verdant',
    name: 'Verdant',
    description: 'Deep forest green with organic warmth',
    modes: {
      dark:     buildDarkPalette(158, 55, 0.17, { baseL: 8.1, baseC: 0.013, midL: 10.8, midC: 0.017, surfaceL: 13.5, surfaceC: 0.021, elevatedL: 19.2, elevatedC: 0.027 }),
      midnight: buildMidnightPalette(158, 158, 60, 0.19, { midL: 2.0, midC: 0.009, surfaceL: 4.4, surfaceC: 0.013, elevatedL: 8.0, elevatedC: 0.018 }),
      light:    buildLightPalette(158, 158, 50, 0.17, { baseL: 97.2, baseC: 0.013, midL: 93.2, midC: 0.022, surfaceL: 95.5, surfaceC: 0.017, elevatedL: 99.1, elevatedC: 0.008, inkHue: 158, inkC: 0.015, mutedHue: 158, mutedC: 0.019, borderHue: 158, borderC: 0.017 }),
    },
  },
  {
    id: 'crimson',
    name: 'Crimson',
    description: 'Bold red with dramatic contrast',
    modes: {
      dark:     buildDarkPalette(18, 58, 0.22, { baseL: 6.8, baseC: 0.017, midL: 8.9, midC: 0.021, surfaceL: 11.1, surfaceC: 0.025, elevatedL: 16.6, elevatedC: 0.030 }),
      midnight: buildMidnightPalette(18, 18, 62, 0.23, { midL: 1.7, midC: 0.010, surfaceL: 4.0, surfaceC: 0.015, elevatedL: 7.3, elevatedC: 0.021 }),
      light:    buildLightPalette(18, 18, 48, 0.20, { baseL: 97.6, baseC: 0.016, midL: 93.8, midC: 0.026, surfaceL: 95.9, surfaceC: 0.020, elevatedL: 99.3, elevatedC: 0.009, inkHue: 18, inkC: 0.018, mutedHue: 18, mutedC: 0.022, borderHue: 18, borderC: 0.020 }),
    },
  },
  {
    id: 'copper',
    name: 'Copper',
    description: 'Rich golden-copper warmth',
    modes: {
      dark:     buildDarkPalette(54, 60, 0.18, { baseL: 9.1, baseC: 0.014, midL: 11.5, midC: 0.017, surfaceL: 14.1, surfaceC: 0.021, elevatedL: 19.8, elevatedC: 0.026 }),
      midnight: buildMidnightPalette(52, 52, 64, 0.20, { midL: 2.3, midC: 0.009, surfaceL: 4.9, surfaceC: 0.013, elevatedL: 8.6, elevatedC: 0.018 }),
      light:    buildLightPalette(54, 54, 50, 0.18, { baseL: 97.0, baseC: 0.016, midL: 92.4, midC: 0.025, surfaceL: 95.2, surfaceC: 0.020, elevatedL: 98.8, elevatedC: 0.010, inkHue: 54, inkC: 0.018, mutedHue: 54, mutedC: 0.022, borderHue: 54, borderC: 0.020 }),
    },
  },
  {
    id: 'dusk',
    name: 'Dusk',
    description: 'Moody twilight violet',
    modes: {
      dark:     buildDarkPalette(302, 51, 0.14, { baseL: 7.0, baseC: 0.016, midL: 9.4, midC: 0.019, surfaceL: 11.8, surfaceC: 0.023, elevatedL: 17.1, elevatedC: 0.028 }),
      midnight: buildMidnightPalette(302, 302, 57, 0.16, { midL: 2.1, midC: 0.010, surfaceL: 4.6, surfaceC: 0.014, elevatedL: 8.2, elevatedC: 0.019 }),
      light:    buildLightPalette(302, 302, 48, 0.14, { baseL: 97.3, baseC: 0.014, midL: 93.4, midC: 0.022, surfaceL: 95.7, surfaceC: 0.018, elevatedL: 99.1, elevatedC: 0.009, inkHue: 302, inkC: 0.016, mutedHue: 302, mutedC: 0.020, borderHue: 302, borderC: 0.018 }),
    },
  },
  // ── Service families ────────────────────────────────────────────────────────
  {
    id: 'aiostreams',
    name: 'AIOStreams',
    description: 'Based on aiostreams.viren070.me',
    service: true,
    modes: {
      dark:     buildDarkPalette(288, 83.9, 0.085, { baseL: 7.2, baseC: 0.018, midL: 9.1, midC: 0.022, surfaceL: 11.8, surfaceC: 0.028, elevatedL: 17.5, elevatedC: 0.034 }),
      midnight: buildMidnightPalette(288, 288, 87, 0.092, { midL: 1.9, midC: 0.009, surfaceL: 4.2, surfaceC: 0.013, elevatedL: 7.8, elevatedC: 0.017 }),
      light:    buildLightPalette(288, 288, 45, 0.085, { baseL: 97.2, baseC: 0.014, midL: 93.0, midC: 0.022, surfaceL: 95.5, surfaceC: 0.017, elevatedL: 99.0, elevatedC: 0.008, inkHue: 288, inkC: 0.016, mutedHue: 288, mutedC: 0.020, borderHue: 288, borderC: 0.018 }),
    },
  },
  {
    id: 'aiometadata',
    name: 'AIOMetadata',
    description: 'Based on aiometadata.viren070.me',
    service: true,
    modes: {
      dark:     buildDarkPalette(226, 71.7, 0.137, { baseL: 8.8, baseC: 0.016, midL: 11.2, midC: 0.020, surfaceL: 14.0, surfaceC: 0.024, elevatedL: 20.1, elevatedC: 0.030 }),
      midnight: buildMidnightPalette(226, 226, 75, 0.145, { midL: 2.0, midC: 0.008, surfaceL: 4.5, surfaceC: 0.012, elevatedL: 8.1, elevatedC: 0.016 }),
      light:    buildLightPalette(226, 226, 45, 0.137, { baseL: 97.5, baseC: 0.012, midL: 93.5, midC: 0.020, surfaceL: 95.8, surfaceC: 0.016, elevatedL: 99.2, elevatedC: 0.008, inkHue: 226, inkC: 0.016, mutedHue: 226, mutedC: 0.020, borderHue: 226, borderC: 0.018 }),
    },
  },
  {
    id: 'stremio',
    name: 'Stremio',
    description: 'Based on stremio.com',
    service: true,
    modes: {
      dark:     buildDarkPalette(262, 50, 0.212, { baseL: 6.6, baseC: 0.020, midL: 8.7, midC: 0.026, surfaceL: 10.6, surfaceC: 0.031, elevatedL: 16.0, elevatedC: 0.038 }),
      midnight: buildMidnightPalette(262, 262, 54, 0.220, { midL: 2.1, midC: 0.010, surfaceL: 4.6, surfaceC: 0.014, elevatedL: 8.3, elevatedC: 0.019 }),
      light:    buildLightPalette(262, 262, 46, 0.212, { baseL: 97.0, baseC: 0.016, midL: 92.8, midC: 0.026, surfaceL: 95.3, surfaceC: 0.020, elevatedL: 99.0, elevatedC: 0.010, inkHue: 262, inkC: 0.018, mutedHue: 262, mutedC: 0.022, borderHue: 262, borderC: 0.020 }),
    },
  },
  {
    id: 'torbox',
    name: 'TorBox',
    description: 'Based on torbox.app',
    service: true,
    modes: {
      dark:     buildDarkPalette(165, 71.3, 0.150, { baseL: 8.2, baseC: 0.017, midL: 10.6, midC: 0.022, surfaceL: 13.3, surfaceC: 0.027, elevatedL: 19.0, elevatedC: 0.034 }),
      midnight: buildMidnightPalette(165, 165, 75, 0.158, { midL: 2.0, midC: 0.009, surfaceL: 4.3, surfaceC: 0.013, elevatedL: 7.7, elevatedC: 0.017 }),
      light:    buildLightPalette(165, 165, 45, 0.150, { baseL: 97.3, baseC: 0.013, midL: 93.2, midC: 0.021, surfaceL: 95.6, surfaceC: 0.017, elevatedL: 99.1, elevatedC: 0.008, inkHue: 165, inkC: 0.015, mutedHue: 165, mutedC: 0.019, borderHue: 165, borderC: 0.017 }),
    },
  },
  {
    id: 'realdebrid',
    name: 'Real Debrid',
    description: 'Based on real-debrid.com',
    service: true,
    modes: {
      dark:     buildDarkPalette(205, 84.8, 0.118, { baseL: 7.8, baseC: 0.019, midL: 10.1, midC: 0.025, surfaceL: 12.7, surfaceC: 0.030, elevatedL: 18.6, elevatedC: 0.037 }),
      midnight: buildMidnightPalette(205, 205, 88, 0.124, { midL: 1.9, midC: 0.009, surfaceL: 4.1, surfaceC: 0.013, elevatedL: 7.5, elevatedC: 0.017 }),
      light:    buildLightPalette(205, 205, 45, 0.118, { baseL: 97.4, baseC: 0.012, midL: 93.4, midC: 0.020, surfaceL: 95.7, surfaceC: 0.016, elevatedL: 99.2, elevatedC: 0.007, inkHue: 205, inkC: 0.015, mutedHue: 205, mutedC: 0.019, borderHue: 205, borderC: 0.017 }),
    },
  },
];

// ─── Family helpers ───────────────────────────────────────────────────────────

export function getFamily(id: string): XRDBThemeFamily {
  const family = THEME_FAMILIES.find((f) => f.id === id);
  if (!family) throw new Error(`Unknown theme family: ${id}`);
  return family;
}

export function resolveActiveTheme(familyId: string, mode: XRDBThemeMode): XRDBPalette {
  const family = getFamily(familyId);
  if (mode === 'midnight') {
    return family.modes.midnight ?? family.modes.dark;
  }
  return family.modes[mode];
}

export function setActiveFamily(id: string): void {
  try { localStorage.setItem(STORAGE_KEY_FAMILY, id); } catch { }
}

export function getActiveFamily(): string {
  try { return localStorage.getItem(STORAGE_KEY_FAMILY) ?? DEFAULT_FAMILY_ID; } catch { return DEFAULT_FAMILY_ID; }
}

export function setActiveMode(pref: XRDBModePreference): void {
  try { localStorage.setItem(STORAGE_KEY_MODE, pref); } catch { }
}

export function getActiveModePreference(): XRDBModePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MODE);
    if (raw === 'dark' || raw === 'light' || raw === 'midnight' || raw === 'system') return raw;
  } catch { }
  return 'dark';
}

export function resolveMode(pref: XRDBModePreference): XRDBThemeMode {
  if (pref !== 'system') return pref;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}

// Maps existing V2 preset ids to family+mode for migration
const FAMILY_MODE_MAP: Record<string, { family: string; mode: XRDBThemeMode }> = {
  slate:              { family: 'slate',       mode: 'dark' },
  obsidian:           { family: 'obsidian',    mode: 'dark' },
  iron:               { family: 'iron',        mode: 'dark' },
  ember:              { family: 'ember',       mode: 'dark' },
  verdant:            { family: 'verdant',     mode: 'dark' },
  crimson:            { family: 'crimson',     mode: 'dark' },
  copper:             { family: 'copper',      mode: 'dark' },
  dusk:               { family: 'dusk',        mode: 'dark' },
  midnight:           { family: 'slate',       mode: 'midnight' },
  'midnight-obsidian':{ family: 'obsidian',    mode: 'midnight' },
  'midnight-iron':    { family: 'iron',        mode: 'midnight' },
  'midnight-ember':   { family: 'ember',       mode: 'midnight' },
  'midnight-verdant': { family: 'verdant',     mode: 'midnight' },
  'midnight-crimson': { family: 'crimson',     mode: 'midnight' },
  'midnight-copper':  { family: 'copper',      mode: 'midnight' },
  'midnight-dusk':    { family: 'dusk',        mode: 'midnight' },
  aiostreams:         { family: 'aiostreams',  mode: 'dark' },
  aiometadata:        { family: 'aiometadata', mode: 'dark' },
  stremio:            { family: 'stremio',     mode: 'dark' },
  torbox:             { family: 'torbox',      mode: 'dark' },
  realdebrid:         { family: 'realdebrid',  mode: 'dark' },
};

export function migrateV2ToFamily(): void {
  try {
    if (localStorage.getItem(STORAGE_KEY_FAMILY)) return;
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    const id = (parsed as Record<string, unknown>).id;
    if (typeof id !== 'string') return;
    const mapping = FAMILY_MODE_MAP[id];
    if (mapping) {
      localStorage.setItem(STORAGE_KEY_FAMILY, mapping.family);
      localStorage.setItem(STORAGE_KEY_MODE, mapping.mode);
      localStorage.removeItem(STORAGE_KEY_V2);
    }
  } catch { }
}

// ─── Deprecated aliases (kept for migration period) ──────────────────────────

/** @deprecated Use XRDBThemeV2 */
export type XRDBTheme = XRDBThemeV2;
/** @deprecated Use ThemePayloadV2 */
export type ThemePayload = ThemePayloadV2;
/** @deprecated Use ThemeSourceV2 */
export type ThemeSource = ThemeSourceV2;
/** @deprecated Use PRESETS_V2 */
export const PRESETS: XRDBThemeV2[] = PRESETS_V2;
/** @deprecated Use DEFAULT_PRESET_V2 */
export const DEFAULT_PRESET: XRDBThemeV2 = DEFAULT_PRESET_V2;
/** @deprecated Use applyThemeV2 */
export const applyTheme = applyThemeV2;
/** @deprecated Use resetThemeV2 */
export const resetTheme = resetThemeV2;
/** @deprecated Use saveThemeV2 */
export const saveTheme = saveThemeV2;
/** @deprecated Use getStoredThemeV2 */
export const getStoredTheme = getStoredThemeV2;
