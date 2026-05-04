import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  approveCommunityTemplate,
  deleteCommunityTemplate,
} from '@/lib/communityTemplateStore';
import { isAdminEnabled, verifyAdminRequest } from '@/lib/adminAuth';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  if (!isAdminEnabled()) {
    return NextResponse.json({ error: 'Not Found.' }, { status: 404 });
  }
  if (!verifyAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const updated = await approveCommunityTemplate(id);
  if (!updated) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  if (!isAdminEnabled()) {
    return NextResponse.json({ error: 'Not Found.' }, { status: 404 });
  }
  if (!verifyAdminRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const deleted = await deleteCommunityTemplate(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
