import Database from 'better-sqlite3';
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { logger } from './serverLogger.ts';

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
  password_hash TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  unlock_version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_accessed_at INTEGER
);

CREATE TABLE IF NOT EXISTS config_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proxy_refs (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

const SCHEMA_MIGRATIONS = [
  `ALTER TABLE config_profiles ADD COLUMN last_accessed_at INTEGER`,
  `ALTER TABLE config_profiles ADD COLUMN password_hash TEXT`,
  `ALTER TABLE config_profiles ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE config_profiles ADD COLUMN locked_until INTEGER`,
  `ALTER TABLE config_profiles ADD COLUMN unlock_version INTEGER NOT NULL DEFAULT 0`,
];

const MIGRATION_WINDOW_MS = 48 * 60 * 60 * 1000;

const ENCRYPTION_VERSION = 0x01;
export const LEGACY_ID_RE = /^xr_[0-9a-f]{8}$/i;
export const ENCRYPTED_ID_RE = /^xrc_[0-9a-f]{16}$/i;
export const PROTECTED_CONFIG_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ConfigProfileRow = {
  params: string;
  password_hash?: string | null;
  failed_attempts?: number | null;
  locked_until?: number | null;
  unlock_version?: number | null;
  created_at?: number;
  updated_at?: number;
  last_accessed_at?: number | null;
};

export type ConfigProfileMetadata = {
  id: string;
  isLegacy: boolean;
  hasPassword: boolean;
  failedAttempts: number;
  lockedUntil: number | null;
  unlockVersion: number;
  createdAt: number | null;
  updatedAt: number | null;
  lastAccessedAt: number | null;
};

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
  logger.warn(
    '[xrdb] Auto-generated config encryption key written to',
    keyPath,
    '-- set XRDB_CONFIG_ENCRYPTION_KEY for production deployments.',
  );
  _configEncryptionKey = generated;
  return _configEncryptionKey;
};

const encryptJsonValue = (value: unknown): string => {
  const key = resolveConfigEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([
    Buffer.from([ENCRYPTION_VERSION]),
    iv,
    authTag,
    ciphertext,
  ]).toString('hex');
};

const decryptJsonValue = <Value>(blob: string): Value | null => {
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
    return JSON.parse(plaintext.toString('utf8')) as Value;
  } catch {
    return null;
  }
};

const encryptConfigParams = (params: Record<string, string>): string => encryptJsonValue(params);

const decryptConfigParams = (blob: string): Record<string, string> | null =>
  decryptJsonValue<Record<string, string>>(blob);

const normalizeConfigProfileMetadata = (
  id: string,
  row: ConfigProfileRow,
): ConfigProfileMetadata => ({
  id,
  isLegacy: LEGACY_ID_RE.test(id) || ENCRYPTED_ID_RE.test(id),
  hasPassword: typeof row.password_hash === 'string' && row.password_hash.length > 0,
  failedAttempts: Number.isFinite(row.failed_attempts) ? Number(row.failed_attempts) : 0,
  lockedUntil:
    typeof row.locked_until === 'number' && Number.isFinite(row.locked_until)
      ? row.locked_until
      : null,
  unlockVersion: Number.isFinite(row.unlock_version) ? Number(row.unlock_version) : 0,
  createdAt: typeof row.created_at === 'number' && Number.isFinite(row.created_at) ? row.created_at : null,
  updatedAt: typeof row.updated_at === 'number' && Number.isFinite(row.updated_at) ? row.updated_at : null,
  lastAccessedAt:
    typeof row.last_accessed_at === 'number' && Number.isFinite(row.last_accessed_at)
      ? row.last_accessed_at
      : null,
});

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

export const deriveConfigScopedSecret = (purpose: string): Buffer =>
  createHash('sha256').update(resolveConfigEncryptionKey()).update('\0').update(purpose).digest();

export const createConfigProfileId = () => randomUUID();

const createProxyReferenceId = () => randomUUID();

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

const getConfigProfileRow = (id: string): ConfigProfileRow | null => {
  ensureDbInitialized();
  const db = getDb();
  const row = db.prepare(
    `SELECT params, password_hash, failed_attempts, locked_until, unlock_version, created_at, updated_at, last_accessed_at
     FROM config_profiles WHERE id = ?`,
  ).get(id) as ConfigProfileRow | undefined;
  return row ?? null;
};

export const upsertConfigProfile = (id: string, params: Record<string, string>): void => {
  ensureDbInitialized();
  const db = getDb();
  const now = Date.now();
  const encrypted = encryptConfigParams(params);
  db.prepare(
    `INSERT INTO config_profiles (id, params, password_hash, failed_attempts, locked_until, unlock_version, created_at, updated_at)
     VALUES (?, ?, NULL, 0, NULL, 0, ?, ?)
     ON CONFLICT(id) DO UPDATE SET params = excluded.params, updated_at = excluded.updated_at`,
  ).run(id, encrypted, now, now);
};

export const createProtectedConfigProfile = (
  params: Record<string, string>,
  passwordHash: string,
): string => {
  ensureDbInitialized();
  const db = getDb();
  const now = Date.now();
  const id = createConfigProfileId();
  const encrypted = encryptConfigParams(params);
  db.prepare(
    `INSERT INTO config_profiles (id, params, password_hash, failed_attempts, locked_until, unlock_version, created_at, updated_at)
     VALUES (?, ?, ?, 0, NULL, 0, ?, ?)`,
  ).run(id, encrypted, passwordHash, now, now);
  return id;
};

export const updateProtectedConfigProfile = (
  id: string,
  params: Record<string, string>,
): boolean => {
  ensureDbInitialized();
  const db = getDb();
  const encrypted = encryptConfigParams(params);
  const result = db.prepare(
    `UPDATE config_profiles
     SET params = ?, updated_at = ?
     WHERE id = ?`,
  ).run(encrypted, Date.now(), id);
  return result.changes > 0;
};

export const rotateConfigProfilePassword = (
  id: string,
  passwordHash: string,
): ConfigProfileMetadata | null => {
  ensureDbInitialized();
  const db = getDb();
  const row = getConfigProfileRow(id);
  if (!row) {
    return null;
  }
  db.prepare(
    `UPDATE config_profiles
     SET password_hash = ?, failed_attempts = 0, locked_until = NULL, unlock_version = ?, updated_at = ?
     WHERE id = ?`,
  ).run(passwordHash, (row.unlock_version ?? 0) + 1, Date.now(), id);
  return getConfigProfileMetadata(id);
};

export const deleteConfigProfile = (id: string): boolean => {
  ensureDbInitialized();
  const db = getDb();
  const result = db.prepare('DELETE FROM config_profiles WHERE id = ?').run(id);
  return result.changes > 0;
};

export const getConfigProfile = (id: string): Record<string, string> | null => {
  const row = getConfigProfileRow(id);
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

export const getConfigProfileMetadata = (id: string): ConfigProfileMetadata | null => {
  const row = getConfigProfileRow(id);
  if (!row) {
    return null;
  }
  return normalizeConfigProfileMetadata(id, row);
};

export const getConfigProfilePasswordHash = (id: string): string | null => {
  const row = getConfigProfileRow(id);
  if (!row || typeof row.password_hash !== 'string' || !row.password_hash) {
    return null;
  }
  return row.password_hash;
};

export const getConfigProfileDeadline = (_id: string): number | null => {
  ensureDbInitialized();
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

export const recordConfigProfileUnlockFailure = (
  id: string,
  lockedUntil: number | null,
): ConfigProfileMetadata | null => {
  ensureDbInitialized();
  const row = getConfigProfileRow(id);
  if (!row) {
    return null;
  }
  const nextFailedAttempts = (row.failed_attempts ?? 0) + 1;
  const nextUnlockVersion = lockedUntil ? (row.unlock_version ?? 0) + 1 : row.unlock_version ?? 0;
  getDb().prepare(
    `UPDATE config_profiles
     SET failed_attempts = ?, locked_until = ?, unlock_version = ?, updated_at = ?
     WHERE id = ?`,
  ).run(nextFailedAttempts, lockedUntil, nextUnlockVersion, Date.now(), id);
  return getConfigProfileMetadata(id);
};

export const clearConfigProfileUnlockFailures = (id: string): ConfigProfileMetadata | null => {
  ensureDbInitialized();
  const row = getConfigProfileRow(id);
  if (!row) {
    return null;
  }
  const shouldAdvanceUnlockVersion = Boolean((row.locked_until ?? null) || (row.failed_attempts ?? 0) > 0);
  getDb().prepare(
    `UPDATE config_profiles
     SET failed_attempts = 0, locked_until = NULL, unlock_version = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    shouldAdvanceUnlockVersion ? (row.unlock_version ?? 0) + 1 : row.unlock_version ?? 0,
    Date.now(),
    id,
  );
  return getConfigProfileMetadata(id);
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

export const createOrReuseProxyReference = <Value extends Record<string, unknown>>(
  payload: Value,
): string => {
  ensureDbInitialized();
  const db = getDb();
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(Object.entries(payload).sort(([left], [right]) => left.localeCompare(right))))
    .digest('hex');
  const existing = db.prepare('SELECT id FROM proxy_refs WHERE fingerprint = ?').get(fingerprint) as
    | { id: string }
    | undefined;
  if (existing?.id) {
    db.prepare('UPDATE proxy_refs SET updated_at = ? WHERE id = ?').run(Date.now(), existing.id);
    return existing.id;
  }

  const id = createProxyReferenceId();
  const encrypted = encryptJsonValue(payload);
  const now = Date.now();
  db.prepare(
    `INSERT INTO proxy_refs (id, fingerprint, payload, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, fingerprint, encrypted, now, now);
  return id;
};

export const getProxyReference = <Value extends Record<string, unknown>>(
  id: string,
): Value | null => {
  ensureDbInitialized();
  const row = getDb().prepare('SELECT payload FROM proxy_refs WHERE id = ?').get(id) as
    | { payload: string }
    | undefined;
  if (!row) {
    return null;
  }
  return decryptJsonValue<Value>(row.payload);
};
