import { statSync } from 'fs';
import { type NextRequest } from 'next/server';
import { isAdminEnabled, verifyAdminRequest } from '@/lib/adminAuth';
import { getDb, ensureDbInitialized, getDbPath } from '@/lib/sqliteStore';

const TABLES = [
  'metadata_cache',
  'config_profiles',
  'community_templates',
  'admin_request_log',
  'admin_cache_events',
  'admin_prewarm_runs',
  'imdb_ratings',
  'imdb_episodes',
] as const;

const IMPORT_MARKER_RATINGS = 'imdb:dataset:imported:ratings';
const IMPORT_MARKER_EPISODES = 'imdb:dataset:imported:episodes';

const countTableWithTimeout = (table: string, timeoutMs = 2000): number => {
  const db = getDb();
  try {
    let done = false;
    let result = -1;
    const t = setTimeout(() => { if (!done) done = true; }, timeoutMs);
    try {
      const row = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number } | undefined;
      if (!done) result = row?.n ?? 0;
    } finally {
      clearTimeout(t);
    }
    return result;
  } catch {
    return 0;
  }
};

export async function GET(request: NextRequest) {
  if (!isAdminEnabled()) return new Response('Not Found', { status: 404 });
  if (!verifyAdminRequest(request)) return new Response('Unauthorized', { status: 401 });

  ensureDbInitialized();
  const db = getDb();
  const dbPath = getDbPath();

  let dbFileSizeBytes = 0;
  try {
    dbFileSizeBytes = statSync(dbPath).size;
  } catch {
  }

  const tableCounts: Record<string, number> = {};
  for (const table of TABLES) {
    try {
      const row = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get() as { n: number } | undefined;
      tableCounts[table] = row?.n ?? 0;
    } catch {
      tableCounts[table] = 0;
    }
  }

  const ratingsRows = countTableWithTimeout('imdb_ratings');
  const episodesRows = countTableWithTimeout('imdb_episodes');

  const getImportMarker = (key: string): number | null => {
    try {
      const row = db.prepare(`SELECT value FROM metadata_cache WHERE key = ?`).get(key) as { value: string } | undefined;
      if (!row?.value) return null;
      const parsed = JSON.parse(row.value) as { importedAt?: number } | number | string;
      if (typeof parsed === 'number') return parsed;
      if (typeof parsed === 'object' && parsed !== null && 'importedAt' in parsed) return parsed.importedAt ?? null;
      return null;
    } catch {
      return null;
    }
  };

  const ratingsLastImport = getImportMarker(IMPORT_MARKER_RATINGS);
  const episodesLastImport = getImportMarker(IMPORT_MARKER_EPISODES);

  return Response.json({
    dbFileSizeBytes,
    tableCounts,
    imdbStatus: {
      ratingsRows,
      episodesRows,
      ratingsLastImport,
      episodesLastImport,
    },
  });
}
