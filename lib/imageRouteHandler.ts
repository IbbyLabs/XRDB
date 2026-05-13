import { NextRequest } from 'next/server';

import { scheduleImdbDatasetSync } from '@/lib/imdbDatasetScheduler';
import { schedulePosterCacheWarm } from '@/lib/posterCacheWarmScheduler';
import { recordRecentPosterRequest } from '@/lib/posterCacheWarmRecentRing';
import {
  XRDB_REQUEST_KEY_ERROR_MESSAGE,
  isXrdbRequestAuthorized,
  resolveProvidedXrdbRequestKey,
} from '@/lib/xrdbRequestKey';
import {
  authorizePartnerRequest,
  getConfiguredPartnerProfiles,
} from '@/lib/partnerAccess';
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
import { getConfigProfile } from '@/lib/dbCore';
import { logger } from '@/lib/serverLogger';
import { recordRequest } from '@/lib/adminMetrics';

const finalImageInFlight = new Map<string, Promise<RenderedImagePayload>>();
const XRDB_PARTNER_PROFILES = getConfiguredPartnerProfiles();

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
    const invalidTypeResponse = respond('Invalid image type', 400);
    recordRequest('image', 400, performance.now() - requestStartedAt, id);
    return invalidTypeResponse;
  }

  const configId = request.nextUrl.searchParams.get('config');
  const configFallbackKey = configId ? (getConfigProfile(configId)?.xrdbKey ?? null) : null;
  const providedRequestKey = resolveProvidedXrdbRequestKey({
    searchParams: request.nextUrl.searchParams,
    headers: request.headers,
    fallbackKey: configFallbackKey,
  });

  const partnerAuth = authorizePartnerRequest({
    method: request.method,
    pathname: request.nextUrl.pathname,
    searchParams: request.nextUrl.searchParams,
    headers: request.headers,
    profiles: XRDB_PARTNER_PROFILES,
  });
  const isPartnerAuthorized = partnerAuth.status === 'ok';
  const metricsProvidedKey = isPartnerAuthorized
    ? `partner:${partnerAuth.partnerId}`
    : providedRequestKey;

  if (partnerAuth.status === 'unauthorized') {
    const unauthorizedResponse = respond(partnerAuth.message, 401);
    recordRequest('image', 401, performance.now() - requestStartedAt, id, {
      configId,
      providedKey: `partner:${providedRequestKey || 'missing'}`,
    });
    return unauthorizedResponse;
  }

  if (partnerAuth.status === 'rate-limited') {
    const rateLimitedResponse = respond(partnerAuth.message, 429, {
      'Retry-After': String(Math.max(1, Math.ceil(partnerAuth.retryAfterMs / 1000))),
    });
    recordRequest('image', 429, performance.now() - requestStartedAt, id, {
      configId,
      providedKey: `partner:${providedRequestKey || 'rate-limited'}`,
    });
    return rateLimitedResponse;
  }

  if (
    !isPartnerAuthorized &&
    !isXrdbRequestAuthorized({
      configuredKeys: XRDB_REQUEST_API_KEYS,
      searchParams: request.nextUrl.searchParams,
      headers: request.headers,
      fallbackKey: configFallbackKey,
    })
  ) {
    const unauthorizedResponse = respond(XRDB_REQUEST_KEY_ERROR_MESSAGE, 401);
    recordRequest('image', 401, performance.now() - requestStartedAt, id, {
      configId,
      providedKey: metricsProvidedKey,
    });
    return unauthorizedResponse;
  }

  logger.request(
    `[XRDB] image request: /${type}/${id} streamBadges=${request.nextUrl.searchParams.get('posterStreamBadges') ?? request.nextUrl.searchParams.get('streamBadges') ?? 'none'}`,
  );
  scheduleImdbDatasetSync();
  schedulePosterCacheWarm();

  if (type === 'poster') {
    recordRecentPosterRequest(id, request.nextUrl.searchParams);
  }

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

    const finalResponse = createImageHttpResponse(
      execution.renderedImage,
      buildServerTimingHeader(phases, totalMs),
      cacheStatus,
      debugHeaders,
    );
    recordRequest('image', 200, totalMs, id, {
      configId,
      providedKey: metricsProvidedKey,
    });
    return finalResponse;
  } catch (error: any) {
    if (error instanceof HttpError) {
      const errResponse = respond(error.message, error.status, error.headers);
      recordRequest('image', error.status, performance.now() - requestStartedAt, id, {
        configId,
        providedKey: metricsProvidedKey,
      });
      return errResponse;
    }

    logger.error('[XRDB] render failed', error);

    const message = typeof error?.message === 'string' ? error.message : 'Unknown error';
    const normalizedMessage = message.toLowerCase();
    if (
      normalizedMessage.includes('fetch failed') ||
      normalizedMessage.includes('enotfound') ||
      normalizedMessage.includes('econnreset') ||
      normalizedMessage.includes('etimedout')
    ) {
      const r502 = respond(
        'Upstream request failed. Check server outbound network and DNS to TMDB/MDBList.',
        502,
      );
      recordRequest('image', 502, performance.now() - requestStartedAt, id, {
        configId,
        providedKey: metricsProvidedKey,
      });
      return r502;
    }

    const stack =
      process.env.NODE_ENV !== 'production' && typeof error?.stack === 'string'
        ? `\n${error.stack}`
        : '';
    const r500 = respond(`Error: ${message}${stack}`, 500);
    recordRequest('image', 500, performance.now() - requestStartedAt, id, {
      configId,
      providedKey: metricsProvidedKey,
    });
    return r500;
  }
}

export async function handleImageRouteGet(
  request: NextRequest,
  params: Promise<{ type: string; id: string }>,
) {
  return handleImageRequest(request, await params);
}
