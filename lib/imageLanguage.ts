export const ORIGINAL_IMAGE_LANGUAGE = 'original';

export const isOriginalImageLanguageSelection = (value?: string | null) =>
  String(value || '').trim().toLowerCase() === ORIGINAL_IMAGE_LANGUAGE;

export const normalizeRequestedImageLanguage = (value?: string | null) => {
  const trimmed = String(value || '').trim().replace(/_/g, '-');
  if (!trimmed) return null;

  const [base, ...rest] = trimmed.split('-').filter(Boolean);
  if (!base) return null;

  const normalizedBase = base.toLowerCase();
  if (normalizedBase === 'us') return 'en';
  if (rest.length === 0) return normalizedBase;

  const normalizedRest = rest.map((segment) => {
    if (/^\d+$/.test(segment)) return segment;
    if (segment.length === 2) return segment.toUpperCase();
    return segment.toLowerCase();
  });

  return [normalizedBase, ...normalizedRest].join('-');
};

export const normalizeImageLanguage = (value?: string | null) => {
  const normalized = normalizeRequestedImageLanguage(value);
  if (!normalized) return null;
  if (normalized === 'en-US') return 'en';
  if (normalized.includes('-')) return normalized.split('-')[0];
  return normalized;
};

export const normalizeImageRegion = (value?: string | null) => {
  const trimmed = String(value || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(trimmed) || /^\d{3}$/.test(trimmed)) return trimmed;
  return null;
};

type RequestedLocale = { lang: string; region: string | null };

const parseRequestedLocale = (value?: string | null): RequestedLocale | null => {
  const normalized = normalizeRequestedImageLanguage(value);
  if (!normalized) return null;
  const [base, ...rest] = normalized.split('-');
  const lang = normalizeImageLanguage(base);
  if (!lang) return null;
  const region = rest.map((segment) => normalizeImageRegion(segment)).find(Boolean) || null;
  return { lang, region };
};

// TMDB tags images with iso_639_1 (language) and iso_3166_1 (region). A region-qualified
// request (e.g. fr-FR) should prefer the matching region over another same-language variant
// (fr-CA) that happens to appear earlier in the list, while still accepting any same-language
// asset before falling back to another language.
const localeMatchTier = <T extends { iso_639_1?: string | null; iso_3166_1?: string | null }>(
  requested: RequestedLocale,
  item: T,
) => {
  const lang = normalizeImageLanguage(item?.iso_639_1);
  if (!lang || lang !== requested.lang) return -1;
  const region = normalizeImageRegion(item?.iso_3166_1);
  if (!requested.region) return 2;
  if (region === requested.region) return 3;
  if (!region) return 1;
  return 0;
};

const pickBestByLocale = <T extends { iso_639_1?: string | null; iso_3166_1?: string | null }>(
  items: T[],
  requestedLang: string,
) => {
  const requested = parseRequestedLocale(requestedLang);
  if (!requested) return null;

  let best: T | null = null;
  let bestTier = -1;
  for (const item of items) {
    const tier = localeMatchTier(requested, item);
    if (tier > bestTier) {
      bestTier = tier;
      best = item;
    }
  }

  return bestTier >= 0 ? best : null;
};

export const buildIncludeImageLanguage = (preferredLang: string, fallbackLang: string) => {
  const languages = [normalizeImageLanguage(preferredLang), normalizeImageLanguage(fallbackLang), 'null']
    .filter(Boolean) as string[];
  return [...new Set(languages)].join(',');
};

export const pickByLanguageWithFallback = <T extends { iso_639_1?: string | null; iso_3166_1?: string | null }>(
  items: T[] = [],
  preferredLang: string,
  fallbackLang: string
) => {
  if (!Array.isArray(items) || items.length === 0) return null;

  const preferredItem = pickBestByLocale(items, preferredLang);
  if (preferredItem) return preferredItem;

  const fallbackItem = pickBestByLocale(items, fallbackLang);
  if (fallbackItem) return fallbackItem;

  const neutralItem = items.find((item) => normalizeImageLanguage(item?.iso_639_1) === null);
  if (neutralItem) return neutralItem;

  return items[0];
};

export const pickByLanguageOrNeutral = <T extends { iso_639_1?: string | null; iso_3166_1?: string | null }>(
  items: T[] = [],
  preferredLang: string,
  fallbackLang: string
) => {
  if (!Array.isArray(items) || items.length === 0) return null;

  const preferredItem = pickBestByLocale(items, preferredLang);
  if (preferredItem) return preferredItem;

  const fallbackItem = pickBestByLocale(items, fallbackLang);
  if (fallbackItem) return fallbackItem;

  return items.find((item) => normalizeImageLanguage(item?.iso_639_1) === null) || null;
};

export const filterByLanguageWithFallback = <T extends { iso_639_1?: string | null }>(
  items: T[] = [],
  preferredLang: string,
  fallbackLang: string
) => {
  if (!Array.isArray(items) || items.length === 0) return [];

  const preferred = normalizeImageLanguage(preferredLang);
  const fallback = normalizeImageLanguage(fallbackLang);

  const matchingItems = items.filter((item) => {
    const itemLang = normalizeImageLanguage(item?.iso_639_1);
    if (preferred && itemLang === preferred) return true;
    if (fallback && itemLang === fallback) return true;
    return itemLang === null;
  });

  return matchingItems.length > 0 ? matchingItems : items;
};
