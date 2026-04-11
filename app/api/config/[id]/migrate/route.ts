import { NextRequest, NextResponse } from 'next/server';

import { migrateLegacyConfigProfileFromBody } from '@/lib/configProfileRoute';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await migrateLegacyConfigProfileFromBody(id, body);
  return NextResponse.json(result.body, { status: result.status });
}