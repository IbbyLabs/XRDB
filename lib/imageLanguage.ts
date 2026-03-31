export const normalizeImageLanguage = (value?: string | null) => {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === 'us' || normalized === 'en-us') return 'en';
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
