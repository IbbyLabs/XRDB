import { type NextRequest } from 'next/server';
import { isAdminEnabled, verifyAdminRequest } from '@/lib/adminAuth';
import { deleteConfigProfile, clearConfigProfilePassword, unlockConfigProfile, getConfigProfileMetadata, getConfigProfile } from '@/lib/dbCore';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isAdminEnabled()) return new Response('Not Found', { status: 404 });
  if (!verifyAdminRequest(request)) return new Response('Unauthorized', { status: 401 });

  const { id } = await context.params;
  const params = getConfigProfile(id);
  if (params === null) {
    return Response.json({ error: 'Profile not found' }, { status: 404 });
  }
  return Response.json({ params });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isAdminEnabled()) return new Response('Not Found', { status: 404 });
  if (!verifyAdminRequest(request)) return new Response('Unauthorized', { status: 401 });

  const { id } = await context.params;
  const deleted = deleteConfigProfile(id);
  if (!deleted) {
    return Response.json({ error: 'Profile not found' }, { status: 404 });
  }
  return Response.json({ ok: true });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isAdminEnabled()) return new Response('Not Found', { status: 404 });
  if (!verifyAdminRequest(request)) return new Response('Unauthorized', { status: 401 });

  const { id } = await context.params;

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid request body', { status: 400 });
  }

  if (body.action === 'reset-password') {
    const updated = clearConfigProfilePassword(id);
    if (!updated) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }
    return Response.json({ ok: true, profile: getConfigProfileMetadata(id) });
  }

  if (body.action === 'unlock') {
    const updated = unlockConfigProfile(id);
    if (!updated) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }
    return Response.json({ ok: true, profile: getConfigProfileMetadata(id) });
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
}
