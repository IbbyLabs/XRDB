import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  buildTmdbMultiSearchUrl,
  isMediaSearchPreviewType,
  mapOmdbSearchResultsForPreviewType,
  mapTmdbSearchResultsForPreviewType,
} from '@/lib/configuratorMediaSearch';
import { OMDB_API_KEY } from '@/lib/imageRouteConfig';
import { OMDB_API_BASE_URL } from '@/lib/serviceBaseUrls';

const DEFAULT_SEARCH_LANGUAGE = 'en-US';
const SEARCH_RESULTS_LIMIT = 8;

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

  const tmdbSearchUrl = buildTmdbMultiSearchUrl({
    tmdbKey,
    query: searchQuery,
    language,
    includeAdult: false,
    page: 1,
  });

  const tmdbResponse = await fetch(tmdbSearchUrl, { cache: 'no-store' }).catch(() => null);
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
    limit: SEARCH_RESULTS_LIMIT,
  });
  if (items.length > 0) {
    return NextResponse.json({ items });
  }

  const omdbKey = String(OMDB_API_KEY || '').trim();
  if (!omdbKey) {
    return NextResponse.json({ items: [] });
  }

  const omdbTarget = new URL(OMDB_API_BASE_URL);
  omdbTarget.searchParams.set('apikey', omdbKey);
  omdbTarget.searchParams.set('s', searchQuery);
  if (previewType === 'thumbnail') {
    omdbTarget.searchParams.set('type', 'series');
  }

  const omdbResponse = await fetch(omdbTarget.toString(), { cache: 'no-store' }).catch(() => null);
  if (!omdbResponse?.ok) {
    return NextResponse.json({ items: [] });
  }

  const omdbPayload = await omdbResponse.json().catch(() => null);
  const omdbResults = Array.isArray((omdbPayload as { Search?: unknown[] } | null)?.Search)
    ? (omdbPayload as { Search: unknown[] }).Search
    : [];
  const omdbItems = mapOmdbSearchResultsForPreviewType({
    results: omdbResults,
    previewType,
    limit: SEARCH_RESULTS_LIMIT,
  });

  return NextResponse.json({ items: omdbItems });
}
