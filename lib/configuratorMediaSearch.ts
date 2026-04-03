export type MediaSearchPreviewType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';
export type TmdbSearchMediaType = 'movie' | 'tv';

export type MediaSearchItem = {
  tmdbId: number;
  mediaType: TmdbSearchMediaType;
  title: string;
  year: string;
  subtitle: string;
  mediaId: string;
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
    const mediaLabel = mediaType === 'movie' ? 'Movie' : 'Series';
    const subtitle = year ? `${mediaLabel} · ${year}` : mediaLabel;

    mapped.push({
      tmdbId: Math.trunc(tmdbId),
      mediaType,
      title,
      year,
      subtitle,
      mediaId: buildMediaIdForPreviewType(previewType, mediaType, Math.trunc(tmdbId)),
    });
  }

  return mapped;
};

export const MEDIA_TARGET_SAMPLE_IDS: Record<MediaSearchPreviewType, string[]> = {
  poster: ['tt0133093', 'tmdb:movie:27205', 'tmdb:movie:603', 'tmdb:movie:157336'],
  backdrop: ['tmdb:tv:1399', 'tmdb:movie:299534', 'tmdb:movie:603'],
  thumbnail: ['tt0944947:1:1', 'tmdb:tv:1399:1:1', 'tmdb:tv:1396:1:1'],
  logo: ['tmdb:movie:603', 'tmdb:tv:1399', 'tmdb:movie:299534'],
};
