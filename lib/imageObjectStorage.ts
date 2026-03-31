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

export { buildObjectStorageImageKey, buildObjectStorageSourceImageKey } from './imageObjectStoragePaths.ts';
export { pruneExpiredObjectStorageImages } from './imageObjectStoragePrune.ts';

type ObjectStorageResult = {
  body: ArrayBuffer;
  contentType: string;
  cacheControl: string;
};

const IMAGE_CACHE_PRUNE_INTERVAL_MS = 10 * 60 * 1000;

type GlobalObjectStorageState = typeof globalThis & {
  __xrdbImageCachePruneTimers?: Map<string, NodeJS.Timeout>;
  __xrdbImageCachePruneInFlight?: Set<string>;
};

const ensureObjectStoragePrunerStarted = () => {
  const globalState = globalThis as GlobalObjectStorageState;
  const cacheDir = ensureObjectStorageDir();
  const timers = globalState.__xrdbImageCachePruneTimers || new Map<string, NodeJS.Timeout>();
  globalState.__xrdbImageCachePruneTimers = timers;

  if (timers.has(cacheDir)) {
    return;
  }

  pruneExpiredObjectStorageImages();
  const timer = setInterval(pruneExpiredObjectStorageImages, IMAGE_CACHE_PRUNE_INTERVAL_MS);
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
    console.error(`Error reading cached image ${key}:`, error);
    return null;
  }
};

export const putCachedImageToObjectStorage = async (
  key: string,
  payload: { body: ArrayBuffer; contentType: string; cacheControl: string }
) => {
  ensureObjectStoragePrunerStarted();
  const { filePath, metadataPath } = getObjectStoragePaths(key);

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
    console.error(`Error writing cached image ${key}:`, error);
  }

  if (Math.random() < 0.02) {
    await pruneOldestImageCache(5000);
  }
};

const pruneOldestImageCache = async (maxFiles: number) => {
  const globalState = globalThis as GlobalObjectStorageState;
  const cacheDir = ensureObjectStorageDir();
  const inFlight = globalState.__xrdbImageCachePruneInFlight || new Set<string>();
  globalState.__xrdbImageCachePruneInFlight = inFlight;

  if (inFlight.has(cacheDir)) return;
  inFlight.add(cacheDir);

  try {
    const entries = readdirSync(cacheDir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && !e.name.endsWith('.json'))
      .map((e) => {
        const p = join(cacheDir, e.name);
        try {
          return { name: e.name, path: p, mtimeMs: statSync(p).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((f): f is { name: string; path: string; mtimeMs: number } => Boolean(f));

    if (files.length <= maxFiles) return;

    files.sort((a, b) => a.mtimeMs - b.mtimeMs);
    const toDelete = files.slice(0, files.length - maxFiles);

    for (const f of toDelete) {
      try {
        unlinkSync(f.path);
        const metaPath = `${f.path}.json`;
        if (existsSync(metaPath)) unlinkSync(metaPath);
      } catch {}
    }
  } catch (error) {
    console.error('Error during image cache pruning:', error);
  } finally {
    inFlight.delete(cacheDir);
  }
};
