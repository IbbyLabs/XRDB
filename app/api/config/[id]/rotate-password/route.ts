import { NextRequest, NextResponse } from 'next/server';

import {
  authorizeConfigProfileManagement,
  rotateConfigProfilePasswordFromBody,
} from '@/lib/configProfileRoute';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorized = authorizeConfigProfileManagement(request.headers, id);
  if (!authorized.ok) {
    return NextResponse.json(authorized.body, { status: authorized.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await rotateConfigProfilePasswordFromBody(id, body);
  return NextResponse.json(result.body, { status: result.status });
}