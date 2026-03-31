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
  simklClientId = null,
  fallbackUrl = null,
  config = null,
}: BuildXrdbImageUrlOptions) => {
  const baseUrl = getProxyParamValue(reqUrl, config, 'xrdbBase');
  const target = new URL(baseUrl || reqUrl.origin);

  if (imageType === 'thumbnail') {
    const episodeToken = buildEpisodeToken(seasonNumber ?? 1, episodeNumber ?? 1) || 'S01E01';
    target.pathname = `/thumbnail/${encodeURIComponent(xrdbId)}/${episodeToken}.jpg`;
  } else {
    target.pathname = `/${imageType}/${encodeURIComponent(xrdbId)}.jpg`;
  }

  target.search = '';

  appendOptionalQuery(target, 'xrdbKey', getProxyParamValue(reqUrl, config, 'xrdbKey'));
  target.searchParams.set('tmdbKey', tmdbKey);
  target.searchParams.set('mdblistKey', mdblistKey);

  const resolvedSimklClientId = simklClientId || getProxyParamValue(reqUrl, config, 'simklClientId');
  if (resolvedSimklClientId) {
    target.searchParams.set('simklClientId', resolvedSimklClientId);
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
