import { NextRequest } from 'next/server';

import {
  handleProxyGet,
  handleProxyOptions,
} from '@/lib/proxyRouteHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return handleProxyOptions(request);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const params = await context.params;
  return handleProxyGet(request, params?.path || []);
}
