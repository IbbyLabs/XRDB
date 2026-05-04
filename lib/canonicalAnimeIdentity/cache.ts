import { getDb, ensureDbInitialized } from '../sqliteStore.ts';
import { deleteMetadata, getMetadata, setMetadata } from '../metadataStore.ts';
import type {
  CanonicalEpisodeCacheRecord,
  CanonicalEpisodeIdentity,
  CanonicalEpisodeProviderRef,
  CanonicalSeriesCacheRecord,
  CanonicalSeriesIdentity,
  CanonicalSeriesProviderLink,
} from './types.ts';

const CANONICAL_CACHE_SCHEMA_VERSION = 1;
const CANONICAL_CACHE_SCHEMA_VERSION_KEY = 'canonical_cache_schema_version';
const CANONICAL_CACHE_INVALID_BEFORE_KEY = 'canonical_cache_invalid_before';
const CANONICAL_NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;

const parseJson = <T>(value: string | null | undefined): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const requireCanonicalCacheId = (value: string | null | undefined, label: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return normalized;
};

const readConfigMetaNumber = (key: string) => {
  const row = getDb()
    .prepare('SELECT value FROM config_meta WHERE key = ?')
    .get(key) as { value?: string } | undefined;
  const parsed = Number(row?.value ?? NaN);
  return Number.isFinite(parsed) ? parsed : null;
};

const writeConfigMetaNumber = (key: string, value: number) => {
  getDb()
    .prepare(
      `INSERT INTO config_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, String(value));
};

const getCanonicalCacheState = () => {
  ensureDbInitialized();
  const storedVersion = readConfigMetaNumber(CANONICAL_CACHE_SCHEMA_VERSION_KEY);
  let invalidBefore = readConfigMetaNumber(CANONICAL_CACHE_INVALID_BEFORE_KEY) ?? 0;

  if (storedVersion !== CANONICAL_CACHE_SCHEMA_VERSION) {
    invalidBefore = Math.max(Date.now(), invalidBefore) + 1;
    const db = getDb();
    db.transaction(() => {
      writeConfigMetaNumber(CANONICAL_CACHE_SCHEMA_VERSION_KEY, CANONICAL_CACHE_SCHEMA_VERSION);
      writeConfigMetaNumber(CANONICAL_CACHE_INVALID_BEFORE_KEY, invalidBefore);
    })();
  }

  return {
    schemaVersion: CANONICAL_CACHE_SCHEMA_VERSION,
    invalidBefore,
  };
};

const buildCanonicalNegativeCacheNamespace = () => {
  const state = getCanonicalCacheState();
  return `v${state.schemaVersion}:b${state.invalidBefore}`;
};

const buildCanonicalNegativeSeriesCacheKey = (provider: string, externalId: string) =>
  `canonical:series:negative:${buildCanonicalNegativeCacheNamespace()}:${buildCanonicalSeriesLookupKey(provider, externalId)}`;

const buildCanonicalNegativeEpisodeCacheKey = (lookupKey: string) =>
  `canonical:episode:negative:${buildCanonicalNegativeCacheNamespace()}:${lookupKey}`;

export const bumpCanonicalCacheInvalidationBoundary = () => {
  ensureDbInitialized();
  const currentInvalidBefore = readConfigMetaNumber(CANONICAL_CACHE_INVALID_BEFORE_KEY) ?? 0;
  const invalidBefore = Math.max(Date.now(), currentInvalidBefore) + 1;
  const db = getDb();
  db.transaction(() => {
    writeConfigMetaNumber(CANONICAL_CACHE_SCHEMA_VERSION_KEY, CANONICAL_CACHE_SCHEMA_VERSION);
    writeConfigMetaNumber(CANONICAL_CACHE_INVALID_BEFORE_KEY, invalidBefore);
  })();
  return invalidBefore;
};

export const hasCanonicalNegativeSeriesMapping = (provider: string, externalId: string) =>
  getMetadata<boolean>(buildCanonicalNegativeSeriesCacheKey(provider, externalId)) === true;

export const setCanonicalNegativeSeriesMapping = (provider: string, externalId: string) => {
  setMetadata(
    buildCanonicalNegativeSeriesCacheKey(provider, externalId),
    true,
    CANONICAL_NEGATIVE_CACHE_TTL_MS,
  );
};

const clearCanonicalNegativeSeriesMapping = (provider: string, externalId: string) => {
  deleteMetadata(buildCanonicalNegativeSeriesCacheKey(provider, externalId));
};

export const hasCanonicalNegativeEpisodeMapping = (lookupKey: string) =>
  getMetadata<boolean>(buildCanonicalNegativeEpisodeCacheKey(lookupKey)) === true;

export const setCanonicalNegativeEpisodeMapping = (lookupKey: string) => {
  setMetadata(
    buildCanonicalNegativeEpisodeCacheKey(lookupKey),
    true,
    CANONICAL_NEGATIVE_CACHE_TTL_MS,
  );
};

const clearCanonicalNegativeEpisodeMapping = (lookupKey: string) => {
  deleteMetadata(buildCanonicalNegativeEpisodeCacheKey(lookupKey));
};

export const buildCanonicalSeriesLookupKey = (provider: string, externalId: string) =>
  `${provider.trim().toLowerCase()}:${externalId.trim()}`;

export const buildCanonicalEpisodeLookupKey = (
  provider: string,
  externalId: string,
  season?: string | null,
  episode?: string | null,
  absoluteEpisode?: string | null,
) =>
  [
    provider.trim().toLowerCase(),
    externalId.trim(),
    `s:${String(season || '-').trim() || '-'}`,
    `e:${String(episode || '-').trim() || '-'}`,
    `a:${String(absoluteEpisode || '-').trim() || '-'}`,
  ].join(':');

export const getCanonicalSeriesMapping = (provider: string, externalId: string): CanonicalSeriesCacheRecord | null => {
  ensureDbInitialized();
  const cacheState = getCanonicalCacheState();
  const row = getDb()
    .prepare(
      `SELECT m.payload, m.updated_at
       FROM canonical_series_provider_ids s
       JOIN canonical_series_mappings m ON m.canonical_series_id = s.canonical_series_id
       WHERE s.provider = ? AND s.external_id = ?`,
    )
    .get(provider.trim().toLowerCase(), externalId.trim()) as { payload?: string; updated_at?: number } | undefined;
  if (Number(row?.updated_at || 0) <= cacheState.invalidBefore) return null;
  const identity = parseJson<CanonicalSeriesIdentity>(row?.payload);
  if (!identity) return null;
  return {
    identity,
    updatedAt: Number(row?.updated_at || 0),
  };
};

const deleteOrphanedCanonicalSeriesMapping = (canonicalSeriesId: string) => {
  const normalizedCanonicalSeriesId = String(canonicalSeriesId || '').trim();
  if (!normalizedCanonicalSeriesId) return;

  const db = getDb();
  const remainingLinks = db
    .prepare(
      `SELECT 1
       FROM canonical_series_provider_ids
       WHERE canonical_series_id = ?
       LIMIT 1`,
    )
    .get(normalizedCanonicalSeriesId);
  if (remainingLinks) return;

  db.prepare(
    `DELETE FROM canonical_series_mappings
     WHERE canonical_series_id = ?`,
  ).run(normalizedCanonicalSeriesId);
};

export const setCanonicalSeriesMapping = (identity: CanonicalSeriesIdentity) => {
  ensureDbInitialized();
  const cacheState = getCanonicalCacheState();
  const now = Math.max(Date.now(), cacheState.invalidBefore + 1);
  const db = getDb();
  const canonicalSeriesId = requireCanonicalCacheId(
    identity.canonicalSeriesId,
    'canonicalSeriesId',
  );
  db.prepare(
    `INSERT INTO canonical_series_mappings (canonical_series_id, payload, confidence, source_updated_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(canonical_series_id) DO UPDATE SET
       payload = excluded.payload,
       confidence = excluded.confidence,
       source_updated_at = excluded.source_updated_at,
       updated_at = excluded.updated_at`,
  ).run(
    canonicalSeriesId,
    JSON.stringify(identity),
    identity.confidence,
    identity.sourceUpdatedAt,
    now,
  );

  const links: CanonicalSeriesProviderLink[] = identity.links.length > 0
    ? identity.links
    : [{
        provider: identity.provider,
        externalId: identity.externalId,
        isPrimary: true,
        source: identity.source,
        confidence: identity.confidence,
      }];

  const upsertLink = db.prepare(
    `INSERT INTO canonical_series_provider_ids (provider, external_id, canonical_series_id, is_primary, source, confidence, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, external_id) DO UPDATE SET
       canonical_series_id = excluded.canonical_series_id,
       is_primary = excluded.is_primary,
       source = excluded.source,
       confidence = excluded.confidence,
       updated_at = excluded.updated_at`,
  );
  const deleteStaleLinks = db.prepare(
    `DELETE FROM canonical_series_provider_ids
     WHERE canonical_series_id = ? AND provider = ? AND external_id = ?`,
  );
  const activeLinks = new Set<string>();
  const displacedCanonicalSeriesIds = new Set<string>();

  for (const link of links) {
    if (!link.externalId) continue;
    activeLinks.add(`${link.provider}:${link.externalId}`);
    clearCanonicalNegativeSeriesMapping(link.provider, link.externalId);
    const existingLink = db
      .prepare(
        `SELECT canonical_series_id
         FROM canonical_series_provider_ids
         WHERE provider = ? AND external_id = ?`,
      )
      .get(link.provider, link.externalId) as { canonical_series_id?: string } | undefined;
    const displacedCanonicalSeriesId = String(existingLink?.canonical_series_id || '').trim();
    if (displacedCanonicalSeriesId && displacedCanonicalSeriesId !== identity.canonicalSeriesId) {
      displacedCanonicalSeriesIds.add(displacedCanonicalSeriesId);
    }
    upsertLink.run(
      link.provider,
      link.externalId,
      canonicalSeriesId,
      link.isPrimary ? 1 : 0,
      link.source,
      link.confidence,
      now,
    );
  }

  const existingLinks = db
    .prepare(
      `SELECT provider, external_id
       FROM canonical_series_provider_ids
       WHERE canonical_series_id = ?`,
    )
    .all(canonicalSeriesId) as Array<{ provider?: string; external_id?: string }>;
  for (const link of existingLinks) {
    const provider = String(link.provider || '').trim();
    const externalId = String(link.external_id || '').trim();
    if (!provider || !externalId) continue;
    if (activeLinks.has(`${provider}:${externalId}`)) continue;
    deleteStaleLinks.run(canonicalSeriesId, provider, externalId);
  }

  for (const displacedCanonicalSeriesId of displacedCanonicalSeriesIds) {
    deleteOrphanedCanonicalSeriesMapping(displacedCanonicalSeriesId);
  }
};

export const getCanonicalEpisodeMapping = (lookupKey: string): CanonicalEpisodeCacheRecord | null => {
  ensureDbInitialized();
  const cacheState = getCanonicalCacheState();
  const row = getDb()
    .prepare(
      `SELECT m.payload, m.updated_at
       FROM canonical_episode_provider_refs r
       JOIN canonical_episode_mappings m ON m.canonical_episode_id = r.canonical_episode_id
       WHERE r.lookup_key = ?`,
    )
    .get(lookupKey) as { payload?: string; updated_at?: number } | undefined;
  if (Number(row?.updated_at || 0) <= cacheState.invalidBefore) return null;
  const identity = parseJson<CanonicalEpisodeIdentity>(row?.payload);
  if (!identity) return null;
  return {
    identity,
    updatedAt: Number(row?.updated_at || 0),
  };
};

const deleteOrphanedCanonicalEpisodeMapping = (canonicalEpisodeId: string) => {
  const normalizedCanonicalEpisodeId = String(canonicalEpisodeId || '').trim();
  if (!normalizedCanonicalEpisodeId) return;

  const db = getDb();
  const remainingRefs = db
    .prepare(
      `SELECT 1
       FROM canonical_episode_provider_refs
       WHERE canonical_episode_id = ?
       LIMIT 1`,
    )
    .get(normalizedCanonicalEpisodeId);
  if (remainingRefs) return;

  db.prepare(
    `DELETE FROM canonical_episode_mappings
     WHERE canonical_episode_id = ?`,
  ).run(normalizedCanonicalEpisodeId);
};

export const setCanonicalEpisodeMapping = (identity: CanonicalEpisodeIdentity) => {
  ensureDbInitialized();
  const cacheState = getCanonicalCacheState();
  const now = Math.max(Date.now(), cacheState.invalidBefore + 1);
  const db = getDb();
  const canonicalEpisodeId = requireCanonicalCacheId(
    identity.canonicalEpisodeId,
    'canonicalEpisodeId',
  );
  const canonicalSeriesId = requireCanonicalCacheId(
    identity.canonicalSeriesId,
    'canonicalEpisode.canonicalSeriesId',
  );
  db.prepare(
    `INSERT INTO canonical_episode_mappings (canonical_episode_id, canonical_series_id, payload, season_number, episode_number, absolute_episode_number, confidence, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(canonical_episode_id) DO UPDATE SET
       canonical_series_id = excluded.canonical_series_id,
       payload = excluded.payload,
       season_number = excluded.season_number,
       episode_number = excluded.episode_number,
       absolute_episode_number = excluded.absolute_episode_number,
       confidence = excluded.confidence,
       updated_at = excluded.updated_at`,
  ).run(
    canonicalEpisodeId,
    canonicalSeriesId,
    JSON.stringify(identity),
    identity.season ? Number.parseInt(identity.season, 10) : null,
    identity.episode ? Number.parseInt(identity.episode, 10) : null,
    identity.absoluteEpisode ? Number.parseInt(identity.absoluteEpisode, 10) : null,
    identity.confidence,
    now,
  );

  const refs: CanonicalEpisodeProviderRef[] = identity.providerRefs.length > 0
    ? identity.providerRefs
    : [];
  const upsertRef = db.prepare(
    `INSERT INTO canonical_episode_provider_refs (lookup_key, provider, series_external_id, provider_season_number, provider_episode_number, provider_absolute_episode_number, canonical_episode_id, source, confidence, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(lookup_key) DO UPDATE SET
       provider = excluded.provider,
       series_external_id = excluded.series_external_id,
       provider_season_number = excluded.provider_season_number,
       provider_episode_number = excluded.provider_episode_number,
       provider_absolute_episode_number = excluded.provider_absolute_episode_number,
       canonical_episode_id = excluded.canonical_episode_id,
       source = excluded.source,
       confidence = excluded.confidence,
       updated_at = excluded.updated_at`,
  );
  const deleteStaleRefs = db.prepare(
    `DELETE FROM canonical_episode_provider_refs
     WHERE canonical_episode_id = ? AND lookup_key = ?`,
  );
  const activeLookupKeys = new Set<string>();
  const displacedCanonicalEpisodeIds = new Set<string>();

  for (const ref of refs) {
    if (!ref.seriesExternalId) continue;
    const lookupKey = buildCanonicalEpisodeLookupKey(
      ref.provider,
      ref.seriesExternalId,
      ref.seasonNumber,
      ref.episodeNumber,
      ref.absoluteEpisodeNumber,
    );
    activeLookupKeys.add(lookupKey);
    clearCanonicalNegativeEpisodeMapping(lookupKey);
    const existingRef = db
      .prepare(
        `SELECT canonical_episode_id
         FROM canonical_episode_provider_refs
         WHERE lookup_key = ?`,
      )
      .get(lookupKey) as { canonical_episode_id?: string } | undefined;
    const displacedCanonicalEpisodeId = String(existingRef?.canonical_episode_id || '').trim();
    if (displacedCanonicalEpisodeId && displacedCanonicalEpisodeId !== identity.canonicalEpisodeId) {
      displacedCanonicalEpisodeIds.add(displacedCanonicalEpisodeId);
    }
    upsertRef.run(
      lookupKey,
      ref.provider,
      ref.seriesExternalId,
      ref.seasonNumber,
      ref.episodeNumber,
      ref.absoluteEpisodeNumber,
      canonicalEpisodeId,
      ref.source,
      ref.confidence,
      now,
    );
  }

  const existingRefs = db
    .prepare(
      `SELECT lookup_key
       FROM canonical_episode_provider_refs
       WHERE canonical_episode_id = ?`,
    )
    .all(canonicalEpisodeId) as Array<{ lookup_key?: string }>;
  for (const ref of existingRefs) {
    const lookupKey = String(ref.lookup_key || '').trim();
    if (!lookupKey || activeLookupKeys.has(lookupKey)) continue;
    deleteStaleRefs.run(canonicalEpisodeId, lookupKey);
  }

  for (const displacedCanonicalEpisodeId of displacedCanonicalEpisodeIds) {
    deleteOrphanedCanonicalEpisodeMapping(displacedCanonicalEpisodeId);
  }
};