import type { MediaFeatureBadgeKey } from './mediaFeatures.ts';
import { MEDIA_FEATURE_BADGE_ORDER } from './mediaFeatures.ts';
import {
  ALL_RATING_PREFERENCES,
  normalizeRatingPreference,
  type RatingPreference,
} from './ratingProviderCatalog.ts';

export const DEFAULT_BADGE_SCALE_PERCENT = 100;
export const MIN_BADGE_SCALE_PERCENT = 70;
export const MAX_BADGE_SCALE_PERCENT = 150;
export const MAX_GENRE_BADGE_SCALE_PERCENT = 200;
export const DEFAULT_PROVIDER_ICON_SCALE_PERCENT = 100;
export const MIN_PROVIDER_ICON_SCALE_PERCENT = 70;
export const MAX_PROVIDER_ICON_SCALE_PERCENT = 145;
export const DEFAULT_STACKED_LINE_WIDTH_PERCENT = 100;
export const MIN_STACKED_LINE_WIDTH_PERCENT = 40;
export const MAX_STACKED_LINE_WIDTH_PERCENT = 160;
export const DEFAULT_STACKED_LINE_HEIGHT_PERCENT = 100;
export const MIN_STACKED_LINE_HEIGHT_PERCENT = 50;
export const MAX_STACKED_LINE_HEIGHT_PERCENT = 220;
export const DEFAULT_STACKED_LINE_GAP_PERCENT = 100;
export const MIN_STACKED_LINE_GAP_PERCENT = 0;
export const MAX_STACKED_LINE_GAP_PERCENT = 220;
export const DEFAULT_STACKED_WIDTH_PERCENT = 100;
export const MIN_STACKED_WIDTH_PERCENT = 70;
export const MAX_STACKED_WIDTH_PERCENT = 130;
export const DEFAULT_STACKED_SURFACE_OPACITY_PERCENT = 100;
export const MIN_STACKED_SURFACE_OPACITY_PERCENT = 30;
export const MAX_STACKED_SURFACE_OPACITY_PERCENT = 100;
export const DEFAULT_STACKED_ELEMENT_OFFSET_PX = 0;
export const MIN_STACKED_ELEMENT_OFFSET_PX = -24;
export const MAX_STACKED_ELEMENT_OFFSET_PX = 24;

export type StackedAccentMode = 'badge' | 'logo';
export const DEFAULT_STACKED_ACCENT_MODE: StackedAccentMode = 'badge';

export type RatingProviderAppearanceOverride = {
  iconUrl?: string;
  accentColor?: string;
  iconScalePercent?: number;
  stackedLineVisible?: boolean;
  stackedLineWidthPercent?: number;
  stackedLineHeightPercent?: number;
  stackedLineGapPercent?: number;
  stackedWidthPercent?: number;
  stackedSurfaceOpacityPercent?: number;
  stackedAccentMode?: StackedAccentMode;
  stackedLineOffsetX?: number;
  stackedLineOffsetY?: number;
  stackedIconOffsetX?: number;
  stackedIconOffsetY?: number;
  stackedValueOffsetX?: number;
  stackedValueOffsetY?: number;
};

export type RatingProviderAppearanceOverrides = Partial<
  Record<RatingPreference, RatingProviderAppearanceOverride>
>;

export const QUALITY_BADGE_OPTIONS: Array<{ id: MediaFeatureBadgeKey; label: string }> = [
  { id: 'certification', label: 'Age Rating' },
  { id: 'netflix', label: 'Netflix' },
  { id: 'hbo', label: 'HBO' },
  { id: 'primevideo', label: 'Prime Video' },
  { id: 'disneyplus', label: 'Disney Plus' },
  { id: 'appletvplus', label: 'Apple TV Plus' },
  { id: 'hulu', label: 'Hulu' },
  { id: 'paramountplus', label: 'Paramount Plus' },
  { id: 'peacock', label: 'Peacock' },
  { id: '4k', label: '4K' },
  { id: 'bluray', label: 'Bluray' },
  { id: 'hdr', label: 'HDR' },
  { id: 'dolbyvision', label: 'Dolby Vision' },
  { id: 'dolbyatmos', label: 'Dolby Atmos' },
  { id: 'remux', label: 'Remux' },
];

export const DEFAULT_QUALITY_BADGE_PREFERENCES: MediaFeatureBadgeKey[] = [
  'certification',
  '4k',
  'bluray',
  'hdr',
  'dolbyvision',
  'dolbyatmos',
  'remux',
];

const QUALITY_BADGE_ALIAS_MAP: Record<string, MediaFeatureBadgeKey> = {
  certification: 'certification',
  age: 'certification',
  agerating: 'certification',
  cert: 'certification',
  netflix: 'netflix',
  hbo: 'hbo',
  hbomax: 'hbo',
  max: 'hbo',
  primevideo: 'primevideo',
  amazonprime: 'primevideo',
  prime: 'primevideo',
  disneyplus: 'disneyplus',
  disneyp: 'disneyplus',
  appletvplus: 'appletvplus',
  appletv: 'appletvplus',
  hulu: 'hulu',
  paramountplus: 'paramountplus',
  paramount: 'paramountplus',
  peacock: 'peacock',
  '4k': '4k',
  uhd: '4k',
  ultrahd: '4k',
  bluray: 'bluray',
  bluraydisc: 'bluray',
  blueray: 'bluray',
  hdr: 'hdr',
  hdr10: 'hdr',
  dolbyvision: 'dolbyvision',
  dovi: 'dolbyvision',
  dv: 'dolbyvision',
  dolbyatmos: 'dolbyatmos',
  atmos: 'dolbyatmos',
  remux: 'remux',
};

const toBase64Url = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  if (typeof window === 'undefined' && typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64url');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (value: string) => {
  if (typeof window === 'undefined' && typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64url').toString('utf8');
  }

  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const compactObject = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));

export const normalizeBadgeScalePercent = (
  value: unknown,
  fallback = DEFAULT_BADGE_SCALE_PERCENT,
) => {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(
    MIN_BADGE_SCALE_PERCENT,
    Math.min(MAX_BADGE_SCALE_PERCENT, Math.round(numericValue)),
  );
};

export const normalizeGenreBadgeScalePercent = (
  value: unknown,
  fallback = DEFAULT_BADGE_SCALE_PERCENT,
) => {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(
    MIN_BADGE_SCALE_PERCENT,
    Math.min(MAX_GENRE_BADGE_SCALE_PERCENT, Math.round(numericValue)),
  );
};

export const normalizeProviderIconScalePercent = (
  value: unknown,
  fallback = DEFAULT_PROVIDER_ICON_SCALE_PERCENT,
) => {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(
    MIN_PROVIDER_ICON_SCALE_PERCENT,
    Math.min(MAX_PROVIDER_ICON_SCALE_PERCENT, Math.round(numericValue)),
  );
};

const normalizeBoundedPercent = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) => {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numericValue)));
};

export const normalizeStackedLineWidthPercent = (
  value: unknown,
  fallback = DEFAULT_STACKED_LINE_WIDTH_PERCENT,
) =>
  normalizeBoundedPercent(
    value,
    fallback,
    MIN_STACKED_LINE_WIDTH_PERCENT,
    MAX_STACKED_LINE_WIDTH_PERCENT,
  );

export const normalizeStackedLineHeightPercent = (
  value: unknown,
  fallback = DEFAULT_STACKED_LINE_HEIGHT_PERCENT,
) =>
  normalizeBoundedPercent(
    value,
    fallback,
    MIN_STACKED_LINE_HEIGHT_PERCENT,
    MAX_STACKED_LINE_HEIGHT_PERCENT,
  );

export const normalizeStackedLineGapPercent = (
  value: unknown,
  fallback = DEFAULT_STACKED_LINE_GAP_PERCENT,
) =>
  normalizeBoundedPercent(
    value,
    fallback,
    MIN_STACKED_LINE_GAP_PERCENT,
    MAX_STACKED_LINE_GAP_PERCENT,
  );

export const normalizeStackedWidthPercent = (
  value: unknown,
  fallback = DEFAULT_STACKED_WIDTH_PERCENT,
) =>
  normalizeBoundedPercent(
    value,
    fallback,
    MIN_STACKED_WIDTH_PERCENT,
    MAX_STACKED_WIDTH_PERCENT,
  );

export const normalizeStackedSurfaceOpacityPercent = (
  value: unknown,
  fallback = DEFAULT_STACKED_SURFACE_OPACITY_PERCENT,
) =>
  normalizeBoundedPercent(
    value,
    fallback,
    MIN_STACKED_SURFACE_OPACITY_PERCENT,
    MAX_STACKED_SURFACE_OPACITY_PERCENT,
  );

export const normalizeStackedElementOffsetPx = (
  value: unknown,
  fallback = DEFAULT_STACKED_ELEMENT_OFFSET_PX,
) =>
  normalizeBoundedPercent(
    value,
    fallback,
    MIN_STACKED_ELEMENT_OFFSET_PX,
    MAX_STACKED_ELEMENT_OFFSET_PX,
  );

export const normalizeStackedAccentMode = (
  value: unknown,
  fallback: StackedAccentMode = DEFAULT_STACKED_ACCENT_MODE,
): StackedAccentMode => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s._-]+/g, '') : '';
  if (!normalized) return fallback;
  if (['badge', 'block', 'surface', 'full'].includes(normalized)) {
    return 'badge';
  }
  if (['logo', 'icon', 'logoonly', 'icononly'].includes(normalized)) {
    return 'logo';
  }
  return fallback;
};

export const normalizeHexColor = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(normalized)) {
    return `#${normalized
      .split('')
      .map((char) => `${char}${char}`)
      .join('')
      .toLowerCase()}`;
  }
  if (/^[0-9a-f]{6}$/i.test(normalized)) {
    return `#${normalized.toLowerCase()}`;
  }
  return undefined;
};

export const normalizeQualityBadgePreference = (value: unknown): MediaFeatureBadgeKey | null => {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s._-]+/g, '') : '';
  if (!normalized) return null;
  return QUALITY_BADGE_ALIAS_MAP[normalized] || null;
};

export const parseQualityBadgePreferencesAllowEmpty = (raw?: string | null) => {
  if (raw === null || raw === undefined) {
    return [...DEFAULT_QUALITY_BADGE_PREFERENCES];
  }

  const parsed = raw
    .split(',')
    .map((item) => normalizeQualityBadgePreference(item))
    .filter((item): item is MediaFeatureBadgeKey => item !== null);

  return [...new Set(parsed)];
};

export const stringifyQualityBadgePreferencesAllowEmpty = (preferences: MediaFeatureBadgeKey[]) =>
  [
    ...new Set(
      preferences
        .map((preference) => normalizeQualityBadgePreference(preference))
        .filter((preference): preference is MediaFeatureBadgeKey => preference !== null),
    ),
  ].join(',');

export const normalizeQualityBadgePreferencesList = (
  value: unknown,
  fallback: MediaFeatureBadgeKey[] = DEFAULT_QUALITY_BADGE_PREFERENCES,
) => {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const normalized = value
    .map((entry) => normalizeQualityBadgePreference(entry))
    .filter((entry): entry is MediaFeatureBadgeKey => entry !== null);

  return [...new Set(normalized)];
};

export const normalizeRatingProviderAppearanceOverrides = (
  value: unknown,
): RatingProviderAppearanceOverrides => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const normalizedEntries = Object.entries(value).flatMap(([rawProvider, rawOverride]) => {
    const provider = normalizeRatingPreference(rawProvider);
    if (!provider || !rawOverride || typeof rawOverride !== 'object' || Array.isArray(rawOverride)) {
      return [];
    }

    const candidate = rawOverride as {
      iconUrl?: unknown;
      accentColor?: unknown;
      iconScalePercent?: unknown;
      iconScale?: unknown;
      stackedLineVisible?: unknown;
      showStackedLine?: unknown;
      stackedRailVisible?: unknown;
      stackedRailEnabled?: unknown;
      stackedLineWidthPercent?: unknown;
      stackedLineWidth?: unknown;
      stackedRailWidthPercent?: unknown;
      stackedLineHeightPercent?: unknown;
      stackedLineHeight?: unknown;
      stackedRailHeightPercent?: unknown;
      stackedLineGapPercent?: unknown;
      stackedLineGap?: unknown;
      stackedRailGapPercent?: unknown;
      stackedWidthPercent?: unknown;
      stackedWidth?: unknown;
      stackedSurfaceOpacityPercent?: unknown;
      stackedSurfaceOpacity?: unknown;
      stackedBodyOpacityPercent?: unknown;
      stackedOpacity?: unknown;
      stackedAccentMode?: unknown;
      stackedAccentPlacement?: unknown;
      stackedAccentTarget?: unknown;
      stackedLogoAccentOnly?: unknown;
      logoOnlyAccent?: unknown;
      stackedLineOffsetX?: unknown;
      stackedLineX?: unknown;
      stackedRailOffsetX?: unknown;
      stackedRailXOffset?: unknown;
      stackedLineOffsetY?: unknown;
      stackedLineY?: unknown;
      stackedRailOffsetY?: unknown;
      stackedRailYOffset?: unknown;
      stackedIconOffsetX?: unknown;
      stackedIconX?: unknown;
      stackedLogoOffsetX?: unknown;
      stackedLogoXOffset?: unknown;
      stackedIconOffsetY?: unknown;
      stackedIconY?: unknown;
      stackedLogoOffsetY?: unknown;
      stackedLogoYOffset?: unknown;
      stackedValueOffsetX?: unknown;
      stackedValueX?: unknown;
      stackedRatingOffsetX?: unknown;
      stackedRatingXOffset?: unknown;
      stackedValueOffsetY?: unknown;
      stackedValueY?: unknown;
      stackedRatingOffsetY?: unknown;
      stackedRatingYOffset?: unknown;
    };
    const iconUrl =
      typeof candidate.iconUrl === 'string' && candidate.iconUrl.trim()
        ? candidate.iconUrl.trim()
        : undefined;
    const accentColor = normalizeHexColor(candidate.accentColor);
    const iconScalePercent = normalizeProviderIconScalePercent(
      candidate.iconScalePercent ?? candidate.iconScale,
      DEFAULT_PROVIDER_ICON_SCALE_PERCENT,
    );
    const stackedLineVisible =
      typeof candidate.stackedLineVisible === 'boolean'
        ? candidate.stackedLineVisible
        : typeof candidate.showStackedLine === 'boolean'
          ? candidate.showStackedLine
          : typeof candidate.stackedRailVisible === 'boolean'
            ? candidate.stackedRailVisible
            : typeof candidate.stackedRailEnabled === 'boolean'
              ? candidate.stackedRailEnabled
              : undefined;
    const stackedLineWidthPercent = normalizeStackedLineWidthPercent(
      candidate.stackedLineWidthPercent ??
        candidate.stackedLineWidth ??
        candidate.stackedRailWidthPercent,
      DEFAULT_STACKED_LINE_WIDTH_PERCENT,
    );
    const stackedLineHeightPercent = normalizeStackedLineHeightPercent(
      candidate.stackedLineHeightPercent ??
        candidate.stackedLineHeight ??
        candidate.stackedRailHeightPercent,
      DEFAULT_STACKED_LINE_HEIGHT_PERCENT,
    );
    const stackedLineGapPercent = normalizeStackedLineGapPercent(
      candidate.stackedLineGapPercent ??
        candidate.stackedLineGap ??
        candidate.stackedRailGapPercent,
      DEFAULT_STACKED_LINE_GAP_PERCENT,
    );
    const stackedWidthPercent = normalizeStackedWidthPercent(
      candidate.stackedWidthPercent ?? candidate.stackedWidth,
      DEFAULT_STACKED_WIDTH_PERCENT,
    );
    const stackedSurfaceOpacityPercent = normalizeStackedSurfaceOpacityPercent(
      candidate.stackedSurfaceOpacityPercent ??
        candidate.stackedSurfaceOpacity ??
        candidate.stackedBodyOpacityPercent ??
        candidate.stackedOpacity,
      DEFAULT_STACKED_SURFACE_OPACITY_PERCENT,
    );
    const stackedAccentMode = (() => {
      const explicitMode =
        candidate.stackedAccentMode ??
        candidate.stackedAccentPlacement ??
        candidate.stackedAccentTarget;
      if (explicitMode !== undefined) {
        return normalizeStackedAccentMode(explicitMode, DEFAULT_STACKED_ACCENT_MODE);
      }
      if (
        candidate.stackedLogoAccentOnly === true ||
        candidate.logoOnlyAccent === true
      ) {
        return 'logo';
      }
      return DEFAULT_STACKED_ACCENT_MODE;
    })();
    const stackedLineOffsetX = normalizeStackedElementOffsetPx(
      candidate.stackedLineOffsetX ??
        candidate.stackedLineX ??
        candidate.stackedRailOffsetX ??
        candidate.stackedRailXOffset,
      DEFAULT_STACKED_ELEMENT_OFFSET_PX,
    );
    const stackedLineOffsetY = normalizeStackedElementOffsetPx(
      candidate.stackedLineOffsetY ??
        candidate.stackedLineY ??
        candidate.stackedRailOffsetY ??
        candidate.stackedRailYOffset,
      DEFAULT_STACKED_ELEMENT_OFFSET_PX,
    );
    const stackedIconOffsetX = normalizeStackedElementOffsetPx(
      candidate.stackedIconOffsetX ??
        candidate.stackedIconX ??
        candidate.stackedLogoOffsetX ??
        candidate.stackedLogoXOffset,
      DEFAULT_STACKED_ELEMENT_OFFSET_PX,
    );
    const stackedIconOffsetY = normalizeStackedElementOffsetPx(
      candidate.stackedIconOffsetY ??
        candidate.stackedIconY ??
        candidate.stackedLogoOffsetY ??
        candidate.stackedLogoYOffset,
      DEFAULT_STACKED_ELEMENT_OFFSET_PX,
    );
    const stackedValueOffsetX = normalizeStackedElementOffsetPx(
      candidate.stackedValueOffsetX ??
        candidate.stackedValueX ??
        candidate.stackedRatingOffsetX ??
        candidate.stackedRatingXOffset,
      DEFAULT_STACKED_ELEMENT_OFFSET_PX,
    );
    const stackedValueOffsetY = normalizeStackedElementOffsetPx(
      candidate.stackedValueOffsetY ??
        candidate.stackedValueY ??
        candidate.stackedRatingOffsetY ??
        candidate.stackedRatingYOffset,
      DEFAULT_STACKED_ELEMENT_OFFSET_PX,
    );
    const override = compactObject({
      iconUrl,
      accentColor,
      iconScalePercent:
        iconScalePercent !== DEFAULT_PROVIDER_ICON_SCALE_PERCENT ? iconScalePercent : undefined,
      stackedLineVisible:
        typeof stackedLineVisible === 'boolean' && stackedLineVisible === false
          ? false
          : undefined,
      stackedLineWidthPercent:
        stackedLineWidthPercent !== DEFAULT_STACKED_LINE_WIDTH_PERCENT
          ? stackedLineWidthPercent
          : undefined,
      stackedLineHeightPercent:
        stackedLineHeightPercent !== DEFAULT_STACKED_LINE_HEIGHT_PERCENT
          ? stackedLineHeightPercent
          : undefined,
      stackedLineGapPercent:
        stackedLineGapPercent !== DEFAULT_STACKED_LINE_GAP_PERCENT
          ? stackedLineGapPercent
          : undefined,
      stackedWidthPercent:
        stackedWidthPercent !== DEFAULT_STACKED_WIDTH_PERCENT ? stackedWidthPercent : undefined,
      stackedSurfaceOpacityPercent:
        stackedSurfaceOpacityPercent !== DEFAULT_STACKED_SURFACE_OPACITY_PERCENT
          ? stackedSurfaceOpacityPercent
          : undefined,
      stackedAccentMode:
        stackedAccentMode !== DEFAULT_STACKED_ACCENT_MODE ? stackedAccentMode : undefined,
      stackedLineOffsetX:
        stackedLineOffsetX !== DEFAULT_STACKED_ELEMENT_OFFSET_PX
          ? stackedLineOffsetX
          : undefined,
      stackedLineOffsetY:
        stackedLineOffsetY !== DEFAULT_STACKED_ELEMENT_OFFSET_PX
          ? stackedLineOffsetY
          : undefined,
      stackedIconOffsetX:
        stackedIconOffsetX !== DEFAULT_STACKED_ELEMENT_OFFSET_PX
          ? stackedIconOffsetX
          : undefined,
      stackedIconOffsetY:
        stackedIconOffsetY !== DEFAULT_STACKED_ELEMENT_OFFSET_PX
          ? stackedIconOffsetY
          : undefined,
      stackedValueOffsetX:
        stackedValueOffsetX !== DEFAULT_STACKED_ELEMENT_OFFSET_PX
          ? stackedValueOffsetX
          : undefined,
      stackedValueOffsetY:
        stackedValueOffsetY !== DEFAULT_STACKED_ELEMENT_OFFSET_PX
          ? stackedValueOffsetY
          : undefined,
    }) as RatingProviderAppearanceOverride;

    return Object.keys(override).length > 0 ? [[provider, override] as const] : [];
  });

  return Object.fromEntries(normalizedEntries);
};

export const serializeRatingProviderAppearanceOverrides = (
  overrides: RatingProviderAppearanceOverrides,
) => {
  const normalized = normalizeRatingProviderAppearanceOverrides(overrides);
  const entries = ALL_RATING_PREFERENCES.flatMap((provider) => {
    const override = normalized[provider];
    return override ? [[provider, override] as const] : [];
  });
  return entries.length > 0 ? JSON.stringify(Object.fromEntries(entries)) : '';
};

export const parseRatingProviderAppearanceOverrides = (
  raw?: string | null,
): RatingProviderAppearanceOverrides => {
  const normalized = String(raw || '').trim();
  if (!normalized) return {};

  const candidates = [normalized];
  if (!normalized.startsWith('{')) {
    try {
      candidates.push(fromBase64Url(normalized));
    } catch {
    }
  }

  for (const candidate of candidates) {
    try {
      return normalizeRatingProviderAppearanceOverrides(JSON.parse(candidate));
    } catch {
    }
  }

  return {};
};

export const encodeRatingProviderAppearanceOverrides = (
  overrides: RatingProviderAppearanceOverrides,
) => {
  const serialized = serializeRatingProviderAppearanceOverrides(overrides);
  return serialized ? toBase64Url(serialized) : '';
};
