import { NextRequest, NextResponse } from 'next/server';
import {
  buildProxyRouteCorsHeaders,
  resolveProxyPublicUrl,
} from './proxyRouteRequest.ts';

export { buildProxyRouteCorsHeaders, resolveProxyPublicUrl } from './proxyRouteRequest.ts';

export const getPublicRequestUrl = (request: NextRequest) =>
  resolveProxyPublicUrl({
    requestUrl: request.nextUrl.toString(),
    hostHeader: request.headers.get('host'),
    forwardedHostHeader: request.headers.get('x-forwarded-host'),
    forwardedProtoHeader: request.headers.get('x-forwarded-proto'),
    trustForwarded: process.env.XRDB_TRUST_PROXY_HEADERS === 'true',
  });

export const buildProxyErrorResponse = (
  request: NextRequest,
  allowedOriginsRaw: string | undefined,
  message: string,
  status = 400,
) =>
  NextResponse.json(
    { error: message },
    {
      status,
      headers: buildProxyRouteCorsHeaders({
        requestOrigin: request.headers.get('origin'),
        allowedOriginsRaw,
      }),
    },
  );

export const buildProxyPassthroughResponse = async (
  request: NextRequest,
  allowedOriginsRaw: string | undefined,
  sourceResponse: Response,
) => {
  const body = await sourceResponse.arrayBuffer();
  const headers = new Headers(sourceResponse.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');

  const corsHeaders = buildProxyRouteCorsHeaders({
    requestOrigin: request.headers.get('origin'),
    allowedOriginsRaw,
  });

  headers.set('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
  headers.set('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
  headers.set('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
  headers.set('Vary', corsHeaders.Vary);

  return new NextResponse(body, {
    status: sourceResponse.status,
    headers,
  });
};
