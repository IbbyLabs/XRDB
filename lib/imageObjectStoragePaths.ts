import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type ObjectStorageMetadata = {
  contentType?: string;
  cacheControl?: string;
};

export const resolveObjectStorageDir = () => {
  const explicit = String(process.env.XRDB_OBJECT_STORAGE_DIR ?? '').trim();
  if (explicit) return explicit;

  const dataDir = String(process.env.XRDB_DATA_DIR ?? '').trim() || join(process.cwd(), 'data');
  return join(dataDir, 'cache', 'images');
};

export const ensureObjectStorageDir = (dir = resolveObjectStorageDir()) => {
  mkdirSync(dir, { recursive: true });
  return dir;
};

const sanitizeObjectStorageKey = (key: string) => key.replace(/\//g, '_');

export const getObjectStoragePaths = (key: string, dir = resolveObjectStorageDir()) => {
  const cacheDir = ensureObjectStorageDir(dir);
  const filePath = join(cacheDir, sanitizeObjectStorageKey(key));
  return {
    cacheDir,
    filePath,
    metadataPath: `${filePath}.json`,
  };
};

export const buildObjectStorageImageKey = (cacheHash: string, ext = 'png') => `final/${cacheHash}.${ext}`;

export const buildObjectStorageSourceImageKey = (id: string, variant: string) =>
  `source/${id.replace(/[^a-zA-Z0-9]/g, '_')}_${variant}.png`;
