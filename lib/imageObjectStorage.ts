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

export { buildObjectStorageImageKey } from './imageObjectStoragePaths.ts';

type ObjectStorageResult = {
  body: ArrayBuffer;
  contentType: string;
  cacheControl: string;
};

const IMAGE_CACHE_PRUNE_INTERVAL_MS = 10 * 60 * 1000;
const IMAGE_CACHE_PRUNE_WRITE_DEBOUNCE_MS = 30 * 1000;
const IMAGE_CACHE_MAX_FILES = 2000;
const IMAGE_CACHE_MAX_BYTES = 1024 * 1024 * 1024;

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

export const getCachedImageFromObjectStorage = async (key: string): Promise<ObjectStorageResult | null> => {
  ensureObjectStoragePrunerStarted();
  const { filePath, metadataPath } = getObjectStoragePaths(key);

  if (!existsSync(filePath) || !existsSync(metadataPath)) {
    return null;
  }

  try {
    const body = readFileSync(filePath);
    if (isCachedObjectExpired(filePath, metadataPath)) {
      deleteCachedObject(filePath, metadataPath);
      return null;
    }

    const metadata = readObjectStorageMetadata(metadataPath) || {};
    const cacheControl = metadata.cacheControl || 'public, max-age=300';

    return {
      body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
      contentType: metadata.contentType || 'image/png',
      cacheControl,
    };
  } catch (error) {
    logger.error(`Error reading cached image ${key}:`, error);
    return null;
  }
};

export const putCachedImageToObjectStorage = async (
  key: string,
  payload: { body: ArrayBuffer; contentType: string; cacheControl: string }
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
  const maxFiles = Math.max(1, Math.trunc(options?.maxFiles ?? IMAGE_CACHE_MAX_FILES));
  const maxBytes = Math.max(1, Math.trunc(options?.maxBytes ?? IMAGE_CACHE_MAX_BYTES));

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
