import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { readConfiguratorProviderCredentialSession } from '@/lib/configuratorProviderCredentialSession';
import { TMDB_API_KEY } from '@/lib/imageRouteConfig';
import { TMDB_API_BASE_URL } from '@/lib/serviceBaseUrls';
import { fetchTmdbServer, hasServerTmdbCredentials } from '@/lib/tmdbServerAuth';

const EMPTY_RESULT = { title: null };

const buildTmdbResolveUrl = (
  path: string,
  tmdbKey: string,
  searchParams: Record<string, string>,
) => {
  const target = new URL(path, `${TMDB_API_BASE_URL.replace(/\/+$/, '')}/`);
  if (tmdbKey) {
    target.searchParams.set('api_key', tmdbKey);
  }
  for (const [key, value] of Object.entries(searchParams)) {
    target.searchParams.set(key, value);
  }
  return target.toString();
};

export async function GET(request: NextRequest) {
  const id = String(request.nextUrl.searchParams.get('id') || '').trim();
  const sessionTmdbKey = readConfiguratorProviderCredentialSession(request).tmdbKey;
  const tmdbKey =
    String(request.nextUrl.searchParams.get('tmdbKey') || '').trim() || sessionTmdbKey || TMDB_API_KEY;

  if (!id || (!tmdbKey && !hasServerTmdbCredentials())) {
    return NextResponse.json(EMPTY_RESULT, { status: 400 });
  }

  const tmdbPrefixMatch = /^tmdb:(movie|tv):(\d+)/.exec(id);
  if (tmdbPrefixMatch) {
    const mediaType = tmdbPrefixMatch[1];
    const tmdbId = tmdbPrefixMatch[2];
    const url = buildTmdbResolveUrl(`${mediaType}/${tmdbId}`, tmdbKey, { language: 'en-US' });
    const response = await fetchTmdbServer(url, { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return NextResponse.json(EMPTY_RESULT);
    const data = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!data) return NextResponse.json(EMPTY_RESULT);
    const title = String((data.title ?? data.name) || '').trim() || null;
    const year = data.release_date || data.first_air_date;
    const yearStr = year ? String(year).slice(0, 4) : null;
    return NextResponse.json({ title: title && yearStr ? `${title} (${yearStr})` : title });
  }

  const url = buildTmdbResolveUrl(`find/${encodeURIComponent(id)}`, tmdbKey, {
    external_source: 'imdb_id',
    language: 'en-US',
  });
  const response = await fetchTmdbServer(url, { cache: 'no-store' }).catch(() => null);
  if (!response?.ok) return NextResponse.json(EMPTY_RESULT);
  const data = await response.json().catch(() => null) as Record<string, unknown[]> | null;
  if (!data) return NextResponse.json(EMPTY_RESULT);

  const allResults = [
    ...((data.movie_results as Record<string, unknown>[]) ?? []),
    ...((data.tv_results as Record<string, unknown>[]) ?? []),
  ];
  if (allResults.length === 0) return NextResponse.json(EMPTY_RESULT);

  const first = allResults[0] as Record<string, unknown>;
  const title = String((first.title ?? first.name) || '').trim() || null;
  const year = first.release_date || first.first_air_date;
  const yearStr = year ? String(year).slice(0, 4) : null;
  return NextResponse.json({ title: title && yearStr ? `${title} (${yearStr})` : title });
}
