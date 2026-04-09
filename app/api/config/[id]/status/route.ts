import { NextRequest, NextResponse } from 'next/server';

import { getConfigProfile, getConfigProfileDeadline, LEGACY_ID_RE } from '@/lib/dbCore';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const isLegacy = LEGACY_ID_RE.test(id);
  if (!isLegacy) {
    return NextResponse.json({ isLegacy: false, migrationDeadline: null });
  }
  const profile = getConfigProfile(id);
  if (!profile) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const migrationDeadline = getConfigProfileDeadline(id);
  return NextResponse.json({ isLegacy: true, migrationDeadline });
}
