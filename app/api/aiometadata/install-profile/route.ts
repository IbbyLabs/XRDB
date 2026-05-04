import { NextRequest, NextResponse } from 'next/server';

import { normalizeAiometadataOrigin } from '@/lib/aiometadataProfileRepair';

const readRemoteJson = async (response: Response) =>
  (await response.json().catch(() => null)) as Record<string, unknown> | null;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }

  const payload = body as {
    baseUrl?: string;
    userUUID?: string;
    password?: string;
    addonPassword?: string;
    posterUrlPattern?: string;
    backgroundUrlPattern?: string;
    logoUrlPattern?: string;
    episodeThumbnailUrlPattern?: string;
  };

  const baseUrl = normalizeAiometadataOrigin(payload.baseUrl);
  if (!baseUrl) {
    return NextResponse.json({ error: 'AIOMetadata base URL must be a valid http or https URL.' }, { status: 400 });
  }

  const userUUID = String(payload.userUUID || '').trim();
  const password = String(payload.password || '');
  const addonPassword = String(payload.addonPassword || '');

  if (!userUUID) {
    return NextResponse.json({ error: 'AIOMetadata UUID is required.' }, { status: 400 });
  }

  if (!password) {
    return NextResponse.json({ error: 'AIOMetadata profile password is required.' }, { status: 400 });
  }

  const posterUrlPattern = String(payload.posterUrlPattern || '').trim();
  const backgroundUrlPattern = String(payload.backgroundUrlPattern || '').trim();
  const logoUrlPattern = String(payload.logoUrlPattern || '').trim();
  const episodeThumbnailUrlPattern = String(payload.episodeThumbnailUrlPattern || '').trim();

  if (!posterUrlPattern && !backgroundUrlPattern && !logoUrlPattern && !episodeThumbnailUrlPattern) {
    return NextResponse.json({ error: 'At least one XRDB AIOMetadata pattern is required.' }, { status: 400 });
  }

  const authPayload = {
    password,
    ...(addonPassword ? { addonPassword } : {}),
  };

  const loadResponse = await fetch(`${baseUrl}/api/config/load/${encodeURIComponent(userUUID)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(authPayload),
    cache: 'no-store',
  });
  const loadJson = await readRemoteJson(loadResponse);
  if (!loadResponse.ok || loadJson?.success !== true || !loadJson.config || typeof loadJson.config !== 'object') {
    return NextResponse.json(
      { error: String(loadJson?.error || 'Failed to load AIOMetadata profile.') },
      { status: loadResponse.ok ? 502 : loadResponse.status },
    );
  }

  const config = loadJson.config as Record<string, unknown>;
  const nextConfig = {
    ...config,
    posterRatingProvider: 'custom',
    customPosterUrlPattern: posterUrlPattern,
    customBackgroundUrlPattern: backgroundUrlPattern,
    customLogoUrlPattern: logoUrlPattern,
    customThumbnailUrlPattern: episodeThumbnailUrlPattern,
  };

  const updateResponse = await fetch(`${baseUrl}/api/config/update/${encodeURIComponent(userUUID)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: nextConfig,
      ...authPayload,
    }),
    cache: 'no-store',
  });
  const updateJson = await readRemoteJson(updateResponse);
  if (!updateResponse.ok || updateJson?.success !== true) {
    return NextResponse.json(
      { error: String(updateJson?.error || 'Failed to update AIOMetadata profile.') },
      { status: updateResponse.ok ? 502 : updateResponse.status },
    );
  }

  return NextResponse.json({
    installUrl: updateJson?.installUrl ?? null,
    message: 'AIOMetadata profile updated with XRDB custom art patterns.',
  });
}