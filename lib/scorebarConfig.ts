const SCOREBAR_STYLE_OPTIONS_LIST = [
  { id: 'solid', label: 'Solid' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'progress', label: 'Progress' },
] as const;

export type ScorebarStyle = (typeof SCOREBAR_STYLE_OPTIONS_LIST)[number]['id'];
export const SCOREBAR_STYLE_OPTIONS = SCOREBAR_STYLE_OPTIONS_LIST;

export const DEFAULT_SCOREBAR_STYLE: ScorebarStyle = 'progress';
export const DEFAULT_SCOREBAR_LOW_COLOR = '#e05252';
export const DEFAULT_SCOREBAR_MID_COLOR = '#e0a452';
export const DEFAULT_SCOREBAR_HIGH_COLOR = '#52c97f';
export const DEFAULT_SCOREBAR_LOW_THRESHOLD = 50;
export const DEFAULT_SCOREBAR_HIGH_THRESHOLD = 75;

const SCOREBAR_STYLE_LOOKUP = new Set(SCOREBAR_STYLE_OPTIONS_LIST.map((o) => o.id));

export const normalizeScorebarStyle = (
  value: unknown,
  fallback: ScorebarStyle = DEFAULT_SCOREBAR_STYLE,
): ScorebarStyle => {
  const token = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SCOREBAR_STYLE_LOOKUP.has(token as ScorebarStyle) ? (token as ScorebarStyle) : fallback;
};

const HEX_COLOR_RE = /^#?[0-9a-fA-F]{3,8}$/;

export const normalizeScorebarColor = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  const hex = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return HEX_COLOR_RE.test(trimmed) ? (hex.startsWith('#') ? hex : `#${hex}`) : fallback;
};

export const normalizeScorebarThreshold = (value: unknown, fallback: number): number => {
  const num = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (Number.isNaN(num) || !Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
};

export type ScorebarConfig = {
  style: ScorebarStyle;
  lowColor: string;
  midColor: string;
  highColor: string;
  lowThreshold: number;
  highThreshold: number;
};

export const DEFAULT_SCOREBAR_CONFIG: ScorebarConfig = {
  style: DEFAULT_SCOREBAR_STYLE,
  lowColor: DEFAULT_SCOREBAR_LOW_COLOR,
  midColor: DEFAULT_SCOREBAR_MID_COLOR,
  highColor: DEFAULT_SCOREBAR_HIGH_COLOR,
  lowThreshold: DEFAULT_SCOREBAR_LOW_THRESHOLD,
  highThreshold: DEFAULT_SCOREBAR_HIGH_THRESHOLD,
};

export const getScorebarThresholdColor = (
  normalizedScore: number | null,
  config: ScorebarConfig,
): string => {
  if (normalizedScore === null) return config.midColor;
  if (normalizedScore < config.lowThreshold) return config.lowColor;
  if (normalizedScore >= config.highThreshold) return config.highColor;
  return config.midColor;
};

export const parseScorebarProgressPercent = (value: string): number | null => {
  const isPercent = value.includes('%');
  const numeric = Number(value.replace('%', '').replace(',', '.').trim());
  if (Number.isNaN(numeric) || !Number.isFinite(numeric) || numeric < 0) return null;
  if (isPercent) return Math.min(100, numeric);
  if (numeric <= 10) return Math.min(100, numeric * 10);
  return Math.min(100, numeric);
};
