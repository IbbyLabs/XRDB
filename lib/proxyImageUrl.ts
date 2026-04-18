import { buildEpisodeToken } from './episodeIdentity.ts';
import { getProxyParamValue } from './proxyConfigCodec.ts';
import {
  XRDB_OPTIONAL_PARAMS,
  XRDB_TYPE_OPTIONAL_PARAMS,
  XRDB_TYPE_STYLE_PARAMS,
  type ProxyConfig,
  type ProxyImageType,
} from './proxyConfigSchema.ts';

type BuildXrdbImageUrlOptions = {
  reqUrl: URL;
  imageType: ProxyImageType;
  xrdbId: string;
  tmdbKey: string;
  mdblistKey: string;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  episodeSourceProvider?: string | null;
  episodeSourceId?: string | null;
  episodeSourceSeason?: number | string | null;
  episodeSourceEpisode?: number | string | null;
  episodeAbsolute?: number | string | null;
  simklClientId?: string | null;
  fallbackUrl?: string | null;
  config?: ProxyConfig | null;
};

const getFirstConfiguredValue = (
  reqUrl: URL,
  config: ProxyConfig | null,
  keys: readonly (keyof ProxyConfig)[],
) => {
  for (const key of keys) {
    const value = getProxyParamValue(reqUrl, config, key);
    if (value) {
      return value;
    }
  }
  return null;
};

const appendOptionalQuery = (target: URL, key: string, value: string | null) => {
  if (value !== null) {
    target.searchParams.set(key, value);
  }
};

export const buildXrdbImageUrl = ({
  reqUrl,
  imageType,
  xrdbId,
  tmdbKey,
  mdblistKey,
  seasonNumber = null,
  episodeNumber = null,
  episodeSourceProvider = null,
  episodeSourceId = null,
  episodeSourceSeason = null,
  episodeSourceEpisode = null,
  episodeAbsolute = null,
  simklClientId = null,
  fallbackUrl = null,
  config = null,
}: BuildXrdbImageUrlOptions) => {
  const baseUrl = getProxyParamValue(reqUrl, config, 'xrdbBase');
  const target = new URL(baseUrl || reqUrl.origin);
  const isAnimeNativeEpisodeAuthority = (provider: string) =>
    provider === 'kitsu' || provider === 'anilist' || provider === 'mal' || provider === 'anidb';
  const parseAnimeNativeEpisodeAuthority = (xrdbId: string) => {
    const parts = String(xrdbId || '').trim().split(':');
    const provider = (parts[0] || '').trim().toLowerCase();
    const externalId = (parts[1] || '').trim();
    if (isAnimeNativeEpisodeAuthority(provider) && externalId) {
      return {
        provider,
        externalId,
        usesCompatibilitySeasonToken: true,
      };
    }
    return null;
  };
  const inferredAnimeEpisodeAuthority = imageType === 'thumbnail'
    ? parseAnimeNativeEpisodeAuthority(xrdbId)
    : null;
  const animeEpisodeAuthority =
    imageType === 'thumbnail' && episodeSourceProvider && episodeSourceId
      ? {
          provider: String(episodeSourceProvider).trim().toLowerCase(),
          externalId: String(episodeSourceId).trim(),
          usesCompatibilitySeasonToken: isAnimeNativeEpisodeAuthority(
            String(episodeSourceProvider).trim().toLowerCase(),
          ),
        }
      : inferredAnimeEpisodeAuthority;

  if (imageType === 'thumbnail') {
    const episodeToken = animeEpisodeAuthority?.usesCompatibilitySeasonToken
      ? (buildEpisodeToken(1, episodeNumber ?? 1) || 'S01E01')
      : (buildEpisodeToken(seasonNumber ?? 1, episodeNumber ?? 1) || 'S01E01');
    target.pathname = `/thumbnail/${encodeURIComponent(xrdbId)}/${episodeToken}.jpg`;
  } else {
    target.pathname = `/${imageType}/${encodeURIComponent(xrdbId)}.jpg`;
  }

  target.search = '';

  appendOptionalQuery(target, 'xrdbKey', getProxyParamValue(reqUrl, config, 'xrdbKey'));
  if (tmdbKey) {
    target.searchParams.set('tmdbKey', tmdbKey);
  }
  if (mdblistKey) {
    target.searchParams.set('mdblistKey', mdblistKey);
  }

  const resolvedSimklClientId = simklClientId || getProxyParamValue(reqUrl, config, 'simklClientId');
  if (resolvedSimklClientId) {
    target.searchParams.set('simklClientId', resolvedSimklClientId);
  }

  if (animeEpisodeAuthority && episodeNumber) {
    target.searchParams.set('episodeSourceProvider', animeEpisodeAuthority.provider);
    target.searchParams.set('episodeSourceId', animeEpisodeAuthority.externalId);
    const resolvedEpisodeSourceSeason =
      episodeSourceSeason !== null && episodeSourceSeason !== undefined
        ? episodeSourceSeason
        : seasonNumber;
    if (resolvedEpisodeSourceSeason !== null && resolvedEpisodeSourceSeason !== undefined) {
      target.searchParams.set('episodeSourceSeason', String(resolvedEpisodeSourceSeason));
    }
    const resolvedEpisodeSourceEpisode =
      episodeSourceEpisode !== null && episodeSourceEpisode !== undefined
        ? episodeSourceEpisode
        : episodeNumber;
    target.searchParams.set('episodeSourceEpisode', String(resolvedEpisodeSourceEpisode));
    const resolvedEpisodeAbsolute =
      episodeAbsolute !== null && episodeAbsolute !== undefined
        ? episodeAbsolute
        : animeEpisodeAuthority.usesCompatibilitySeasonToken
          ? episodeNumber
          : null;
    if (resolvedEpisodeAbsolute !== null && resolvedEpisodeAbsolute !== undefined) {
      target.searchParams.set('episodeAbsolute', String(resolvedEpisodeAbsolute));
    }
  }

  for (const key of XRDB_OPTIONAL_PARAMS) {
    appendOptionalQuery(target, key, getProxyParamValue(reqUrl, config, key));
  }

  for (const key of XRDB_TYPE_OPTIONAL_PARAMS[imageType] || []) {
    appendOptionalQuery(target, key, getProxyParamValue(reqUrl, config, key));
  }

  const styleKeys = XRDB_TYPE_STYLE_PARAMS[imageType];
  appendOptionalQuery(
    target,
    'ratingStyle',
    getFirstConfiguredValue(reqUrl, config, styleKeys.ratingStyle),
  );

  if (styleKeys.imageText.length > 0) {
    appendOptionalQuery(
      target,
      'imageText',
      getFirstConfiguredValue(reqUrl, config, styleKeys.imageText),
    );
  }

  const normalizedFallbackUrl = typeof fallbackUrl === 'string' ? fallbackUrl.trim() : '';
  if (normalizedFallbackUrl) {
    target.searchParams.set('fallbackUrl', normalizedFallbackUrl);
  }

  return target.toString();
};
