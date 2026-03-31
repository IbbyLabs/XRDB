import { NextRequest } from 'next/server';

import { scheduleImdbDatasetSync } from '@/lib/imdbDatasetScheduler';
import {
  XRDB_REQUEST_KEY_ERROR_MESSAGE,
  isXrdbRequestAuthorized,
} from '@/lib/xrdbRequestKey';
import {
  ALLOWED_IMAGE_TYPES,
  XRDB_REQUEST_API_KEYS,
} from '@/lib/imageRouteConfig';
import {
  buildServerTimingHeader,
  createImageHttpResponse,
  HttpError,
  type PhaseDurations,
  type RenderedImagePayload,
} from '@/lib/imageRouteRuntime';
import {
  fetchJsonCached,
  fetchTextCached,
} from '@/lib/imageRouteCachedFetch';
import { resolveImageRouteRequestState } from '@/lib/imageRouteRequestState';
import { executeImageRouteRender } from '@/lib/imageRouteExecution';

const finalImageInFlight = new Map<string, Promise<RenderedImagePayload>>();

export async function handleImageRequest(
  request: NextRequest,
  params: { type: string; id: string },
) {
  const requestStartedAt = performance.now();
  const phases: PhaseDurations = {
    auth: 0,
    tmdb: 0,
    mdb: 0,
    fanart: 0,
    stream: 0,
    render: 0,
  };
  const respond = (body: string, status: number, headers?: HeadersInit) => {
    const finalHeaders = new Headers(headers);
    const totalMs = performance.now() - requestStartedAt;
    finalHeaders.set('Server-Timing', buildServerTimingHeader(phases, totalMs));
    return new Response(body, { status, headers: finalHeaders });
  };

  const { type, id } = params;
  if (!ALLOWED_IMAGE_TYPES.has(type)) {
    return respond('Invalid image type', 400);
  }

  if (
    !isXrdbRequestAuthorized({
      configuredKeys: XRDB_REQUEST_API_KEYS,
      searchParams: request.nextUrl.searchParams,
      headers: request.headers,
    })
  ) {
    return respond(XRDB_REQUEST_KEY_ERROR_MESSAGE, 401);
  }

  console.warn(
    `[XRDB] image request: /${type}/${id} streamBadges=${request.nextUrl.searchParams.get('posterStreamBadges') ?? request.nextUrl.searchParams.get('streamBadges') ?? 'none'}`,
  );
  scheduleImdbDatasetSync();

  try {
    const requestState = await resolveImageRouteRequestState({
      request,
      imageType: type as 'poster' | 'backdrop' | 'logo',
      id,
    });
    const hadSharedRender =
      requestState.shouldCacheFinalImage &&
      finalImageInFlight.has(requestState.renderSeedKey);
    const execution = await executeImageRouteRender({
      requestState,
      phases,
      fetchJsonCached,
      fetchTextCached,
      finalImageInFlight,
    });
    const totalMs = performance.now() - requestStartedAt;
    const cacheStatus = execution.objectStorageHit
      ? 'hit'
      : hadSharedRender
        ? 'shared'
        : 'miss';
    const debugHeaders = requestState.debugRatings
      ? {
          'X-XRDB-Ratings-Requested': requestState.effectiveRatingPreferences.join(','),
          'X-XRDB-Ratings-Resolved': execution.debugResolvedRatingProviders.join(','),
          'X-XRDB-Simkl-Requested': execution.debugNeedsSimklRating ? '1' : '0',
          'X-XRDB-Simkl-Client-Source': requestState.simklClientSource,
          'X-XRDB-Provider-Ratings-Enabled': execution.debugProviderRatingsEnabled ? '1' : '0',
        }
      : undefined;

    return createImageHttpResponse(
      execution.renderedImage,
      buildServerTimingHeader(phases, totalMs),
      cacheStatus,
      debugHeaders,
    );
  } catch (error: any) {
    if (error instanceof HttpError) {
      return respond(error.message, error.status, error.headers);
    }

    if (process.env.NODE_ENV !== 'production') {
      console.error('[XRDB] render failed', error);
    }

    const message = typeof error?.message === 'string' ? error.message : 'Unknown error';
    const normalizedMessage = message.toLowerCase();
    if (
      normalizedMessage.includes('fetch failed') ||
      normalizedMessage.includes('enotfound') ||
      normalizedMessage.includes('econnreset') ||
      normalizedMessage.includes('etimedout')
    ) {
      return respond(
        'Upstream request failed. Check server outbound network and DNS to TMDB/MDBList.',
        502,
      );
    }

    const stack =
      process.env.NODE_ENV !== 'production' && typeof error?.stack === 'string'
        ? `\n${error.stack}`
        : '';
    return respond(`Error: ${message}${stack}`, 500);
  }
}

export async function handleImageRouteGet(
  request: NextRequest,
  params: Promise<{ type: string; id: string }>,
) {
  return handleImageRequest(request, await params);
}
