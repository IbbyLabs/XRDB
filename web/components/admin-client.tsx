'use client';

import { useState, useCallback, useEffect } from 'react';
import { Activity, HardDrive, RefreshCw, AlertCircle } from 'lucide-react';
import { fetchMetrics, fetchCacheStats, type MetricsSnapshot, type CacheStats } from '@/lib/api';

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

function fmtUptime(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${fmt(s / 3600, 1)}h`;
}

function MetricsPanel({ data }: { data: MetricsSnapshot }) {
  const topRoutes = Object.entries(data.byRoute)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const statusEntries = Object.entries(data.byStatus).sort((a, b) => Number(a[0]) - Number(b[0]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.75rem' }}>Latency</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
          {([
            { label: 'p50', value: fmt(data.p50Ms), unit: 'ms' },
            { label: 'p95', value: fmt(data.p95Ms), unit: 'ms' },
            { label: 'p99', value: fmt(data.p99Ms), unit: 'ms' },
            { label: 'Total requests', value: data.totalRequests.toLocaleString(), unit: '' },
            { label: 'Uptime', value: fmtUptime(data.uptimeSeconds), unit: '' },
          ] as { label: string; value: string; unit: string }[]).map(({ label, value, unit }) => (
            <div key={label} className="xrdb-stat">
              <span className="xrdb-stat-label">{label}</span>
              <span className="xrdb-stat-value">{value}{unit}</span>
            </div>
          ))}
        </div>
      </div>

      {statusEntries.length > 0 && (
        <div>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.75rem' }}>Status codes</h2>
          <div className="xrdb-card">
            <table className="xrdb-table">
              <thead><tr><th scope="col">Status</th><th scope="col">Requests</th></tr></thead>
              <tbody>
                {statusEntries.map(([code, count]) => (
                  <tr key={code}>
                    <td><span className="xrdb-mono">{code}</span></td>
                    <td>{count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {topRoutes.length > 0 && (
        <div>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.75rem' }}>Top routes</h2>
          <div className="xrdb-card">
            <table className="xrdb-table">
              <thead><tr><th scope="col">Route</th><th scope="col">Requests</th></tr></thead>
              <tbody>
                {topRoutes.map(([route, count]) => (
                  <tr key={route}>
                    <td><span className="xrdb-mono">{route}</span></td>
                    <td>{count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CachePanel({ data }: { data: CacheStats }) {
  if (data.status) {
    return <div className="xrdb-notice xrdb-notice-info" role="status">{data.status}</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
        <div className="xrdb-stat"><span className="xrdb-stat-label">Hot entries</span><span className="xrdb-stat-value">{data.hotEntries}</span></div>
        <div className="xrdb-stat"><span className="xrdb-stat-label">Disk entries</span><span className="xrdb-stat-value">{data.diskEntries}</span></div>
        <div className="xrdb-stat"><span className="xrdb-stat-label">TTL</span><span className="xrdb-stat-value" style={{ fontSize: '1.1rem' }}>{data.ttl}</span></div>
      </div>
      <div className="xrdb-card">
        <div className="xrdb-card-body">
          <span className="xrdb-label">Cache directory</span>
          <span className="xrdb-mono" style={{ display: 'block', marginTop: '0.25rem', wordBreak: 'break-all' }}>{data.dir}</span>
        </div>
      </div>
    </div>
  );
}

type Tab = 'metrics' | 'cache';

const TABS: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: 'metrics', label: 'Metrics', icon: Activity },
  { id: 'cache',   label: 'Cache',   icon: HardDrive },
];

export function AdminClient() {
  const [tab, setTab]         = useState<Tab>('metrics');
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [cache, setCache]     = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async (t: Tab) => {
    setLoading(true);
    setError(null);
    try {
      if (t === 'metrics') setMetrics(await fetchMetrics());
      else                  setCache(await fetchCacheStats());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load initial data in useEffect, not during render
  useEffect(() => { void load('metrics'); }, [load]);

  const switchTab = (t: Tab) => {
    setTab(t);
    if ((t === 'metrics' && !metrics) || (t === 'cache' && !cache)) {
      void load(t);
    }
  };

  return (
    <div className="xrdb-page-inner">
      <div className="admin-header">
        <div>
          <h1 className="xrdb-section-title">Admin</h1>
          <p className="xrdb-section-sub">Runtime metrics and cache diagnostics.</p>
        </div>
        <button
          className="xrdb-btn xrdb-btn-ghost"
          onClick={() => void load(tab)}
          disabled={loading}
          aria-label="Refresh data"
        >
          <RefreshCw size={13} aria-hidden="true" className={loading ? 'xrdb-spin' : ''} />
          Refresh
        </button>
      </div>

      <div role="tablist" aria-label="Admin sections" className="admin-tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => switchTab(id)}
            className={`admin-tab${tab === id ? ' admin-tab--active' : ''}`}
          >
            <Icon size={13} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="xrdb-notice xrdb-notice-error" style={{ marginBottom: '1rem' }} role="alert">
          <AlertCircle size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {TABS.map(({ id }) => (
        <div
          key={id}
          role="tabpanel"
          id={`panel-${id}`}
          aria-labelledby={`tab-${id}`}
          hidden={tab !== id}
        >
          {loading && tab === id && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }} aria-label="Loading data" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="xrdb-skeleton" style={{ height: '5rem' }} />
              ))}
            </div>
          )}
          {!loading && id === 'metrics' && metrics && <MetricsPanel data={metrics} />}
          {!loading && id === 'cache'   && cache   && <CachePanel   data={cache}   />}
        </div>
      ))}
    </div>
  );
}
