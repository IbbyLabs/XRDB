import { type NextRequest } from 'next/server';
import { isAdminEnabled, verifyAdminRequest } from '@/lib/adminAuth';
import { listAllCommunityTemplates } from '@/lib/communityTemplateStore';

export async function GET(request: NextRequest) {
  if (!isAdminEnabled()) return new Response('Not Found', { status: 404 });
  if (!verifyAdminRequest(request)) return new Response('Unauthorized', { status: 401 });

  const templates = await listAllCommunityTemplates();
  return Response.json({ templates });
}
