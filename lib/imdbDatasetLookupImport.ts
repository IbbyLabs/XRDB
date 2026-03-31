import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { ensureDbInitialized, getDb } from './sqliteStore.ts';
import { getMetadata, setMetadata } from './metadataStore.ts';

export const getFileMtimeMs = (filePath: string) => {
  try {
    const stat = statSync(filePath);
    return stat.mtimeMs || stat.mtime.getTime();
  } catch {
    return 0;
  }
};

export const shouldDownloadFile = (filePath: string, refreshMs: number) => {
  try {
    const stat = statSync(filePath);
    if (!stat.isFile() || stat.size === 0) return true;
    return Date.now() - stat.mtimeMs > refreshMs;
  } catch {
    return true;
  }
};

export const downloadToFile = async (url: string, destination: string) => {
  mkdirSync(dirname(destination), { recursive: true });
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`IMDb dataset download failed (${response.status}) for ${url}`);
  }

  const tmpPath = `${destination}.tmp`;
  const nodeStream = Readable.fromWeb(response.body as any);
  try {
    await pipeline(nodeStream, createWriteStream(tmpPath));
    renameSync(tmpPath, destination);
  } catch (error) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
    }
    throw error;
  }
};

const getImportMarker = (key: string) => {
  const value = getMetadata<string>(key);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const setImportMarker = (key: string, value: number, ttlMs: number) => {
  setMetadata(key, String(value), ttlMs);
};

const tableHasRows = (table: string) => {
  ensureDbInitialized();
  const db = getDb();
  try {
    const row = db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get() as { '1'?: number } | undefined;
    return Boolean(row);
  } catch {
    return false;
  }
};

export const shouldImportDataset = (table: string, markerKey: string, filePath: string, markerTtlMs: number) => {
  if (!existsSync(filePath)) return false;
  const hasRows = tableHasRows(table);
  const fileMtime = getFileMtimeMs(filePath);
  const marker = getImportMarker(markerKey);

  if (!hasRows) return true;
  if (!marker) {
    if (fileMtime > 0) {
      setImportMarker(markerKey, fileMtime, markerTtlMs);
    }
    return false;
  }
  return fileMtime > marker;
};

const openDatasetStream = (filePath: string) => {
  const stream = createReadStream(filePath);
  return filePath.endsWith('.gz') ? stream.pipe(createGunzip()) : stream;
};

export const importRatings = async (
  filePath: string,
  batchSize: number,
  progressEvery: number,
  logEnabled: boolean,
) => {
  ensureDbInitialized();
  const db = getDb();
  const insertStmt = db.prepare(
    'INSERT OR REPLACE INTO imdb_ratings (tconst, average_rating, num_votes) VALUES (?, ?, ?)'
  );
  const insertBatch = db.transaction((rows: Array<[string, number, number]>) => {
    for (const row of rows) {
      insertStmt.run(row[0], row[1], row[2]);
    }
  });

  const rl = createInterface({ input: openDatasetStream(filePath), crlfDelay: Infinity });
  let batch: Array<[string, number, number]> = [];
  let total = 0;

  for await (const line of rl) {
    if (!line || line.startsWith('tconst\t')) continue;
    const [tconst, ratingRaw, votesRaw] = line.split('\t');
    if (!tconst || ratingRaw === '\\N' || votesRaw === '\\N') continue;
    const rating = Number(ratingRaw);
    const votes = Number(votesRaw);
    if (!Number.isFinite(rating) || !Number.isFinite(votes)) continue;
    batch.push([tconst, rating, votes]);
    if (batch.length >= batchSize) {
      insertBatch(batch);
      total += batch.length;
      batch = [];
      if (progressEvery > 0 && logEnabled && total % progressEvery === 0) {
        console.log(`IMDb ratings imported: ${total.toLocaleString('en-GB')}`);
      }
    }
  }

  if (batch.length) {
    insertBatch(batch);
    total += batch.length;
  }
};

export const importEpisodes = async (
  filePath: string,
  batchSize: number,
  progressEvery: number,
  logEnabled: boolean,
) => {
  ensureDbInitialized();
  const db = getDb();
  const insertStmt = db.prepare(
    'INSERT OR REPLACE INTO imdb_episodes (tconst, parent_tconst, season_number, episode_number) VALUES (?, ?, ?, ?)'
  );
  const insertBatch = db.transaction((rows: Array<[string, string, number | null, number | null]>) => {
    for (const row of rows) {
      insertStmt.run(row[0], row[1], row[2], row[3]);
    }
  });

  const rl = createInterface({ input: openDatasetStream(filePath), crlfDelay: Infinity });
  let batch: Array<[string, string, number | null, number | null]> = [];
  let total = 0;

  for await (const line of rl) {
    if (!line || line.startsWith('tconst\t')) continue;
    const [tconst, parentTconst, seasonRaw, episodeRaw] = line.split('\t');
    if (!tconst || !parentTconst) continue;
    const seasonNumber = seasonRaw === '\\N' ? null : Number(seasonRaw);
    const episodeNumber = episodeRaw === '\\N' ? null : Number(episodeRaw);
    batch.push([
      tconst,
      parentTconst,
      Number.isFinite(seasonNumber) ? seasonNumber : null,
      Number.isFinite(episodeNumber) ? episodeNumber : null,
    ]);
    if (batch.length >= batchSize) {
      insertBatch(batch);
      total += batch.length;
      batch = [];
      if (progressEvery > 0 && logEnabled && total % progressEvery === 0) {
        console.log(`IMDb episodes imported: ${total.toLocaleString('en-GB')}`);
      }
    }
  }

  if (batch.length) {
    insertBatch(batch);
    total += batch.length;
  }
};
