export type AnimeImageType = 'poster' | 'backdrop' | 'logo';
export type ReverseMappedAnimeMediaType = 'tv' | 'movie';
export type KitsuFallbackAsset = {
  imageUrl: string | null;
  rating: string | null;
  title: string | null;
  logoAspectRatio: number | null;
};

export type ReverseMappedAnimeImageTarget =
  | {
      kind: 'tmdb';
      tmdbId: string;
      mediaType: ReverseMappedAnimeMediaType;
      media: any;
    }
  | {
      kind: 'kitsu-fallback';
      tmdbId: string | null;
      kitsuId: string;
      fallbackAsset: KitsuFallbackAsset;
    }
  | {
      kind: 'not-found';
      tmdbId: string | null;
      kitsuId: string | null;
    };

export const resolveReverseMappedAnimeImageTarget = async ({
  imageType,
  fetchTmdbId,
  fetchKitsuId,
  fetchTmdbMedia,
  fetchKitsuFallbackAsset,
}: {
  imageType: AnimeImageType;
  fetchTmdbId: () => Promise<string | null>;
  fetchKitsuId: () => Promise<string | null>;
  fetchTmdbMedia: (tmdbId: string, mediaType: ReverseMappedAnimeMediaType) => Promise<any | null>;
  fetchKitsuFallbackAsset: (kitsuId: string, imageType: AnimeImageType) => Promise<KitsuFallbackAsset | null>;
}): Promise<ReverseMappedAnimeImageTarget> => {
  const resolveKitsuFallback = async (tmdbId: string | null): Promise<ReverseMappedAnimeImageTarget> => {
    const kitsuId = await fetchKitsuId();
    if (!kitsuId) {
      return { kind: 'not-found', tmdbId, kitsuId: null };
    }

    const fallbackAsset = await fetchKitsuFallbackAsset(kitsuId, imageType);
    if (fallbackAsset?.imageUrl) {
      return {
        kind: 'kitsu-fallback',
        tmdbId,
        kitsuId,
        fallbackAsset,
      };
    }

    return { kind: 'not-found', tmdbId, kitsuId };
  };

  const tmdbId = await fetchTmdbId();
  if (!tmdbId) {
    return resolveKitsuFallback(null);
  }

  for (const mediaType of ['tv', 'movie'] as const) {
    const media = await fetchTmdbMedia(tmdbId, mediaType);
    if (!media) continue;
    return {
      kind: 'tmdb',
      tmdbId,
      mediaType,
      media,
    };
  }

  return resolveKitsuFallback(tmdbId);
};
