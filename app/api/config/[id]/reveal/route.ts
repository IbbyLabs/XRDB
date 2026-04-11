import { NextRequest, NextResponse } from 'next/server';

import {
  authorizeConfigProfileManagement,
  revealConfigProfileForManagement,
} from '@/lib/configProfileRoute';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorized = authorizeConfigProfileManagement(request.headers, id);
  if (!authorized.ok) {
    return NextResponse.json(authorized.body, { status: authorized.status });
  }
  const profile = revealConfigProfileForManagement(id);
  if (!profile) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(profile);
}