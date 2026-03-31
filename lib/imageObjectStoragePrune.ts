import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { getCacheTtlMsFromCacheControl } from './cacheControlTtl.ts';
import { ensureObjectStorageDir, type ObjectStorageMetadata } from './imageObjectStoragePaths.ts';

export const FALLBACK_IMAGE_CACHE_TTL_MS = 5 * 60 * 1000;

export const readObjectStorageMetadata = (metadataPath: string) => {
  try {
    return JSON.parse(readFileSync(metadataPath, 'utf8')) as ObjectStorageMetadata;
  } catch {
    return null;
  }
};

export const deleteCachedObject = (filePath: string, metadataPath: string) => {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {}

  try {
    if (existsSync(metadataPath)) {
      unlinkSync(metadataPath);
    }
  } catch {}
};

export const isCachedObjectExpired = (filePath: string, metadataPath: string) => {
  try {
    const metadata = readObjectStorageMetadata(metadataPath);
    if (!metadata) return true;
    const cacheControl = metadata.cacheControl || 'public, max-age=300';
    const ttlMs = getCacheTtlMsFromCacheControl(cacheControl, FALLBACK_IMAGE_CACHE_TTL_MS);
    const { mtimeMs } = statSync(filePath);
    return mtimeMs + ttlMs <= Date.now();
  } catch {
    return true;
  }
};

export const pruneExpiredObjectStorageImages = (dir?: string) => {
  const cacheDir = ensureObjectStorageDir(dir);

  try {
    const entries = readdirSync(cacheDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || entry.name.endsWith('.json')) {
        continue;
      }

      const filePath = join(cacheDir, entry.name);
      const metadataPath = `${filePath}.json`;

      if (!existsSync(metadataPath) || isCachedObjectExpired(filePath, metadataPath)) {
        deleteCachedObject(filePath, metadataPath);
      }
    }
  } catch {}
};
