import { type NextRequest } from 'next/server';
import { isAdminEnabled, verifyAdminKey, buildSetAdminCookieHeader } from '@/lib/adminAuth';

export async function POST(request: NextRequest) {
  if (!isAdminEnabled()) {
    return new Response('Not Found', { status: 404 });
  }

  let body: { key?: string };
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid request body', { status: 400 });
  }

  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!verifyAdminKey(key)) {
    return new Response('Unauthorized', { status: 401 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': buildSetAdminCookieHeader(key),
    },
  });
}
