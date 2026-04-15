import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';

import { TMDB_API_KEY } from './imageRouteConfig.ts';
import { resolveImdbDatasetPaths } from './imdbDatasetLookupSchedulerConfig.ts';
import { logger } from './serverLogger.ts';
import { TMDB_API_BASE_URL } from './serviceBaseUrls.ts';
import type { PosterCacheWarmConfig } from './posterCacheWarmConfig.ts';

type WarmFetchImpl = typeof fetch;

type TmdbPopularPayload = {
  results?: Array<{
    id?: number;
  }>;
};

type MdblistTrendingItem = {
  imdb_id?: string | null;
};

const MDBLIST_TRENDING_LIST_URLS = [
  'https://mdblist.com/lists/garycrawfordgc/top-movies-of-the-week/json',
  'https://mdblist.com/lists/garycrawfordgc/latest-tv-shows/json',
] as const;

const toPositiveInteger = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : null;
};

const toImdbId = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^tt\d+$/i.test(normalized) ? normalized : null;
};

const limitIds = (ids: string[], limit: number) => ids.slice(0, Math.max(0, limit));

const TMDB_ENDPOINTS: Array<{ path: string; page: number; mediaType: 'movie' | 'tv' }> = [
  { path: 'movie/popular', page: 1, mediaType: 'movie' },
  { path: 'movie/popular', page: 2, mediaType: 'movie' },
  { path: 'movie/now_playing', page: 1, mediaType: 'movie' },
  { path: 'tv/popular', page: 1, mediaType: 'tv' },
  { path: 'tv/popular', page: 2, mediaType: 'tv' },
  { path: 'tv/on_the_air', page: 1, mediaType: 'tv' },
];

export const fetchTmdbPopularIds = async ({
  config,
  fetchImpl = fetch,
  tmdbKey = TMDB_API_KEY,
}: {
  config: Pick<PosterCacheWarmConfig, 'tmdbEnabled' | 'tmdbLimit' | 'logEnabled'>;
  fetchImpl?: WarmFetchImpl;
  tmdbKey?: string;
}) => {
  if (!config.tmdbEnabled || !tmdbKey) {
    return [];
  }

  try {
    const responses = await Promise.all(
      TMDB_ENDPOINTS.map(({ path, page }) =>
        fetchImpl(
          `${TMDB_API_BASE_URL}/${path}?api_key=${encodeURIComponent(tmdbKey)}&language=en-US&page=${page}`,
          { cache: 'no-store' },
        ),
      ),
    );

    const failedLabels = responses
      .map((r, i) =>
        r.ok ? null : `${TMDB_ENDPOINTS[i].path}[page=${TMDB_ENDPOINTS[i].page}]=${r.status}`,
      )
      .filter((s): s is string => s !== null);

    if (failedLabels.length === responses.length) {
      logger.warn(`[XRDB] poster warm TMDB fetch failed: ${failedLabels.join(' ')}`);
      return [];
    }

    if (failedLabels.length > 0) {
      logger.warn(`[XRDB] poster warm TMDB some endpoints failed: ${failedLabels.join(' ')}`);
    }

    const payloads = (await Promise.all(
      responses.map((r) =>
        r.ok ? (r.json() as Promise<TmdbPopularPayload>) : Promise.resolve<TmdbPopularPayload>({}),
      ),
    )) as TmdbPopularPayload[];

    const allIds: string[] = [];
    for (let i = 0; i < TMDB_ENDPOINTS.length; i++) {
      const { mediaType } = TMDB_ENDPOINTS[i];
      const payload = payloads[i];
      if (!Array.isArray(payload.results)) continue;
      for (const item of payload.results) {
        const id = toPositiveInteger(item?.id);
        if (id !== null) allIds.push(`tmdb:${mediaType}:${id}`);
      }
    }

    const mergedIds = limitIds([...new Set(allIds)], config.tmdbLimit);
    if (config.logEnabled) {
      logger.info(`[XRDB] poster warm TMDB source fetched=${mergedIds.length}`);
    }
    return mergedIds;
  } catch (error) {
    logger.warn('[XRDB] poster warm TMDB popular fetch failed:', error instanceof Error ? error.message : error);
    return [];
  }
};

export const fetchMdblistTrendingIds = async ({
  config,
  fetchImpl = fetch,
}: {
  config: Pick<PosterCacheWarmConfig, 'mdblistEnabled' | 'mdblistLimit' | 'logEnabled'>;
  fetchImpl?: WarmFetchImpl;
}) => {
  if (!config.mdblistEnabled) {
    return [];
  }

  try {
    const responses = await Promise.all(
      MDBLIST_TRENDING_LIST_URLS.map((url) => fetchImpl(url, { cache: 'no-store' })),
    );

    if (responses.some((response) => !response.ok)) {
      logger.warn(
        `[XRDB] poster warm MDBList trending fetch failed statuses=${responses.map((response) => response.status).join(',')}`,
      );
      return [];
    }

    const payloads = (await Promise.all(
      responses.map((response) => response.json()),
    )) as MdblistTrendingItem[][];

    const ids = limitIds(
      [...new Set(payloads.flatMap((payload) => payload.map((item) => toImdbId(item?.imdb_id)).filter((item): item is string => item !== null)))],
      config.mdblistLimit,
    );

    if (config.logEnabled) {
      logger.info(`[XRDB] poster warm MDBList source fetched=${ids.length}`);
    }
    return ids;
  } catch (error) {
    logger.warn(
      '[XRDB] poster warm MDBList trending fetch failed:',
      error instanceof Error ? error.message : error,
    );
    return [];
  }
};

export const fetchImdbTopRatedIds = async ({
  config,
  ratingsPath = resolveImdbDatasetPaths().ratingsPath,
}: {
  config: Pick<PosterCacheWarmConfig, 'imdbEnabled' | 'imdbLimit' | 'logEnabled'>;
  ratingsPath?: string;
}) => {
  if (!config.imdbEnabled) {
    return [];
  }

  if (!existsSync(ratingsPath)) {
    if (config.logEnabled) {
      logger.warn('[XRDB] poster warm IMDb source: ratings file not found, skipping');
    }
    return [];
  }

  try {
    const entries: Array<[string, number]> = [];
    const stream = createReadStream(ratingsPath);
    const rl = createInterface({
      input: ratingsPath.endsWith('.gz') ? stream.pipe(createGunzip()) : stream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line || line.startsWith('tconst\t')) continue;
      const parts = line.split('\t');
      const tconst = parts[0];
      const votesRaw = parts[2];
      if (!tconst || !votesRaw || votesRaw === '\\N') continue;
      const votes = Number(votesRaw);
      if (!Number.isFinite(votes) || votes <= 0) continue;
      entries.push([tconst, votes]);
    }

    entries.sort((a, b) => b[1] - a[1]);
    const ids = entries.slice(0, config.imdbLimit).map(([tconst]) => tconst);

    if (config.logEnabled) {
      logger.info(`[XRDB] poster warm IMDb source fetched=${ids.length}`);
    }
    return ids;
  } catch (error) {
    logger.warn('[XRDB] poster warm IMDb source failed:', error instanceof Error ? error.message : error);
    return [];
  }
};