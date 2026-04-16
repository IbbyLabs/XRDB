import { NextRequest, NextResponse } from 'next/server';

import { loadProxyManifestPayload } from '@/lib/proxySourceManifest';
import {
  buildProxyCorsHeaders,
  buildProxyNoStoreHeaders,
} from '@/lib/proxyManifest';
import { MDBLIST_API_KEYS } from '@/lib/imageRouteConfig';
import { hasServerTmdbCredentials } from '@/lib/tmdbServerAuth';

const resolveCorsHeaders = (request: NextRequest) =>
  buildProxyCorsHeaders({
    requestOrigin: request.headers.get('origin'),
    allowedOriginsRaw: process.env.XRDB_PROXY_ALLOWED_ORIGINS,
  });

const resolveResponseHeaders = (request: NextRequest) => ({
  ...resolveCorsHeaders(request),
  ...buildProxyNoStoreHeaders(),
});

const buildError = (request: NextRequest, message: string, status = 400) =>
  NextResponse.json({ error: message }, { status, headers: resolveResponseHeaders(request) });

export function handleProxyManifestOptions(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: resolveCorsHeaders(request) });
}

export async function handleProxyManifestGet(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const sourceUrl = searchParams.get('url');
  const catalogPlan = searchParams.get('catalogPlan');
  const tmdbKey = searchParams.get('tmdbKey');
  const mdblistKey = searchParams.get('mdblistKey');

  if (!sourceUrl) {
    return buildError(request, 'Missing "url" query parameter.');
  }
  if ((!tmdbKey && !hasServerTmdbCredentials()) || (!mdblistKey && MDBLIST_API_KEYS.length === 0)) {
    return buildError(request, 'Missing "tmdbKey" or "mdblistKey" query parameter.');
  }

  const result = await loadProxyManifestPayload({ sourceUrl, catalogPlan });
  if (!result.ok) {
    if (result.error === 'invalid-source') {
      return buildError(request, 'Invalid or unsafe source manifest URL.', 400);
    }
    if (result.error === 'unreachable') {
      return buildError(request, 'Unable to reach the source manifest.', 502);
    }
    if (result.error === 'bad-status') {
      return buildError(request, `Source manifest returned ${result.status}.`, 502);
    }
    return buildError(request, 'Source manifest is not valid JSON.', 502);
  }

  return NextResponse.json(result.payload, {
    status: 200,
    headers: resolveResponseHeaders(request),
  });
}
