import { NextRequest, NextResponse } from 'next/server';

import {
  buildReadmePreviewTargetUrl,
  resolveReadmePreviewDefinition,
  resolveReadmePreviewOrigins,
} from '@/lib/readmePreview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const buildTextResponse = (message: string, status: number) =>
  new NextResponse(message, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });

const copyPreviewHeaders = (response: Response, contentLength?: number) => {
  const headers = new Headers();
  const contentType = response.headers.get('content-type');
  const cacheControl = response.headers.get('cache-control');
  const sourceContentLength = response.headers.get('content-length');
  const etag = response.headers.get('etag');

  if (contentType) headers.set('content-type', contentType);
  if (cacheControl) headers.set('cache-control', cacheControl);
  if (typeof contentLength === 'number' && Number.isFinite(contentLength) && contentLength >= 0) {
    headers.set('content-length', String(contentLength));
  } else if (sourceContentLength) {
    headers.set('content-length', sourceContentLength);
  }
  if (etag) headers.set('etag', etag);
  headers.set('x-robots-tag', 'noindex');

  return headers;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const definition = resolveReadmePreviewDefinition(slug);
  if (!definition) {
    return buildTextResponse('Unknown README preview.', 404);
  }

  const tmdbKey = process.env.XRDB_README_PREVIEW_TMDB_KEY?.trim();
  if (!tmdbKey) {
    return buildTextResponse('README preview TMDB key is not configured.', 503);
  }

  const mdblistKey = process.env.XRDB_README_PREVIEW_MDBLIST_KEY?.trim() || null;
  const cacheBuster = request.nextUrl.searchParams.get('cb');
  const previewOrigins = resolveReadmePreviewOrigins({
    requestOrigin: request.nextUrl.origin,
    previewOrigin: process.env.XRDB_PREVIEW_ORIGIN,
    bindHost: process.env.HOSTNAME,
    port: process.env.PORT,
  });

  let sourceResponse: Response | null = null;
  for (const previewOrigin of previewOrigins) {
    const targetUrl = buildReadmePreviewTargetUrl({
      origin: previewOrigin,
      definition,
      tmdbKey,
      mdblistKey,
      cacheBuster,
    });

    try {
      sourceResponse = await fetch(targetUrl.toString(), { cache: 'no-store' });
    } catch {
      continue;
    }

    if (sourceResponse.ok) {
      break;
    }
  }

  if (!sourceResponse) {
    return buildTextResponse('README preview fetch failed.', 502);
  }

  if (!sourceResponse.ok) {
    const fallbackBody = await sourceResponse.text().catch(() => 'README preview fetch failed.');
    return new NextResponse(fallbackBody, {
      status: sourceResponse.status,
      headers: {
        'content-type':
          sourceResponse.headers.get('content-type') || 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex',
      },
    });
  }

  let payload: ArrayBuffer;
  try {
    payload = await sourceResponse.arrayBuffer();
  } catch {
    return buildTextResponse('README preview fetch failed.', 502);
  }

  return new NextResponse(payload, {
    status: sourceResponse.status,
    headers: copyPreviewHeaders(sourceResponse, payload.byteLength),
  });
}
