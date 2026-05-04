import { type NextRequest } from 'next/server';
import { isAdminEnabled, verifyAdminRequest } from '@/lib/adminAuth';
import { approveCommunityTemplate, deleteCommunityTemplate } from '@/lib/communityTemplateStore';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isAdminEnabled()) return new Response('Not Found', { status: 404 });
  if (!verifyAdminRequest(request)) return new Response('Unauthorized', { status: 401 });

  const { id } = await context.params;
  const approved = await approveCommunityTemplate(id);
  if (!approved) {
    return Response.json({ error: 'Template not found' }, { status: 404 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isAdminEnabled()) return new Response('Not Found', { status: 404 });
  if (!verifyAdminRequest(request)) return new Response('Unauthorized', { status: 401 });

  const { id } = await context.params;
  const deleted = await deleteCommunityTemplate(id);
  if (!deleted) {
    return Response.json({ error: 'Template not found' }, { status: 404 });
  }
  return Response.json({ ok: true });
}
