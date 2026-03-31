import { NextRequest, NextResponse } from 'next/server';

import {
  parseAddonBaseUrl,
} from '@/lib/proxyConfigBridge';
import {
  XRDB_REQUEST_KEY_ERROR_MESSAGE,
  getConfiguredXrdbRequestKeys,
  isXrdbRequestAuthorized,
} from '@/lib/xrdbRequestKey';
import { assertSafeSourceUrl } from '@/lib/networkSecurity';
import { buildProxyManifestPayload } from '@/lib/proxyManifest';
import {
  buildProxyErrorResponse,
  buildProxyPassthroughResponse,
  buildProxyRouteCorsHeaders,
  getPublicRequestUrl,
} from '@/lib/proxyRouteHttp';
import {
  buildProxyForwardUrl,
  parseProxyRouteConfig,
} from '@/lib/proxyRoutePlan';
import {
  mapWithConcurrency,
  rewriteMetaImages,
  translateMetaPayload,
} from '@/lib/proxyRouteRuntime';

const XRDB_REQUEST_API_KEYS = getConfiguredXrdbRequestKeys();
const PROXY_ALLOWED_ORIGINS = process.env.XRDB_PROXY_ALLOWED_ORIGINS;

const buildError = (request: NextRequest, message: string, status = 400) =>
  buildProxyErrorResponse(request, PROXY_ALLOWED_ORIGINS, message, status);

export const buildJsonCorsHeaders = (request: NextRequest) =>
  buildProxyRouteCorsHeaders({
    requestOrigin: request.headers.get('origin'),
    allowedOriginsRaw: PROXY_ALLOWED_ORIGINS,
  });

const buildSourceErrorResponse = async (sourceResponse: Response) => {
  const errorBody = await sourceResponse.text();
  return new NextResponse(errorBody, {
    status: sourceResponse.status,
    headers: {
      'content-type': sourceResponse.headers.get('content-type') || 'text/plain',
    },
  });
};

export async function handleProxyOptions(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: buildJsonCorsHeaders(request),
  });
}

export async function handleProxyGet(
  request: NextRequest,
  pathSegments: string[],
) {
  const parsed = parseProxyRouteConfig(request.nextUrl.searchParams, pathSegments);
  if (parsed.error) {
    return buildError(request, parsed.error.message, parsed.error.status);
  }

  const { config, configSeed, resourceSegments } = parsed;
  if (!config) {
    return buildError(request, 'Missing proxy config in path.');
  }

  if (
    !isXrdbRequestAuthorized({
      configuredKeys: XRDB_REQUEST_API_KEYS,
      searchParams: request.nextUrl.searchParams,
      headers: request.headers,
      fallbackKey: config.xrdbKey,
    })
  ) {
    return buildError(request, XRDB_REQUEST_KEY_ERROR_MESSAGE, 401);
  }

  if (resourceSegments.length === 0) {
    return buildError(request, 'Missing addon resource path.');
  }

  let safeManifestUrl: URL;
  try {
    safeManifestUrl = await assertSafeSourceUrl(config.url);
  } catch {
    return buildError(request, 'Invalid or unsafe source manifest URL.', 400);
  }

  const publicRequestUrl = getPublicRequestUrl(request);
  const usingQueryConfig =
    request.nextUrl.searchParams.has('url') ||
    request.nextUrl.searchParams.has('tmdbKey') ||
    request.nextUrl.searchParams.has('mdblistKey');

  if (!usingQueryConfig && resourceSegments.length === 1 && resourceSegments[0] === 'manifest.json') {
    let manifestResponse: Response;
    try {
      manifestResponse = await fetch(safeManifestUrl.toString(), {
        cache: 'no-store',
        redirect: 'error',
      });
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

    return NextResponse.json(
      buildProxyManifestPayload(manifest, config.url, {
        configSeed,
        catalogPlan: config.catalogPlan,
      }),
      {
        status: 200,
        headers: buildJsonCorsHeaders(request),
      },
    );
  }

  let originBase: string;
  try {
    originBase = parseAddonBaseUrl(safeManifestUrl.toString());
  } catch {
    return buildError(request, 'Invalid source manifest URL.', 400);
  }

  const resource = resourceSegments[0] || '';
  const forwardUrl = buildProxyForwardUrl(
    originBase,
    resourceSegments,
    request.nextUrl.searchParams,
  );

  let sourceResponse: Response;
  try {
    sourceResponse = await fetch(forwardUrl.toString(), {
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    return buildError(request, 'Unable to reach the source addon.', 502);
  }

  if (!sourceResponse.ok) {
    return buildSourceErrorResponse(sourceResponse);
  }

  if (resource !== 'catalog' && resource !== 'meta') {
    return buildProxyPassthroughResponse(request, PROXY_ALLOWED_ORIGINS, sourceResponse);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await sourceResponse.json()) as Record<string, unknown>;
  } catch {
    return buildProxyPassthroughResponse(request, PROXY_ALLOWED_ORIGINS, sourceResponse);
  }

  if (resource === 'catalog' && Array.isArray(payload.metas)) {
    const metasWithImages = payload.metas.map((meta) =>
      rewriteMetaImages(meta as Record<string, unknown>, publicRequestUrl, config),
    );
    payload.metas = await mapWithConcurrency(
      metasWithImages as Array<Record<string, unknown>>,
      6,
      async (meta) => translateMetaPayload(meta, publicRequestUrl, config),
    );
  }

  if (resource === 'meta' && payload.meta && typeof payload.meta === 'object') {
    const metaWithImages = rewriteMetaImages(
      payload.meta as Record<string, unknown>,
      publicRequestUrl,
      config,
    );
    payload.meta = await translateMetaPayload(metaWithImages, publicRequestUrl, config);
  }

  return NextResponse.json(payload, {
    status: 200,
    headers: buildJsonCorsHeaders(request),
  });
}
