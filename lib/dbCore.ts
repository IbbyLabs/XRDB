import Database from 'better-sqlite3';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

CREATE TABLE IF NOT EXISTS config_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const SCHEMA_MIGRATIONS = [
  `ALTER TABLE config_profiles ADD COLUMN last_accessed_at INTEGER`,
];

const MIGRATION_WINDOW_MS = 48 * 60 * 60 * 1000;

const ENCRYPTION_VERSION = 0x01;
export const LEGACY_ID_RE = /^xr_[0-9a-f]{8}$/i;

let _configEncryptionKey: Buffer | null = null;

const resolveConfigEncryptionKey = (): Buffer => {
  if (_configEncryptionKey) return _configEncryptionKey;

  const envKey = String(process.env.XRDB_CONFIG_ENCRYPTION_KEY ?? '').trim();
  if (/^[0-9a-f]{64}$/i.test(envKey)) {
    _configEncryptionKey = Buffer.from(envKey, 'hex');
    return _configEncryptionKey;
  }

  const keyPath = join(resolveDbDataDir(), '.config-key');
  try {
    const stored = readFileSync(keyPath, 'utf8').trim();
    if (/^[0-9a-f]{64}$/i.test(stored)) {
      _configEncryptionKey = Buffer.from(stored, 'hex');
      return _configEncryptionKey;
    }
  } catch {
  }

  const generated = randomBytes(32);
  mkdirSync(dirname(keyPath), { recursive: true });
  writeFileSync(keyPath, generated.toString('hex'), { mode: 0o600 });
  console.warn(
    '[xrdb] Auto-generated config encryption key written to',
    keyPath,
    '-- set XRDB_CONFIG_ENCRYPTION_KEY for production deployments.',
  );
  _configEncryptionKey = generated;
  return _configEncryptionKey;
};

const encryptConfigParams = (params: Record<string, string>): string => {
  const key = resolveConfigEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(params), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([
    Buffer.from([ENCRYPTION_VERSION]),
    iv,
    authTag,
    ciphertext,
  ]).toString('hex');
};

const decryptConfigParams = (blob: string): Record<string, string> | null => {
  try {
    const buf = Buffer.from(blob, 'hex');
    if (buf.length < 1 + 12 + 16 + 1) return null;
    const version = buf[0];
    if (version !== ENCRYPTION_VERSION) return null;
    const iv = buf.subarray(1, 13);
    const authTag = buf.subarray(13, 29);
    const ciphertext = buf.subarray(29);
    const key = resolveConfigEncryptionKey();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8')) as Record<string, string>;
  } catch {
    return null;
  }
};

type DbState = {
  db: Database.Database;
  initialized: boolean;
  path: string;
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
    for (const migration of SCHEMA_MIGRATIONS) {
      try {
        state.db.exec(migration);
      } catch {
      }
    }
    state.db
      .prepare(`INSERT OR IGNORE INTO config_meta (key, value) VALUES ('legacy_migration_deadline', ?)`)
      .run(String(Date.now() + MIGRATION_WINDOW_MS));
    state.initialized = true;

    const pruneDaysRaw = String(process.env.XRDB_INACTIVE_CONFIG_PRUNE_DAYS ?? '').trim();
    const pruneDays = parseInt(pruneDaysRaw, 10);
    if (Number.isFinite(pruneDays) && pruneDays > 0) {
      pruneInactiveConfigProfiles(pruneDays);
    }
  }
};

export const upsertConfigProfile = (id: string, params: Record<string, string>): void => {
  ensureDbInitialized();
  const db = getDb();
  const now = Date.now();
  const encrypted = encryptConfigParams(params);
  db.prepare(
    `INSERT INTO config_profiles (id, params, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET params = excluded.params, updated_at = excluded.updated_at`,
  ).run(id, encrypted, now, now);
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
  const decrypted = decryptConfigParams(row.params);
  if (decrypted !== null) return decrypted;
  if (LEGACY_ID_RE.test(id)) {
    try {
      return JSON.parse(row.params) as Record<string, string>;
    } catch {
      return null;
    }
  }
  return null;
};

export const getConfigProfileDeadline = (_id: string): number | null => {
  const db = getDb();
  const row = db
    .prepare(`SELECT value FROM config_meta WHERE key = 'legacy_migration_deadline'`)
    .get() as { value: string } | undefined;
  const deadline = row ? parseInt(row.value, 10) : null;
  return deadline !== null && Number.isFinite(deadline) ? deadline : null;
};

export const touchConfigProfileAccess = (id: string): void => {
  const db = getDb();
  db.prepare('UPDATE config_profiles SET last_accessed_at = ? WHERE id = ?').run(Date.now(), id);
};

export const pruneInactiveConfigProfiles = (days: number): void => {
  ensureDbInitialized();
  const db = getDb();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  db.prepare(
    `DELETE FROM config_profiles
     WHERE (last_accessed_at IS NOT NULL AND last_accessed_at < ?)
        OR (last_accessed_at IS NULL AND created_at < ?)`,
  ).run(cutoff, cutoff);
};
