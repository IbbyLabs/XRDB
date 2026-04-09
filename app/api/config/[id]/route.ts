import { NextRequest, NextResponse } from 'next/server';

import { getConfigProfile } from '@/lib/dbCore';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = getConfigProfile(id);
  if (!profile) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(profile);
}
