import { TMDB_API_BASE_URL } from './serviceBaseUrls.ts';

export type MediaSearchPreviewType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';
export type TmdbSearchMediaType = 'movie' | 'tv';
export type MediaSearchSource = 'tmdb' | 'imdb';
type OmdbSearchMediaType = 'movie' | 'series';

export type MediaSearchItem = {
  source: MediaSearchSource;
  mediaType: TmdbSearchMediaType;
  title: string;
  year: string;
  subtitle: string;
  mediaId: string;
  posterUrl?: string;
  tmdbId?: number;
  imdbId?: string;
};

export const isMediaSearchPreviewType = (value: unknown): value is MediaSearchPreviewType =>
  value === 'poster' || value === 'backdrop' || value === 'thumbnail' || value === 'logo';

const normalizeYear = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const year = trimmed.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : '';
};

const normalizeTitle = (result: Record<string, unknown>, mediaType: TmdbSearchMediaType) => {
  const primary =
    mediaType === 'movie'
      ? String(result.title || result.original_title || '').trim()
      : String(result.name || result.original_name || '').trim();
  return primary;
};

const normalizeImdbId = (value: unknown) => {
  const normalized = String(value || '').trim();
  return /^tt\d+$/i.test(normalized) ? normalized.toLowerCase() : '';
};

const normalizeOmdbType = (value: unknown): OmdbSearchMediaType | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'movie' || normalized === 'series') {
    return normalized as OmdbSearchMediaType;
  }
  return null;
};

const normalizeTmdbPosterPath = (value: unknown) => {
  const normalized = String(value || '').trim();
  return normalized.startsWith('/') ? normalized : '';
};

const buildTmdbPosterUrl = (posterPath: string, size = 'w154') => {
  if (!posterPath) return '';
  return `https://image.tmdb.org/t/p/${size}${posterPath}`;
};

const normalizeOmdbPosterUrl = (value: unknown) => {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.toUpperCase() === 'N/A') {
    return '';
  }
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
};

const buildSubtitle = ({
  mediaType,
  year,
  source,
}: {
  mediaType: TmdbSearchMediaType;
  year: string;
  source: MediaSearchSource;
}) => {
  const mediaLabel = mediaType === 'movie' ? 'Movie' : 'Series';
  const sourceLabel = source === 'imdb' ? 'IMDb' : 'TMDB';
  return year ? `${mediaLabel} · ${year} · ${sourceLabel}` : `${mediaLabel} · ${sourceLabel}`;
};

export const buildMediaIdForPreviewType = (
  previewType: MediaSearchPreviewType,
  mediaType: TmdbSearchMediaType,
  tmdbId: number,
) => {
  if (previewType === 'thumbnail') {
    return `tmdb:tv:${tmdbId}:1:1`;
  }
  return mediaType === 'tv' ? `tmdb:tv:${tmdbId}` : `tmdb:movie:${tmdbId}`;
};

export const buildImdbMediaIdForPreviewType = (
  previewType: MediaSearchPreviewType,
  imdbId: string,
) => {
  const normalizedImdbId = normalizeImdbId(imdbId);
  if (!normalizedImdbId) return '';
  if (previewType === 'thumbnail') {
    return `imdb:${normalizedImdbId}:1:1`;
  }
  return `imdb:${normalizedImdbId}`;
};

export const buildTmdbMultiSearchUrl = ({
  tmdbKey,
  query,
  language,
  includeAdult = false,
  page = 1,
  apiBaseUrl = TMDB_API_BASE_URL,
}: {
  tmdbKey: string;
  query: string;
  language: string;
  includeAdult?: boolean;
  page?: number;
  apiBaseUrl?: string;
}) => {
  const target = new URL('search/multi', `${String(apiBaseUrl || '').replace(/\/+$/, '')}/`);
  target.searchParams.set('api_key', tmdbKey);
  target.searchParams.set('query', query);
  target.searchParams.set('include_adult', includeAdult ? 'true' : 'false');
  target.searchParams.set('language', language);
  target.searchParams.set('page', String(page));
  return target.toString();
};

export const mapTmdbSearchResultsForPreviewType = ({
  results,
  previewType,
  limit = 8,
}: {
  results: unknown[];
  previewType: MediaSearchPreviewType;
  limit?: number;
}): MediaSearchItem[] => {
  const mapped: MediaSearchItem[] = [];

  for (const entry of results) {
    if (mapped.length >= limit) break;
    if (!entry || typeof entry !== 'object') continue;
    const result = entry as Record<string, unknown>;
    const mediaTypeRaw = String(result.media_type || '').trim().toLowerCase();
    if (mediaTypeRaw !== 'movie' && mediaTypeRaw !== 'tv') continue;
    const mediaType = mediaTypeRaw as TmdbSearchMediaType;
    if (previewType === 'thumbnail' && mediaType !== 'tv') continue;

    const tmdbId = Number(result.id);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
    const title = normalizeTitle(result, mediaType);
    if (!title) continue;
    const year = normalizeYear(
      mediaType === 'movie' ? result.release_date : result.first_air_date,
    );
    const posterPath = normalizeTmdbPosterPath(result.poster_path);

    mapped.push({
      source: 'tmdb',
      tmdbId: Math.trunc(tmdbId),
      mediaType,
      title,
      year,
      subtitle: buildSubtitle({ mediaType, year, source: 'tmdb' }),
      mediaId: buildMediaIdForPreviewType(previewType, mediaType, Math.trunc(tmdbId)),
      posterUrl: buildTmdbPosterUrl(posterPath),
    });
  }

  return mapped;
};

export const mapOmdbSearchResultsForPreviewType = ({
  results,
  previewType,
  limit = 8,
}: {
  results: unknown[];
  previewType: MediaSearchPreviewType;
  limit?: number;
}): MediaSearchItem[] => {
  const mapped: MediaSearchItem[] = [];

  for (const entry of results) {
    if (mapped.length >= limit) break;
    if (!entry || typeof entry !== 'object') continue;
    const result = entry as Record<string, unknown>;
    const omdbType = normalizeOmdbType(result.Type);
    if (!omdbType) continue;
    if (previewType === 'thumbnail' && omdbType !== 'series') continue;

    const imdbId = normalizeImdbId(result.imdbID);
    if (!imdbId) continue;
    const mediaId = buildImdbMediaIdForPreviewType(previewType, imdbId);
    if (!mediaId) continue;

    const mediaType: TmdbSearchMediaType = omdbType === 'series' ? 'tv' : 'movie';
    const title = String(result.Title || '').trim();
    if (!title) continue;
    const year = normalizeYear(result.Year);

    mapped.push({
      source: 'imdb',
      mediaType,
      title,
      year,
      subtitle: buildSubtitle({ mediaType, year, source: 'imdb' }),
      mediaId,
      posterUrl: normalizeOmdbPosterUrl(result.Poster),
      imdbId,
    });
  }

  return mapped;
};

export type PinnedTarget = { mediaId: string; title: string };
export type PinnedTargetsStore = Record<MediaSearchPreviewType, PinnedTarget[]>;

export const PINNED_TARGETS_STORAGE_KEY = 'xrdb.pinnedTargets.v1';
export const PINNED_TARGETS_MAX_PER_TYPE = 8;

export const MEDIA_TARGET_SAMPLE_IDS: Record<MediaSearchPreviewType, string[]> = {
  poster: [
    'tt0133093',
    'tmdb:movie:27205',
    'tmdb:movie:157336',
    'tmdb:movie:335787',
    'tmdb:movie:550',
    'tmdb:movie:680',
    'tmdb:tv:1399',
    'tmdb:tv:1396',
    'tmdb:tv:1429',
    'tmdb:tv:85937',
  ],
  backdrop: [
    'tmdb:movie:299534',
    'tmdb:movie:603',
    'tmdb:movie:438631',
    'tmdb:movie:157336',
    'tmdb:tv:1399',
    'tmdb:tv:94997',
    'tmdb:tv:1396',
    'tmdb:tv:1429',
    'tmdb:tv:85937',
    'tmdb:tv:95479',
  ],
  thumbnail: [
    'tt0944947:1:1',
    'tmdb:tv:1399:1:1',
    'tmdb:tv:1396:1:1',
    'tmdb:tv:94997:1:1',
    'tmdb:tv:66732:1:1',
    'tmdb:tv:1429:1:1',
    'tmdb:tv:85937:1:1',
    'tmdb:tv:95479:1:1',
    'tmdb:tv:37854:1:1',
    'tmdb:tv:75603:1:1',
  ],
  logo: [
    'tmdb:movie:603',
    'tmdb:tv:1399',
    'tmdb:movie:299534',
    'tmdb:movie:27205',
    'tmdb:tv:1396',
    'tmdb:movie:438631',
    'tmdb:movie:157336',
    'tmdb:tv:1429',
    'tmdb:tv:85937',
    'tmdb:tv:37854',
  ],
};

export const pickShuffledMediaTarget = ({
  previewType,
  currentMediaId,
  pinnedTargets,
  randomValue = Math.random(),
}: {
  previewType: MediaSearchPreviewType;
  currentMediaId: string;
  pinnedTargets?: PinnedTarget[];
  randomValue?: number;
}) => {
  const builtInSamples = MEDIA_TARGET_SAMPLE_IDS[previewType];
  const pinnedIds = pinnedTargets ? pinnedTargets.map((p) => p.mediaId) : [];
  const seen = new Set<string>();
  const samples: string[] = [];
  for (const id of [...builtInSamples, ...pinnedIds]) {
    const key = id.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    samples.push(id);
  }
  if (samples.length === 0) {
    return '';
  }

  const normalizedCurrent = String(currentMediaId || '').trim().toLowerCase();
  const alternateSamples = samples.filter(
    (sample) => sample.trim().toLowerCase() !== normalizedCurrent,
  );
  const candidateSamples = alternateSamples.length > 0 ? alternateSamples : samples;
  const boundedRandom =
    Number.isFinite(randomValue) && randomValue >= 0 && randomValue < 1
      ? randomValue
      : Math.random();
  const randomIndex = Math.floor(boundedRandom * candidateSamples.length);
  return candidateSamples[randomIndex] || candidateSamples[0] || '';
};

const EMPTY_PINNED_STORE: PinnedTargetsStore = {
  poster: [],
  backdrop: [],
  thumbnail: [],
  logo: [],
};

export const readPinnedTargetsFromStorage = (): PinnedTargetsStore => {
  try {
    const raw = localStorage.getItem(PINNED_TARGETS_STORAGE_KEY);
    if (!raw) return { ...EMPTY_PINNED_STORE };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_PINNED_STORE };
    const store = parsed as Record<string, unknown>;
    const result: PinnedTargetsStore = { ...EMPTY_PINNED_STORE };
    for (const key of ['poster', 'backdrop', 'thumbnail', 'logo'] as const) {
      const arr = store[key];
      if (!Array.isArray(arr)) continue;
      result[key] = arr
        .filter(
          (entry): entry is PinnedTarget =>
            !!entry &&
            typeof entry === 'object' &&
            typeof (entry as Record<string, unknown>).mediaId === 'string' &&
            typeof (entry as Record<string, unknown>).title === 'string',
        )
        .slice(0, PINNED_TARGETS_MAX_PER_TYPE);
    }
    return result;
  } catch {
    return { ...EMPTY_PINNED_STORE };
  }
};

export const writePinnedTargetsToStorage = (store: PinnedTargetsStore): void => {
  try {
    localStorage.setItem(PINNED_TARGETS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // silent — localStorage may be full or unavailable
  }
};

export const isBuiltInSample = (mediaId: string): boolean => {
  const normalized = String(mediaId || '').trim().toLowerCase();
  if (!normalized) return false;
  for (const ids of Object.values(MEDIA_TARGET_SAMPLE_IDS)) {
    if (ids.some((id) => id.trim().toLowerCase() === normalized)) return true;
  }
  return false;
};
