import { type NextRequest } from 'next/server';
import { isAdminEnabled, verifyAdminRequest } from '@/lib/adminAuth';
import { listAllConfigProfiles } from '@/lib/dbCore';

export async function GET(request: NextRequest) {
  if (!isAdminEnabled()) return new Response('Not Found', { status: 404 });
  if (!verifyAdminRequest(request)) return new Response('Unauthorized', { status: 401 });

  const q = request.nextUrl.searchParams.get('q') ?? undefined;
  const profiles = listAllConfigProfiles(q);
  return Response.json({ profiles });
}
