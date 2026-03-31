import { existsSync } from 'node:fs';
import {
  downloadToFile,
  getFileMtimeMs,
  importEpisodes,
  importRatings,
  setImportMarker,
  shouldDownloadFile,
  shouldImportDataset,
} from './imdbDatasetLookupImport.ts';
import {
  resolveImdbDatasetPaths,
  resolveImdbDatasetSyncConfig,
  resolveImdbDatasetUrls,
} from './imdbDatasetLookupSchedulerConfig.ts';

export { resolveImdbDatasetPaths, resolveImdbDatasetUrls };

let syncInFlight: Promise<void> | null = null;
let lastCheckAt = 0;

export const scheduleImdbDatasetSync = () => {
  const config = resolveImdbDatasetSyncConfig();
  if (!config.autoDownload && !config.autoImport) return;
  const now = Date.now();
  if (syncInFlight) return;
  if (now - lastCheckAt < config.checkIntervalMs) return;
  lastCheckAt = now;
  syncInFlight = runImdbDatasetSync().catch(() => {}).finally(() => {
    syncInFlight = null;
  });
};

export const runImdbDatasetSync = async () => {
  const config = resolveImdbDatasetSyncConfig();
  const { paths, urls } = config;

  const ratingsNeedsDownload = config.autoDownload && shouldDownloadFile(paths.ratingsPath, config.refreshMs);
  const episodesNeedsDownload = config.autoDownload && shouldDownloadFile(paths.episodesPath, config.refreshMs);

  if (ratingsNeedsDownload) {
    await downloadToFile(urls.ratingsUrl, paths.ratingsPath);
  }
  if (episodesNeedsDownload) {
    await downloadToFile(urls.episodesUrl, paths.episodesPath);
  }

  if (!config.autoImport) return;

  const ratingsMarker = 'imdb:dataset:imported:ratings';
  const episodesMarker = 'imdb:dataset:imported:episodes';

  const shouldImportRatings = shouldImportDataset(
    'imdb_ratings',
    ratingsMarker,
    paths.ratingsPath,
    config.importMarkerTtlMs,
  );
  const shouldImportEpisodes = shouldImportDataset(
    'imdb_episodes',
    episodesMarker,
    paths.episodesPath,
    config.importMarkerTtlMs,
  );

  if (shouldImportRatings && existsSync(paths.ratingsPath)) {
    await importRatings(paths.ratingsPath, config.importBatchSize, config.importProgress, config.logEnabled);
    setImportMarker(ratingsMarker, getFileMtimeMs(paths.ratingsPath) || Date.now(), config.importMarkerTtlMs);
  }
  if (shouldImportEpisodes && existsSync(paths.episodesPath)) {
    await importEpisodes(paths.episodesPath, config.importBatchSize, config.importProgress, config.logEnabled);
    setImportMarker(episodesMarker, getFileMtimeMs(paths.episodesPath) || Date.now(), config.importMarkerTtlMs);
  }
};
