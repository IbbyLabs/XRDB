import { type NextRequest } from 'next/server';
import { isAdminEnabled, verifyAdminRequest } from '@/lib/adminAuth';
import { getDb, ensureDbInitialized } from '@/lib/sqliteStore';
import { getCacheEventStats } from '@/lib/adminMetrics';
import { clearObjectStorageCache, getObjectStorageCacheStats } from '@/lib/imageObjectStorage';

const getCacheTableStats = () => {
  ensureDbInitialized();
  const db = getDb();
  const now = Date.now();

  const total = (db.prepare('SELECT COUNT(*) as n FROM metadata_cache').get() as { n: number }).n;
  const expired = (
    db.prepare('SELECT COUNT(*) as n FROM metadata_cache WHERE expires_at <= ?').get(now) as { n: number }
  ).n;
  const active = total - expired;

  const oldest = db
    .prepare('SELECT key, expires_at FROM metadata_cache ORDER BY expires_at ASC LIMIT 1')
    .get() as { key: string; expires_at: number } | undefined;

  const newest = db
    .prepare('SELECT key, expires_at FROM metadata_cache ORDER BY expires_at DESC LIMIT 1')
    .get() as { key: string; expires_at: number } | undefined;

  return { total, expired, active, oldest: oldest ?? null, newest: newest ?? null };
};

export async function GET(request: NextRequest) {
  if (!isAdminEnabled()) return new Response('Not Found', { status: 404 });
  if (!verifyAdminRequest(request)) return new Response('Unauthorized', { status: 401 });

  const tableStats = getCacheTableStats();
  const objectStorageStats = getObjectStorageCacheStats();
  const eventStats = getCacheEventStats();

  return Response.json({ tableStats, objectStorageStats, eventStats });
}

export async function DELETE(request: NextRequest) {
  if (!isAdminEnabled()) return new Response('Not Found', { status: 404 });
  if (!verifyAdminRequest(request)) return new Response('Unauthorized', { status: 401 });

  ensureDbInitialized();
  const db = getDb();
  const mode = request.nextUrl.searchParams.get('mode') ?? 'expired';
  const prefix = request.nextUrl.searchParams.get('prefix');

  if (prefix) {
    const result = db
      .prepare("DELETE FROM metadata_cache WHERE key LIKE ? || '%'")
      .run(prefix);
    return Response.json({ ok: true, deleted: result.changes });
  }

  if (mode === 'final') {
    const deleted = clearObjectStorageCache({ mode: 'final' });
    return Response.json({ ok: true, deleted, scope: 'image-final' });
  }

  if (mode === 'all') {
    const metadataDeleted = db.prepare('DELETE FROM metadata_cache').run().changes;
    const imageDeleted = clearObjectStorageCache({ mode: 'all' });
    return Response.json({ ok: true, deleted: metadataDeleted + imageDeleted, metadataDeleted, imageDeleted });
  }

  const metadataDeleted = db
    .prepare('DELETE FROM metadata_cache WHERE expires_at <= ?')
    .run(Date.now()).changes;
  const imageDeleted = clearObjectStorageCache({ mode: 'expired' });
  return Response.json({ ok: true, deleted: metadataDeleted + imageDeleted, metadataDeleted, imageDeleted });
}
