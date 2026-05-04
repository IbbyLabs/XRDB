import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  COMMUNITY_TEMPLATES,
  type CommunityTemplate,
} from '@/lib/community-templates';
import {
  listApprovedCommunityTemplates,
  submitCommunityTemplate,
} from '@/lib/communityTemplateStore';

const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 280;
const MAX_AUTHOR_LENGTH = 60;
const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 40;

export async function GET() {
  try {
    const dbTemplates = await listApprovedCommunityTemplates();

    const fromDb: CommunityTemplate[] = dbTemplates.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      author: row.author || undefined,
      tags: row.tags,
      config: row.config as CommunityTemplate['config'],
    }));

    return NextResponse.json({ templates: [...COMMUNITY_TEMPLATES, ...fromDb] });
  } catch {
    return NextResponse.json({ error: 'Failed to load templates.' }, { status: 500 });
  }
}

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
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  const author = typeof raw.author === 'string' ? raw.author.trim() : '';
  const config = raw.config;

  if (!name) {
    return NextResponse.json({ error: 'name is required.' }, { status: 400 });
  }
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `name must be at most ${MAX_NAME_LENGTH} characters.` },
      { status: 400 },
    );
  }
  if (!description) {
    return NextResponse.json({ error: 'description is required.' }, { status: 400 });
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return NextResponse.json(
      { error: `description must be at most ${MAX_DESCRIPTION_LENGTH} characters.` },
      { status: 400 },
    );
  }
  if (author.length > MAX_AUTHOR_LENGTH) {
    return NextResponse.json(
      { error: `author must be at most ${MAX_AUTHOR_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const rawTags = Array.isArray(raw.tags) ? raw.tags : [];
  const tags: string[] = rawTags
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_TAGS);

  for (const tag of tags) {
    if (tag.length > MAX_TAG_LENGTH) {
      return NextResponse.json(
        { error: `Each tag must be at most ${MAX_TAG_LENGTH} characters.` },
        { status: 400 },
      );
    }
  }

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return NextResponse.json({ error: 'config must be an object.' }, { status: 400 });
  }

  const configObj = config as Record<string, unknown>;
  if (configObj.version !== 1) {
    return NextResponse.json({ error: 'config.version must be 1.' }, { status: 400 });
  }
  if (!configObj.settings || typeof configObj.settings !== 'object' || Array.isArray(configObj.settings)) {
    return NextResponse.json({ error: 'config.settings must be an object.' }, { status: 400 });
  }

  try {
    const id = await submitCommunityTemplate({
      name,
      description,
      author: author || 'Anonymous',
      tags,
      config: configObj as Record<string, unknown>,
    });

    return NextResponse.json(
      { id, message: 'Template submitted. It will appear after review.' },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Failed to submit template.' }, { status: 500 });
  }
}
