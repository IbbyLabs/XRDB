import Database from 'better-sqlite3';
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { accessSync, constants, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { logger } from './serverLogger.ts';

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

CREATE TABLE IF NOT EXISTS canonical_series_mappings (
  canonical_series_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  confidence REAL,
  source_updated_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_series_provider_ids (
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  canonical_series_id TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  confidence REAL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider, external_id)
);

CREATE INDEX IF NOT EXISTS canonical_series_provider_ids_series_idx
  ON canonical_series_provider_ids (canonical_series_id);

CREATE TABLE IF NOT EXISTS canonical_episode_mappings (
  canonical_episode_id TEXT PRIMARY KEY,
  canonical_series_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  season_number INTEGER,
  episode_number INTEGER,
  absolute_episode_number INTEGER,
  confidence REAL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS canonical_episode_mappings_series_idx
  ON canonical_episode_mappings (canonical_series_id);

CREATE TABLE IF NOT EXISTS canonical_episode_provider_refs (
  lookup_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  series_external_id TEXT NOT NULL,
  provider_season_number TEXT,
  provider_episode_number TEXT,
  provider_absolute_episode_number TEXT,
  canonical_episode_id TEXT NOT NULL,
  source TEXT,
  confidence REAL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS canonical_episode_provider_refs_episode_idx
  ON canonical_episode_provider_refs (canonical_episode_id);

CREATE TABLE IF NOT EXISTS canonical_mapping_overrides (
  lookup_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  provider TEXT,
  external_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  reason TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS canonical_mapping_overrides_scope_idx
  ON canonical_mapping_overrides (scope);

CREATE TABLE IF NOT EXISTS community_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  config TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS community_templates_approved_idx ON community_templates (approved, created_at);

CREATE TABLE IF NOT EXISTS community_themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  author TEXT,
  palette_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  admin_note TEXT
);

CREATE INDEX IF NOT EXISTS community_themes_status_idx ON community_themes (status, submitted_at);

CREATE TABLE IF NOT EXISTS admin_request_log (
  id TEXT PRIMARY KEY,
  route_type TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms REAL NOT NULL,
  media_id TEXT,
  config_id TEXT,
  request_key_hash TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_request_log_created_idx ON admin_request_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_request_log_type_idx ON admin_request_log (route_type, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_cache_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  key_prefix TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_cache_events_created_idx ON admin_cache_events (created_at DESC);

CREATE TABLE IF NOT EXISTS admin_prewarm_runs (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  warmed INTEGER NOT NULL,
  skipped INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  static_count INTEGER NOT NULL,
  tmdb_count INTEGER NOT NULL,
  mdblist_count INTEGER NOT NULL,
  imdb_count INTEGER NOT NULL,
  recent_count INTEGER NOT NULL,
  snapshot_count INTEGER NOT NULL,
  target_count INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_prewarm_runs_completed_idx ON admin_prewarm_runs (completed_at DESC);
`;

const SCHEMA_MIGRATIONS = [
  `ALTER TABLE config_profiles ADD COLUMN last_accessed_at INTEGER`,
  `ALTER TABLE config_profiles ADD COLUMN password_hash TEXT`,
  `ALTER TABLE config_profiles ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE config_profiles ADD COLUMN locked_until INTEGER`,
  `ALTER TABLE config_profiles ADD COLUMN unlock_version INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE config_profiles ADD COLUMN is_inactive INTEGER DEFAULT 0`,
  `ALTER TABLE config_profiles ADD COLUMN inactive_marked_at INTEGER`,
  `CREATE TABLE IF NOT EXISTS community_templates (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, author TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]', config TEXT NOT NULL, approved INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS community_templates_approved_idx ON community_templates (approved, created_at)`,
  `CREATE TABLE IF NOT EXISTS admin_request_log (id TEXT PRIMARY KEY, route_type TEXT NOT NULL, status_code INTEGER NOT NULL, duration_ms REAL NOT NULL, media_id TEXT, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS admin_request_log_created_idx ON admin_request_log (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS admin_request_log_type_idx ON admin_request_log (route_type, created_at DESC)`,
  `ALTER TABLE admin_request_log ADD COLUMN config_id TEXT`,
  `ALTER TABLE admin_request_log ADD COLUMN request_key_hash TEXT`,
  `CREATE INDEX IF NOT EXISTS admin_request_log_config_idx ON admin_request_log (config_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS admin_request_log_key_hash_idx ON admin_request_log (request_key_hash, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS admin_cache_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, key_prefix TEXT, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS admin_cache_events_created_idx ON admin_cache_events (created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS admin_prewarm_runs (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, completed_at INTEGER NOT NULL, warmed INTEGER NOT NULL, skipped INTEGER NOT NULL, failed INTEGER NOT NULL, static_count INTEGER NOT NULL, tmdb_count INTEGER NOT NULL, mdblist_count INTEGER NOT NULL, imdb_count INTEGER NOT NULL, recent_count INTEGER NOT NULL, snapshot_count INTEGER NOT NULL, target_count INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS admin_prewarm_runs_completed_idx ON admin_prewarm_runs (completed_at DESC)`,
];

const MIGRATION_WINDOW_MS = 48 * 60 * 60 * 1000;

const ENCRYPTION_VERSION = 0x01;
export const LEGACY_ID_RE = /^xr_[0-9a-f]{8}$/i;
const ENCRYPTED_ID_RE = /^xrc_[0-9a-f]{16}$/i;
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
  is_inactive?: number | null;
  inactive_marked_at?: number | null;
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
  isInactive: boolean;
  inactiveMarkedAt: number | null;
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
  ensureWritableParentDirectory(keyPath);
  try {
    writeFileSync(keyPath, generated.toString('hex'), { mode: 0o600 });
  } catch (error) {
    failDataDirPermission(dirname(keyPath), error);
  }
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
  isInactive: (row.is_inactive ?? 0) !== 0,
  inactiveMarkedAt:
    typeof row.inactive_marked_at === 'number' && Number.isFinite(row.inactive_marked_at)
      ? row.inactive_marked_at
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

const formatDataDirPermissionHelp = (targetPath: string) =>
  [
    `[xrdb] Data directory is not writable: ${targetPath}`,
    '[xrdb] This usually means Docker created the bind mount as root before XRDB started.',
    '[xrdb] Fix the host path permissions, then recreate XRDB.',
    `[xrdb] Example: sudo chown -R 1000:1000 "${targetPath}" && sudo chmod -R 755 "${targetPath}"`,
  ].join(' ');

const failDataDirPermission = (targetPath: string, error: unknown): never => {
  const cause = error instanceof Error ? ` Cause: ${error.message}` : '';
  throw new Error(`${formatDataDirPermissionHelp(targetPath)}${cause}`);
};

const resolveDbDataDir = () => {
  const configured = String(process.env.XRDB_DATA_DIR ?? '').trim();
  return configured || join(process.cwd(), 'data');
};

export const getDbPath = () => {
  const configured = String(process.env.XRDB_DB_PATH ?? '').trim();
  return configured || join(resolveDbDataDir(), 'xrdb.db');
};

const ensureWritableParentDirectory = (filePath: string) => {
  const targetDir = dirname(filePath);

  try {
    mkdirSync(targetDir, { recursive: true });
    accessSync(targetDir, constants.R_OK | constants.W_OK);
  } catch (error) {
    failDataDirPermission(targetDir, error);
  }

  return targetDir;
};

const openDatabase = (databasePath: string) => {
  ensureWritableParentDirectory(databasePath);

  let db: Database.Database;
  try {
    db = new Database(databasePath);
  } catch (error) {
    if (
      error instanceof Error
      && ('code' in error)
      && (error as NodeJS.ErrnoException & { code?: string }).code === 'SQLITE_CANTOPEN'
    ) {
      failDataDirPermission(dirname(databasePath), error);
    }
    throw error;
  }

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

const createConfigProfileId = () => randomUUID();

const createProxyReferenceId = () => randomUUID();

type CommunityThemeOldRow = {
  id: string;
  name: string;
  author: string | null;
  hue: number;
  accent_l: number;
  accent_c: number;
  surface_depth: number;
  status: string;
  submitted_at: number;
  reviewed_at: number | null;
  admin_note: string | null;
};

function parametricToPaletteSync(h: number, l: number, c: number, d: number): Record<string, string> {
  return {
    bgBase:     `oklch(${d}% 0.010 ${h})`,
    bgMid:      `oklch(9.5% 0.012 ${h})`,
    bgSurface:  `oklch(11% 0.014 ${h})`,
    bgElevated: `oklch(16% 0.018 ${h})`,
    accent:     `oklch(${l}% ${c} ${h})`,
    accentDim:  `oklch(19% 0.09 ${h})`,
    accentText: `oklch(76% 0.10 ${h})`,
    ink:        `oklch(93% 0.007 ${h})`,
    muted:      `oklch(51% 0.014 ${h})`,
    border:     `oklch(22% 0.016 ${h})`,
    scrim:      `oklch(4% 0.008 ${h} / 0.86)`,
  };
}

function migrateCommunityThemes(db: Database.Database): void {
  const cols = db.prepare('PRAGMA table_info(community_themes)').all() as { name: string }[];
  if (!cols.length) return;
  const hasHue = cols.some(c => c.name === 'hue');
  if (!hasHue) return;

  db.exec('ALTER TABLE community_themes RENAME TO community_themes_old');
  db.exec(`CREATE TABLE community_themes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    author TEXT,
    palette_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    submitted_at INTEGER NOT NULL,
    reviewed_at INTEGER,
    admin_note TEXT
  )`);

  const old = db.prepare('SELECT * FROM community_themes_old').all() as CommunityThemeOldRow[];
  const insert = db.prepare('INSERT INTO community_themes VALUES (?,?,?,?,?,?,?,?)');
  for (const row of old) {
    const hue = ((row.hue % 360) + 360) % 360;
    const l = Math.min(70, Math.max(40, row.accent_l));
    const c = Math.min(0.24, Math.max(0.08, row.accent_c));
    const d = Math.min(15, Math.max(5, row.surface_depth));
    const palette = parametricToPaletteSync(hue, l, c, d);
    insert.run(row.id, row.name, row.author, JSON.stringify(palette), row.status, row.submitted_at, row.reviewed_at, row.admin_note);
  }

  db.exec('DROP TABLE community_themes_old');
  db.exec('CREATE INDEX IF NOT EXISTS community_themes_status_idx ON community_themes (status, submitted_at)');
}

export const ensureDbInitialized = () => {
  const state = getDbState();
  if (!state.initialized) {
    state.db.exec(SCHEMA_SQL);
    migrateCommunityThemes(state.db);
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

    const purgeDaysRaw = String(process.env.XRDB_INACTIVE_CONFIG_PURGE_DAYS ?? '').trim();
    const purgeDays = parseInt(purgeDaysRaw, 10);
    if (Number.isFinite(purgeDays) && purgeDays > 0) {
      purgeInactiveConfigProfiles(purgeDays);
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

export const listAllConfigProfiles = (query?: string): ConfigProfileMetadata[] => {
  ensureDbInitialized();
  const db = getDb();
  const rows = (
    query && query.trim()
      ? db
          .prepare(
            `SELECT id, password_hash, failed_attempts, locked_until, unlock_version, created_at, updated_at, last_accessed_at
             FROM config_profiles WHERE id LIKE ? ORDER BY created_at DESC`,
          )
          .all(`%${query.trim()}%`)
      : db
          .prepare(
            `SELECT id, password_hash, failed_attempts, locked_until, unlock_version, created_at, updated_at, last_accessed_at
             FROM config_profiles ORDER BY created_at DESC`,
          )
          .all()
  ) as (ConfigProfileRow & { id: string })[];
  return rows.map((row) => normalizeConfigProfileMetadata(row.id, row));
};

export const clearConfigProfilePassword = (id: string): boolean => {
  ensureDbInitialized();
  const result = getDb()
    .prepare(
      `UPDATE config_profiles
       SET password_hash = NULL, failed_attempts = 0, locked_until = NULL,
           unlock_version = unlock_version + 1, updated_at = ?
       WHERE id = ?`,
    )
    .run(Date.now(), id);
  return result.changes > 0;
};

export const unlockConfigProfile = (id: string): boolean => {
  ensureDbInitialized();
  const result = getDb()
    .prepare(
      `UPDATE config_profiles
       SET failed_attempts = 0, locked_until = NULL,
           unlock_version = unlock_version + 1, updated_at = ?
       WHERE id = ?`,
    )
    .run(Date.now(), id);
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

const pruneInactiveConfigProfiles = (days: number): void => {
  ensureDbInitialized();
  const db = getDb();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const now = Date.now();
  db.prepare(
    `UPDATE config_profiles
     SET is_inactive = 1, inactive_marked_at = ?
     WHERE is_inactive = 0
       AND ((last_accessed_at IS NOT NULL AND last_accessed_at < ?)
            OR (last_accessed_at IS NULL AND created_at < ?))`,
  ).run(now, cutoff, cutoff);
};

const purgeInactiveConfigProfiles = (days: number): void => {
  ensureDbInitialized();
  const db = getDb();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  db.prepare(
    `DELETE FROM config_profiles
     WHERE is_inactive = 1 AND inactive_marked_at IS NOT NULL AND inactive_marked_at < ?`,
  ).run(cutoff);
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
