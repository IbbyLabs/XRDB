import { ProxyAgent } from 'undici';
import type { RatingPreference } from './ratingProviderCatalog.ts';
import type { BackdropRatingLayout } from './backdropLayoutOptions.ts';
import type { PosterRatingLayout } from './posterLayoutOptions.ts';
import type { SideRatingPosition } from './sideRatingPosition.ts';
import type { MediaFeatureBadgeKey } from './mediaFeatures.ts';
import { getConfiguredXrdbRequestKeys } from './xrdbRequestKey.ts';
import { resolveTorrentioBaseUrl } from './torrentioUrl.ts';

export type PosterTextPreference = 'original' | 'clean' | 'textless' | 'alternative' | 'random';
export type PosterImageSize = 'normal' | 'large' | '4k';
export type BackdropImageSize = 'normal' | 'large' | '4k';
export type RandomPosterTextMode = 'any' | 'text' | 'textless';
export type RandomPosterLanguageMode = 'any' | 'requested' | 'fallback';
export type RandomPosterFallbackMode = 'best' | 'original';
export type ArtworkSource = 'tmdb' | 'fanart' | 'cinemeta' | 'omdb' | 'random' | 'blackbar';
export type EpisodeArtworkMode = 'still' | 'series';
export type AnimeMappingProvider = 'mal' | 'anilist' | 'imdb' | 'tmdb' | 'tvdb' | 'anidb';
export type AggregateBadgeKey = 'aggregate-overall' | 'aggregate-critics' | 'aggregate-audience';
export type BadgeKey = RatingPreference | MediaFeatureBadgeKey | AggregateBadgeKey;
export type QualityBadgesSide = 'left' | 'right';
export type PosterQualityBadgesPosition = 'auto' | QualityBadgesSide;
export type AgeRatingBadgePosition =
  | 'inherit'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'left-top'
  | 'left-center'
  | 'left-bottom'
  | 'right-top'
  | 'right-center'
  | 'right-bottom';
export type LogoBackground = 'transparent' | 'dark';
export type BlockbusterDensity = 'sparse' | 'balanced' | 'packed';
export type RpdbRatingBarPosition =
  | 'bottom'
  | 'top'
  | 'right-bottom'
  | 'right-center'
  | 'right-top'
  | 'left-bottom'
  | 'left-center'
  | 'left-top';
export type RpdbRatingBarPositionAliases = {
  posterRatingsLayout?: PosterRatingLayout;
  backdropRatingsLayout?: BackdropRatingLayout;
  sideRatingsPosition?: SideRatingPosition;
};

const ANIME_MAPPING_PROVIDER_SET = new Set<AnimeMappingProvider>([
  'mal',
  'anilist',
  'imdb',
  'tmdb',
  'tvdb',
  'anidb',
]);
const ARTWORK_SOURCE_SET = new Set<ArtworkSource>(['tmdb', 'fanart', 'cinemeta', 'omdb', 'random', 'blackbar']);
const EPISODE_ARTWORK_MODE_SET = new Set<EpisodeArtworkMode>(['still', 'series']);
const POSTER_IMAGE_SIZE_SET = new Set<PosterImageSize>(['normal', 'large', '4k']);
const BACKDROP_IMAGE_SIZE_SET = new Set<BackdropImageSize>(['normal', 'large', '4k']);
const RANDOM_POSTER_TEXT_MODE_SET = new Set<RandomPosterTextMode>(['any', 'text', 'textless']);
const RANDOM_POSTER_LANGUAGE_MODE_SET = new Set<RandomPosterLanguageMode>(['any', 'requested', 'fallback']);
const RANDOM_POSTER_FALLBACK_MODE_SET = new Set<RandomPosterFallbackMode>(['best', 'original']);

export const FALLBACK_IMAGE_LANGUAGE = 'en';
export const ALLOWED_IMAGE_TYPES = new Set(['poster', 'backdrop', 'logo']);
export const EXPLICIT_ID_SOURCE_SET = new Set(['imdb', 'tmdb', 'tvdb', 'mal', 'kitsu', 'anilist', 'anidb']);
export const RAW_IMDB_ID_RE = /^tt\d+(?::.+)?$/i;
export const ANIME_NATIVE_INPUT_ID_PREFIX_SET = new Set(['kitsu', 'mal', 'myanimelist', 'anilist', 'anidb']);
export const FANART_ARTWORK_SOURCE_SET = new Set<ArtworkSource>(['fanart', 'random']);
export const DEFAULT_POSTER_IMAGE_SIZE: PosterImageSize = 'normal';
export const DEFAULT_BACKDROP_IMAGE_SIZE: BackdropImageSize = 'normal';
export const DEFAULT_RANDOM_POSTER_TEXT_MODE: RandomPosterTextMode = 'any';
export const DEFAULT_RANDOM_POSTER_LANGUAGE_MODE: RandomPosterLanguageMode = 'any';
export const DEFAULT_RANDOM_POSTER_FALLBACK_MODE: RandomPosterFallbackMode = 'best';
export const POSTER_IMAGE_DIMENSIONS: Record<PosterImageSize, { width: number; height: number }> = {
  normal: { width: 580, height: 859 },
  large: { width: 1280, height: 1896 },
  '4k': { width: 2000, height: 2926 },
};
export const BACKDROP_IMAGE_DIMENSIONS: Record<BackdropImageSize, { width: number; height: number }> = {
  normal: { width: 1280, height: 720 },
  large: { width: 1920, height: 1080 },
  '4k': { width: 3840, height: 2160 },
};
export const DEFAULT_BLOCKBUSTER_DENSITY: BlockbusterDensity = 'balanced';
export const FINAL_IMAGE_RENDERER_CACHE_VERSION = 'poster-backdrop-logo-v100';
export const XRDB_REQUEST_API_KEYS = getConfiguredXrdbRequestKeys();
export const ANILIST_GRAPHQL_URL =
  process.env.XRDB_ANILIST_GRAPHQL_URL?.trim() || 'https://graphql.anilist.co';
export const MYANIMELIST_API_BASE_URL =
  process.env.XRDB_MAL_API_BASE_URL?.trim() || 'https://api.myanimelist.net/v2';
export const MYANIMELIST_CLIENT_ID =
  process.env.XRDB_MAL_CLIENT_ID?.trim() || process.env.MAL_CLIENT_ID?.trim() || '';
export const JIKAN_API_BASE_URL =
  process.env.XRDB_JIKAN_API_BASE_URL?.trim() || 'https://api.jikan.moe/v4';
export const TRAKT_API_BASE_URL =
  process.env.XRDB_TRAKT_API_BASE_URL?.trim() || 'https://api.trakt.tv';
export const TRAKT_CLIENT_ID =
  process.env.XRDB_TRAKT_CLIENT_ID?.trim() || process.env.TRAKT_CLIENT_ID?.trim() || '';
export const FANART_API_KEY =
  process.env.XRDB_FANART_API_KEY?.trim() || process.env.FANART_API_KEY?.trim() || '';
export const FANART_CLIENT_KEY =
  process.env.XRDB_FANART_CLIENT_KEY?.trim() || process.env.FANART_CLIENT_KEY?.trim() || '';
export const OMDB_API_KEY =
  process.env.XRDB_OMDB_API_KEY?.trim() ||
  process.env.OMDB_API_KEY?.trim() ||
  process.env.OMDB_KEY?.trim() ||
  '';
export const ANILIST_MEDIA_RATING_QUERY = `
  query XrdbAnimeRating($id: Int) {
    Media(id: $id, type: ANIME) {
      averageScore
      meanScore
    }
  }
`;

export const ANILIST_EPISODE_THUMBNAIL_QUERY = `
  query XrdbEpisodeThumbnail($id: Int) {
    Media(id: $id, type: ANIME) {
      streamingEpisodes {
        title
        thumbnail
      }
    }
  }
`;

export const parseApiKeyList = (...values: Array<string | undefined>) => {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    for (const candidate of (value || '').split(/[\s,;]+/)) {
      const normalized = candidate.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
};

export const normalizeArtworkSource = (
  value?: string | null,
  fallback: ArtworkSource = 'tmdb',
): ArtworkSource => {
  const normalized = (value || '').trim().toLowerCase();
  const canonical = normalized === 'imdb' ? 'cinemeta' : normalized;
  return ARTWORK_SOURCE_SET.has(canonical as ArtworkSource)
    ? (canonical as ArtworkSource)
    : fallback;
};

export const normalizeEpisodeArtworkMode = (
  value?: string | null,
  fallback: EpisodeArtworkMode = 'series',
): EpisodeArtworkMode => {
  const normalized = (value || '').trim().toLowerCase();
  return EPISODE_ARTWORK_MODE_SET.has(normalized as EpisodeArtworkMode)
    ? (normalized as EpisodeArtworkMode)
    : fallback;
};

export const normalizePosterImageSize = (
  value?: string | null,
  fallback: PosterImageSize = DEFAULT_POSTER_IMAGE_SIZE,
): PosterImageSize => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'default') return fallback;
  if (normalized === 'standard') return 'normal';
  if (normalized === 'verylarge') return '4k';
  if (normalized === 'uhd' || normalized === 'ultra' || normalized === '4k-slow' || normalized === '4kslow') {
    return '4k';
  }
  return POSTER_IMAGE_SIZE_SET.has(normalized as PosterImageSize)
    ? (normalized as PosterImageSize)
    : fallback;
};

export const normalizeBackdropImageSize = (
  value?: string | null,
  fallback: BackdropImageSize = DEFAULT_BACKDROP_IMAGE_SIZE,
): BackdropImageSize => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'default') return fallback;
  if (normalized === 'standard') return 'normal';
  if (normalized === 'verylarge') return '4k';
  if (normalized === 'uhd' || normalized === 'ultra' || normalized === '4k-slow' || normalized === '4kslow') {
    return '4k';
  }
  return BACKDROP_IMAGE_SIZE_SET.has(normalized as BackdropImageSize)
    ? (normalized as BackdropImageSize)
    : fallback;
};

export const normalizeRandomPosterTextMode = (
  value?: string | null,
  fallback: RandomPosterTextMode = DEFAULT_RANDOM_POSTER_TEXT_MODE,
): RandomPosterTextMode => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  return RANDOM_POSTER_TEXT_MODE_SET.has(normalized as RandomPosterTextMode)
    ? (normalized as RandomPosterTextMode)
    : fallback;
};

export const normalizeRandomPosterLanguageMode = (
  value?: string | null,
  fallback: RandomPosterLanguageMode = DEFAULT_RANDOM_POSTER_LANGUAGE_MODE,
): RandomPosterLanguageMode => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  return RANDOM_POSTER_LANGUAGE_MODE_SET.has(normalized as RandomPosterLanguageMode)
    ? (normalized as RandomPosterLanguageMode)
    : fallback;
};

export const normalizeRandomPosterFallbackMode = (
  value?: string | null,
  fallback: RandomPosterFallbackMode = DEFAULT_RANDOM_POSTER_FALLBACK_MODE,
): RandomPosterFallbackMode => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  return RANDOM_POSTER_FALLBACK_MODE_SET.has(normalized as RandomPosterFallbackMode)
    ? (normalized as RandomPosterFallbackMode)
    : fallback;
};

export const normalizeRandomPosterMinVoteCount = (
  value?: string | null,
): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, parsed);
};

export const normalizeRandomPosterMinVoteAverage = (
  value?: string | null,
): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number.parseFloat(String(value).trim());
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return 0;
  if (parsed > 10) return 10;
  return parsed;
};

export const normalizeRandomPosterMinDimension = (
  value?: string | null,
): number | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, parsed);
};

export const normalizeRpdbRatingBarPosition = (
  value?: string | null,
): RpdbRatingBarPosition | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'default') return 'bottom';
  if (normalized === 'center') return 'right-center';
  if (normalized === 'bottom') return 'bottom';
  if (
    normalized === 'top' ||
    normalized === 'right-bottom' ||
    normalized === 'right-center' ||
    normalized === 'right-top' ||
    normalized === 'left-bottom' ||
    normalized === 'left-center' ||
    normalized === 'left-top'
  ) {
    return normalized as RpdbRatingBarPosition;
  }
  return null;
};

export const resolveRpdbRatingBarPositionAliases = (
  value?: string | null,
): RpdbRatingBarPositionAliases => {
  const position = normalizeRpdbRatingBarPosition(value);
  if (!position) return {};
  if (position === 'bottom') {
    return {
      posterRatingsLayout: 'bottom',
    };
  }
  if (position === 'top') {
    return {
      posterRatingsLayout: 'top',
    };
  }
  const [layoutSide, verticalAnchor] = position.split('-') as [
    'left' | 'right',
    'bottom' | 'center' | 'top',
  ];
  const sideRatingsPosition =
    verticalAnchor === 'center'
      ? 'middle'
      : (verticalAnchor as Extract<SideRatingPosition, 'top' | 'bottom'>);
  return {
    posterRatingsLayout: layoutSide,
    backdropRatingsLayout: layoutSide === 'right' ? 'right-vertical' : undefined,
    sideRatingsPosition,
  };
};

export const normalizeRpdbFontScalePercent = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'default') return null;
  const parsed = Number(normalized.replace('%', ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const percentValue = normalized.includes('%') || parsed > 3 ? parsed : parsed * 100;
  return Math.round(percentValue);
};

export const normalizeBooleanSearchFlag = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return null;
};

export const toAnimeMappingProvider = (value?: string | null): AnimeMappingProvider | null => {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return null;
  const canonical = normalized === 'myanimelist' ? 'mal' : normalized;
  return ANIME_MAPPING_PROVIDER_SET.has(canonical as AnimeMappingProvider)
    ? (canonical as AnimeMappingProvider)
    : null;
};

export const parseCacheTtlMs = (
  value: string | undefined,
  fallbackMs: number,
  minMs: number,
  maxMs: number,
) => {
  if (!value) return fallbackMs;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMs;
  return Math.min(maxMs, Math.max(minMs, parsed));
};

export const parseNonNegativeInt = (value?: string | null, max = Number.MAX_SAFE_INTEGER) => {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.min(max, Math.floor(parsed));
};

export const normalizeOptionalBadgeCount = (value?: string | null) => {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.floor(parsed);
  if (normalized < 1) return null;
  return normalized;
};

export const normalizeBlockbusterDensity = (
  value?: string | null,
  fallback: BlockbusterDensity = DEFAULT_BLOCKBUSTER_DENSITY,
): BlockbusterDensity => {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'sparse' || normalized === 'balanced' || normalized === 'packed') {
    return normalized;
  }
  return fallback;
};

export const TMDB_CACHE_TTL_MS = parseCacheTtlMs(
  process.env.XRDB_TMDB_CACHE_TTL_MS,
  3 * 24 * 60 * 60 * 1000,
  10 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
);
export const MDBLIST_CACHE_TTL_MS = parseCacheTtlMs(
  process.env.XRDB_MDBLIST_CACHE_TTL_MS,
  3 * 24 * 60 * 60 * 1000,
  10 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
);
export const MDBLIST_OLD_MOVIE_CACHE_TTL_MS = parseCacheTtlMs(
  process.env.XRDB_MDBLIST_OLD_MOVIE_CACHE_TTL_MS,
  7 * 24 * 60 * 60 * 1000,
  60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
);
export const MDBLIST_OLD_MOVIE_AGE_DAYS = (() => {
  const rawValue = Number(process.env.XRDB_MDBLIST_OLD_MOVIE_AGE_DAYS);
  if (!Number.isFinite(rawValue) || rawValue <= 0) return 365;
  return Math.min(3650, Math.max(30, Math.floor(rawValue)));
})();
export const MDBLIST_RATE_LIMIT_COOLDOWN_MS = parseCacheTtlMs(
  process.env.XRDB_MDBLIST_RATE_LIMIT_COOLDOWN_MS,
  24 * 60 * 60 * 1000,
  30 * 1000,
  7 * 24 * 60 * 60 * 1000,
);
export const IMDB_DATASET_CACHE_TTL_MS = parseCacheTtlMs(
  process.env.XRDB_IMDB_DATASET_CACHE_TTL_MS,
  7 * 24 * 60 * 60 * 1000,
  60 * 60 * 1000,
  365 * 24 * 60 * 60 * 1000,
);
export const KITSU_CACHE_TTL_MS = parseCacheTtlMs(
  process.env.XRDB_KITSU_CACHE_TTL_MS,
  3 * 24 * 60 * 60 * 1000,
  10 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
);
export const OMDB_CACHE_TTL_MS = parseCacheTtlMs(
  process.env.XRDB_OMDB_CACHE_TTL_MS,
  3 * 24 * 60 * 60 * 1000,
  10 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
);
export const SIMKL_CACHE_TTL_MS = parseCacheTtlMs(
  process.env.XRDB_SIMKL_CACHE_TTL_MS,
  3 * 24 * 60 * 60 * 1000,
  10 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
);
export const SIMKL_ID_CACHE_TTL_MS = parseCacheTtlMs(
  process.env.XRDB_SIMKL_ID_CACHE_TTL_MS,
  180 * 24 * 60 * 60 * 1000,
  10 * 60 * 1000,
  365 * 24 * 60 * 60 * 1000,
);
export const SIMKL_ID_EMPTY_CACHE_TTL_MS = parseCacheTtlMs(
  process.env.XRDB_SIMKL_ID_EMPTY_CACHE_TTL_MS,
  24 * 60 * 60 * 1000,
  10 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
);
export const TORRENTIO_CACHE_TTL_MS = parseCacheTtlMs(
  process.env.XRDB_TORRENTIO_CACHE_TTL_MS,
  6 * 60 * 60 * 1000,
  10 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
);
export const TORRENTIO_RATE_LIMIT_COOLDOWN_MS = parseCacheTtlMs(
  process.env.XRDB_TORRENTIO_RATE_LIMIT_COOLDOWN_MS,
  15 * 60 * 1000,
  60 * 1000,
  24 * 60 * 60 * 1000,
);
export const TORRENTIO_CONCURRENCY = (() => {
  const rawValue = Number(process.env.XRDB_TORRENTIO_CONCURRENCY);
  if (!Number.isFinite(rawValue) || rawValue <= 0) return 2;
  return Math.max(1, Math.min(4, Math.floor(rawValue)));
})();
export const TORRENTIO_BASE_URL = resolveTorrentioBaseUrl(process.env.XRDB_TORRENTIO_BASE_URL);
export const TORRENTIO_PROXY_URL =
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.https_proxy ||
  process.env.http_proxy ||
  null;
export const TORRENTIO_DISPATCHER = TORRENTIO_PROXY_URL ? new ProxyAgent(TORRENTIO_PROXY_URL) : undefined;
export const PROVIDER_ICON_CACHE_TTL_MS = parseCacheTtlMs(
  process.env.XRDB_PROVIDER_ICON_CACHE_TTL_MS,
  7 * 24 * 60 * 60 * 1000,
  60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
);
export const FINAL_IMAGE_CACHE_MAX_ENTRIES = 300;
export const SOURCE_IMAGE_CACHE_MAX_ENTRIES = 128;
export const METADATA_CACHE_MAX_ENTRIES = 2000;
export const PROVIDER_ICON_CACHE_MAX_ENTRIES = 64;
export const PROVIDER_ICON_CACHE_VERSION = 'v3';
export const TMDB_ANIMATION_GENRE_ID = 16;
export const MDBLIST_API_KEYS = parseApiKeyList(
  process.env.MDBLIST_API_KEYS,
  process.env.MDBLIST_API_KEY,
);
export const SIMKL_CLIENT_ID =
  process.env.SIMKL_CLIENT_ID ||
  process.env.SIMKL_API_KEY ||
  process.env.XRDB_SIMKL_CLIENT_ID ||
  '';
