import { type NextRequest } from 'next/server';
import { isAdminEnabled, verifyAdminRequest } from '@/lib/adminAuth';

const isSet = (v: string | undefined | null): boolean =>
  typeof v === 'string' && v.trim().length > 0;

const countSet = (envVars: (string | undefined | null)[]): number =>
  envVars.filter((v) => isSet(v)).length;

export async function GET(request: NextRequest) {
  if (!isAdminEnabled()) return new Response('Not Found', { status: 404 });
  if (!verifyAdminRequest(request)) return new Response('Unauthorized', { status: 401 });

  const env = process.env;

  const apiKeys = {
    tmdb: isSet(env.XRDB_TMDB_API_KEY ?? env.TMDB_API_KEY),
    omdb: isSet(env.XRDB_OMDB_API_KEY ?? env.OMDB_API_KEY),
    fanartTv: isSet(env.XRDB_FANART_API_KEY ?? env.FANART_API_KEY),
    fanartClient: isSet(env.XRDB_FANART_CLIENT_KEY ?? env.FANART_CLIENT_KEY),
    mdblist: countSet([env.MDBLIST_API_KEYS, env.MDBLIST_API_KEY]) > 0,
    trakt: isSet(env.XRDB_TRAKT_CLIENT_ID ?? env.TRAKT_CLIENT_ID),
    myAnimelist: isSet(env.XRDB_MYANIMELIST_CLIENT_ID ?? env.MYANIMELIST_CLIENT_ID),
    rpdb: isSet(env.XRDB_RPDB_API_KEY ?? env.RPDB_API_KEY),
    simkl: isSet(env.XRDB_SIMKL_CLIENT_ID ?? env.SIMKL_CLIENT_ID),
  };

  const xrdbKeys = (env.XRDB_REQUEST_API_KEYS ?? env.XRDB_REQUEST_API_KEY ?? '').trim();
  const xrdbKeyCount = xrdbKeys ? xrdbKeys.split(',').filter((k) => k.trim().length > 0).length : 0;

  const cacheTtls = {
    metadataCacheMax: parseInt(env.METADATA_CACHE_MAX_ENTRIES ?? '2000', 10),
    imdbDatasetCacheTtlMs: env.XRDB_IMDB_DATASET_CACHE_TTL_MS ?? null,
    posterCacheWarm: isSet(env.XRDB_POSTER_CACHE_WARM_ENABLED ?? env.POSTER_CACHE_WARM_ENABLED),
  };

  const instanceConfig = {
    dataDir: env.XRDB_DATA_DIR ?? null,
    dbPath: env.XRDB_DB_PATH ?? null,
    nodeEnv: env.NODE_ENV ?? null,
    port: env.PORT ?? null,
    baseUrl: isSet(env.XRDB_BASE_URL ?? env.NEXT_PUBLIC_BASE_URL),
    encryptionKey: isSet(env.XRDB_CONFIG_ENCRYPTION_KEY),
    adminKey: true,
  };

  const systemHealth = {
    uptimeSeconds: Math.floor(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    nodeVersion: process.version,
  };

  return Response.json({ apiKeys, xrdbKeyCount, cacheTtls, instanceConfig, systemHealth });
}
