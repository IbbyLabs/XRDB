import { type NextRequest } from 'next/server';
import { isAdminEnabled, verifyAdminRequest } from '@/lib/adminAuth';
import { runPosterCacheWarm } from '@/lib/posterCacheWarmScheduler';

let prewarmInFlight = false;

export async function POST(request: NextRequest) {
  if (!isAdminEnabled()) return new Response('Not Found', { status: 404 });
  if (!verifyAdminRequest(request)) return new Response('Unauthorized', { status: 401 });

  if (prewarmInFlight) {
    return Response.json({ started: false, reason: 'already running' }, { status: 409 });
  }

  prewarmInFlight = true;

  runPosterCacheWarm()
    .finally(() => {
      prewarmInFlight = false;
    });

  return Response.json({ started: true });
}
