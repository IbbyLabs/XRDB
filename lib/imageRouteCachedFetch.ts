import { getMetadata, setMetadata } from './metadataStore.ts';
import {
  HttpError,
  measurePhase,
  withDedupe,
  type CachedJsonNetworkObserver,
  type CachedJsonResponse,
  type CachedTextResponse,
  type JsonFetchImpl,
  type PhaseDurations,
} from './imageRouteRuntime.ts';

const jsonMetadataInFlight = new Map<string, Promise<CachedJsonResponse>>();
const textMetadataInFlight = new Map<string, Promise<CachedTextResponse>>();

export const fetchJsonCached = async (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
  observer?: CachedJsonNetworkObserver,
  fetchImpl: JsonFetchImpl = fetch,
): Promise<CachedJsonResponse> => {
  const cached = getMetadata<CachedJsonResponse>(key);
  if (cached) {
    return cached;
  }

  return withDedupe(jsonMetadataInFlight, key, async () => {
    const fromCache = getMetadata<CachedJsonResponse>(key);
    if (fromCache) return fromCache;

    const fetchStartedAt = Date.now();
    let response: Response;
    try {
      response = await measurePhase(phases, phase, () =>
        fetchImpl(url, {
          cache: 'no-store',
          ...init,
        }),
      );
    } catch (error) {
      if (observer?.onNetworkError) {
        try {
          await observer.onNetworkError({
            key,
            url,
            errorMessage: error instanceof Error ? error.message : 'Network error',
            durationMs: Date.now() - fetchStartedAt,
          });
        } catch {
        }
      }
      throw error;
    }

    let data: any = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    const payload: CachedJsonResponse = {
      ok: response.ok,
      status: response.status,
      data,
      location: response.headers.get('location'),
    };

    const tmdbHost = (() => {
      try {
        return new URL(url).hostname === 'api.themoviedb.org';
      } catch {
        return false;
      }
    })();

    if (!response.ok && tmdbHost && response.status === 401) {
      const statusMessage =
        typeof data?.status_message === 'string' ? data.status_message.toLowerCase() : '';
      if (
        statusMessage.includes('invalid') ||
        statusMessage.includes('api key') ||
        statusMessage.includes('unauthorized')
      ) {
        throw new HttpError('TMDB API key is invalid or unauthorized', 401);
      }
      throw new HttpError('TMDB request is unauthorized', 401);
    }

    if (!response.ok && tmdbHost && response.status === 429) {
      throw new HttpError('TMDB rate limit reached. Try again later.', 429);
    }

    if (observer?.onNetworkResponse) {
      try {
        await observer.onNetworkResponse({
          key,
          url,
          status: response.status,
          ok: response.ok,
          data,
          durationMs: Date.now() - fetchStartedAt,
        });
      } catch {
      }
    }

    const failureTtlMs = Math.min(ttlMs, 2 * 60 * 1000);
    const targetTtlMs = response.ok ? ttlMs : failureTtlMs;
    setMetadata(key, payload, targetTtlMs);

    return payload;
  });
};

export const fetchTextCached = async (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
): Promise<CachedTextResponse> => {
  const cached = getMetadata<CachedTextResponse>(key);
  if (cached) {
    return cached;
  }

  return withDedupe(textMetadataInFlight, key, async () => {
    const fromCache = getMetadata<CachedTextResponse>(key);
    if (fromCache) return fromCache;

    const response = await measurePhase(phases, phase, () =>
      fetch(url, {
        cache: 'no-store',
        redirect: 'follow',
        ...init,
      }),
    );

    let data: string | null = null;
    try {
      data = await response.text();
    } catch {
      data = null;
    }

    const payload: CachedTextResponse = {
      ok: response.ok,
      status: response.status,
      data,
    };
    const failureTtlMs = Math.min(ttlMs, 2 * 60 * 1000);
    setMetadata(key, payload, response.ok ? ttlMs : failureTtlMs);
    return payload;
  });
};
