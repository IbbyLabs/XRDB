import type { RatingPreference } from './ratingProviderCatalog.ts';

export const XRDBID_PREFIX = 'xrdbid';

export const THUMBNAIL_RATING_PREFERENCES = ['tmdb', 'imdb'] as const satisfies readonly RatingPreference[];
export type ThumbnailRatingPreference = (typeof THUMBNAIL_RATING_PREFERENCES)[number];

export type EpisodeIdMode = 'imdb' | 'xrdbid' | 'tvdb' | 'kitsu' | 'anilist' | 'mal' | 'anidb';

export const DEFAULT_EPISODE_ID_MODE: EpisodeIdMode = 'imdb';

const EPISODE_ID_MODE_SET = new Set<EpisodeIdMode>([
  'imdb',
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
  if (mode === 'tvdb' && prefix === 'tvdb') return trimmed;
  if (mode === 'kitsu' && prefix === 'kitsu') return trimmed;
  if (mode === 'anilist' && prefix === 'anilist') return trimmed;
  if (mode === 'mal' && prefix === 'mal') return trimmed;
  if (mode === 'anidb' && prefix === 'anidb') return trimmed;

  return trimmed;
};
