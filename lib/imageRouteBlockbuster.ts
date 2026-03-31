import { TMDB_CACHE_TTL_MS } from './imageRouteConfig.ts';
import {
  dedupeBlockbusterBlurbs,
  extractBlockbusterReviewBlurbs,
  type BlockbusterBlurb,
} from './imageRouteBlockbusterReview.ts';
import type { CachedJsonResponse, PhaseDurations } from './imageRouteRuntime.ts';

type BlockbusterFetchJson = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
) => Promise<CachedJsonResponse>;

export const fetchBlockbusterBlurbsWithFallback = async ({
  mediaType,
  tmdbId,
  tmdbKey,
  requestedLanguage,
  fallbackLanguage,
  phases,
  fetchJsonCached,
}: {
  mediaType: 'movie' | 'tv';
  tmdbId: string | number;
  tmdbKey: string;
  requestedLanguage: string;
  fallbackLanguage: string;
  phases: PhaseDurations;
  fetchJsonCached: BlockbusterFetchJson;
}): Promise<BlockbusterBlurb[]> => {
  const fetchBlockbusterBlurbsForLanguage = async (language: string) => {
    const responses = await Promise.all(
      [1, 2, 3].map((page) =>
        fetchJsonCached(
          `tmdb:${mediaType}:${tmdbId}:reviews:${language}:page:${page}`,
          `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/reviews?api_key=${tmdbKey}&language=${language}&page=${page}`,
          TMDB_CACHE_TTL_MS,
          phases,
          'tmdb',
        )
      )
    );
    return dedupeBlockbusterBlurbs(
      responses.flatMap((response) =>
        response.ok ? extractBlockbusterReviewBlurbs(response.data) : []
      ),
      10
    );
  };

  let blockbusterBlurbs = await fetchBlockbusterBlurbsForLanguage(requestedLanguage);

  if (blockbusterBlurbs.length < 6 && requestedLanguage !== fallbackLanguage) {
    blockbusterBlurbs = dedupeBlockbusterBlurbs(
      [
        ...blockbusterBlurbs,
        ...(await fetchBlockbusterBlurbsForLanguage(fallbackLanguage)),
      ],
      10
    );
  }

  return blockbusterBlurbs;
};
