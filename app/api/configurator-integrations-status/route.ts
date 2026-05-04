import { NextResponse } from 'next/server';

import { FANART_API_KEY, MDBLIST_API_KEYS, SIMKL_CLIENT_ID, TMDB_API_KEY } from '@/lib/imageRouteConfig';
import { getMdbListResponseMessage } from '@/lib/imageRouteMdbList';
import { fetchTmdbServer, hasServerTmdbCredentials } from '@/lib/tmdbServerAuth';
import { getConfiguredXrdbRequestKeys } from '@/lib/xrdbRequestKey';

export const dynamic = 'force-dynamic';

type ProviderIntegrationId = 'tmdb' | 'mdblist' | 'fanart' | 'simkl';

type ProviderIntegrationStatus = {
  present: boolean;
  working: boolean | null;
  checkedAt: number | null;
};

type IntegrationStatusPayload = {
  checkedAt: number;
  requestProtectionEnabled: boolean;
  providers: Record<ProviderIntegrationId, ProviderIntegrationStatus>;
};

type IntegrationStatusCache = {
  at: number;
  payload: IntegrationStatusPayload;
};

let statusCache: IntegrationStatusCache | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000;

const EMPTY_PROVIDER_STATUS: ProviderIntegrationStatus = {
  present: false,
  working: null,
  checkedAt: null,
};

const INVALID_TOKEN_HINTS = ['invalid', 'unauthorized', 'forbidden', 'bad key', 'expired', 'missing'];

const hasInvalidTokenHint = (message: string) =>
  INVALID_TOKEN_HINTS.some((token) => message.includes(token));

const pingUrl = async (url: string, init?: RequestInit) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const checkedAt = Date.now();

  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'User-Agent': 'XRDB-Configurator/1.0',
        ...(init?.headers || {}),
      },
    });

    clearTimeout(timer);
    return {
      present: true,
      working: response.ok,
      checkedAt,
    } satisfies ProviderIntegrationStatus;
  } catch {
    clearTimeout(timer);
    return {
      present: true,
      working: false,
      checkedAt,
    } satisfies ProviderIntegrationStatus;
  }
};

const pingJson = async (
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; checkedAt: number }> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const checkedAt = Date.now();

  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'User-Agent': 'XRDB-Configurator/1.0',
        ...(init?.headers || {}),
      },
    });

    if (!response.ok) {
      clearTimeout(timer);
      return { ok: false, checkedAt };
    }

    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const message = getMdbListResponseMessage(payload || {}).toLowerCase();

    clearTimeout(timer);
    if (message && hasInvalidTokenHint(message)) {
      return { ok: false, checkedAt };
    }

    return { ok: true, checkedAt };
  } catch {
    clearTimeout(timer);
    return { ok: false, checkedAt };
  }
};

const checkTmdb = async (): Promise<ProviderIntegrationStatus> => {
  if (!hasServerTmdbCredentials()) {
    return EMPTY_PROVIDER_STATUS;
  }

  const checkedAt = Date.now();

  try {
    const url = `https://api.themoviedb.org/3/configuration${TMDB_API_KEY ? `?api_key=${encodeURIComponent(TMDB_API_KEY)}` : ''}`;
    const response = await fetchTmdbServer(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'XRDB-Configurator/1.0' },
    });

    return {
      present: true,
      working: response.ok,
      checkedAt,
    };
  } catch {
    return {
      present: true,
      working: false,
      checkedAt,
    };
  }
};

const checkMdbList = async (): Promise<ProviderIntegrationStatus> => {
  if (MDBLIST_API_KEYS.length === 0) {
    return EMPTY_PROVIDER_STATUS;
  }

  let checkedAt = Date.now();

  for (const apiKey of MDBLIST_API_KEYS) {
    const result = await pingJson(
      `https://api.mdblist.com/imdb/movie/tt1375666?apikey=${encodeURIComponent(apiKey)}`,
    );
    checkedAt = result.checkedAt;

    if (result.ok) {
      return {
        present: true,
        working: true,
        checkedAt,
      };
    }
  }

  return {
    present: true,
    working: false,
    checkedAt,
  };
};

const checkFanart = async (): Promise<ProviderIntegrationStatus> => {
  if (!FANART_API_KEY) {
    return EMPTY_PROVIDER_STATUS;
  }

  return pingUrl(`https://webservice.fanart.tv/v3/movies/tt0133093?api_key=${encodeURIComponent(FANART_API_KEY)}`);
};

const checkSimkl = async (): Promise<ProviderIntegrationStatus> => {
  if (!SIMKL_CLIENT_ID) {
    return EMPTY_PROVIDER_STATUS;
  }

  return pingUrl(`https://api.simkl.com/movies/trending?client_id=${encodeURIComponent(SIMKL_CLIENT_ID)}&limit=1`);
};

const buildStatusPayload = async (): Promise<IntegrationStatusPayload> => {
  const [tmdb, mdblist, fanart, simkl] = await Promise.all([
    checkTmdb(),
    checkMdbList(),
    checkFanart(),
    checkSimkl(),
  ]);

  return {
    checkedAt: Date.now(),
    requestProtectionEnabled: getConfiguredXrdbRequestKeys().length > 0,
    providers: {
      tmdb,
      mdblist,
      fanart,
      simkl,
    },
  };
};

export async function GET() {
  if (statusCache && Date.now() - statusCache.at < CACHE_TTL_MS) {
    return NextResponse.json(statusCache.payload);
  }

  const payload = await buildStatusPayload();
  statusCache = {
    at: Date.now(),
    payload,
  };

  return NextResponse.json(payload);
}