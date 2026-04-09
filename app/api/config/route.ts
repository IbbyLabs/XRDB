import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { upsertConfigProfile } from '@/lib/dbCore';

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

  const raw = body as Record<string, unknown>;
  const providedId = typeof raw._id === 'string' && raw._id.trim() ? raw._id.trim() : null;
  const id = providedId ?? `xr_${randomBytes(4).toString('hex')}`;

  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === '_id') continue;
    if (value !== null && value !== undefined && value !== '') {
      params[key] = String(value);
    }
  }

  upsertConfigProfile(id, params);

  return NextResponse.json({ id });
}
