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

export const buildIncludeImageLanguage = (preferredLang: string, fallbackLang: string) => {
  const languages = [normalizeImageLanguage(preferredLang), normalizeImageLanguage(fallbackLang), 'null']
    .filter(Boolean) as string[];
  return [...new Set(languages)].join(',');
};

export const pickByLanguageWithFallback = <T extends { iso_639_1?: string | null }>(
  items: T[] = [],
  preferredLang: string,
  fallbackLang: string
) => {
  if (!Array.isArray(items) || items.length === 0) return null;

  const preferred = normalizeImageLanguage(preferredLang);
  const fallback = normalizeImageLanguage(fallbackLang);

  if (preferred) {
    const preferredItem = items.find((item) => normalizeImageLanguage(item?.iso_639_1) === preferred);
    if (preferredItem) return preferredItem;
  }

  if (fallback) {
    const fallbackItem = items.find((item) => normalizeImageLanguage(item?.iso_639_1) === fallback);
    if (fallbackItem) return fallbackItem;
  }

  const neutralItem = items.find((item) => normalizeImageLanguage(item?.iso_639_1) === null);
  if (neutralItem) return neutralItem;

  return items[0];
};

export const pickByLanguageOrNeutral = <T extends { iso_639_1?: string | null }>(
  items: T[] = [],
  preferredLang: string,
  fallbackLang: string
) => {
  if (!Array.isArray(items) || items.length === 0) return null;

  const preferred = normalizeImageLanguage(preferredLang);
  const fallback = normalizeImageLanguage(fallbackLang);

  if (preferred) {
    const preferredItem = items.find((item) => normalizeImageLanguage(item?.iso_639_1) === preferred);
    if (preferredItem) return preferredItem;
  }

  if (fallback) {
    const fallbackItem = items.find((item) => normalizeImageLanguage(item?.iso_639_1) === fallback);
    if (fallbackItem) return fallbackItem;
  }

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
