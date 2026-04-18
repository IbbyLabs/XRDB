import { NextRequest } from 'next/server';
import {
  XRDB_REQUEST_KEY_ERROR_MESSAGE,
  getConfiguredXrdbRequestKeys,
  isXrdbRequestAuthorized,
} from '@/lib/xrdbRequestKey';
import { handleImageRequest } from '@/lib/imageRouteHandler';
import { getConfigProfile } from '@/lib/dbCore';
import { XRDB_EPISODE_CONFIG_PROFILE_ID } from '@/lib/imageRouteConfig';
import { buildThumbnailBackdropUrl } from '@/lib/thumbnailRoute';
const XRDB_REQUEST_API_KEYS = getConfiguredXrdbRequestKeys();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; episodeToken: string }> },
) {
  const requestUrl = new URL(request.url);
  const configId = requestUrl.searchParams.get('config') ?? XRDB_EPISODE_CONFIG_PROFILE_ID;
  const configFallbackKey = configId ? (getConfigProfile(configId)?.xrdbKey ?? null) : null;

  if (
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
