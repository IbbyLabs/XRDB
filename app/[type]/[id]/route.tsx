import { NextRequest } from 'next/server';

import { handleImageRouteGet } from '@/lib/imageRouteHandler';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  return handleImageRouteGet(request, params);
}
