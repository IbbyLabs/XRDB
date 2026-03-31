import { collectMDBListRatings } from './imageRouteMedia.ts';
import {
  getMdbListApiKeysInPriorityOrder,
  isMdbListRateLimitedResponse,
  markMdbListApiKeyRateLimited,
  shouldRetryMdbListWithAnotherKey,
} from './imageRouteMdbList.ts';
import type { CachedJsonResponse, PhaseDurations } from './imageRouteRuntime.ts';

type MdbFetchJson = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
) => Promise<CachedJsonResponse>;

export const fetchMdbListRatings = async ({
  imdbId,
  cacheTtlMs,
  phases,
  requestSource,
  imageType,
  cleanId,
  manualApiKey,
  fetchJsonCached,
}: {
  imdbId: string;
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
  const apiKeys = manualApiKey ? [manualApiKey] : getMdbListApiKeysInPriorityOrder();

  if (!normalizedImdbId || !apiKeys.length) return null;

  for (const apiKey of apiKeys) {
    try {
      const response = await fetchJsonCached(
        `mdblist:${normalizedImdbId}:key:${apiKey}`,
        `https://mdblist.com/api/?apikey=${encodeURIComponent(apiKey)}&i=${encodeURIComponent(normalizedImdbId)}`,
        cacheTtlMs,
        phases,
        'mdb',
      );

      if (isMdbListRateLimitedResponse(response)) {
        markMdbListApiKeyRateLimited(apiKey);
        continue;
      }

      if (!response.ok) {
        if (shouldRetryMdbListWithAnotherKey(response)) {
          continue;
        }
        return null;
      }

      return collectMDBListRatings(response.data);
    } catch {
    }
  }

  return null;
};
