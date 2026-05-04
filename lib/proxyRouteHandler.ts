import { NextRequest, NextResponse } from 'next/server';

import {
  parseAddonBaseUrl,
} from '@/lib/proxyConfigBridge';
import {
  XRDB_REQUEST_KEY_ERROR_MESSAGE,
  getConfiguredXrdbRequestKeys,
  isXrdbRequestAuthorized,
  resolveProvidedXrdbRequestKey,
} from '@/lib/xrdbRequestKey';
import { PROTECTED_CONFIG_ID_RE } from '@/lib/dbCore';
import { recordRequest } from '@/lib/adminMetrics';
import { assertSafeSourceUrl, fetchWithOneRedirect } from '@/lib/networkSecurity';
import { loadProxyManifestPayload } from '@/lib/proxySourceManifest';
import {
  buildProxyErrorResponse,
  buildProxyNoStoreHeaders,
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

const buildJsonCorsHeaders = (request: NextRequest) =>
  buildProxyRouteCorsHeaders({
    requestOrigin: request.headers.get('origin'),
    allowedOriginsRaw: PROXY_ALLOWED_ORIGINS,
  });

const buildManifestHeaders = (request: NextRequest) => ({
  ...buildJsonCorsHeaders(request),
  ...buildProxyNoStoreHeaders(),
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
  const requestStartedAt = performance.now();
  let trackedConfigId: string | null = null;
  let trackedProvidedKey: string | null = null;
  let trackedResource: string | null = null;

  const finalize = (response: NextResponse | Response) => {
    recordRequest('proxy', response.status, performance.now() - requestStartedAt, trackedResource, {
      configId: trackedConfigId,
      providedKey: trackedProvidedKey,
    });
    return response;
  };

  const parsed = parseProxyRouteConfig(request.nextUrl.searchParams, pathSegments);
  if (parsed.error) {
    return finalize(buildError(request, parsed.error.message, parsed.error.status));
  }

  const { config, configSeed, resourceSegments } = parsed;
  trackedResource = resourceSegments[0] || null;
  if (!config) {
    return finalize(buildError(request, 'Missing proxy config in path.'));
  }

  trackedConfigId = configSeed && PROTECTED_CONFIG_ID_RE.test(configSeed) ? configSeed : null;
  trackedProvidedKey = resolveProvidedXrdbRequestKey({
    searchParams: request.nextUrl.searchParams,
    headers: request.headers,
    fallbackKey: config.xrdbKey,
  });

  if (
    !isXrdbRequestAuthorized({
      configuredKeys: XRDB_REQUEST_API_KEYS,
      searchParams: request.nextUrl.searchParams,
      headers: request.headers,
      fallbackKey: config.xrdbKey,
    })
  ) {
    return finalize(buildError(request, XRDB_REQUEST_KEY_ERROR_MESSAGE, 401));
  }

  if (resourceSegments.length === 0) {
    return finalize(buildError(request, 'Missing addon resource path.'));
  }

  let safeManifestUrl: URL;
  try {
    safeManifestUrl = await assertSafeSourceUrl(config.url);
  } catch {
    return finalize(buildError(request, 'Invalid or unsafe source manifest URL.', 400));
  }

  const publicRequestUrl = getPublicRequestUrl(request);
  const usingQueryConfig =
    request.nextUrl.searchParams.has('url') ||
    request.nextUrl.searchParams.has('tmdbKey') ||
    request.nextUrl.searchParams.has('mdblistKey');

  if (!usingQueryConfig && resourceSegments.length === 1 && resourceSegments[0] === 'manifest.json') {
    const result = await loadProxyManifestPayload({
      sourceUrl: config.url,
      catalogPlan: config.catalogPlan,
      configSeed,
    });
    if (!result.ok) {
      if (result.error === 'unreachable') {
        return finalize(buildError(request, 'Unable to reach the source manifest.', 502));
      }
      if (result.error === 'bad-status') {
        return finalize(buildError(request, `Source manifest returned ${result.status}.`, 502));
      }
      if (result.error === 'invalid-json') {
        return finalize(buildError(request, 'Source manifest is not valid JSON.', 502));
      }
      return finalize(buildError(request, 'Invalid or unsafe source manifest URL.', 400));
    }

    return finalize(NextResponse.json(
      result.payload,
      {
        status: 200,
        headers: buildManifestHeaders(request),
      },
    ));
  }

  let originBase: string;
  try {
    originBase = parseAddonBaseUrl(safeManifestUrl.toString());
  } catch {
    return finalize(buildError(request, 'Invalid source manifest URL.', 400));
  }

  const resource = resourceSegments[0] || '';
  const forwardUrl = buildProxyForwardUrl(
    originBase,
    resourceSegments,
    request.nextUrl.searchParams,
  );

  let sourceResponse: Response;
  try {
    sourceResponse = await fetchWithOneRedirect(forwardUrl.toString());
  } catch {
    return finalize(buildError(request, 'Unable to reach the source addon.', 502));
  }

  if (!sourceResponse.ok) {
    return finalize(await buildSourceErrorResponse(sourceResponse));
  }

  if (resource !== 'catalog' && resource !== 'meta') {
    return finalize(await buildProxyPassthroughResponse(request, PROXY_ALLOWED_ORIGINS, sourceResponse));
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await sourceResponse.json()) as Record<string, unknown>;
  } catch {
    return finalize(await buildProxyPassthroughResponse(request, PROXY_ALLOWED_ORIGINS, sourceResponse));
  }

  if (resource === 'catalog' && Array.isArray(payload.metas)) {
    const metasWithImages = await mapWithConcurrency(
      payload.metas as Array<Record<string, unknown>>,
      6,
      async (meta) => rewriteMetaImages(meta as Record<string, unknown>, publicRequestUrl, config),
    );
    payload.metas = await mapWithConcurrency(
      metasWithImages as Array<Record<string, unknown>>,
      6,
      async (meta) => translateMetaPayload(meta, publicRequestUrl, config),
    );
  }

  if (resource === 'meta' && payload.meta && typeof payload.meta === 'object') {
    const metaWithImages = await rewriteMetaImages(
      payload.meta as Record<string, unknown>,
      publicRequestUrl,
      config,
    );
    payload.meta = await translateMetaPayload(metaWithImages, publicRequestUrl, config);
  }

  return finalize(NextResponse.json(payload, {
    status: 200,
    headers: buildJsonCorsHeaders(request),
  }));
}
