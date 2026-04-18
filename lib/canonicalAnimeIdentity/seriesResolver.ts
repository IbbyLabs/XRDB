import { createHash } from 'node:crypto';

import {
  getCanonicalSeriesMapping,
  hasCanonicalNegativeSeriesMapping,
  setCanonicalNegativeSeriesMapping,
  setCanonicalSeriesMapping,
} from './cache.ts';
import { getCanonicalMappingOverride } from './overrides.ts';
import { fetchCanonicalProviderMapping } from './providerAdapters.ts';
import type {
  CanonicalMappedIds,
  CanonicalResolutionSource,
  CanonicalSeriesIdentity,
  RawEpisodeIdentityInput,
} from './types.ts';
import type { CachedJsonResponse, PhaseDurations } from '../imageRouteRuntime.ts';

type ResolverFetchJson = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
) => Promise<CachedJsonResponse>;

const buildCanonicalSeriesId = (provider: string, externalId: string, mappedIds: CanonicalMappedIds) => {
  if (mappedIds.tmdb) return `tmdb:${mappedIds.tmdb}`;
  if (mappedIds.imdb) return `imdb:${mappedIds.imdb}`;
  const fingerprint = createHash('sha1')
    .update(provider)
    .update(':')
    .update(externalId)
    .digest('hex')
    .slice(0, 16);
  return `anime:${provider}:${externalId}:${fingerprint}`;
};

const normalizeCanonicalSeriesLookupAuthority = (input: RawEpisodeIdentityInput) => {
  const provider = input.episodeProvider && input.episodeSourceId ? input.episodeProvider : input.rawProvider;
  const externalId = (input.episodeProvider && input.episodeSourceId ? input.episodeSourceId : input.rawExternalId) || input.rawId;

  if (provider === 'xrdbid' && input.rawExternalId) {
    return {
      provider: 'imdb' as const,
      externalId: input.rawExternalId,
    };
  }

  return {
    provider,
    externalId,
  };
};

export const resolveCanonicalSeriesIdentity = async ({
  input,
  phases,
  fetchJsonCached,
}: {
  input: RawEpisodeIdentityInput;
  phases: PhaseDurations;
  fetchJsonCached: ResolverFetchJson;
}): Promise<CanonicalSeriesIdentity> => {
  const { provider, externalId } = normalizeCanonicalSeriesLookupAuthority(input);
  const overrideKey = `series:${provider}:${externalId}`;
  const override = getCanonicalMappingOverride(overrideKey);
  if (override?.scope === 'series') {
    return {
      ...(override.payload as CanonicalSeriesIdentity),
      source: 'override',
    };
  }

  const cached = getCanonicalSeriesMapping(provider, externalId);
  if (cached) {
    return {
      ...cached.identity,
      source: 'cache',
    };
  }

  const hasNegativeCache = hasCanonicalNegativeSeriesMapping(provider, externalId);

  const mappingSeason = input.episodeProvider && input.episodeSourceId ? null : input.season;
  const mappingEpisode = input.episodeSourceEpisode || input.episode;

  const mapping = hasNegativeCache
    ? {
        payload: null,
        mappedIds: { tmdb: null, kitsu: null, anilist: null, mal: null },
        tmdbEpisodeTarget: null,
      }
    : await fetchCanonicalProviderMapping({
        provider,
        externalId,
        season: mappingSeason,
        episode: mappingEpisode,
        phases,
        fetchJsonCached,
      });
  const mappedIds: CanonicalMappedIds = {};
  if ((input.rawProvider === 'imdb' || input.rawProvider === 'xrdbid') && input.rawExternalId) {
    mappedIds.imdb = input.rawExternalId;
  }
  if (mapping.mappedIds.tmdb) mappedIds.tmdb = mapping.mappedIds.tmdb;
  if (mapping.mappedIds.kitsu) mappedIds.kitsu = mapping.mappedIds.kitsu;
  if (mapping.mappedIds.anilist) mappedIds.anilist = mapping.mappedIds.anilist;
  if (mapping.mappedIds.mal) mappedIds.mal = mapping.mappedIds.mal;
  if (provider === 'anidb') mappedIds.anidb = externalId;
  const mappingSource: CanonicalResolutionSource = mapping.payload
    ? (provider === 'kitsu' ? 'kitsu-mapping' : 'reverse-mapping')
    : 'raw';
  const identity: CanonicalSeriesIdentity = {
    canonicalSeriesId: buildCanonicalSeriesId(provider, externalId, mappedIds),
    provider,
    externalId,
    mediaType: input.mediaType,
    mappedIds,
    links: [
      {
        provider,
        externalId,
        isPrimary: true,
        source: mappingSource,
        confidence: mapping.payload ? 0.85 : 0.25,
      },
      ...Object.entries(mappedIds)
        .filter(([mappedProvider, mappedId]) => mappedId && mappedProvider !== provider)
        .map(([mappedProvider, mappedId]) => ({
          provider: mappedProvider as CanonicalSeriesIdentity['provider'],
          externalId: String(mappedId),
          isPrimary: false,
          source: mappingSource,
          confidence: mapping.payload ? 0.75 : 0.25,
        })),
    ],
    source: mappingSource,
    confidence: mapping.payload ? 0.85 : 0.25,
    sourceUpdatedAt: Date.now(),
  };
  const hasResolvedProviderLinks = Boolean(
    mapping.mappedIds.tmdb || mapping.mappedIds.kitsu || mapping.mappedIds.anilist || mapping.mappedIds.mal,
  );
  if (mapping.payload || hasResolvedProviderLinks) {
    setCanonicalSeriesMapping(identity);
  } else {
    setCanonicalNegativeSeriesMapping(provider, externalId);
  }
  return identity;
};