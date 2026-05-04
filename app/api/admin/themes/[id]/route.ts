import type { NextRequest } from 'next/server';

import { isAdminEnabled, verifyAdminRequest } from '@/lib/adminAuth';
import { reviewCommunityTheme } from '@/lib/communityThemeStore';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isAdminEnabled()) return new Response('Not Found', { status: 404 });
  if (!verifyAdminRequest(request)) return new Response('Unauthorized', { status: 401 });

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Body must be a JSON object.' }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const action = raw.action;

  if (action !== 'approve' && action !== 'deny') {
    return Response.json({ error: 'action must be "approve" or "deny".' }, { status: 422 });
  }

  const name = action === 'approve' && typeof raw.name === 'string' ? raw.name.trim() : undefined;
  const admin_note = typeof raw.admin_note === 'string' ? raw.admin_note.trim() : undefined;

  const updated = await reviewCommunityTheme(
    id,
    action === 'approve' ? 'approved' : 'denied',
    { name: name || undefined, admin_note: admin_note || undefined },
  );

  if (!updated) {
    return Response.json({ error: 'Theme not found.' }, { status: 404 });
  }

  return Response.json({ ok: true });
}
