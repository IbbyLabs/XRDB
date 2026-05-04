import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { validatePalette } from '@/lib/theme';
import { submitCommunityTheme } from '@/lib/communityThemeStore';

const MAX_NAME_LENGTH = 60;
const MAX_AUTHOR_LENGTH = 60;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name || name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: 'name is required and must be 1-60 characters.' }, { status: 422 });
  }

  const author = typeof raw.author === 'string' ? raw.author.trim().slice(0, MAX_AUTHOR_LENGTH) : undefined;

  if (!validatePalette(raw.palette)) {
    return NextResponse.json({ error: 'palette is required and must be a valid OKLCH palette object.' }, { status: 422 });
  }

  try {
    const id = await submitCommunityTheme({ name, author: author || undefined, palette: raw.palette });
    return NextResponse.json({ id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to submit theme.' }, { status: 500 });
  }
}
