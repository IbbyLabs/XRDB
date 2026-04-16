import { NextRequest, NextResponse } from 'next/server';

import { getConfigProfileDeadline, getConfigProfileMetadata } from '@/lib/dbCore';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const metadata = getConfigProfileMetadata(id);
  if (!metadata) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({
    isLegacy: metadata.isLegacy,
    migrationDeadline: metadata.isLegacy ? getConfigProfileDeadline(id) : null,
    requiresPassword: metadata.hasPassword,
    failedAttempts: metadata.failedAttempts,
    lockedUntil: metadata.lockedUntil,
    isLocked: typeof metadata.lockedUntil === 'number' && metadata.lockedUntil > Date.now(),
  });
}
