import { formatRatingNumber } from './ratingDisplay.ts';
import {
  normalizeRatingPreference,
  type RatingPreference,
} from './ratingProviderCatalog.ts';
import { TMDB_ANIMATION_GENRE_ID } from './imageRouteConfig.ts';

export type OutputFormat = 'png' | 'jpeg' | 'webp';

export const shouldRenderRatingValue = (value: string | null | undefined) => {
  if (!value) return false;
  const normalized = value.trim();
  if (!normalized) return false;
  if (normalized.toUpperCase() === 'N/A') return false;

  const numericCandidate = normalized
    .replace('%', '')
    .split('/')[0]
    .replace(',', '.')
    .trim();
  const numericValue = Number(numericCandidate);
  if (!Number.isNaN(numericValue) && numericValue === 0) return false;

  return true;
};

export const pickOutputFormat = (
  imageType: 'poster' | 'backdrop' | 'logo',
  acceptHeader?: string | null,
): OutputFormat => {
  if (imageType === 'logo') return 'png';
  const accept = (acceptHeader || '').toLowerCase();
  return accept.includes('image/webp') ? 'webp' : 'jpeg';
};

export const outputFormatToContentType = (format: OutputFormat) => {
  if (format === 'webp') return 'image/webp';
  if (format === 'jpeg') return 'image/jpeg';
  return 'image/png';
};

export const outputFormatToExtension = (format: OutputFormat) => {
  if (format === 'webp') return 'webp';
  if (format === 'jpeg') return 'jpg';
  return 'png';
};

export const isTmdbAnimationTitle = (media: any) => {
  const genreIds = Array.isArray(media?.genre_ids) ? media.genre_ids : [];
  if (genreIds.some((genreId: any) => Number(genreId) === TMDB_ANIMATION_GENRE_ID)) {
    return true;
  }

  const genres = Array.isArray(media?.genres) ? media.genres : [];
  return genres.some((genre: any) => {
    if (Number(genre?.id) === TMDB_ANIMATION_GENRE_ID) {
      return true;
    }

    return String(genre?.name || '').trim().toLowerCase() === 'animation';
  });
};

export const normalizeRatingValue = (value: unknown): string | null => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return formatRatingNumber(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const normalized = Number(trimmed.replace(',', '.'));
    if (!Number.isNaN(normalized) && Number.isFinite(normalized)) {
      return formatRatingNumber(normalized);
    }
  }

  if (value && typeof value === 'object') {
    const nested = value as { value?: unknown; rating?: unknown; score?: unknown };
    return normalizeRatingValue(nested.value ?? nested.rating ?? nested.score);
  }

  return null;
};

export const isNegativeRatingValue = (value: string | null | undefined) => {
  if (!value) return false;
  const numericCandidate = value
    .replace('%', '')
    .split('/')[0]
    .replace(',', '.')
    .trim();
  const numericValue = Number(numericCandidate);
  return !Number.isNaN(numericValue) && numericValue < 0;
};

export const collectMDBListRatings = (payload: any) => {
  const result = new Map<RatingPreference, string>();
  const items = payload?.ratings;
  if (!Array.isArray(items)) {
    const directMdbListScore = normalizeRatingValue(
      payload?.score ?? payload?.mdblist_score ?? payload?.mdblist ?? null,
    );
    if (directMdbListScore && !isNegativeRatingValue(directMdbListScore)) {
      result.set('mdblist', directMdbListScore);
    }
    return result;
  }

  for (const item of items) {
    const sourceRaw = String(item?.source || item?.name || item?.provider || '');
    const source = normalizeRatingPreference(sourceRaw);
    if (!source || result.has(source)) continue;
    const rating = normalizeRatingValue(item?.value ?? item?.rating ?? item?.score);
    if (rating && !(source === 'mdblist' && isNegativeRatingValue(rating))) {
      result.set(source, rating);
    }
  }

  if (!result.has('mdblist')) {
    const directMdbListScore = normalizeRatingValue(
      payload?.score ?? payload?.mdblist_score ?? payload?.mdblist ?? null,
    );
    if (directMdbListScore && !isNegativeRatingValue(directMdbListScore)) {
      result.set('mdblist', directMdbListScore);
    }
  }

  return result;
};
