#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const zlib = require('node:zlib');
const Database = require('better-sqlite3');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS metadata_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  last_accessed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS metadata_cache_expires_idx ON metadata_cache (expires_at);

CREATE TABLE IF NOT EXISTS imdb_ratings (
  tconst TEXT PRIMARY KEY,
  average_rating REAL NOT NULL,
  num_votes INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS imdb_ratings_votes_idx ON imdb_ratings (num_votes);

CREATE TABLE IF NOT EXISTS imdb_episodes (
  tconst TEXT PRIMARY KEY,
  parent_tconst TEXT NOT NULL,
  season_number INTEGER,
  episode_number INTEGER
);

CREATE INDEX IF NOT EXISTS imdb_episodes_parent_idx ON imdb_episodes (parent_tconst, season_number, episode_number);
`;

const IMPORT_MARKER_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000;

const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--ratings') {
      args.ratings = argv[++i];
    } else if (arg === '--episodes') {
      args.episodes = argv[++i];
    } else if (arg === '--db') {
      args.db = argv[++i];
    } else if (arg === '--batch') {
      args.batch = argv[++i];
    } else if (arg === '--progress') {
      args.progress = argv[++i];
    } else if (arg === '--truncate') {
      args.truncate = true;
    } else if (arg === '--skip-ratings') {
      args.skipRatings = true;
    } else if (arg === '--skip-episodes') {
      args.skipEpisodes = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }
  return args;
};

const resolveDataDir = () => {
  const configured = String(process.env.XRDB_DATA_DIR ?? '').trim();
  return configured || path.join(process.cwd(), 'data');
};

const resolveDatasetPaths = (args) => {
  const dataDir = resolveDataDir();

  return {
    ratingsPath:
      args.ratings ||
      process.env.XRDB_IMDB_RATINGS_DATASET_PATH ||
      path.join(dataDir, 'imdb', 'title.ratings.tsv.gz'),
    episodesPath:
      args.episodes ||
      process.env.XRDB_IMDB_EPISODES_DATASET_PATH ||
      path.join(dataDir, 'imdb', 'title.episode.tsv.gz'),
  };
};

const resolveDbPath = (args) => {
  const configured = String(process.env.XRDB_DB_PATH ?? '').trim();
  return args.db || configured || path.join(resolveDataDir(), 'xrdb.db');
};

const printUsage = () => {
  console.log('IMDb dataset import');
  console.log('');
  console.log('Usage:');
  console.log('  node scripts/imdb-dataset-import.js --ratings <path> --episodes <path> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --db <path>           SQLite DB path (default: ./data/xrdb.db)');
  console.log('  --batch <n>           Batch size (default: 5000)');
  console.log('  --progress <n>        Progress interval in rows (default: 500000)');
  console.log('  --truncate            Clear existing imdb tables before import');
  console.log('  --skip-ratings        Skip ratings import');
  console.log('  --skip-episodes       Skip episodes import');
};

const ensureFileExists = (filePath, label) => {
  if (!fs.existsSync(filePath)) {
    console.error(`${label} not found: ${filePath}`);
    process.exit(1);
  }
};

const setImportMarker = (db, key, value) => {
  const now = Date.now();
  const expiresAt = now + IMPORT_MARKER_TTL_MS;
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
  db.prepare(`
    INSERT OR REPLACE INTO metadata_cache (key, value, expires_at, last_accessed_at)
    VALUES (?, ?, ?, ?)
  `).run(key, stringValue, expiresAt, now);
};

const openDatasetStream = (filePath) => {
  const stream = fs.createReadStream(filePath);
  return filePath.endsWith('.gz') ? stream.pipe(zlib.createGunzip()) : stream;
};

const getFileMarkerValue = (filePath) => {
  try {
    return fs.statSync(filePath).mtimeMs || Date.now();
  } catch {
    return Date.now();
  }
};

const importRatings = async (db, ratingsPath, batchSize, progressEvery) => {
  console.log(`Importing ratings from: ${ratingsPath}`);
  const insertStmt = db.prepare(
    'INSERT OR REPLACE INTO imdb_ratings (tconst, average_rating, num_votes) VALUES (?, ?, ?)'
  );
  const insertBatch = db.transaction((rows) => {
    for (const row of rows) {
      insertStmt.run(row[0], row[1], row[2]);
    }
  });

  const rl = readline.createInterface({
    input: openDatasetStream(ratingsPath),
    crlfDelay: Infinity,
  });

  let batch = [];
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
      if (total % progressEvery === 0) {
        console.log(`Ratings imported: ${total.toLocaleString('en-GB')}`);
      }
    }
  }
  if (batch.length) {
    insertBatch(batch);
    total += batch.length;
  }
  console.log(`Ratings imported: ${total.toLocaleString('en-GB')}`);
  setImportMarker(db, 'imdb:dataset:imported:ratings', getFileMarkerValue(ratingsPath));
};

const importEpisodes = async (db, episodesPath, batchSize, progressEvery) => {
  console.log(`Importing episodes from: ${episodesPath}`);
  const insertStmt = db.prepare(
    'INSERT OR REPLACE INTO imdb_episodes (tconst, parent_tconst, season_number, episode_number) VALUES (?, ?, ?, ?)'
  );
  const insertBatch = db.transaction((rows) => {
    for (const row of rows) {
      insertStmt.run(row[0], row[1], row[2], row[3]);
    }
  });

  const rl = readline.createInterface({
    input: openDatasetStream(episodesPath),
    crlfDelay: Infinity,
  });

  let batch = [];
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
      if (total % progressEvery === 0) {
        console.log(`Episodes imported: ${total.toLocaleString('en-GB')}`);
      }
    }
  }
  if (batch.length) {
    insertBatch(batch);
    total += batch.length;
  }
  console.log(`Episodes imported: ${total.toLocaleString('en-GB')}`);
  setImportMarker(db, 'imdb:dataset:imported:episodes', getFileMarkerValue(episodesPath));
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const { ratingsPath, episodesPath } = resolveDatasetPaths(args);
  const dbPath = resolveDbPath(args);
  const batchSize = Number(args.batch || 5000);
  const progressEvery = Number(args.progress || 500000);

  if (!args.skipRatings) {
    ensureFileExists(ratingsPath, 'Ratings dataset');
  }
  if (!args.skipEpisodes) {
    ensureFileExists(episodesPath, 'Episodes dataset');
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);

  if (args.truncate) {
    console.log('Truncating imdb tables...');
    db.exec('DELETE FROM imdb_ratings;');
    db.exec('DELETE FROM imdb_episodes;');
  }

  if (!args.skipRatings) {
    await importRatings(db, ratingsPath, batchSize, progressEvery);
  }
  if (!args.skipEpisodes) {
    await importEpisodes(db, episodesPath, batchSize, progressEvery);
  }
  console.log('IMDb import completed.');
};

run().catch((error) => {
  console.error('IMDb import failed.');
  console.error(error);
  process.exit(1);
});
