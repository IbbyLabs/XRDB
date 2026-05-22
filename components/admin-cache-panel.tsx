'use client';

import { useState, useEffect, useCallback } from 'react';

type CacheTableStats = {
  total: number;
  expired: number;
  active: number;
  oldest: { key: string; expires_at: number } | null;
  newest: { key: string; expires_at: number } | null;
};

type CacheEventStats = {
  hits: number;
  misses: number;
  hitRate: number;
};

type CacheData = {
  tableStats: CacheTableStats;
  objectStorageStats: {
    totalFiles: number;
    totalBytes: number;
    expiredFiles: number;
    finalFiles: number;
    finalBytes: number;
  };
  eventStats: CacheEventStats;
};

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

export function AdminCachePanel() {
  const [data, setData] = useState<CacheData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flushing, setFlushing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cache');
      if (!res.ok) throw new Error(res.statusText);
      setData(await res.json());
      setError(null);
    } catch {
      setError('Failed to load cache stats.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const flush = async (mode: 'expired' | 'all' | 'final') => {
    if (mode === 'all' && !window.confirm('Flush all cache entries? Active entries will be removed.')) return;
    if (mode === 'final' && !window.confirm('Flush all final image cache entries?')) return;
    setFlushing(mode);
    try {
      await fetch(`/api/admin/cache?mode=${mode}`, { method: 'DELETE' });
      await load();
    } finally {
      setFlushing(null);
    }
  };

  if (error) {
    return (
      <div className="xrdb-admin-section">
        <div className="xrdb-admin-section-header">
          <h2 className="xrdb-admin-section-title">Cache</h2>
        </div>
        <div className="xrdb-admin-empty" role="status">
          {error}
          <button className="xrdb-admin-btn xrdb-admin-btn--offset" onClick={load}>Retry</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="xrdb-admin-section">
        <div className="xrdb-admin-section-header">
          <h2 className="xrdb-admin-section-title">Cache</h2>
        </div>
        <div className="xrdb-admin-empty" role="status">Loading…</div>
      </div>
    );
  }

  const { tableStats, objectStorageStats, eventStats } = data;

  return (
    <div className="xrdb-admin-section">
      <div className="xrdb-admin-section-header">
        <h2 className="xrdb-admin-section-title">Cache</h2>
        <div className="xrdb-admin-btn-row">
          <button
            className="xrdb-admin-btn"
            onClick={() => flush('expired')}
            disabled={flushing !== null}
          >
            {flushing === 'expired' ? 'Pruning…' : 'Prune expired'}
          </button>
          <button
            className="xrdb-admin-btn xrdb-admin-btn--danger"
            onClick={() => flush('final')}
            disabled={flushing !== null}
          >
            {flushing === 'final' ? 'Flushing…' : 'Flush final images'}
          </button>
          <button
            className="xrdb-admin-btn xrdb-admin-btn--danger"
            onClick={() => flush('all')}
            disabled={flushing !== null}
          >
            {flushing === 'all' ? 'Flushing…' : 'Flush all'}
          </button>
        </div>
      </div>
      <div className="xrdb-admin-section-body">
        <div className="xrdb-admin-stat-grid">
          <div className="xrdb-admin-stat-card">
            <div className="xrdb-admin-stat-label">Total entries</div>
            <div className="xrdb-admin-stat-value">{tableStats.total.toLocaleString()}</div>
          </div>
          <div className="xrdb-admin-stat-card">
            <div className="xrdb-admin-stat-label">Active</div>
            <div className="xrdb-admin-stat-value">{tableStats.active.toLocaleString()}</div>
          </div>
          <div className="xrdb-admin-stat-card">
            <div className="xrdb-admin-stat-label">Expired</div>
            <div className="xrdb-admin-stat-value">{tableStats.expired.toLocaleString()}</div>
            {tableStats.expired > 0 && (
              <div className="xrdb-admin-stat-sub">Prune to free space</div>
            )}
          </div>
          <div className="xrdb-admin-stat-card">
            <div className="xrdb-admin-stat-label">Hit rate</div>
            <div className="xrdb-admin-stat-value">{(eventStats.hitRate * 100).toFixed(1)}%</div>
            <div className="xrdb-admin-stat-sub">
              {eventStats.hits.toLocaleString()} hits / {eventStats.misses.toLocaleString()} misses
            </div>
          </div>
          <div className="xrdb-admin-stat-card">
            <div className="xrdb-admin-stat-label">Final images</div>
            <div className="xrdb-admin-stat-value">{objectStorageStats.finalFiles.toLocaleString()}</div>
            <div className="xrdb-admin-stat-sub">
              {(objectStorageStats.finalBytes / (1024 * 1024)).toFixed(1)} MB stored
            </div>
          </div>
          <div className="xrdb-admin-stat-card">
            <div className="xrdb-admin-stat-label">Image cache files</div>
            <div className="xrdb-admin-stat-value">{objectStorageStats.totalFiles.toLocaleString()}</div>
            <div className="xrdb-admin-stat-sub">
              {objectStorageStats.expiredFiles.toLocaleString()} expired
            </div>
          </div>
        </div>
        {(tableStats.oldest || tableStats.newest) && (
          <div className="xrdb-admin-ts-row">
            {tableStats.oldest && (
              <span className="xrdb-admin-ts-item">
                Oldest expires: <strong>{fmtDate(tableStats.oldest.expires_at)}</strong>
              </span>
            )}
            {tableStats.newest && (
              <span className="xrdb-admin-ts-item">
                Newest expires: <strong>{fmtDate(tableStats.newest.expires_at)}</strong>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
