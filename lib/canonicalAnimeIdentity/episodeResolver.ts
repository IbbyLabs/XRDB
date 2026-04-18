import { createHash } from 'node:crypto';

import {
  buildCanonicalEpisodeLookupKey,
  getCanonicalEpisodeMapping,
  hasCanonicalNegativeEpisodeMapping,
  setCanonicalEpisodeMapping,
  setCanonicalNegativeEpisodeMapping,
} from './cache.ts';
import { getCanonicalMappingOverride } from './overrides.ts';
import { fetchCanonicalProviderMapping } from './providerAdapters.ts';
import { resolveTmdbConsolidatedSeasonEpisode } from '../imageRouteEpisodeLookup.ts';
import type {
  CanonicalEpisodeIdentity,
  CanonicalEpisodeProviderRef,
  CanonicalAnimeProvider,
  CanonicalMappedIds,
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

const buildCanonicalEpisodeId = (seriesId: string, season: string | null, episode: string | null, absoluteEpisode: string | null) => {
  const fingerprint = createHash('sha1')
    .update(seriesId)
    .update(':')
    .update(String(season || '-'))
    .update(':')
    .update(String(episode || '-'))
    .update(':')
    .update(String(absoluteEpisode || '-'))
    .digest('hex')
    .slice(0, 16);
  return `${seriesId}:${fingerprint}`;
};

const normalizeProviderRefInput = (
  provider: CanonicalAnimeProvider | null,
  externalId: string | null,
  fallbackImdbId: string | null,
) => {
  if (provider === 'xrdbid') {
    return fallbackImdbId
      ? {
          provider: 'imdb' as const,
          externalId: fallbackImdbId,
        }
      : null;
  }
  if (!provider || provider === 'unknown' || !externalId) {
    return null;
  }
  return {
    provider,
    externalId,
  };
};

const appendProviderRef = (
  providerRefs: CanonicalEpisodeProviderRef[],
  providerRef: CanonicalEpisodeProviderRef | null,
) => {
  if (!providerRef || !providerRef.seriesExternalId) {
    return;
  }

  const duplicate = providerRefs.some(
    (existingRef) =>
      existingRef.provider === providerRef.provider &&
      existingRef.seriesExternalId === providerRef.seriesExternalId &&
      existingRef.seasonNumber === providerRef.seasonNumber &&
      existingRef.episodeNumber === providerRef.episodeNumber &&
      existingRef.absoluteEpisodeNumber === providerRef.absoluteEpisodeNumber,
  );
  if (!duplicate) {
    providerRefs.push(providerRef);
  }
};

const maybeApplyTmdbConsolidatedRemap = async ({
  identity,
  tmdbShowId,
  phases,
  fetchJsonCached,
  tmdbKey,
  applyTmdbConsolidatedRemap,
}: {
  identity: CanonicalEpisodeIdentity;
  tmdbShowId: string | null;
  phases: PhaseDurations;
  fetchJsonCached: ResolverFetchJson;
  tmdbKey?: string | null;
  applyTmdbConsolidatedRemap?: boolean;
}) => {
  if (
    !applyTmdbConsolidatedRemap ||
    !tmdbKey ||
    !tmdbShowId ||
    !identity.season ||
    !identity.episode
  ) {
    return identity;
  }

  const remapped = await resolveTmdbConsolidatedSeasonEpisode(
    tmdbShowId,
    identity.season,
    identity.episode,
    tmdbKey,
    phases,
    fetchJsonCached,
  );
  if (!remapped) {
    return identity;
  }

  if (remapped.season === identity.season && remapped.episode === identity.episode) {
    return identity;
  }

  return {
    ...identity,
    season: remapped.season,
    episode: remapped.episode,
    canonicalEpisodeId: buildCanonicalEpisodeId(
      identity.canonicalSeriesId,
      remapped.season,
      remapped.episode,
      identity.absoluteEpisode,
    ),
  };
};

export const resolveCanonicalEpisodeIdentity = async ({
  input,
  series,
  phases,
  fetchJsonCached,
  tmdbKey,
  applyTmdbConsolidatedRemap = false,
}: {
  input: RawEpisodeIdentityInput;
  series: CanonicalSeriesIdentity;
  phases: PhaseDurations;
  fetchJsonCached: ResolverFetchJson;
  tmdbKey?: string | null;
  applyTmdbConsolidatedRemap?: boolean;
}): Promise<CanonicalEpisodeIdentity> => {
  const authorityProvider = input.episodeProvider && input.episodeSourceId ? input.episodeProvider : series.provider;
  const authoritySeriesId = input.episodeProvider && input.episodeSourceId ? input.episodeSourceId : series.externalId;
  const authoritySeason = input.episodeProvider && input.episodeSourceId
    ? (input.episodeSourceSeason || null)
    : (input.episodeSourceSeason || input.season);
  const authorityEpisode = input.episodeSourceEpisode || input.episode;
  const authorityAbsolute = input.episodeAbsolute || input.absoluteEpisode;
  const lookupKey = buildCanonicalEpisodeLookupKey(
    authorityProvider,
    authoritySeriesId,
    authoritySeason,
    authorityEpisode,
    authorityAbsolute,
  );

  const override = getCanonicalMappingOverride(`episode:${lookupKey}`);
  if (override?.scope === 'episode') {
    return {
      ...(override.payload as CanonicalEpisodeIdentity),
      source: 'override',
    };
  }

  const cached = getCanonicalEpisodeMapping(lookupKey);
  if (cached) {
    const cachedIdentity = await maybeApplyTmdbConsolidatedRemap({
      identity: {
        ...cached.identity,
        source: 'cache',
      },
      tmdbShowId:
        cached.identity.mappedIds.tmdb ||
        series.mappedIds.tmdb ||
        (series.provider === 'tmdb' ? series.externalId : null),
      phases,
      fetchJsonCached,
      tmdbKey,
      applyTmdbConsolidatedRemap,
    });
    if (cachedIdentity.season !== cached.identity.season || cachedIdentity.episode !== cached.identity.episode) {
      setCanonicalEpisodeMapping(cachedIdentity);
    }
    return {
      ...cachedIdentity,
      ...cached.identity,
      ...cachedIdentity,
    };
  }

  const hasNegativeCache = hasCanonicalNegativeEpisodeMapping(lookupKey);

  const mapping = hasNegativeCache
    ? {
        payload: null,
        mappedIds: { tmdb: null, kitsu: null, anilist: null, mal: null },
        tmdbEpisodeTarget: null,
      }
    : await fetchCanonicalProviderMapping({
        provider: authorityProvider,
        externalId: authoritySeriesId,
        season: authoritySeason,
        episode: authorityEpisode,
        phases,
        fetchJsonCached,
      });

  let resolvedSeason = mapping.tmdbEpisodeTarget?.season || authoritySeason || null;
  let resolvedEpisode = mapping.tmdbEpisodeTarget?.episode || authorityEpisode || null;
  const resolvedAbsolute = authorityAbsolute || (authorityProvider === 'kitsu' && !authoritySeason ? authorityEpisode : null) || null;

  const providerRefs: CanonicalEpisodeProviderRef[] = [];
  const providerRefSource = mapping.payload
    ? (authorityProvider === 'kitsu' ? 'kitsu-mapping' : 'reverse-mapping')
    : 'raw';
  const fallbackImdbId = series.mappedIds.imdb || null;
  const rawProviderRefInput = normalizeProviderRefInput(
    input.rawProvider,
    input.rawExternalId,
    fallbackImdbId,
  );
  appendProviderRef(
    providerRefs,
    rawProviderRefInput
      ? {
          provider: rawProviderRefInput.provider,
          seriesExternalId: rawProviderRefInput.externalId,
          seasonNumber: input.season,
          episodeNumber: input.episode,
          absoluteEpisodeNumber: input.absoluteEpisode,
          role: 'raw-source',
          source: 'raw',
          confidence: 0.4,
        }
      : null,
  );
  appendProviderRef(providerRefs, {
    provider: authorityProvider,
    seriesExternalId: authoritySeriesId,
    seasonNumber: authoritySeason,
    episodeNumber: authorityEpisode,
    absoluteEpisodeNumber: authorityAbsolute,
    role: 'authority',
    source: providerRefSource,
    confidence: mapping.payload ? 0.85 : 0.4,
  });
  appendProviderRef(
    providerRefs,
    mapping.tmdbEpisodeTarget?.id
      ? {
          provider: 'tmdb',
          seriesExternalId: mapping.tmdbEpisodeTarget.id,
          seasonNumber: mapping.tmdbEpisodeTarget.season,
          episodeNumber: mapping.tmdbEpisodeTarget.episode,
          absoluteEpisodeNumber: resolvedAbsolute,
          role: 'mapped',
          source: providerRefSource,
          confidence: mapping.payload ? 0.85 : 0.4,
        }
      : null,
  );

  const mappedIds: CanonicalMappedIds = {
    ...series.mappedIds,
  };
  if (mapping.tmdbEpisodeTarget?.id) {
    mappedIds.tmdb = mapping.tmdbEpisodeTarget.id;
  }

  const identity: CanonicalEpisodeIdentity = {
    canonicalEpisodeId: buildCanonicalEpisodeId(series.canonicalSeriesId, resolvedSeason, resolvedEpisode, resolvedAbsolute),
    canonicalSeriesId: series.canonicalSeriesId,
    season: resolvedSeason,
    episode: resolvedEpisode,
    absoluteEpisode: resolvedAbsolute,
    mappedIds,
    providerRefs,
    source: mapping.payload ? (authorityProvider === 'kitsu' ? 'kitsu-mapping' : 'reverse-mapping') : 'raw',
    confidence: mapping.payload ? 0.85 : 0.4,
  };
  const remappedIdentity = await maybeApplyTmdbConsolidatedRemap({
    identity,
    tmdbShowId: mappedIds.tmdb || (series.provider === 'tmdb' ? series.externalId : null),
    phases,
    fetchJsonCached,
    tmdbKey,
    applyTmdbConsolidatedRemap,
  });
  const hasResolvedEpisodeTarget = Boolean(mapping.payload || mapping.tmdbEpisodeTarget?.id);
  const hasDerivedCoordinates =
    remappedIdentity.season !== (authoritySeason || null) ||
    remappedIdentity.episode !== (authorityEpisode || null) ||
    remappedIdentity.absoluteEpisode !== (authorityAbsolute || null);
  if (hasResolvedEpisodeTarget || hasDerivedCoordinates) {
    setCanonicalEpisodeMapping(remappedIdentity);
  } else {
    setCanonicalNegativeEpisodeMapping(lookupKey);
  }
  return remappedIdentity;
};