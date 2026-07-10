import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, unlinkSync, readdirSync } from 'node:fs';
import {
  ensureObjectStorageDir,
  getObjectStoragePaths,
  resolveObjectStorageDir,
} from './imageObjectStoragePaths.ts';
import {
  deleteCachedObject,
  isCachedObjectExpired,
  pruneExpiredObjectStorageImages,
  readObjectStorageMetadata,
} from './imageObjectStoragePrune.ts';
import { logger } from './serverLogger.ts';
import { recordCacheEvent } from './adminMetrics.ts';
import { parseNonNegativeInt } from './imageRouteConfig.ts';

export { buildObjectStorageImageKey } from './imageObjectStoragePaths.ts';

type ObjectStorageResult = {
  body: ArrayBuffer;
  contentType: string;
  cacheControl: string;
};

export type ObjectStorageCacheStats = {
  totalFiles: number;
  totalBytes: number;
  expiredFiles: number;
  finalFiles: number;
  finalBytes: number;
};

const IMAGE_CACHE_PRUNE_INTERVAL_MS = 10 * 60 * 1000;
const IMAGE_CACHE_PRUNE_WRITE_DEBOUNCE_MS = 30 * 1000;
const DEFAULT_IMAGE_CACHE_MAX_FILES = 20000;
const DEFAULT_IMAGE_CACHE_MAX_BYTES = 8 * 1024 * 1024 * 1024;

// Final rendered posters are the same for any client requesting the same title
// with the same visual settings, so a larger retained set turns repeat views
// into cache hits instead of re-renders. Both limits are overridable for
// deployments with tighter or looser disk budgets.
export const resolveImageCacheLimits = (env: NodeJS.ProcessEnv = process.env) => {
  const maxFiles = parseNonNegativeInt(env.XRDB_IMAGE_CACHE_MAX_FILES);
  const maxMb = parseNonNegativeInt(env.XRDB_IMAGE_CACHE_MAX_MB);
  return {
    maxFiles: maxFiles !== null && maxFiles > 0 ? maxFiles : DEFAULT_IMAGE_CACHE_MAX_FILES,
    maxBytes: maxMb !== null && maxMb > 0 ? maxMb * 1024 * 1024 : DEFAULT_IMAGE_CACHE_MAX_BYTES,
  };
};

type GlobalObjectStorageState = typeof globalThis & {
  __xrdbImageCachePruneTimers?: Map<string, NodeJS.Timeout>;
  __xrdbImageCachePruneInFlight?: Set<string>;
  __xrdbImageCachePruneLastAt?: Map<string, number>;
};

const ensureObjectStoragePrunerStarted = () => {
  const globalState = globalThis as GlobalObjectStorageState;
  const cacheDir = ensureObjectStorageDir();
  const timers = globalState.__xrdbImageCachePruneTimers || new Map<string, NodeJS.Timeout>();
  globalState.__xrdbImageCachePruneTimers = timers;

  if (timers.has(cacheDir)) {
    return;
  }

  pruneObjectStorageCache({ dir: cacheDir });
  const timer = setInterval(() => {
    pruneObjectStorageCache({ dir: cacheDir });
  }, IMAGE_CACHE_PRUNE_INTERVAL_MS);
  timer.unref?.();
  timers.set(cacheDir, timer);
};

export const isObjectStorageConfigured = () => true;

const toKeyPrefix = (key: string, cohortKey?: string | null) => {
  if (cohortKey) {
    return `image:final:cohort:${cohortKey}`;
  }
  if (key.startsWith('final/')) return 'image:final';
  if (key.startsWith('source/')) return 'image:source';
  return 'image';
};

const listObjectStorageFiles = (dir = resolveObjectStorageDir()) => {
  const cacheDir = ensureObjectStorageDir(dir);
  const entries = readdirSync(cacheDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && !entry.name.endsWith('.json'))
    .map((entry) => {
      const path = join(cacheDir, entry.name);
      const metadataPath = `${path}.json`;
      const stats = statSync(path);
      return {
        name: entry.name,
        path,
        metadataPath,
        sizeBytes: stats.size,
      };
    });
};

export const getObjectStorageCacheStats = (dir = resolveObjectStorageDir()): ObjectStorageCacheStats => {
  const files = listObjectStorageFiles(dir);
  let totalBytes = 0;
  let expiredFiles = 0;
  let finalFiles = 0;
  let finalBytes = 0;

  for (const file of files) {
    totalBytes += file.sizeBytes;
    if (isCachedObjectExpired(file.path, file.metadataPath)) {
      expiredFiles += 1;
    }
    if (file.name.startsWith('final_')) {
      finalFiles += 1;
      finalBytes += file.sizeBytes;
    }
  }

  return {
    totalFiles: files.length,
    totalBytes,
    expiredFiles,
    finalFiles,
    finalBytes,
  };
};

export const clearObjectStorageCache = ({
  mode,
  dir,
}: {
  mode: 'expired' | 'all' | 'final';
  dir?: string;
}) => {
  const files = listObjectStorageFiles(dir);
  let deleted = 0;

  for (const file of files) {
    const matchesMode =
      mode === 'all' ||
      (mode === 'final' && file.name.startsWith('final_')) ||
      (mode === 'expired' && isCachedObjectExpired(file.path, file.metadataPath));

    if (!matchesMode) {
      continue;
    }

    deleteCachedObject(file.path, file.metadataPath);
    deleted += 1;
  }

  if (deleted > 0) {
    recordCacheEvent('delete', mode === 'final' ? 'image:final' : 'image');
  }

  return deleted;
};

export const getCachedImageFromObjectStorage = async (
  key: string,
  cohortKey?: string | null,
): Promise<ObjectStorageResult | null> => {
  ensureObjectStoragePrunerStarted();
  const { filePath, metadataPath } = getObjectStoragePaths(key);

  if (!existsSync(filePath) || !existsSync(metadataPath)) {
    recordCacheEvent('miss', toKeyPrefix(key, cohortKey));
    return null;
  }

  try {
    const body = readFileSync(filePath);
    if (isCachedObjectExpired(filePath, metadataPath)) {
      deleteCachedObject(filePath, metadataPath);
      recordCacheEvent('miss', toKeyPrefix(key, cohortKey));
      return null;
    }

    const metadata = readObjectStorageMetadata(metadataPath) || {};
    const cacheControl = metadata.cacheControl || 'public, max-age=300';

    recordCacheEvent('hit', toKeyPrefix(key, cohortKey));
    return {
      body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
      contentType: metadata.contentType || 'image/png',
      cacheControl,
    };
  } catch (error) {
    recordCacheEvent('miss', toKeyPrefix(key, cohortKey));
    logger.error(`Error reading cached image ${key}:`, error);
    return null;
  }
};

export const putCachedImageToObjectStorage = async (
  key: string,
  payload: { body: ArrayBuffer; contentType: string; cacheControl: string }
  ,
  cohortKey?: string | null,
) => {
  ensureObjectStoragePrunerStarted();
  const { cacheDir, filePath, metadataPath } = getObjectStoragePaths(key);

  try {
    mkdirSync(dirname(filePath), { recursive: true });

    writeFileSync(filePath, Buffer.from(payload.body));
    writeFileSync(
      metadataPath,
      JSON.stringify({
        contentType: payload.contentType,
        cacheControl: payload.cacheControl,
      }),
      'utf8'
    );
    recordCacheEvent('set', toKeyPrefix(key, cohortKey));
  } catch (error) {
    logger.error(`Error writing cached image ${key}:`, error);
  }

  const globalState = globalThis as GlobalObjectStorageState;
  const pruneLastAt = globalState.__xrdbImageCachePruneLastAt || new Map<string, number>();
  globalState.__xrdbImageCachePruneLastAt = pruneLastAt;
  const now = Date.now();
  if (now - (pruneLastAt.get(cacheDir) ?? 0) >= IMAGE_CACHE_PRUNE_WRITE_DEBOUNCE_MS) {
    pruneLastAt.set(cacheDir, now);
    pruneObjectStorageCache({ dir: cacheDir });
  }
};

export const pruneObjectStorageCache = (options?: {
  dir?: string;
  maxFiles?: number;
  maxBytes?: number;
}) => {
  const globalState = globalThis as GlobalObjectStorageState;
  const cacheDir = ensureObjectStorageDir(options?.dir);
  const inFlight = globalState.__xrdbImageCachePruneInFlight || new Set<string>();
  globalState.__xrdbImageCachePruneInFlight = inFlight;
  const limits = resolveImageCacheLimits();
  const maxFiles = Math.max(1, Math.trunc(options?.maxFiles ?? limits.maxFiles));
  const maxBytes = Math.max(1, Math.trunc(options?.maxBytes ?? limits.maxBytes));

  if (inFlight.has(cacheDir)) return;
  inFlight.add(cacheDir);

  try {
    pruneExpiredObjectStorageImages(cacheDir);

    const entries = readdirSync(cacheDir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && !e.name.endsWith('.json'))
      .map((e) => {
        const p = join(cacheDir, e.name);
        try {
          const stats = statSync(p);
          return { name: e.name, path: p, mtimeMs: stats.mtimeMs, sizeBytes: stats.size };
        } catch {
          return null;
        }
      })
      .filter((f): f is { name: string; path: string; mtimeMs: number; sizeBytes: number } => Boolean(f));

    let remainingFiles = files.length;
    let remainingBytes = files.reduce((total, file) => total + file.sizeBytes, 0);

    if (remainingFiles <= maxFiles && remainingBytes <= maxBytes) return;

    files.sort((a, b) => a.mtimeMs - b.mtimeMs);

    for (const f of files) {
      if (remainingFiles <= maxFiles && remainingBytes <= maxBytes) {
        break;
      }

      try {
        unlinkSync(f.path);
        const metaPath = `${f.path}.json`;
        if (existsSync(metaPath)) unlinkSync(metaPath);
        remainingFiles -= 1;
        remainingBytes -= f.sizeBytes;
      } catch {}
    }
  } catch (error) {
    logger.error('Error during image cache pruning:', error);
  } finally {
    inFlight.delete(cacheDir);
  }
};

export { pruneExpiredObjectStorageImages };
