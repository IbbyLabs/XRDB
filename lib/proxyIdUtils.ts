import { createHash } from 'node:crypto';
import { XRDBID_PREFIX } from './episodeIdentity.ts';

const IMDB_ID_PATTERN = /^tt\d+$/i;
const CANONICAL_ID_PREFIXES = new Set([
  'tmdb',
  'kitsu',
  'anilist',
  'anidb',
  'tvdb',
  'myanimelist',
  'mal',
  XRDBID_PREFIX,
]);

const normalizeMediaKind = (value: string | undefined | null): 'movie' | 'tv' | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'movie' || normalized === 'film') return 'movie';
  if (normalized === 'series' || normalized === 'show' || normalized === 'tv') return 'tv';
  return null;
};

const normalizeTmdbId = (parts: string[], mediaType?: string | null) => {
  const explicitKind = normalizeMediaKind(parts[1]);
  if (explicitKind && parts.length >= 3 && parts[2]) {
    return `tmdb:${explicitKind}:${parts.slice(2).join(':')}`;
  }

  if (parts.length < 2 || !parts[1]) {
    return null;
  }

  const inferredKind = normalizeMediaKind(mediaType);
  if (inferredKind) {
    return `tmdb:${inferredKind}:${parts.slice(1).join(':')}`;
  }

  return `tmdb:${parts.slice(1).join(':')}`;
};

const normalizeKnownPrefixId = (prefix: string, parts: string[]) => {
  if (!CANONICAL_ID_PREFIXES.has(prefix) || parts.length < 2 || !parts[1]) {
    return null;
  }

  const tail = parts.slice(1).join(':');
  return prefix === 'mal' || prefix === 'myanimelist' ? `mal:${tail}` : `${prefix}:${tail}`;
};

export const buildProxyId = (manifestUrl: string, configSeed?: string) => {
  const hash = createHash('sha256').update(manifestUrl);
  if (configSeed) {
    hash.update('|');
    hash.update(configSeed);
  }
  return `xrdb.proxy.${hash.digest('hex').slice(0, 12)}`;
};

export const parseAddonBaseUrl = (manifestUrl: string) => {
  const url = new URL(manifestUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Unsupported manifest URL protocol.');
  }
  url.hash = '';
  url.search = '';
  if (url.pathname.endsWith('/manifest.json')) {
    url.pathname = url.pathname.slice(0, -'/manifest.json'.length);
  }
  url.pathname = url.pathname.replace(/\/$/, '');
  return url.toString();
};

export const normalizeXrdbId = (
  rawId: string | undefined | null,
  mediaType?: string | null,
): string | null => {
  if (!rawId) return null;
  const trimmed = rawId.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(':');
  const head = parts[0];
  if (IMDB_ID_PATTERN.test(head)) {
    return trimmed;
  }

  const prefix = head.toLowerCase();
  if (prefix === 'imdb' && parts.length >= 2 && IMDB_ID_PATTERN.test(parts[1])) {
    return parts.length === 2 ? parts[1] : `imdb:${parts.slice(1).join(':')}`;
  }

  if (prefix === 'tmdb') {
    return normalizeTmdbId(parts, mediaType);
  }

  return normalizeKnownPrefixId(prefix, parts);
};

export const hasExplicitTmdbMediaTypeInXrdbId = (
  rawId: string | undefined | null,
  mediaType?: string | null,
) => {
  const normalized = normalizeXrdbId(rawId, mediaType);
  if (!normalized) return false;
  const parts = normalized.split(':');
  return parts[0] === 'tmdb' && (parts[1] === 'movie' || parts[1] === 'tv') && parts.length >= 3;
};

export const isAmbiguousTmdbXrdbId = (
  rawId: string | undefined | null,
  mediaType?: string | null,
) => {
  const normalized = normalizeXrdbId(rawId, mediaType);
  if (!normalized) return false;
  return normalized.startsWith('tmdb:') && !hasExplicitTmdbMediaTypeInXrdbId(normalized);
};
