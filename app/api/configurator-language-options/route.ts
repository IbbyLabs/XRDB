import { NextResponse } from 'next/server';

import { buildTmdbSupportedLanguageOptions } from '@/lib/configuratorLanguageOptions';
import { readConfiguratorProviderCredentialSession } from '@/lib/configuratorProviderCredentialSession';
import { TMDB_API_KEY } from '@/lib/imageRouteConfig';
import { TMDB_API_BASE_URL } from '@/lib/serviceBaseUrls';
import { fetchTmdbServer, hasServerTmdbCredentials } from '@/lib/tmdbServerAuth';

type TmdbLanguageRecord = {
  english_name?: string | null;
  iso_639_1?: string | null;
  name?: string | null;
};

const toUpstreamErrorStatus = (status: number) =>
  status === 401 || status === 403 ? 401 : 502;

const resolveRequestTmdbKey = (request: Request) => {
  const searchParams = new URL(request.url).searchParams;
  return (searchParams.get('tmdbKey') || searchParams.get('tmdb_key') || '').trim();
};

const buildTmdbConfigurationUrl = (path: string, tmdbKey = '') => {
  const target = new URL(path, `${TMDB_API_BASE_URL.replace(/\/+$/, '')}/`);
  if (tmdbKey) {
    target.searchParams.set('api_key', tmdbKey);
  } else if (TMDB_API_KEY) {
    target.searchParams.set('api_key', TMDB_API_KEY);
  }
  return target.toString();
};

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestTmdbKey =
    resolveRequestTmdbKey(request) || readConfiguratorProviderCredentialSession(request).tmdbKey;

  if (!requestTmdbKey && !hasServerTmdbCredentials()) {
    return NextResponse.json(
      { error: 'TMDB credentials are required.', options: [] },
      { status: 400 },
    );
  }

  const [languagesResponse, primaryTranslationsResponse] = await Promise.all([
    fetchTmdbServer(buildTmdbConfigurationUrl('configuration/languages', requestTmdbKey), {
      cache: 'no-store',
    }),
    fetchTmdbServer(buildTmdbConfigurationUrl('configuration/primary_translations', requestTmdbKey), {
      cache: 'no-store',
    }),
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