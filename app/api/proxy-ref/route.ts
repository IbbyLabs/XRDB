import { NextRequest, NextResponse } from 'next/server';

import { createOrReuseProxyReference } from '@/lib/dbCore';
import { normalizeProxyConfigPayload } from '@/lib/proxyConfigCodec';
import { buildProxyReferenceUrl } from '@/lib/proxyRouteHttp';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }

  const config = normalizeProxyConfigPayload(body as Record<string, unknown>);
  if (!config) {
    return NextResponse.json({ error: 'Invalid proxy payload' }, { status: 400 });
  }

  const id = createOrReuseProxyReference(config);
  const url = buildProxyReferenceUrl(request, id);
  return NextResponse.json({ id, url });
}
