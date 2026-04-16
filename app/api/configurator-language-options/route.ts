import { NextResponse } from 'next/server';

import { buildTmdbSupportedLanguageOptions } from '@/lib/configuratorLanguageOptions';
import { TMDB_API_KEY } from '@/lib/imageRouteConfig';
import { TMDB_API_BASE_URL } from '@/lib/serviceBaseUrls';

type TmdbLanguageRecord = {
  english_name?: string | null;
  iso_639_1?: string | null;
  name?: string | null;
};

const toUpstreamErrorStatus = (status: number) =>
  status === 401 || status === 403 ? 401 : 502;

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!TMDB_API_KEY) {
    return NextResponse.json(
      { error: 'TMDB key is required.', options: [] },
      { status: 400 },
    );
  }

  const [languagesResponse, primaryTranslationsResponse] = await Promise.all([
    fetch(
      `${TMDB_API_BASE_URL}/configuration/languages?api_key=${encodeURIComponent(TMDB_API_KEY)}`,
      { cache: 'no-store' },
    ),
    fetch(
      `${TMDB_API_BASE_URL}/configuration/primary_translations?api_key=${encodeURIComponent(TMDB_API_KEY)}`,
      { cache: 'no-store' },
    ),
  ]);

  if (!languagesResponse.ok) {
    return NextResponse.json(
      { error: 'TMDB language request failed.', options: [] },
      { status: toUpstreamErrorStatus(languagesResponse.status) },
    );
  }

  const languagesPayload = (await languagesResponse.json().catch(() => null)) as
    | TmdbLanguageRecord[]
    | null;
  if (!Array.isArray(languagesPayload)) {
    return NextResponse.json(
      { error: 'TMDB language payload was invalid.', options: [] },
      { status: 502 },
    );
  }

  const primaryTranslationsPayload = primaryTranslationsResponse.ok
    ? ((await primaryTranslationsResponse.json().catch(() => null)) as string[] | null)
    : null;

  return NextResponse.json({
    options: buildTmdbSupportedLanguageOptions({
      languages: languagesPayload,
      primaryTranslations: Array.isArray(primaryTranslationsPayload)
        ? primaryTranslationsPayload.filter((value): value is string => typeof value === 'string')
        : [],
    }),
  });
}