import { join } from 'node:path';

export type DatasetPaths = {
  ratingsPath: string;
  episodesPath: string;
};

export type DatasetUrls = {
  ratingsUrl: string;
  episodesUrl: string;
};

export type ImdbDatasetSyncConfig = {
  autoDownload: boolean;
  autoImport: boolean;
  refreshMs: number;
  checkIntervalMs: number;
  logEnabled: boolean;
  importBatchSize: number;
  importProgress: number;
  importMarkerTtlMs: number;
  paths: DatasetPaths;
  urls: DatasetUrls;
};

export const parseBool = (value: string | undefined, fallback: boolean) => {
  if (value === undefined || value === null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
};

export const parseMs = (value: string | undefined, fallbackMs: number, minMs: number, maxMs: number) => {
  if (!value) return fallbackMs;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMs;
  return Math.min(maxMs, Math.max(minMs, parsed));
};

export const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export const resolveImdbDataDir = () => {
  const configured = String(process.env.XRDB_DATA_DIR ?? '').trim();
  return configured || join(process.cwd(), 'data');
};

export const resolveImdbDatasetPaths = (): DatasetPaths => {
  const dataDir = resolveImdbDataDir();
  const ratingsPath =
    process.env.XRDB_IMDB_RATINGS_DATASET_PATH ||
    process.env.IMDB_RATINGS_DATASET_PATH ||
    join(dataDir, 'imdb', 'title.ratings.tsv.gz');
  const episodesPath =
    process.env.XRDB_IMDB_EPISODES_DATASET_PATH ||
    process.env.IMDB_EPISODES_DATASET_PATH ||
    join(dataDir, 'imdb', 'title.episode.tsv.gz');
  return { ratingsPath, episodesPath };
};

export const resolveImdbDatasetUrls = (): DatasetUrls => {
  const datasetBaseUrl = String(process.env.XRDB_IMDB_DATASET_BASE_URL || 'https://datasets.imdbws.com').replace(
    /\/+$/,
    '',
  );

  return {
    ratingsUrl: process.env.XRDB_IMDB_RATINGS_DATASET_URL || `${datasetBaseUrl}/title.ratings.tsv.gz`,
    episodesUrl: process.env.XRDB_IMDB_EPISODES_DATASET_URL || `${datasetBaseUrl}/title.episode.tsv.gz`,
  };
};

export const resolveImdbDatasetSyncConfig = (): ImdbDatasetSyncConfig => ({
  autoDownload: parseBool(process.env.XRDB_IMDB_DATASET_AUTO_DOWNLOAD, true),
  autoImport: parseBool(process.env.XRDB_IMDB_DATASET_AUTO_IMPORT, true),
  refreshMs: parseMs(
    process.env.XRDB_IMDB_DATASET_REFRESH_MS,
    3 * 24 * 60 * 60 * 1000,
    60 * 60 * 1000,
    365 * 24 * 60 * 60 * 1000,
  ),
  checkIntervalMs: parseMs(
    process.env.XRDB_IMDB_DATASET_CHECK_INTERVAL_MS,
    15 * 60 * 1000,
    60 * 1000,
    24 * 60 * 60 * 1000,
  ),
  logEnabled: parseBool(process.env.XRDB_IMDB_DATASET_LOG, false),
  importBatchSize: Math.max(1000, parsePositiveInt(process.env.XRDB_IMDB_DATASET_IMPORT_BATCH, 5000)),
  importProgress: Math.max(0, parsePositiveInt(process.env.XRDB_IMDB_DATASET_IMPORT_PROGRESS, 0)),
  importMarkerTtlMs: 10 * 365 * 24 * 60 * 60 * 1000,
  paths: resolveImdbDatasetPaths(),
  urls: resolveImdbDatasetUrls(),
});
