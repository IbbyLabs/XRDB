import type { SupportedLanguageOption } from './configuratorPageOptions.ts';

type TmdbLanguageRecord = {
  english_name?: string | null;
  iso_639_1?: string | null;
  name?: string | null;
};

const LANGUAGE_FLAG = '🌐';

const normalizeLocaleCode = (value?: string | null) => {
  const trimmed = String(value || '').trim().replace(/_/g, '-');
  if (!trimmed) return null;
  const [base, ...rest] = trimmed.split('-').filter(Boolean);
  if (!base) return null;
  const normalizedBase = base.toLowerCase();
  if (rest.length === 0) {
    return normalizedBase;
  }
  const normalizedRest = rest.map((segment) => {
    if (/^\d+$/.test(segment)) return segment;
    if (segment.length === 2) return segment.toUpperCase();
    return segment.toLowerCase();
  });
  return [normalizedBase, ...normalizedRest].join('-');
};

const getLocaleBase = (value?: string | null) => normalizeLocaleCode(value)?.split('-')[0] || null;

const getLocaleRegion = (value?: string | null) => {
  const normalized = normalizeLocaleCode(value);
  if (!normalized) return null;
  return normalized.split('-').slice(1).find((segment) => /^[A-Z]{2}$/.test(segment) || /^\d{3}$/.test(segment)) || null;
};

const toLanguageLabel = (value?: string | null) => {
  const trimmed = String(value || '').trim();
  return trimmed || null;
};

const toTitleCaseLabel = (value: string, locale?: string | null) => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const [first, ...rest] = [...trimmed];
  return `${first.toLocaleUpperCase(locale || undefined)}${rest.join('')}`;
};

const getRegionLabel = (regionCode: string, localeCandidates: Array<string | null>) => {
  const locales = [...new Set(localeCandidates.filter((entry): entry is string => Boolean(entry)))];
  for (const locale of locales) {
    try {
      const names = new Intl.DisplayNames([locale], { type: 'region' });
      const label = names.of(regionCode);
      if (label && label !== regionCode) {
        return label;
      }
    } catch {}
  }
  return null;
};

export const buildTmdbSupportedLanguageOptions = ({
  languages,
  primaryTranslations = [],
}: {
  languages: TmdbLanguageRecord[];
  primaryTranslations?: string[];
}): SupportedLanguageOption[] => {
  const baseLabels = new Map<string, string>();

  for (const entry of languages) {
    const base = getLocaleBase(entry.iso_639_1);
    if (!base) continue;
    const preferredLabel =
      toLanguageLabel(entry.name) ||
      toLanguageLabel(entry.english_name) ||
      base;
    baseLabels.set(base, preferredLabel);
  }

  const normalizedCodes = [
    ...languages.map((entry) => entry.iso_639_1 || ''),
    ...primaryTranslations,
  ]
    .map((entry) => normalizeLocaleCode(entry))
    .filter((entry): entry is string => Boolean(entry));

  const basesWithVariants = new Set(
    normalizedCodes
      .filter((code) => code.includes('-'))
      .map((code) => getLocaleBase(code))
      .filter((code): code is string => Boolean(code)),
  );

  const options = new Map<string, SupportedLanguageOption>();

  for (const code of normalizedCodes) {
    const base = getLocaleBase(code);
    if (!base) continue;
    if (!code.includes('-') && basesWithVariants.has(base)) {
      continue;
    }

    const region = getLocaleRegion(code);
    const baseLabel = toTitleCaseLabel(baseLabels.get(base) || code, base);
    const regionLabel = region ? getRegionLabel(region, [code, base, 'en']) : null;

    options.set(code, {
      code,
      flag: LANGUAGE_FLAG,
      label: regionLabel ? `${baseLabel} (${regionLabel})` : baseLabel,
    });
  }

  return [...options.values()].sort(
    (left, right) =>
      left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }) ||
      left.code.localeCompare(right.code, undefined, { sensitivity: 'base' }),
  );
};
