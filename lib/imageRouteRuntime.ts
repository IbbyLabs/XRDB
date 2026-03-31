import { createHash, timingSafeEqual } from 'node:crypto';

export type TimedCacheEntry<T> = {
  value: T;
  expiresAt: number;
  lastAccessedAt: number;
};

export type CachedJsonResponse = {
  ok: boolean;
  status: number;
  data: any;
  location?: string | null;
};

export type CachedTextResponse = {
  ok: boolean;
  status: number;
  data: string | null;
};

export type JsonFetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export type CachedJsonNetworkObserver = {
  onNetworkResponse?: (input: {
    key: string;
    url: string;
    status: number;
    ok: boolean;
    data: any;
    durationMs: number;
  }) => Promise<void> | void;
  onNetworkError?: (input: {
    key: string;
    url: string;
    errorMessage: string;
    durationMs: number;
  }) => Promise<void> | void;
};

export type RenderedImagePayload = {
  body: ArrayBuffer;
  contentType: string;
  cacheControl: string;
};

export type PhaseDurations = {
  auth: number;
  tmdb: number;
  mdb: number;
  fanart: number;
  stream: number;
  render: number;
};

export class HttpError extends Error {
  status: number;
  headers?: HeadersInit;

  constructor(message: string, status: number, headers?: HeadersInit) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

export const sha1Hex = (value: string) => createHash('sha1').update(value).digest('hex');

export const safeCompareText = (left: string, right: string) => {
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
};

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const isImdbId = (value?: string | null) => {
  if (!value) return false;
  return /^tt\d+$/.test(value.trim());
};

export const getDeterministicTtlMs = (baseTtlMs: number, seed: string) => {
  const normalizedSeed = String(seed || '').trim();
  if (!normalizedSeed) return baseTtlMs;

  const jitterWindowMs = Math.min(12 * 60 * 60 * 1000, Math.floor(baseTtlMs * 0.15));
  if (jitterWindowMs <= 0) return baseTtlMs;

  const hashPrefix = sha1Hex(normalizedSeed).slice(0, 8);
  const hashValue = Number.parseInt(hashPrefix, 16);
  if (!Number.isFinite(hashValue)) return baseTtlMs;

  const offsetMs = (hashValue % (jitterWindowMs + 1)) - Math.floor(jitterWindowMs / 2);
  return Math.max(60 * 1000, baseTtlMs + offsetMs);
};

export const getCacheTtlMsFromCacheControl = (
  value: string | null | undefined,
  fallbackMs: number,
) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallbackMs;

  const sMaxAgeMatch = normalized.match(/s-maxage=(\d+)/);
  if (sMaxAgeMatch) {
    const ttlSeconds = Number(sMaxAgeMatch[1]);
    if (Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
      return ttlSeconds * 1000;
    }
  }

  const maxAgeMatch = normalized.match(/max-age=(\d+)/);
  if (maxAgeMatch) {
    const ttlSeconds = Number(maxAgeMatch[1]);
    if (Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
      return ttlSeconds * 1000;
    }
  }

  return fallbackMs;
};

export const parseRetryAfterMs = (value: string | null | undefined, fallbackMs: number) => {
  const normalized = String(value || '').trim();
  if (!normalized) return fallbackMs;

  const seconds = Number(normalized);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.max(30 * 1000, Math.round(seconds * 1000));
  }

  const retryTimestamp = Date.parse(normalized);
  if (Number.isFinite(retryTimestamp)) {
    return Math.max(30 * 1000, retryTimestamp - Date.now());
  }

  return fallbackMs;
};

export const withDedupe = async <T,>(
  inFlightMap: Map<string, Promise<T>>,
  key: string,
  factory: () => Promise<T>,
) => {
  const existing = inFlightMap.get(key);
  if (existing) return existing;
  const promise = factory().finally(() => {
    inFlightMap.delete(key);
  });
  inFlightMap.set(key, promise);
  return promise;
};

export const createConcurrencyLimit = (concurrency: number) => {
  let active = 0;
  const queue: Array<() => void> = [];
  return async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      const next = queue.shift();
      if (next) next();
    }
  };
};

export const measurePhase = async <T,>(
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  fn: () => Promise<T>,
) => {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    phases[phase] += performance.now() - start;
  }
};

export const buildServerTimingHeader = (phases: PhaseDurations, totalMs: number) => {
  const parts = [
    `auth;dur=${phases.auth.toFixed(1)}`,
    `tmdb;dur=${phases.tmdb.toFixed(1)}`,
    `mdb;dur=${phases.mdb.toFixed(1)}`,
    `fanart;dur=${phases.fanart.toFixed(1)}`,
    `stream;dur=${phases.stream.toFixed(1)}`,
    `render;dur=${phases.render.toFixed(1)}`,
    `total;dur=${totalMs.toFixed(1)}`,
  ];
  return parts.join(', ');
};

export const createImageHttpResponse = (
  payload: RenderedImagePayload,
  serverTiming: string,
  cacheStatus: 'hit' | 'miss' | 'shared',
  extraHeaders?: HeadersInit,
) =>
  (() => {
    const headers = new Headers(extraHeaders);
    headers.set('Content-Type', payload.contentType);
    headers.set('Cache-Control', payload.cacheControl);
    headers.set('Vary', 'Accept');
    headers.set('Server-Timing', serverTiming);
    headers.set('X-XRDB-Cache', cacheStatus);
    return new Response(payload.body.slice(0), {
      status: 200,
      headers,
    });
  })();
