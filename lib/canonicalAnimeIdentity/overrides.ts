import { getDb, ensureDbInitialized } from '../sqliteStore.ts';
import {
  bumpCanonicalCacheInvalidationBoundary,
  setCanonicalEpisodeMapping,
  setCanonicalSeriesMapping,
} from './cache.ts';
import type {
  CanonicalEpisodeIdentity,
  CanonicalMappingOverride,
  CanonicalEpisodeProviderRef,
  CanonicalSeriesProviderLink,
  CanonicalSeriesIdentity,
} from './types.ts';

const parseOverridePayload = (value: string) => {
  try {
    return JSON.parse(value) as CanonicalSeriesIdentity | CanonicalEpisodeIdentity;
  } catch {
    return null;
  }
};

const parseEpisodeOverrideLookupKey = (lookupKey: string) => {
  const match = /^episode:([^:]+):([^:]+):s:([^:]+):e:([^:]+):a:(.+)$/.exec(lookupKey);
  if (!match) return null;
  return {
    provider: match[1],
    seriesExternalId: match[2],
    season: match[3] === '-' ? null : match[3],
    episode: match[4] === '-' ? null : match[4],
    absoluteEpisode: match[5] === '-' ? null : match[5],
  };
};

const materializeSeriesOverrideIdentity = (
  override: CanonicalMappingOverride,
  identity: CanonicalSeriesIdentity,
): CanonicalSeriesIdentity => {
  const links: CanonicalSeriesProviderLink[] = [...identity.links];
  const hasPrimaryLink = links.some(
    (link) => link.provider === identity.provider && link.externalId === identity.externalId,
  );

  if (!hasPrimaryLink) {
    links.unshift({
      provider: identity.provider,
      externalId: identity.externalId,
      isPrimary: true,
      source: 'override',
      confidence: identity.confidence,
    });
  }

  for (const [provider, externalId] of Object.entries(identity.mappedIds)) {
    const normalizedExternalId = String(externalId || '').trim();
    if (!normalizedExternalId) continue;
    if (links.some((link) => link.provider === provider && link.externalId === normalizedExternalId)) {
      continue;
    }
    links.push({
      provider: provider as CanonicalSeriesProviderLink['provider'],
      externalId: normalizedExternalId,
      isPrimary: false,
      source: 'override',
      confidence: identity.confidence,
    });
  }

  return {
    ...identity,
    links,
    source: 'override',
    sourceUpdatedAt: override.updatedAt,
  };
};

const materializeEpisodeOverrideIdentity = (
  override: CanonicalMappingOverride,
  identity: CanonicalEpisodeIdentity,
): CanonicalEpisodeIdentity => {
  const providerRefs: CanonicalEpisodeProviderRef[] = [...identity.providerRefs];
  const parsedLookup = parseEpisodeOverrideLookupKey(override.lookupKey);

  if (
    parsedLookup &&
    !providerRefs.some(
      (providerRef) =>
        providerRef.provider === parsedLookup.provider &&
        providerRef.seriesExternalId === parsedLookup.seriesExternalId &&
        providerRef.seasonNumber === parsedLookup.season &&
        providerRef.episodeNumber === parsedLookup.episode &&
        providerRef.absoluteEpisodeNumber === parsedLookup.absoluteEpisode,
    )
  ) {
    providerRefs.unshift({
      provider: parsedLookup.provider as CanonicalEpisodeProviderRef['provider'],
      seriesExternalId: parsedLookup.seriesExternalId,
      seasonNumber: parsedLookup.season,
      episodeNumber: parsedLookup.episode,
      absoluteEpisodeNumber: parsedLookup.absoluteEpisode,
      role: 'authority',
      source: 'override',
      confidence: identity.confidence,
    });
  }

  for (const [provider, externalId] of Object.entries(identity.mappedIds)) {
    const normalizedExternalId = String(externalId || '').trim();
    if (!normalizedExternalId) continue;
    if (
      providerRefs.some(
        (providerRef) =>
          providerRef.provider === provider && providerRef.seriesExternalId === normalizedExternalId,
      )
    ) {
      continue;
    }
    providerRefs.push({
      provider: provider as CanonicalEpisodeProviderRef['provider'],
      seriesExternalId: normalizedExternalId,
      seasonNumber: identity.season,
      episodeNumber: identity.episode,
      absoluteEpisodeNumber: identity.absoluteEpisode,
      role: 'mapped',
      source: 'override',
      confidence: identity.confidence,
    });
  }

  return {
    ...identity,
    providerRefs,
    source: 'override',
  };
};

export const getCanonicalMappingOverride = (lookupKey: string): CanonicalMappingOverride | null => {
  ensureDbInitialized();
  const row = getDb()
    .prepare(
      `SELECT lookup_key, scope, provider, external_key, payload, reason, updated_at
       FROM canonical_mapping_overrides WHERE lookup_key = ?`,
    )
    .get(lookupKey) as {
      lookup_key?: string;
      scope?: 'series' | 'episode';
      provider?: string | null;
      external_key?: string;
      payload?: string;
      reason?: string | null;
      updated_at?: number;
    } | undefined;
  if (!row?.payload || !row.lookup_key || !row.scope || !row.external_key) return null;
  const payload = parseOverridePayload(row.payload);
  if (!payload) return null;
  return {
    lookupKey: row.lookup_key,
    scope: row.scope,
    provider: (row.provider as any) || null,
    externalKey: row.external_key,
    payload,
    reason: row.reason || null,
    updatedAt: Number(row.updated_at || 0),
  };
};

export const upsertCanonicalMappingOverride = (override: CanonicalMappingOverride) => {
  ensureDbInitialized();
  getDb().transaction(() => {
    getDb()
      .prepare(
        `INSERT INTO canonical_mapping_overrides (lookup_key, scope, provider, external_key, payload, reason, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(lookup_key) DO UPDATE SET
           scope = excluded.scope,
           provider = excluded.provider,
           external_key = excluded.external_key,
           payload = excluded.payload,
           reason = excluded.reason,
           updated_at = excluded.updated_at`,
      )
      .run(
        override.lookupKey,
        override.scope,
        override.provider,
        override.externalKey,
        JSON.stringify(override.payload),
        override.reason,
        override.updatedAt,
      );
    bumpCanonicalCacheInvalidationBoundary();
    if (override.scope === 'series') {
      setCanonicalSeriesMapping(
        materializeSeriesOverrideIdentity(override, override.payload as CanonicalSeriesIdentity),
      );
      return;
    }
    setCanonicalEpisodeMapping(
      materializeEpisodeOverrideIdentity(override, override.payload as CanonicalEpisodeIdentity),
    );
  })();
};