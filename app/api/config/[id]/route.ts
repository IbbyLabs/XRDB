import { NextRequest, NextResponse } from 'next/server';

import { deleteConfigProfile } from '@/lib/dbCore';
import {
  authorizeConfigProfileManagement,
  buildConfigProfilePublicMetadata,
  updateConfigProfileFromBody,
} from '@/lib/configProfileRoute';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const profile = buildConfigProfilePublicMetadata(id);
  if (!profile) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(profile);
}

export async function PATCH(
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

  const result = await updateConfigProfileFromBody(id, body);
  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorized = authorizeConfigProfileManagement(request.headers, id);
  if (!authorized.ok) {
    return NextResponse.json(authorized.body, { status: authorized.status });
  }
  const deleted = deleteConfigProfile(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
