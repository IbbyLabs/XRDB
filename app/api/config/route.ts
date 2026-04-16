import { NextRequest, NextResponse } from 'next/server';

import { createProtectedConfigProfileFromBody } from '@/lib/configProfileRoute';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }

  const result = await createProtectedConfigProfileFromBody(body);
  if (!result.ok) {
    return NextResponse.json(result.body, { status: result.status });
  }

  return NextResponse.json({ id: result.id });
}
