import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const SCHEMA_SQL = `
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

CREATE TABLE IF NOT EXISTS config_profiles (
  id TEXT PRIMARY KEY,
  params TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

type DbState = {
  path: string;
  db: Database.Database;
  initialized: boolean;
};

type GlobalDbState = typeof globalThis & {
  __xrdbSqlite?: DbState;
};

const getGlobalDbState = () => globalThis as GlobalDbState;

const resolveDbDataDir = () => {
  const configured = String(process.env.XRDB_DATA_DIR ?? '').trim();
  return configured || join(process.cwd(), 'data');
};

export const getDbPath = () => {
  const configured = String(process.env.XRDB_DB_PATH ?? '').trim();
  return configured || join(resolveDbDataDir(), 'xrdb.db');
};

const openDatabase = (databasePath: string) => {
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
};

const getDbState = () => {
  const globalState = getGlobalDbState();
  const databasePath = getDbPath();

  if (!globalState.__xrdbSqlite || globalState.__xrdbSqlite.path !== databasePath) {
    try {
      globalState.__xrdbSqlite?.db.close();
    } catch {
    }

    globalState.__xrdbSqlite = {
      path: databasePath,
      db: openDatabase(databasePath),
      initialized: false,
    };
  }

  return globalState.__xrdbSqlite;
};

export const getDb = () => getDbState().db;

export const ensureDbInitialized = () => {
  const state = getDbState();
  if (!state.initialized) {
    state.db.exec(SCHEMA_SQL);
    state.initialized = true;
  }
};

export const upsertConfigProfile = (id: string, params: Record<string, string>): void => {
  ensureDbInitialized();
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO config_profiles (id, params, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET params = excluded.params, updated_at = excluded.updated_at`,
  ).run(id, JSON.stringify(params), now, now);
};

export const deleteConfigProfile = (id: string): boolean => {
  ensureDbInitialized();
  const db = getDb();
  const result = db.prepare('DELETE FROM config_profiles WHERE id = ?').run(id);
  return result.changes > 0;
};

export const getConfigProfile = (id: string): Record<string, string> | null => {
  ensureDbInitialized();
  const db = getDb();
  const row = db.prepare('SELECT params FROM config_profiles WHERE id = ?').get(id) as
    | { params: string }
    | undefined;
  if (!row) {
    return null;
  }
  try {
    return JSON.parse(row.params) as Record<string, string>;
  } catch {
    return null;
  }
};
