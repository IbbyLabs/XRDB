'use client';

import { useState, useEffect, useCallback } from 'react';

type ApiKeys = Record<string, boolean>;
type CacheTtls = Record<string, string | number | boolean | null>;
type InstanceConfig = Record<string, string | boolean | null>;

type SystemHealth = {
  uptimeSeconds: number;
  memoryMb: number;
  nodeVersion: string;
};

type ConfigData = {
  apiKeys: ApiKeys;
  xrdbKeyCount: number;
  cacheTtls: CacheTtls;
  instanceConfig: InstanceConfig;
  systemHealth: SystemHealth;
};

type HealthResult = {
  provider: string;
  ok: boolean;
  statusCode: number | null;
  error?: string;
  checkedAt: number;
};

type HealthData = {
  results: HealthResult[];
  cached: boolean;
  cachedAt: number;
};

type StatsData = {
  dbFileSizeBytes: number;
  tableCounts: Record<string, number>;
  imdbStatus: {
    ratingsRows: number;
    episodesRows: number;
    ratingsLastImport: number | null;
    episodesLastImport: number | null;
  };
};

const KEY_LABELS: Record<string, string> = {
  tmdb: 'TMDB',
  omdb: 'OMDb',
  fanartTv: 'Fanart.tv',
  fanartClient: 'Fanart client key',
  mdblist: 'MDBList',
  trakt: 'Trakt',
  myAnimelist: 'MyAnimeList',
  rpdb: 'RPDB',
  simkl: 'Simkl',
};

const INSTANCE_LABELS: Record<string, string> = {
  dataDir: 'Data directory',
  dbPath: 'Database path',
  nodeEnv: 'Environment',
  port: 'Port',
  baseUrl: 'Base URL configured',
  encryptionKey: 'Profile encryption',
};

const CACHE_TTL_LABELS: Record<string, string> = {
  metadataCacheMax: 'Metadata cache limit',
  imdbDatasetCacheTtlMs: 'IMDb cache TTL',
  posterCacheWarm: 'Poster prewarm enabled',
};

const fmtBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const fmtTs = (ts: number | null): string => {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
};

export function AdminConfigPanel() {
  const [data, setData] = useState<ConfigData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [stats, setStats] = useState<StatsData | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/config');
      if (!res.ok) throw new Error(res.statusText);
      setData(await res.json());
      setError(null);
    } catch {
      setError('Failed to load config.');
    }
  }, []);

  const loadHealth = useCallback(async (force = false) => {
    setHealthLoading(true);
    try {
      const res = await fetch(`/api/admin/config/health${force ? '?force=1' : ''}`);
      if (res.ok) setHealth(await res.json());
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats');
      if (res.ok) setStats(await res.json());
    } catch {
    }
  }, []);

  useEffect(() => {
    load();
    loadStats();
  }, [load, loadStats]);

  if (error) {
    return (
      <div className="xrdb-admin-section">
        <div className="xrdb-admin-section-header">
          <h2 className="xrdb-admin-section-title">Configuration</h2>
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
          <h2 className="xrdb-admin-section-title">Configuration</h2>
        </div>
        <div className="xrdb-admin-empty" role="status">Loading…</div>
      </div>
    );
  }

  return (
    <div className="xrdb-admin-section">
      <div className="xrdb-admin-section-header">
        <h2 className="xrdb-admin-section-title">Configuration</h2>
      </div>
      <div className="xrdb-admin-section-body xrdb-admin-section-body--stack">
        <div>
          <div className="xrdb-admin-section-label-row">
            <h3 className="xrdb-admin-section-label xrdb-admin-section-label--inline">API keys</h3>
            <button
              className="xrdb-admin-btn xrdb-admin-btn--sm"
              onClick={() => loadHealth(true)}
              disabled={healthLoading}
            >
              {healthLoading ? 'Checking…' : health ? 'Recheck' : 'Check health'}
            </button>
            {health && (
              <span className="xrdb-admin-health-ts">
                Checked {new Date(health.cachedAt).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit' })}
                {health.cached ? ' (cached)' : ''}
              </span>
            )}
          </div>
          <div className="xrdb-admin-config-grid">
            {Object.entries(data.apiKeys).map(([key, isSet]) => {
              const liveResult = health?.results.find((r) => r.provider === key);
              let badge: React.ReactNode;
              if (liveResult) {
                if (liveResult.ok) {
                  badge = <span className="xrdb-admin-badge xrdb-admin-badge--ok">OK {liveResult.statusCode}</span>;
                } else if (liveResult.error) {
                  badge = <span className="xrdb-admin-badge xrdb-admin-badge--warn">{liveResult.error}</span>;
                } else {
                  badge = <span className="xrdb-admin-badge xrdb-admin-badge--err">Error {liveResult.statusCode}</span>;
                }
              } else {
                badge = (
                  <span className={`xrdb-admin-badge ${isSet ? 'xrdb-admin-badge--ok' : 'xrdb-admin-badge--warn'}`}>
                    {isSet ? 'Set' : 'Not set'}
                  </span>
                );
              }
              return (
                <div key={key} className="xrdb-admin-config-row">
                  <span className="xrdb-admin-config-name">{KEY_LABELS[key] ?? key}</span>
                  {badge}
                </div>
              );
            })}
            <div className="xrdb-admin-config-row">
              <span className="xrdb-admin-config-name">XRDB request keys</span>
              <span className={`xrdb-admin-badge ${data.xrdbKeyCount > 0 ? 'xrdb-admin-badge--ok' : 'xrdb-admin-badge--warn'}`}>
                {data.xrdbKeyCount > 0 ? `${data.xrdbKeyCount} configured` : 'Open'}
              </span>
            </div>
          </div>
        </div>

        <div>
          <h3 className="xrdb-admin-section-label">Instance</h3>
          <div className="xrdb-admin-config-grid">
            {Object.entries(data.instanceConfig).filter(([key]) => key !== 'adminKey').map(([key, val]) => (
              <div key={key} className="xrdb-admin-config-row">
                <span className="xrdb-admin-config-name xrdb-admin-config-name--sm">{INSTANCE_LABELS[key] ?? key}</span>
                {typeof val === 'boolean' ? (
                  <span className={`xrdb-admin-badge ${val ? 'xrdb-admin-badge--ok' : 'xrdb-admin-badge--warn'}`}>
                    {val ? 'Set' : 'Not set'}
                  </span>
                ) : (
                  <span className="xrdb-admin-config-value xrdb-admin-config-value--truncate">
                    {val ?? '—'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="xrdb-admin-section-label">Cache settings</h3>
          <div className="xrdb-admin-config-grid">
            {Object.entries(data.cacheTtls).map(([key, val]) => (
              <div key={key} className="xrdb-admin-config-row">
                <span className="xrdb-admin-config-name xrdb-admin-config-name--sm">{CACHE_TTL_LABELS[key] ?? key}</span>
                {typeof val === 'boolean' ? (
                  <span className={`xrdb-admin-badge ${val ? 'xrdb-admin-badge--ok' : 'xrdb-admin-badge--warn'}`}>
                    {val ? 'Enabled' : 'Disabled'}
                  </span>
                ) : (
                  <span className="xrdb-admin-config-value">{val != null ? String(val) : 'Default'}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {stats && (
          <div>
            <h3 className="xrdb-admin-section-label">IMDb dataset</h3>
            <div className="xrdb-admin-config-grid">
              <div className="xrdb-admin-config-row">
                <span className="xrdb-admin-config-name">Ratings rows</span>
                <span className="xrdb-admin-config-value">
                  {stats.imdbStatus.ratingsRows === -1 ? 'timeout' : stats.imdbStatus.ratingsRows.toLocaleString()}
                </span>
              </div>
              <div className="xrdb-admin-config-row">
                <span className="xrdb-admin-config-name">Episodes rows</span>
                <span className="xrdb-admin-config-value">
                  {stats.imdbStatus.episodesRows === -1 ? 'timeout' : stats.imdbStatus.episodesRows.toLocaleString()}
                </span>
              </div>
              <div className="xrdb-admin-config-row">
                <span className="xrdb-admin-config-name">Ratings imported</span>
                <span className="xrdb-admin-config-value">{fmtTs(stats.imdbStatus.ratingsLastImport)}</span>
              </div>
              <div className="xrdb-admin-config-row">
                <span className="xrdb-admin-config-name">Episodes imported</span>
                <span className="xrdb-admin-config-value">{fmtTs(stats.imdbStatus.episodesLastImport)}</span>
              </div>
            </div>
          </div>
        )}

        <div>
          <h3 className="xrdb-admin-section-label">System</h3>
          <div className="xrdb-admin-config-grid">
            <div className="xrdb-admin-config-row">
              <span className="xrdb-admin-config-name">Uptime</span>
              <span className="xrdb-admin-config-value">
                {data.systemHealth.uptimeSeconds < 60
                  ? `${data.systemHealth.uptimeSeconds}s`
                  : data.systemHealth.uptimeSeconds < 3600
                  ? `${Math.floor(data.systemHealth.uptimeSeconds / 60)}m ${data.systemHealth.uptimeSeconds % 60}s`
                  : `${Math.floor(data.systemHealth.uptimeSeconds / 3600)}h ${Math.floor((data.systemHealth.uptimeSeconds % 3600) / 60)}m`}
              </span>
            </div>
            <div className="xrdb-admin-config-row">
              <span className="xrdb-admin-config-name">Memory (RSS)</span>
              <span className="xrdb-admin-config-value">{data.systemHealth.memoryMb} MB</span>
            </div>
            <div className="xrdb-admin-config-row">
              <span className="xrdb-admin-config-name">Node.js</span>
              <span className="xrdb-admin-config-value">{data.systemHealth.nodeVersion}</span>
            </div>
          </div>
        </div>

        {stats && (
          <div>
            <h3 className="xrdb-admin-section-label">Database</h3>
            <div className="xrdb-admin-config-grid">
              <div className="xrdb-admin-config-row">
                <span className="xrdb-admin-config-name">File size</span>
                <span className="xrdb-admin-config-value">{fmtBytes(stats.dbFileSizeBytes)}</span>
              </div>
              {Object.entries(stats.tableCounts).map(([table, count]) => (
                <div key={table} className="xrdb-admin-config-row">
                  <span className="xrdb-admin-config-name--mono">{table}</span>
                  <span className="xrdb-admin-config-value">{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
