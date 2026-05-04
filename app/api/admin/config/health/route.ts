import { type NextRequest } from 'next/server';
import { isAdminEnabled, verifyAdminRequest } from '@/lib/adminAuth';

type ProviderResult = {
  provider: string;
  ok: boolean;
  statusCode: number | null;
  error?: string;
  checkedAt: number;
};

type CacheEntry = {
  results: ProviderResult[];
  at: number;
};

let healthCache: CacheEntry | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

const ping = async (provider: string, url: string, headers?: Record<string, string>): Promise<ProviderResult> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const checkedAt = Date.now();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      method: 'GET',
      headers: { 'User-Agent': 'XRDB-HealthCheck/1.0', ...headers },
    });
    clearTimeout(timer);
    return { provider, ok: res.ok, statusCode: res.status, checkedAt };
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    return { provider, ok: false, statusCode: null, error: isTimeout ? 'timeout' : 'unreachable', checkedAt };
  }
};

const buildChecks = (): Array<() => Promise<ProviderResult>> => {
  const checks: Array<() => Promise<ProviderResult>> = [];

  const tmdbKey = process.env.XRDB_TMDB_API_KEY?.trim() || process.env.TMDB_API_KEY?.trim() || process.env.TMDB_KEY?.trim();
  if (tmdbKey) {
    checks.push(() => ping('tmdb', `https://api.themoviedb.org/3/configuration?api_key=${tmdbKey}`));
  }
  const mdblistKey = process.env.MDBLIST_API_KEY?.trim() || process.env.MDBLIST_KEY?.trim();
  if (mdblistKey) {
    checks.push(() => ping('mdblist', `https://mdblist.com/api/?apikey=${mdblistKey}&i=tt1375666`));
  }
  const omdbKey = process.env.XRDB_OMDB_API_KEY?.trim() || process.env.OMDB_API_KEY?.trim() || process.env.OMDB_KEY?.trim();
  if (omdbKey) {
    checks.push(() => ping('omdb', `https://www.omdbapi.com/?apikey=${omdbKey}&t=tt0000001`));
  }
  const fanartKey = process.env.XRDB_FANART_API_KEY?.trim() || process.env.FANART_API_KEY?.trim();
  if (fanartKey) {
    checks.push(() => ping('fanartTv', `https://webservice.fanart.tv/v3/movies/tt0000001?api_key=${fanartKey}`));
  }
  const traktClientId = process.env.XRDB_TRAKT_CLIENT_ID?.trim() || process.env.TRAKT_CLIENT_ID?.trim();
  if (traktClientId) {
    checks.push(() => ping('trakt', `https://api.trakt.tv/movies/trending?limit=1`, {
      'trakt-api-version': '2',
      'trakt-api-key': traktClientId,
    }));
  }
  const malClientId = process.env.XRDB_MAL_CLIENT_ID?.trim() || process.env.MAL_CLIENT_ID?.trim();
  if (malClientId) {
    checks.push(() => ping('myAnimelist', `https://api.myanimelist.net/v2/anime/1?fields=id`, {
      'X-MAL-CLIENT-ID': malClientId,
    }));
  }
  if (process.env.RPDB_API_KEY) {
    checks.push(() => ping('rpdb', `https://api.ratingposterdb.com/${process.env.RPDB_API_KEY}/isValid`));
  }
  const simklClientId = process.env.SIMKL_CLIENT_ID?.trim() || process.env.XRDB_SIMKL_CLIENT_ID?.trim();
  if (simklClientId) {
    checks.push(() => ping('simkl', `https://api.simkl.com/movies/trending?client_id=${simklClientId}&limit=1`));
  }

  return checks;
};

export async function GET(request: NextRequest) {
  if (!isAdminEnabled()) return new Response('Not Found', { status: 404 });
  if (!verifyAdminRequest(request)) return new Response('Unauthorized', { status: 401 });

  const force = request.nextUrl.searchParams.get('force') === '1';

  if (!force && healthCache && Date.now() - healthCache.at < CACHE_TTL_MS) {
    return Response.json({ results: healthCache.results, cached: true, cachedAt: healthCache.at });
  }

  const checks = buildChecks();
  const results = await Promise.all(checks.map((fn) => fn()));

  healthCache = { results, at: Date.now() };

  return Response.json({ results, cached: false, cachedAt: healthCache.at });
}
