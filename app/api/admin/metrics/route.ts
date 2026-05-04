import { type NextRequest } from 'next/server';
import { isAdminEnabled, verifyAdminRequest } from '@/lib/adminAuth';
import { getMetricsSnapshot, getRecentRequests, clearRequestLog, clearCacheEvents } from '@/lib/adminMetrics';

export async function GET(request: NextRequest) {
  if (!isAdminEnabled()) return new Response('Not Found', { status: 404 });
  if (!verifyAdminRequest(request)) return new Response('Unauthorized', { status: 401 });

  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 100, 500) : 100;

  const snapshot = getMetricsSnapshot();
  const recent = getRecentRequests(limit);

  return Response.json({ snapshot, recent });
}

export async function DELETE(request: NextRequest) {
  if (!isAdminEnabled()) return new Response('Not Found', { status: 404 });
  if (!verifyAdminRequest(request)) return new Response('Unauthorized', { status: 401 });

  const target = request.nextUrl.searchParams.get('target') ?? 'all';
  if (target === 'cache-events') {
    clearCacheEvents();
  } else {
    clearRequestLog();
    clearCacheEvents();
  }

  return Response.json({ ok: true });
}
