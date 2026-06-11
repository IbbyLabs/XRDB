import type { CachedJsonResponse, PhaseDurations } from './imageRouteRuntime.ts';
import { normalizeRatingValue } from './imageRouteMedia.ts';
import { buildGeneratedLogoDataUrl } from './imageRouteText.ts';
import { fetchKitsuAnimeAttributes } from './imageRouteAnimeRatings.ts';
import {
  ANILIST_GRAPHQL_URL,
  JIKAN_API_BASE_URL,
  KITSU_CACHE_TTL_MS,
  MYANIMELIST_API_BASE_URL,
  MYANIMELIST_CLIENT_ID,
} from './imageRouteConfig.ts';
import { sha1Hex } from './imageRouteRuntime.ts';
import { normalizeMalId } from './animeMappingPayload.ts';
import { BROWSER_LIKE_USER_AGENT } from './imageRouteExternalRatings.ts';

type KitsuFallbackJsonFetch = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
) => Promise<CachedJsonResponse>;

type FallbackAsset = {
  imageUrl: string | null;
  rating: string | null;
  title: string | null;
  logoAspectRatio: number | null;
};

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

const pickMyAnimeListImageUrl = (picture: any) =>
  pickKitsuImageUrl({
    original: picture?.large,
    large: picture?.large,
    medium: picture?.medium,
    small: picture?.medium,
  });

const pickJikanImageUrl = (images: any) =>
  pickKitsuImageUrl({
    original: images?.jpg?.large_image_url || images?.webp?.large_image_url,
    large: images?.jpg?.image_url || images?.webp?.image_url,
    medium: images?.jpg?.small_image_url || images?.webp?.small_image_url,
    small: images?.jpg?.image_url || images?.webp?.image_url,
  });

const pickAniListCoverImageUrl = (coverImage: any) =>
  pickKitsuImageUrl({
    original: coverImage?.extraLarge,
    large: coverImage?.large,
    medium: coverImage?.medium,
    small: coverImage?.medium,
  });

const pickAniListTitle = (media: any) => {
  const title = media?.title;
  return (
    normalizeKitsuTitleCandidate(title?.english) ||
    normalizeKitsuTitleCandidate(title?.romaji) ||
    normalizeKitsuTitleCandidate(title?.native) ||
    null
  );
};

const toLogoAwareFallbackAsset = ({
  imageType,
  posterUrl,
  backdropUrl,
  title,
  rating,
}: {
  imageType: 'poster' | 'backdrop' | 'logo';
  posterUrl: string | null;
  backdropUrl: string | null;
  title: string | null;
  rating: string | null;
}): FallbackAsset => {
  if (imageType === 'logo' && title) {
    const generatedLogo = buildGeneratedLogoDataUrl(title);
    return {
      imageUrl: generatedLogo.dataUrl,
      rating,
      title,
      logoAspectRatio: generatedLogo.aspectRatio,
    };
  }

  if (imageType === 'backdrop') {
    return {
      imageUrl: backdropUrl || posterUrl,
      rating,
      title,
      logoAspectRatio: null,
    };
  }

  return {
    imageUrl: posterUrl || backdropUrl,
    rating,
    title,
    logoAspectRatio: null,
  };
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

export const fetchMyAnimeListFallbackAsset = async (
  malId: string,
  imageType: 'poster' | 'backdrop' | 'logo',
  phases: PhaseDurations,
  fetchJsonCached: KitsuFallbackJsonFetch,
) => {
  const normalizedMalId = normalizeMalId(malId);
  if (!normalizedMalId) return null;

  let title: string | null = null;
  let posterUrl: string | null = null;
  let rating: string | null = null;

  if (MYANIMELIST_CLIENT_ID) {
    try {
      const malResponse = await fetchJsonCached(
        `mal:anime:${normalizedMalId}:details:${sha1Hex(MYANIMELIST_CLIENT_ID)}`,
        `${MYANIMELIST_API_BASE_URL}/anime/${encodeURIComponent(normalizedMalId)}?fields=title,mean,main_picture`,
        KITSU_CACHE_TTL_MS,
        phases,
        'mdb',
        {
          headers: {
            accept: 'application/json',
            'X-MAL-CLIENT-ID': MYANIMELIST_CLIENT_ID,
            'User-Agent': BROWSER_LIKE_USER_AGENT,
          },
        }
      );
      if (malResponse.ok) {
        title = normalizeKitsuTitleCandidate(malResponse.data?.title);
        posterUrl = pickMyAnimeListImageUrl(malResponse.data?.main_picture);
        rating = normalizeRatingValue(malResponse.data?.mean);
      }
    } catch {
      // Fall back to Jikan below.
    }
  }

  if (!posterUrl || !rating || !title) {
    try {
      const jikanResponse = await fetchJsonCached(
        `jikan:anime:${normalizedMalId}:details`,
        `${JIKAN_API_BASE_URL}/anime/${encodeURIComponent(normalizedMalId)}`,
        KITSU_CACHE_TTL_MS,
        phases,
        'mdb',
        {
          headers: {
            accept: 'application/json',
            'User-Agent': BROWSER_LIKE_USER_AGENT,
          },
        }
      );
      if (jikanResponse.ok) {
        const payload = jikanResponse.data?.data || {};
        title =
          title ||
          normalizeKitsuTitleCandidate(payload.title_english) ||
          normalizeKitsuTitleCandidate(payload.title) ||
          normalizeKitsuTitleCandidate(payload.title_japanese);
        posterUrl = posterUrl || pickJikanImageUrl(payload.images);
        rating = rating || normalizeRatingValue(payload.score);
      }
    } catch {
      // Ignore network errors and return null below.
    }
  }

  const fallbackAsset = toLogoAwareFallbackAsset({
    imageType,
    posterUrl,
    backdropUrl: posterUrl,
    title,
    rating,
  });
  return fallbackAsset.imageUrl ? fallbackAsset : null;
};

const ANILIST_FALLBACK_DETAILS_QUERY = `
  query XrdbAnimeFallbackDetails($id: Int) {
    Media(id: $id, type: ANIME) {
      title {
        romaji
        english
        native
      }
      averageScore
      meanScore
      coverImage {
        extraLarge
        large
        medium
      }
      bannerImage
    }
  }
`;

export const fetchAniListFallbackAsset = async (
  aniListId: string,
  imageType: 'poster' | 'backdrop' | 'logo',
  phases: PhaseDurations,
  fetchJsonCached: KitsuFallbackJsonFetch,
) => {
  const rawAniListId = String(aniListId || '').trim();
  const normalizedAniListId = rawAniListId.toLowerCase().startsWith('anilist:')
    ? rawAniListId.split(':').slice(1).join(':').trim()
    : rawAniListId;
  const parsedAniListId = Number.parseInt(normalizedAniListId, 10);
  if (!Number.isFinite(parsedAniListId) || parsedAniListId <= 0) return null;

  try {
    const anilistResponse = await fetchJsonCached(
      `anilist:anime:${parsedAniListId}:details`,
      ANILIST_GRAPHQL_URL,
      KITSU_CACHE_TTL_MS,
      phases,
      'mdb',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'User-Agent': BROWSER_LIKE_USER_AGENT,
        },
        body: JSON.stringify({
          query: ANILIST_FALLBACK_DETAILS_QUERY,
          variables: { id: parsedAniListId },
        }),
      }
    );
    if (!anilistResponse.ok || anilistResponse.data?.errors) return null;

    const media = anilistResponse.data?.data?.Media || null;
    if (!media) return null;

    const title = pickAniListTitle(media);
    const posterUrl = pickAniListCoverImageUrl(media.coverImage);
    const backdropUrl = normalizeKitsuTitleCandidate(media.bannerImage) || posterUrl;
    const rating = normalizeRatingValue(media.averageScore ?? media.meanScore);
    const fallbackAsset = toLogoAwareFallbackAsset({
      imageType,
      posterUrl,
      backdropUrl,
      title,
      rating,
    });
    return fallbackAsset.imageUrl ? fallbackAsset : null;
  } catch {
    return null;
  }
};
