import { NextResponse } from 'next/server';

import {
  describeConfiguratorProviderCredentialSession,
  migrateConfiguratorProviderCredentialSession,
  updateConfiguratorProviderCredentialSession,
} from '@/lib/configuratorProviderCredentialSession';

export const dynamic = 'force-dynamic';

const applyProviderCredentialCookie = (
  response: NextResponse,
  cookie: ReturnType<typeof updateConfiguratorProviderCredentialSession>['cookie'],
) => {
  response.cookies.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    secure: cookie.secure,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });
};

export async function GET(request: Request) {
  const migratedSession = migrateConfiguratorProviderCredentialSession(request);
  const { status, maskedPreview } = migratedSession || describeConfiguratorProviderCredentialSession(request);

  const response = NextResponse.json({ ok: true, status, maskedPreview });

  if (migratedSession) {
    applyProviderCredentialCookie(response, migratedSession.cookie);
  }

  return response;
}

export async function PUT(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid provider credential payload.' }, { status: 400 });
  }

  if (payload && typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid provider credential payload.' }, { status: 400 });
  }

  const result = updateConfiguratorProviderCredentialSession(
    request,
    payload ? (payload as Record<string, unknown>) : null,
  );
  const response = NextResponse.json({
    ok: true,
    status: result.status,
    maskedPreview: result.maskedPreview,
  });

  applyProviderCredentialCookie(response, result.cookie);

  return response;
}