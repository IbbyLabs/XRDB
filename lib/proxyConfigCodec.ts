import {
  normalizeMetadataTranslationMode,
  type MetadataTranslationMode,
} from './metadataTranslation.ts';
import {
  normalizeEpisodeIdMode,
  type EpisodeIdMode,
} from './episodeIdentity.ts';
import {
  PROXY_OPTIONAL_BOOLEAN_KEYS,
  PROXY_OPTIONAL_STRING_KEYS,
  type ProxyConfig,
} from './proxyConfigSchema.ts';

const LEGACY_QUERY_KEY_BY_FIELD = {
  posterArtworkSource: 'posterCleanSource',
  backdropArtworkSource: 'backdropCleanSource',
  logoArtworkSource: 'logoSource',
} as const satisfies Partial<Record<keyof ProxyConfig, string>>;

const readOptionalText = (value: unknown) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const readOptionalTextAllowEmpty = (value: unknown) => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return undefined;
};

const readOptionalBoolean = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
};

const decodeBase64Url = (encoded: string) => {
  try {
    return Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4;
    const padded = padding ? normalized + '='.repeat(4 - padding) : normalized;
    return Buffer.from(padded, 'base64').toString('utf8');
  }
};

const assignNormalizedStringField = (
  config: ProxyConfig,
  key: (typeof PROXY_OPTIONAL_STRING_KEYS)[number],
  value: string,
) => {
  if (key === 'translateMetaMode') {
    config.translateMetaMode = normalizeMetadataTranslationMode(value);
    return;
  }
  if (key === 'episodeIdMode') {
    config.episodeIdMode = normalizeEpisodeIdMode(value);
    return;
  }
  config[key] = value;
};

export const decodeProxyConfig = (encoded: string): ProxyConfig | null => {
  try {
    const payload = JSON.parse(decodeBase64Url(encoded)) as Record<string, unknown>;
    const url = readOptionalText(payload.url);
    const tmdbKey = readOptionalText(payload.tmdbKey);
    const mdblistKey = readOptionalText(payload.mdblistKey);
    if (!url || !tmdbKey || !mdblistKey) return null;

    const config: ProxyConfig = { url, tmdbKey, mdblistKey };
    for (const key of PROXY_OPTIONAL_STRING_KEYS) {
      const value = readOptionalTextAllowEmpty(payload[key]);
      if (value !== undefined) {
        assignNormalizedStringField(config, key, value);
      }
    }
    for (const key of PROXY_OPTIONAL_BOOLEAN_KEYS) {
      const value = readOptionalBoolean(payload[key]);
      if (value !== undefined) {
        config[key] = value;
      }
    }
    return config;
  } catch {
    return null;
  }
};

export const getProxyConfigFromQuery = (searchParams: URLSearchParams): ProxyConfig | null => {
  const url = searchParams.get('url');
  const tmdbKey = searchParams.get('tmdbKey');
  const mdblistKey = searchParams.get('mdblistKey');
  if (!url || !tmdbKey || !mdblistKey) return null;

  const config: ProxyConfig = { url, tmdbKey, mdblistKey };
  const xrdbKey = searchParams.get('xrdbKey');
  if (xrdbKey) {
    config.xrdbKey = xrdbKey;
  }

  for (const key of PROXY_OPTIONAL_STRING_KEYS) {
    const value = searchParams.get(key);
    if (value !== null) {
      assignNormalizedStringField(config, key, value);
    }
  }
  for (const key of PROXY_OPTIONAL_BOOLEAN_KEYS) {
    const value = readOptionalBoolean(searchParams.get(key));
    if (value !== undefined) {
      config[key] = value;
    }
  }

  return config;
};

const readLegacyParam = (
  reqUrl: URL,
  config: ProxyConfig | null,
  key: keyof typeof LEGACY_QUERY_KEY_BY_FIELD,
) => {
  const legacyKey = LEGACY_QUERY_KEY_BY_FIELD[key];
  if (!legacyKey) return null;

  const configValue = config?.[legacyKey];
  if (typeof configValue === 'string') {
    return configValue;
  }

  const queryValue = reqUrl.searchParams.get(legacyKey);
  return queryValue !== null ? queryValue : null;
};

export const getProxyParamValue = (
  reqUrl: URL,
  config: ProxyConfig | null,
  key: keyof ProxyConfig,
) => {
  const configValue = config?.[key];
  if (typeof configValue === 'string') {
    return configValue;
  }

  if (
    key === 'posterArtworkSource' ||
    key === 'backdropArtworkSource' ||
    key === 'logoArtworkSource'
  ) {
    const legacyValue = readLegacyParam(reqUrl, config, key);
    if (legacyValue !== null) {
      return legacyValue;
    }
  }

  const queryValue = reqUrl.searchParams.get(key);
  return queryValue !== null ? queryValue : null;
};

export {
  normalizeMetadataTranslationMode,
  normalizeEpisodeIdMode,
  type MetadataTranslationMode,
  type EpisodeIdMode,
};
