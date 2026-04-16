import { collectMDBListRatings } from './imageRouteMedia.ts';
import {
  getMdbListApiKeysInPriorityOrder,
  isMdbListRateLimitedResponse,
  markMdbListApiKeyRateLimited,
  shouldRetryMdbListWithAnotherKey,
} from './imageRouteMdbList.ts';
import { sha1Hex } from './imageRouteRuntime.ts';
import type { CachedJsonResponse, PhaseDurations } from './imageRouteRuntime.ts';

export type MdbListRatingsFetchResult = {
  ratings: ReturnType<typeof collectMDBListRatings> | null;
  transientFailureTtlMs: number | null;
};

type MdbFetchJson = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
) => Promise<CachedJsonResponse>;

export const fetchMdbListRatings = async ({
  imdbId,
  mediaType,
  cacheTtlMs,
  phases,
  requestSource,
  imageType,
  cleanId,
  manualApiKey,
  fetchJsonCached,
}: {
  imdbId: string;
  mediaType: 'movie' | 'tv';
  cacheTtlMs: number;
  phases: PhaseDurations;
  requestSource?: string;
  imageType?: string;
  cleanId?: string;
  manualApiKey?: string | null;
  fetchJsonCached: MdbFetchJson;
}) => {
  void requestSource;
  void imageType;
  void cleanId;

  const normalizedImdbId = String(imdbId || '').trim();
  const normalizedMediaType = mediaType === 'tv' ? 'show' : 'movie';
  const apiKeys = manualApiKey ? [manualApiKey] : getMdbListApiKeysInPriorityOrder();
  const transientFailureTtlMs = Math.min(cacheTtlMs, 2 * 60 * 1000);
  let sawTransientFailure = false;

  if (!normalizedImdbId || !apiKeys.length) {
    return {
      ratings: null,
      transientFailureTtlMs: null,
    };
  }

  for (const apiKey of apiKeys) {
    try {
      const response = await fetchJsonCached(
        `mdblist:${normalizedImdbId}:key:${sha1Hex(apiKey).slice(0, 12)}`,
        `https://api.mdblist.com/imdb/${normalizedMediaType}/${encodeURIComponent(normalizedImdbId)}?apikey=${encodeURIComponent(apiKey)}`,
        cacheTtlMs,
        phases,
        'mdb',
      );

      if (isMdbListRateLimitedResponse(response)) {
        markMdbListApiKeyRateLimited(apiKey);
        sawTransientFailure = true;
        continue;
      }

      if (!response.ok) {
        if (shouldRetryMdbListWithAnotherKey(response)) {
          sawTransientFailure = true;
          continue;
        }
        return {
          ratings: null,
          transientFailureTtlMs: null,
        };
      }

      return {
        ratings: collectMDBListRatings(response.data),
        transientFailureTtlMs: null,
      };
    } catch {
      sawTransientFailure = true;
    }
  }

  return {
    ratings: null,
    transientFailureTtlMs: sawTransientFailure ? transientFailureTtlMs : null,
  };
};
