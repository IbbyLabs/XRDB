import type { RatingPreference } from './ratingProviderCatalog.ts';

export const XRDBID_PREFIX = 'xrdbid';

export const THUMBNAIL_RATING_PREFERENCES = ['tmdb', 'imdb'] as const satisfies readonly RatingPreference[];
export type ThumbnailRatingPreference = (typeof THUMBNAIL_RATING_PREFERENCES)[number];

export type EpisodeIdMode = 'imdb' | 'tmdb' | 'xrdbid' | 'tvdb' | 'kitsu' | 'anilist' | 'mal' | 'anidb';

export const DEFAULT_EPISODE_ID_MODE: EpisodeIdMode = 'imdb';

export const EPISODE_SOURCE_PROVIDER_QUERY_KEYS = [
  'episodeSourceProvider',
  'episode_source_provider',
  'ep_provider',
] as const;

export const EPISODE_SOURCE_ID_QUERY_KEYS = [
  'episodeSourceId',
  'episode_source_id',
  'ep_id',
] as const;

export const EPISODE_SOURCE_SEASON_QUERY_KEYS = [
  'episodeSourceSeason',
  'episode_source_season',
  'ep_season',
] as const;

export const EPISODE_SOURCE_EPISODE_QUERY_KEYS = [
  'episodeSourceEpisode',
  'episode_source_episode',
  'ep_episode',
] as const;

export const EPISODE_ABSOLUTE_QUERY_KEYS = [
  'episodeAbsolute',
  'episode_absolute',
  'ep_absolute',
] as const;

export const EPISODE_SOURCE_KITSU_ID_QUERY_KEYS = [
  'episodeSourceKitsuId',
  'episode_source_kitsu_id',
] as const;

export const EPISODE_SOURCE_ANILIST_ID_QUERY_KEYS = [
  'episodeSourceAniListId',
  'episode_source_anilist_id',
] as const;

export const EPISODE_SOURCE_MAL_ID_QUERY_KEYS = [
  'episodeSourceMalId',
  'episode_source_mal_id',
] as const;

export const EPISODE_SOURCE_ANIDB_ID_QUERY_KEYS = [
  'episodeSourceAniDbId',
  'episode_source_anidb_id',
] as const;

export const EPISODE_SOURCE_TVDB_ID_QUERY_KEYS = [
  'episodeSourceTvdbId',
  'episode_source_tvdb_id',
] as const;

export const EPISODE_AUTHORITY_CANDIDATE_PROVIDERS = [
  'kitsu',
  'anilist',
  'mal',
  'anidb',
  'tvdb',
] as const;

export type EpisodeAuthorityCandidateProvider =
  (typeof EPISODE_AUTHORITY_CANDIDATE_PROVIDERS)[number];

export type EpisodeAuthorityCandidates = Partial<Record<EpisodeAuthorityCandidateProvider, string>>;

const EPISODE_ID_MODE_SET = new Set<EpisodeIdMode>([
  'imdb',
  'tmdb',
  'xrdbid',
  'tvdb',
  'kitsu',
  'anilist',
  'mal',
  'anidb',
]);
const THUMBNAIL_RATING_PREFERENCE_SET = new Set<RatingPreference>(THUMBNAIL_RATING_PREFERENCES);

export const normalizeEpisodeIdMode = (
  value: unknown,
  fallback: EpisodeIdMode = DEFAULT_EPISODE_ID_MODE,
): EpisodeIdMode => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return EPISODE_ID_MODE_SET.has(normalized as EpisodeIdMode)
    ? (normalized as EpisodeIdMode)
    : fallback;
};

export const isThumbnailRatingPreference = (
  value: RatingPreference,
): value is ThumbnailRatingPreference => THUMBNAIL_RATING_PREFERENCE_SET.has(value);

export const filterThumbnailRatingPreferences = (
  values: readonly RatingPreference[],
): ThumbnailRatingPreference[] => values.filter(isThumbnailRatingPreference);

const normalizeEpisodeNumber = (value: string | number) => {
  const raw = typeof value === 'number' ? String(Math.trunc(value)) : String(value || '').trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(1, Math.trunc(parsed));
};

const normalizeEpisodeHintValue = (value: string | null) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (trimmed.includes('{') || trimmed.includes('}')) return null;
  if (/^(unknown|null|undefined)$/i.test(trimmed)) return null;
  return trimmed;
};

const readFirstTrimmedSearchParam = (
  searchParams: URLSearchParams,
  keys: readonly string[],
) => {
  for (const key of keys) {
    const value = normalizeEpisodeHintValue(searchParams.get(key));
    if (value) {
      return value;
    }
  }
  return null;
};

export const parseEpisodeSourceHintSearchParams = (searchParams: URLSearchParams) => ({
  episodeSourceProviderValue: readFirstTrimmedSearchParam(
    searchParams,
    EPISODE_SOURCE_PROVIDER_QUERY_KEYS,
  ),
  episodeSourceId: readFirstTrimmedSearchParam(searchParams, EPISODE_SOURCE_ID_QUERY_KEYS),
  episodeSourceSeason: readFirstTrimmedSearchParam(searchParams, EPISODE_SOURCE_SEASON_QUERY_KEYS),
  episodeSourceEpisode: readFirstTrimmedSearchParam(searchParams, EPISODE_SOURCE_EPISODE_QUERY_KEYS),
  episodeAbsolute: readFirstTrimmedSearchParam(searchParams, EPISODE_ABSOLUTE_QUERY_KEYS),
  episodeAuthorityCandidates: {
    kitsu: readFirstTrimmedSearchParam(searchParams, EPISODE_SOURCE_KITSU_ID_QUERY_KEYS) || undefined,
    anilist: readFirstTrimmedSearchParam(searchParams, EPISODE_SOURCE_ANILIST_ID_QUERY_KEYS) || undefined,
    mal: readFirstTrimmedSearchParam(searchParams, EPISODE_SOURCE_MAL_ID_QUERY_KEYS) || undefined,
    anidb: readFirstTrimmedSearchParam(searchParams, EPISODE_SOURCE_ANIDB_ID_QUERY_KEYS) || undefined,
    tvdb: readFirstTrimmedSearchParam(searchParams, EPISODE_SOURCE_TVDB_ID_QUERY_KEYS) || undefined,
  } satisfies EpisodeAuthorityCandidates,
});

export const selectEpisodeAuthorityCandidate = (
  candidates: EpisodeAuthorityCandidates,
): { provider: EpisodeAuthorityCandidateProvider; externalId: string } | null => {
  for (const provider of EPISODE_AUTHORITY_CANDIDATE_PROVIDERS) {
    const externalId = candidates[provider];
    if (externalId) {
      return { provider, externalId };
    }
  }
  return null;
};

export const buildEpisodeToken = (seasonValue: string | number, episodeValue: string | number) => {
  const seasonNumber = normalizeEpisodeNumber(seasonValue);
  const episodeNumber = normalizeEpisodeNumber(episodeValue);
  if (!seasonNumber || !episodeNumber) return null;
  return `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
};

export type EpisodePreviewMediaTarget = {
  mediaId: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeToken: string;
};

const KITSU_PREFIX = 'kitsu';

export const parseEpisodePreviewMediaTarget = (value: string): EpisodePreviewMediaTarget | null => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith(`${KITSU_PREFIX}:`)) {
    const parts = trimmed.split(':').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 3) return null;
    const mediaIdValue = parts[1] || '';
    if (!mediaIdValue) return null;

    const mediaId = `${KITSU_PREFIX}:${mediaIdValue}`;
    let seasonNumber = 1;
    let episodeNumber = 0;
    if (parts.length >= 4) {
      const normalizedSeason = normalizeEpisodeNumber(parts[2]);
      const normalizedEpisode = normalizeEpisodeNumber(parts[3]);
      if (!normalizedSeason || !normalizedEpisode) return null;
      seasonNumber = normalizedSeason;
      episodeNumber = normalizedEpisode;
    } else {
      const normalizedEpisode = normalizeEpisodeNumber(parts[2]);
      if (!normalizedEpisode) return null;
      episodeNumber = normalizedEpisode;
    }
    const episodeToken = buildEpisodeToken(seasonNumber, episodeNumber);
    if (!episodeToken) return null;
    return { mediaId, seasonNumber, episodeNumber, episodeToken };
  }

  const parts = trimmed.split(':').map((part) => part.trim());
  if (parts.length < 3) return null;
  const seasonRaw = parts[parts.length - 2] || '';
  const episodeRaw = parts[parts.length - 1] || '';
  const mediaId = parts.slice(0, -2).join(':').trim();
  if (!mediaId) return null;

  const seasonNumber = normalizeEpisodeNumber(seasonRaw);
  const episodeNumber = normalizeEpisodeNumber(episodeRaw);
  if (!seasonNumber || !episodeNumber) return null;
  const episodeToken = buildEpisodeToken(seasonNumber, episodeNumber);
  if (!episodeToken) return null;
  return { mediaId, seasonNumber, episodeNumber, episodeToken };
};

export const buildEpisodePreviewMediaTarget = ({
  mediaId,
  seasonNumber,
  episodeNumber,
}: {
  mediaId: string;
  seasonNumber: string | number;
  episodeNumber: string | number;
}) => {
  const normalizedMediaId = String(mediaId || '').trim().replace(/:+$/, '');
  if (!normalizedMediaId) return null;
  const normalizedSeason = normalizeEpisodeNumber(seasonNumber);
  const normalizedEpisode = normalizeEpisodeNumber(episodeNumber);
  if (!normalizedSeason || !normalizedEpisode) return null;
  return `${normalizedMediaId}:${normalizedSeason}:${normalizedEpisode}`;
};

export const parseKitsuEpisodeInput = (parts: string[]) => {
  const mediaId = String(parts[1] || '').trim();
  if (parts.length >= 4) {
    return {
      mediaId,
      season: null,
      episode: String(parts[3] || '').trim() || null,
    };
  }

  return {
    mediaId,
    season: null,
    episode: String(parts[2] || '').trim() || null,
  };
};

export const buildEpisodeScopedXrdbId = ({
  baseXrdbId,
  seasonNumber,
  episodeNumber,
}: {
  baseXrdbId: string;
  seasonNumber: number;
  episodeNumber: number;
}) => {
  const normalizedBaseId = String(baseXrdbId || '').trim();
  if (!normalizedBaseId) return null;

  if (normalizedBaseId.toLowerCase().startsWith('kitsu:')) {
    return `${normalizedBaseId}:${episodeNumber}`;
  }

  return `${normalizedBaseId}:${seasonNumber}:${episodeNumber}`;
};

export const buildEpisodePatternBaseId = (mode: EpisodeIdMode) => {
  if (mode === 'xrdbid') {
    return `${XRDBID_PREFIX}:{imdb_id}`;
  }
  if (mode === 'tmdb') {
    return 'tmdb:{tmdb_id}';
  }
  if (mode === 'tvdb') {
    return 'tvdb:{tvdb_id}';
  }
  if (mode === 'kitsu') {
    return 'kitsu:{kitsu_id}';
  }
  if (mode === 'anilist') {
    return 'anilist:{anilist_id}';
  }
  if (mode === 'mal') {
    return 'mal:{mal_id}';
  }
  if (mode === 'anidb') {
    return 'anidb:{anidb_id}';
  }
  return '{imdb_id}';
};

export const buildEpisodePatternToken = (mode: EpisodeIdMode) => {
  return 'S{season}E{episode}';
};

export const applyEpisodeIdModeToXrdbId = (
  normalizedXrdbId: string,
  mode: EpisodeIdMode,
  mediaType?: 'movie' | 'tv' | null,
) => {
  const trimmed = String(normalizedXrdbId || '').trim();
  if (!trimmed) return null;
  if (mediaType === 'movie') return trimmed;
  if (mode === 'imdb') return trimmed;

  if (mode === 'xrdbid' && /^tt\d+$/i.test(trimmed)) {
    return `${XRDBID_PREFIX}:${trimmed}`;
  }

  const prefix = trimmed.split(':')[0]?.trim().toLowerCase() || '';
  if (mode === 'tmdb' && prefix !== 'tmdb') {
    const numericId = trimmed.replace(/^tmdb:/i, '');
    return `tmdb:${numericId}`;
  }
  if (mode === 'tmdb') return trimmed;
  if (mode === 'tvdb' && prefix === 'tvdb') return trimmed;
  if (mode === 'kitsu' && prefix === 'kitsu') return trimmed;
  if (mode === 'anilist' && prefix === 'anilist') return trimmed;
  if (mode === 'mal' && prefix === 'mal') return trimmed;
  if (mode === 'anidb' && prefix === 'anidb') return trimmed;

  return trimmed;
};
