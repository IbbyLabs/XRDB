import type { CachedJsonResponse, PhaseDurations } from './imageRouteRuntime.ts';
import { normalizeRatingValue } from './imageRouteMedia.ts';
import { buildGeneratedLogoDataUrl } from './imageRouteText.ts';
import { fetchKitsuAnimeAttributes } from './imageRouteAnimeRatings.ts';

type KitsuFallbackJsonFetch = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
) => Promise<CachedJsonResponse>;

export const pickKitsuImageUrl = (image: any) => {
  const candidates = [
    image?.original,
    image?.large,
    image?.medium,
    image?.small,
    image?.tiny,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim();
    if (normalized) return normalized;
  }

  return null;
};

export const normalizeKitsuTitleCandidate = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || null;
};

export const pickKitsuOriginalTitle = (attributes: any) => {
  const titles = attributes?.titles;
  const candidates = [
    titles?.en_jp,
    attributes?.canonicalTitle,
    titles?.ja_jp,
    titles?.en,
    titles?.en_us,
    typeof attributes?.slug === 'string' ? attributes.slug.replace(/-/g, ' ') : null,
  ];

  if (titles && typeof titles === 'object') {
    candidates.push(...Object.values(titles));
  }

  for (const candidate of candidates) {
    const normalized = normalizeKitsuTitleCandidate(candidate);
    if (normalized) return normalized;
  }

  return null;
};

export const pickPosterTitleFromMedia = (
  media: any,
  mediaType: 'movie' | 'tv' | null,
  fallbackTitle?: string | null
) => {
  const candidates = [
    mediaType === 'movie' ? media?.title : mediaType === 'tv' ? media?.name : null,
    mediaType === 'movie' ? media?.original_title : mediaType === 'tv' ? media?.original_name : null,
    media?.title,
    media?.name,
    media?.original_title,
    media?.original_name,
    fallbackTitle,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.replace(/\s+/g, ' ').trim();
    if (normalized) return normalized;
  }
  return null;
};

export const fetchKitsuFallbackAsset = async (
  kitsuId: string,
  imageType: 'poster' | 'backdrop' | 'logo',
  phases: PhaseDurations,
  fetchJsonCached: KitsuFallbackJsonFetch,
) => {
  const normalizedKitsuId = String(kitsuId || '').trim();
  if (!normalizedKitsuId) return null;

  const attributes = await fetchKitsuAnimeAttributes(normalizedKitsuId, phases, fetchJsonCached);
  if (!attributes) return null;

  const posterUrl = pickKitsuImageUrl(attributes?.posterImage);
  const coverUrl = pickKitsuImageUrl(attributes?.coverImage);
  const rating = normalizeRatingValue(attributes?.averageRating);
  const originalTitle = pickKitsuOriginalTitle(attributes);

  if (imageType === 'logo' && originalTitle) {
    const generatedLogo = buildGeneratedLogoDataUrl(originalTitle);
    return {
      imageUrl: generatedLogo.dataUrl,
      rating,
      title: originalTitle,
      logoAspectRatio: generatedLogo.aspectRatio,
    };
  }

  if (imageType === 'poster') {
    return {
      imageUrl: posterUrl || coverUrl,
      rating,
      title: originalTitle,
      logoAspectRatio: null,
    };
  }

  if (imageType === 'backdrop') {
    return {
      imageUrl: coverUrl || posterUrl,
      rating,
      title: originalTitle,
      logoAspectRatio: null,
    };
  }

  return {
    imageUrl: posterUrl || coverUrl,
    rating,
    title: originalTitle,
    logoAspectRatio: null,
  };
};
