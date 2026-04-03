import { PROVIDER_ICON_CACHE_VERSION } from './imageRouteConfig.ts';
import { sha1Hex } from './imageRouteRuntime.ts';

export type ImageRouteArtworkType = 'poster' | 'backdrop' | 'logo';

export const toImageContentType = (value: string | null) => {
  const normalized = (value || '').split(';')[0]?.trim().toLowerCase();
  return normalized?.startsWith('image/') ? normalized : 'image/png';
};

export const buildSourceImageFallbackCacheControl = (ttlMs: number) => {
  const ttlSeconds = Math.max(60, Math.floor(ttlMs / 1000));
  return `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}, stale-while-revalidate=3600`;
};

export const isSharedCacheableSourceImageUrl = (value: string) => {
  try {
    const hostname = new URL(value).hostname;
    return hostname === 'image.tmdb.org' || hostname === 'm.media-amazon.com';
  } catch {
    return false;
  }
};

export const buildProviderIconStorageKey = (iconUrl: string, iconCornerRadius = 0) =>
  `icons/${PROVIDER_ICON_CACHE_VERSION}/${sha1Hex(`${iconUrl}|r:${iconCornerRadius}`)}.png`;

export const buildProviderIconMemoryCacheKey = (iconUrl: string, iconCornerRadius = 0) =>
  `icon:${PROVIDER_ICON_CACHE_VERSION}:${iconUrl}|r:${iconCornerRadius}`;

export const pickTmdbImageSize = (imageType: ImageRouteArtworkType, outputWidth: number) => {
  if (imageType === 'poster') {
    if (outputWidth <= 500) return 'w500';
    if (outputWidth <= 780) return 'w780';
    return 'original';
  }
  if (imageType === 'backdrop') return 'w1280';
  if (imageType === 'logo') {
    return outputWidth <= 500 ? 'w500' : 'original';
  }
  return 'original';
};

export const buildTmdbImageUrl = (
  imageType: ImageRouteArtworkType,
  imgPath: string,
  outputWidth: number,
) => {
  const size = pickTmdbImageSize(imageType, outputWidth);
  return `https://image.tmdb.org/t/p/${size}${imgPath}`;
};

export const buildTmdbProviderLogoUrl = (logoPath: string, size = 'w185') =>
  `https://image.tmdb.org/t/p/${size}${logoPath}`;

export const buildCinemetaPosterUrl = (imdbId: string) =>
  `https://images.metahub.space/poster/medium/${encodeURIComponent(imdbId)}/img`;

export const buildCinemetaBackdropUrl = (imdbId: string) =>
  `https://images.metahub.space/background/medium/${encodeURIComponent(imdbId)}/img`;

export const buildCinemetaLogoUrl = (imdbId: string) =>
  `https://images.metahub.space/logo/medium/${encodeURIComponent(imdbId)}/img`;
