import { TMDB_CACHE_TTL_MS } from './imageRouteConfig.ts';
import {
  getCachedImageFromObjectStorage,
  isObjectStorageConfigured,
  putCachedImageToObjectStorage,
} from './imageObjectStorage.ts';
import { assertSafeSourceUrl } from './networkSecurity.ts';
import { buildSourceImageFallbackCacheControl, isTmdbSourceImageUrl } from './imageRouteSourceUrls.ts';
import {
  HttpError,
  sha1Hex,
  type RenderedImagePayload,
  withDedupe,
} from './imageRouteRuntime.ts';

const sourceImageInFlight = new Map<string, Promise<RenderedImagePayload>>();

export const fetchSourceImageUncached = async (
  imgUrl: string,
  fallbackTtlMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<RenderedImagePayload> => {
  const sourceResponse = await fetchImpl(imgUrl, { cache: 'no-store' });
  if (!sourceResponse.ok) {
    throw new HttpError('Image not found', sourceResponse.status || 404);
  }

  return {
    body: await sourceResponse.arrayBuffer(),
    contentType: sourceResponse.headers.get('content-type') || 'image/jpeg',
    cacheControl:
      sourceResponse.headers.get('cache-control') || buildSourceImageFallbackCacheControl(fallbackTtlMs),
  };
};

export const getSourceImagePayload = async (
  imgUrl: string,
  fallbackTtlMs = TMDB_CACHE_TTL_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<RenderedImagePayload> => {
  const normalizedImgUrl = String(imgUrl || '').trim();
  if (!normalizedImgUrl) {
    throw new HttpError('Image not found', 404);
  }

  const sharedCacheable = isTmdbSourceImageUrl(normalizedImgUrl);
  if (!sharedCacheable) {
    return fetchSourceImageUncached(normalizedImgUrl, fallbackTtlMs, fetchImpl);
  }

  const sourceHash = sha1Hex(normalizedImgUrl);
  const sourceObjectStorageKey = `source/${sourceHash}`;
  const objectStorageEnabled = isObjectStorageConfigured();

  const readSharedSourcePayload = async () => {
    if (!objectStorageEnabled) return null;

    const objectPayload = await getCachedImageFromObjectStorage(sourceObjectStorageKey);
    if (!objectPayload) {
      return null;
    }

    const payload: RenderedImagePayload = {
      body: objectPayload.body,
      contentType: objectPayload.contentType,
      cacheControl: objectPayload.cacheControl,
    };
    return payload;
  };

  if (objectStorageEnabled) {
    try {
      const sharedPayload = await readSharedSourcePayload();
      if (sharedPayload) {
        return sharedPayload;
      }
    } catch {
    }
  }

  return withDedupe(sourceImageInFlight, normalizedImgUrl, async () => {
    if (objectStorageEnabled) {
      try {
        const sharedPayload = await readSharedSourcePayload();
        if (sharedPayload) {
          return sharedPayload;
        }
      } catch {
      }
    }

    const payload = await fetchSourceImageUncached(normalizedImgUrl, fallbackTtlMs, fetchImpl);

    if (objectStorageEnabled) {
      try {
        await putCachedImageToObjectStorage(sourceObjectStorageKey, payload);
      } catch {
      }
    }

    return payload;
  });
};

export const normalizeSafeFallbackImageUrl = async (value: string | null | undefined) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  try {
    return (await assertSafeSourceUrl(normalized)).toString();
  } catch {
    return null;
  }
};

export const getSourceImagePayloadWithFallback = async (options: {
  imgUrl: string;
  fallbackUrl?: string | null;
  fallbackTtlMs?: number;
  fetchImpl?: typeof fetch;
}) => {
  const {
    imgUrl,
    fallbackUrl = null,
    fallbackTtlMs = TMDB_CACHE_TTL_MS,
    fetchImpl = fetch,
  } = options;
  const normalizedPrimaryUrl = String(imgUrl || '').trim();
  const normalizedFallbackUrl = await normalizeSafeFallbackImageUrl(fallbackUrl);

  try {
    return await getSourceImagePayload(normalizedPrimaryUrl, fallbackTtlMs, fetchImpl);
  } catch (error) {
    if (!normalizedFallbackUrl || normalizedFallbackUrl === normalizedPrimaryUrl) {
      throw error;
    }
    return getSourceImagePayload(normalizedFallbackUrl, fallbackTtlMs, fetchImpl);
  }
};
