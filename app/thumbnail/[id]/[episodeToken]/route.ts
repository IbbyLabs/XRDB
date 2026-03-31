import { NextRequest } from 'next/server';
import {
  XRDB_REQUEST_KEY_ERROR_MESSAGE,
  getConfiguredXrdbRequestKeys,
  isXrdbRequestAuthorized,
} from '@/lib/xrdbRequestKey';
import { handleImageRequest } from '@/lib/imageRouteHandler';

const EPISODE_THUMBNAIL_TOKEN_RE = /^S(\d+)E(\d+)(?:\.(?:jpg|jpeg|png|webp))?$/i;
const XRDB_REQUEST_API_KEYS = getConfiguredXrdbRequestKeys();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; episodeToken: string }> },
) {
  const requestUrl = new URL(request.url);
  if (
    !isXrdbRequestAuthorized({
      configuredKeys: XRDB_REQUEST_API_KEYS,
      searchParams: requestUrl.searchParams,
      headers: new Headers(request.headers),
    })
  ) {
    return new Response(XRDB_REQUEST_KEY_ERROR_MESSAGE, { status: 401 });
  }

  const { id, episodeToken } = await params;
  const match = EPISODE_THUMBNAIL_TOKEN_RE.exec(episodeToken);
  const season = match?.[1] || null;
  const episode = match?.[2] || null;
  if (!season || !episode) {
    return new Response('Invalid episode thumbnail token', { status: 400 });
  }

  const backdropId = `${id}:${season}:${episode}.jpg`;
  const backdropUrl = new URL(requestUrl);
  backdropUrl.pathname = `/backdrop/${backdropId}`;
  backdropUrl.searchParams.set('thumbnail', '1');

  return handleImageRequest(
    new NextRequest(backdropUrl, {
      headers: request.headers,
      method: request.method,
    }),
    {
      type: 'backdrop',
      id: backdropId,
    },
  );
}
