import { NextRequest, NextResponse } from 'next/server';

import { assertSafeSourceUrl } from '@/lib/networkSecurity';
import {
  buildProxyCorsHeaders,
  buildProxyManifestPayload,
} from '@/lib/proxyManifest';

const resolveCorsHeaders = (request: NextRequest) =>
  buildProxyCorsHeaders({
    requestOrigin: request.headers.get('origin'),
    allowedOriginsRaw: process.env.XRDB_PROXY_ALLOWED_ORIGINS,
  });

const buildError = (request: NextRequest, message: string, status = 400) =>
  NextResponse.json({ error: message }, { status, headers: resolveCorsHeaders(request) });

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
  if (!tmdbKey || !mdblistKey) {
    return buildError(request, 'Missing "tmdbKey" or "mdblistKey" query parameter.');
  }

  let safeSourceUrl: URL;
  try {
    safeSourceUrl = await assertSafeSourceUrl(sourceUrl);
  } catch {
    return buildError(request, 'Invalid or unsafe source manifest URL.', 400);
  }

  let manifestResponse: Response;
  try {
    manifestResponse = await fetch(safeSourceUrl.toString(), { cache: 'no-store', redirect: 'error' });
  } catch {
    return buildError(request, 'Unable to reach the source manifest.', 502);
  }

  if (!manifestResponse.ok) {
    return buildError(request, `Source manifest returned ${manifestResponse.status}.`, 502);
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = (await manifestResponse.json()) as Record<string, unknown>;
  } catch {
    return buildError(request, 'Source manifest is not valid JSON.', 502);
  }

  return NextResponse.json(buildProxyManifestPayload(manifest, sourceUrl, { catalogPlan }), {
    status: 200,
    headers: resolveCorsHeaders(request),
  });
}
