import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  isMediaSearchPreviewType,
  mapTmdbSearchResultsForPreviewType,
} from '@/lib/configuratorMediaSearch';
import { TMDB_API_BASE_URL } from '@/lib/serviceBaseUrls';

const DEFAULT_SEARCH_LANGUAGE = 'en-US';

export async function GET(request: NextRequest) {
  const searchQuery = String(request.nextUrl.searchParams.get('q') || '').trim();
  const tmdbKey = String(request.nextUrl.searchParams.get('tmdbKey') || '').trim();
  const previewTypeRaw = String(request.nextUrl.searchParams.get('previewType') || '').trim();
  const language = String(request.nextUrl.searchParams.get('lang') || '').trim() || DEFAULT_SEARCH_LANGUAGE;

  if (!searchQuery || searchQuery.length < 2) {
    return NextResponse.json({ error: 'Search query must be at least 2 characters.' }, { status: 400 });
  }
  if (!tmdbKey) {
    return NextResponse.json({ error: 'TMDB key is required.' }, { status: 400 });
  }

  const previewType = isMediaSearchPreviewType(previewTypeRaw) ? previewTypeRaw : 'poster';

  const target = new URL('/search/multi', `${TMDB_API_BASE_URL}/`);
  target.searchParams.set('api_key', tmdbKey);
  target.searchParams.set('query', searchQuery);
  target.searchParams.set('include_adult', 'false');
  target.searchParams.set('language', language);
  target.searchParams.set('page', '1');

  const tmdbResponse = await fetch(target.toString(), { cache: 'no-store' }).catch(() => null);
  if (!tmdbResponse) {
    return NextResponse.json({ error: 'Search request failed.' }, { status: 502 });
  }
  if (!tmdbResponse.ok) {
    const status = tmdbResponse.status === 401 || tmdbResponse.status === 403 ? 401 : 502;
    return NextResponse.json({ error: 'TMDB search request failed.' }, { status });
  }

  const payload = await tmdbResponse.json().catch(() => null);
  const results = Array.isArray((payload as { results?: unknown[] } | null)?.results)
    ? (payload as { results: unknown[] }).results
    : [];
  const items = mapTmdbSearchResultsForPreviewType({
    results,
    previewType,
    limit: 8,
  });

  return NextResponse.json({ items });
}
