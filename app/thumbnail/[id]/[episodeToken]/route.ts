import { NextRequest } from 'next/server';
import {
  XRDB_REQUEST_KEY_ERROR_MESSAGE,
  getConfiguredXrdbRequestKeys,
  isXrdbRequestAuthorized,
} from '@/lib/xrdbRequestKey';
import {
  authorizePartnerRequest,
  getConfiguredPartnerProfiles,
} from '@/lib/partnerAccess';
import { handleImageRequest } from '@/lib/imageRouteHandler';
import { getConfigProfile } from '@/lib/dbCore';
import { XRDB_DEFAULT_EPISODE_PROFILE_ID } from '@/lib/imageRouteConfig';
import { buildThumbnailBackdropUrl } from '@/lib/thumbnailRoute';
const XRDB_REQUEST_API_KEYS = getConfiguredXrdbRequestKeys();
const XRDB_PARTNER_PROFILES = getConfiguredPartnerProfiles();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; episodeToken: string }> },
) {
  const requestUrl = new URL(request.url);
  const configId = requestUrl.searchParams.get('config') ?? XRDB_DEFAULT_EPISODE_PROFILE_ID;
  const configFallbackKey = configId ? (getConfigProfile(configId)?.xrdbKey ?? null) : null;

  const partnerAuth = authorizePartnerRequest({
    method: request.method,
    pathname: requestUrl.pathname,
    searchParams: requestUrl.searchParams,
    headers: new Headers(request.headers),
    profiles: XRDB_PARTNER_PROFILES,
  });
  const isPartnerAuthorized = partnerAuth.status === 'ok';

  if (partnerAuth.status === 'unauthorized') {
    return new Response(partnerAuth.message, { status: 401 });
  }

  if (partnerAuth.status === 'rate-limited') {
    return new Response(partnerAuth.message, {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, Math.ceil(partnerAuth.retryAfterMs / 1000))),
      },
    });
  }

  if (
    !isPartnerAuthorized &&
    !isXrdbRequestAuthorized({
      configuredKeys: XRDB_REQUEST_API_KEYS,
      searchParams: requestUrl.searchParams,
      headers: new Headers(request.headers),
      fallbackKey: configFallbackKey,
    })
  ) {
    return new Response(XRDB_REQUEST_KEY_ERROR_MESSAGE, { status: 401 });
  }

  const { id, episodeToken } = await params;
  const rewritten = buildThumbnailBackdropUrl(requestUrl, id, episodeToken, configId);
  if (!rewritten) {
    return new Response('Invalid episode thumbnail token', { status: 400 });
  }

  return handleImageRequest(
    new NextRequest(rewritten.backdropUrl, {
      headers: request.headers,
      method: request.method,
    }),
    {
      type: 'backdrop',
      id: rewritten.backdropId,
    },
  );
}
