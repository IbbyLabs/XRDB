import { existsSync, readFileSync } from 'node:fs';

import { parseBool, parseMs, parsePositiveInt } from './imdbDatasetLookupSchedulerConfig.ts';

export type PosterCacheWarmConfig = {
  enabled: boolean;
  intervalMs: number;
  checkIntervalMs: number;
  concurrency: number;
  logEnabled: boolean;
  source: string;
  sourceFilePath: string | null;
};

const POSTER_ROUTE_RE = /\/poster\/([^/?#]+)\.(?:jpe?g|png|webp|avif)$/i;
const EXPLICIT_POSTER_ID_RE = /^(tt\d+|tmdb:(?:movie|tv):[^\s]+|tvdb:[^\s]+|xrdbid:[^\s]+|kitsu:[^\s]+|mal:[^\s]+|myanimelist:[^\s]+|anilist:[^\s]+|anidb:[^\s]+)$/i;

const normalizePosterWarmTarget = (rawValue: string) => {
  const trimmedValue = rawValue.trim();
  if (!trimmedValue || trimmedValue.startsWith('#')) {
    return null;
  }

  const routeMatch = trimmedValue.match(POSTER_ROUTE_RE);
  if (routeMatch?.[1]) {
    return decodeURIComponent(routeMatch[1]).trim() || null;
  }

  try {
    const parsedUrl = new URL(trimmedValue);
    const urlRouteMatch = parsedUrl.pathname.match(POSTER_ROUTE_RE);
    if (urlRouteMatch?.[1]) {
      return decodeURIComponent(urlRouteMatch[1]).trim() || null;
    }
  } catch {
  }

  const withoutExtension = trimmedValue.replace(/\.(?:jpe?g|png|webp|avif)$/i, '');
  return EXPLICIT_POSTER_ID_RE.test(withoutExtension) ? withoutExtension : null;
};

export const parsePosterWarmTargets = (rawValue: string) => {
  const targets = new Set<string>();
  for (const chunk of rawValue.split(/[\n,]/)) {
    const target = normalizePosterWarmTarget(chunk);
    if (target) {
      targets.add(target);
    }
  }
  return [...targets];
};

export const readPosterWarmSource = (config: Pick<PosterCacheWarmConfig, 'source' | 'sourceFilePath'>) => {
  const inlineTargets = parsePosterWarmTargets(config.source);
  const fileTargets =
    config.sourceFilePath && existsSync(config.sourceFilePath)
      ? parsePosterWarmTargets(readFileSync(config.sourceFilePath, 'utf8'))
      : [];

  return [...new Set([...inlineTargets, ...fileTargets])];
};

export const resolvePosterCacheWarmConfig = (): PosterCacheWarmConfig => {
  const source = String(process.env.XRDB_POSTER_WARM_SOURCE ?? '').trim();
  const sourceFilePath = String(process.env.XRDB_POSTER_WARM_SOURCE_FILE ?? '').trim() || null;
  const enabled = parseBool(process.env.XRDB_POSTER_WARM_ENABLED, true) && (Boolean(source) || Boolean(sourceFilePath));

  return {
    enabled,
    intervalMs: parseMs(process.env.XRDB_POSTER_WARM_INTERVAL_MS, 6 * 60 * 60 * 1000, 5 * 60 * 1000, 30 * 24 * 60 * 60 * 1000),
    checkIntervalMs: parseMs(process.env.XRDB_POSTER_WARM_CHECK_INTERVAL_MS, 15 * 60 * 1000, 30 * 1000, 24 * 60 * 60 * 1000),
    concurrency: Math.max(1, Math.min(8, parsePositiveInt(process.env.XRDB_POSTER_WARM_CONCURRENCY, 2))),
    logEnabled: parseBool(process.env.XRDB_POSTER_WARM_LOG, false),
    source,
    sourceFilePath,
  };
};