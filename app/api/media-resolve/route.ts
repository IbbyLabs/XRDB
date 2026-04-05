import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { TMDB_API_BASE_URL } from '@/lib/serviceBaseUrls';

const EMPTY_RESULT = { title: null };

export async function GET(request: NextRequest) {
  const id = String(request.nextUrl.searchParams.get('id') || '').trim();
  const tmdbKey = String(request.nextUrl.searchParams.get('tmdbKey') || '').trim();

  if (!id || !tmdbKey) {
    return NextResponse.json(EMPTY_RESULT, { status: 400 });
  }

  const tmdbPrefixMatch = /^tmdb:(movie|tv):(\d+)/.exec(id);
  if (tmdbPrefixMatch) {
    const mediaType = tmdbPrefixMatch[1];
    const tmdbId = tmdbPrefixMatch[2];
    const url = `${TMDB_API_BASE_URL}/${mediaType}/${tmdbId}?api_key=${tmdbKey}&language=en-US`;
    const response = await fetch(url, { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return NextResponse.json(EMPTY_RESULT);
    const data = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!data) return NextResponse.json(EMPTY_RESULT);
    const title = String((data.title ?? data.name) || '').trim() || null;
    const year = data.release_date || data.first_air_date;
    const yearStr = year ? String(year).slice(0, 4) : null;
    return NextResponse.json({ title: title && yearStr ? `${title} (${yearStr})` : title });
  }

  const url = `${TMDB_API_BASE_URL}/find/${encodeURIComponent(id)}?api_key=${tmdbKey}&external_source=imdb_id&language=en-US`;
  const response = await fetch(url, { cache: 'no-store' }).catch(() => null);
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
