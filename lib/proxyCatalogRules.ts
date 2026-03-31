export type ProxyCatalogRule = {
  key: string;
  title?: string;
  hidden?: boolean;
  searchEnabled?: boolean;
  discoverOnly?: boolean;
};

export type ProxyCatalogDescriptor = {
  key: string;
  type: string;
  id: string;
  name: string;
  searchSupported: boolean;
  searchRequired: boolean;
};

type CatalogExtraEntry = {
  isRequired: boolean;
  name: string;
  options: string[];
};

const SEARCH_ENTRY_NAME = 'search';

const toTrimmedString = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const encodeBase64Url = (value: string) => {
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

const decodeBase64Url = (value: string) => {
  if (typeof window === 'undefined' && typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64url').toString('utf8');
  }
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding ? normalized + '='.repeat(4 - padding) : normalized;
  return new TextDecoder().decode(
    Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)),
  );
};

const readCatalogExtraEntries = (catalog: Record<string, unknown>): CatalogExtraEntry[] => {
  const modernEntries = Array.isArray(catalog.extra) ? catalog.extra : [];
  const legacySupported = Array.isArray(catalog.extraSupported) ? catalog.extraSupported : [];
  const legacyRequired = new Set(
    (Array.isArray(catalog.extraRequired) ? catalog.extraRequired : [])
      .map((entry) => toTrimmedString(entry).toLowerCase())
      .filter(Boolean),
  );

  const entries: CatalogExtraEntry[] = [];

  for (const entry of modernEntries) {
    if (typeof entry === 'string') {
      const name = entry.trim();
      if (name) {
        entries.push({ name, isRequired: false, options: [] });
      }
      continue;
    }

    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const typedEntry = entry as Record<string, unknown>;
    const name = toTrimmedString(typedEntry.name);
    if (!name) {
      continue;
    }

    entries.push({
      name,
      isRequired: typedEntry.isRequired === true,
      options: Array.isArray(typedEntry.options)
        ? typedEntry.options.map((option) => toTrimmedString(option)).filter(Boolean)
        : [],
    });
  }

  for (const entry of legacySupported) {
    const name = toTrimmedString(entry);
    if (!name) continue;
    entries.push({
      name,
      isRequired: legacyRequired.has(name.toLowerCase()),
      options: [],
    });
  }

  const merged = new Map<string, CatalogExtraEntry>();
  for (const entry of entries) {
    const normalizedName = entry.name.trim();
    if (!normalizedName) continue;
    const existing = merged.get(normalizedName.toLowerCase());
    if (existing) {
      existing.isRequired = existing.isRequired || entry.isRequired;
      existing.options = [...new Set([...existing.options, ...entry.options])];
      continue;
    }
    merged.set(normalizedName.toLowerCase(), {
      name: normalizedName,
      isRequired: entry.isRequired,
      options: [...new Set(entry.options)],
    });
  }

  return [...merged.values()];
};

const writeCatalogExtraEntries = (catalog: Record<string, unknown>, entries: CatalogExtraEntry[]) => {
  const nextCatalog: Record<string, unknown> = { ...catalog };
  nextCatalog.extra = entries.map((entry) => ({
    name: entry.name,
    isRequired: entry.isRequired,
    ...(entry.options.length > 0 ? { options: entry.options } : {}),
  }));
  delete nextCatalog.extraSupported;
  delete nextCatalog.extraRequired;
  return nextCatalog;
};

const buildDescriptorFromCatalog = (catalog: Record<string, unknown>): ProxyCatalogDescriptor | null => {
  const type = toTrimmedString(catalog.type);
  const id = toTrimmedString(catalog.id);
  if (!type || !id) return null;

  const searchEntry = readCatalogExtraEntries(catalog).find(
    (entry) => entry.name.trim().toLowerCase() === SEARCH_ENTRY_NAME,
  );

  return {
    key: `${type}:${id}`,
    type,
    id,
    name: toTrimmedString(catalog.name) || `${type}:${id}`,
    searchSupported: Boolean(searchEntry),
    searchRequired: searchEntry?.isRequired === true,
  };
};

const withoutSearchEntry = (catalog: Record<string, unknown>) =>
  writeCatalogExtraEntries(
    catalog,
    readCatalogExtraEntries(catalog).filter(
      (entry) => entry.name.trim().toLowerCase() !== SEARCH_ENTRY_NAME,
    ),
  );

export const normalizeProxyCatalogRules = (value: unknown): ProxyCatalogRule[] => {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const typedEntry = entry as Record<string, unknown>;
      const key = toTrimmedString(typedEntry.key);
      if (!key) return null;
      const title = toTrimmedString(typedEntry.title);
      const hidden = typedEntry.hidden === true;
      const searchEnabled =
        typeof typedEntry.searchEnabled === 'boolean' ? typedEntry.searchEnabled : undefined;
      const discoverOnly = typedEntry.discoverOnly === true;
      if (!title && !hidden && searchEnabled === undefined && !discoverOnly) {
        return null;
      }
      return {
        key,
        ...(title ? { title } : {}),
        ...(hidden ? { hidden: true } : {}),
        ...(searchEnabled !== undefined ? { searchEnabled } : {}),
        ...(discoverOnly ? { discoverOnly: true } : {}),
      };
    })
    .filter((entry): entry is ProxyCatalogRule => Boolean(entry));

  const deduped = new Map<string, ProxyCatalogRule>();
  for (const entry of normalized) {
    deduped.set(entry.key, entry);
  }
  return [...deduped.values()];
};

export const encodeProxyCatalogRules = (rules: ProxyCatalogRule[]) => {
  const normalized = normalizeProxyCatalogRules(rules);
  if (normalized.length === 0) return '';
  return encodeBase64Url(JSON.stringify(normalized));
};

export const decodeProxyCatalogRules = (encoded: string | null | undefined): ProxyCatalogRule[] => {
  const trimmed = String(encoded || '').trim();
  if (!trimmed) return [];
  try {
    return normalizeProxyCatalogRules(JSON.parse(decodeBase64Url(trimmed)));
  } catch {
    return [];
  }
};

export const readProxyCatalogDescriptors = (manifest: Record<string, unknown>): ProxyCatalogDescriptor[] => {
  const catalogs = Array.isArray(manifest.catalogs) ? manifest.catalogs : [];
  return catalogs
    .map((entry) =>
      entry && typeof entry === 'object'
        ? buildDescriptorFromCatalog(entry as Record<string, unknown>)
        : null,
    )
    .filter((entry): entry is ProxyCatalogDescriptor => Boolean(entry));
};

export const applyProxyCatalogRules = (
  manifest: Record<string, unknown>,
  rules: ProxyCatalogRule[],
) => {
  const normalizedRules = normalizeProxyCatalogRules(rules);
  if (normalizedRules.length === 0) {
    return manifest;
  }

  const ruleByKey = new Map(normalizedRules.map((entry) => [entry.key, entry]));
  const catalogs = Array.isArray(manifest.catalogs) ? manifest.catalogs : [];
  const nextCatalogs = catalogs
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      const catalog = entry as Record<string, unknown>;
      const descriptor = buildDescriptorFromCatalog(catalog);
      if (!descriptor) return entry;

      const rule = ruleByKey.get(descriptor.key);
      if (!rule) return entry;
      if (rule.hidden) return null;

      let nextCatalog: Record<string, unknown> = { ...catalog };
      if (rule.title) {
        nextCatalog.name = rule.title;
      }
      if (descriptor.searchSupported && (rule.discoverOnly || rule.searchEnabled === false)) {
        nextCatalog = withoutSearchEntry(nextCatalog);
      }
      return nextCatalog;
    })
    .filter((entry) => entry !== null);

  return {
    ...manifest,
    catalogs: nextCatalogs,
  };
};
