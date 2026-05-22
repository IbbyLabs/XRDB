'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { MetricsSnapshot, RequestLogEntry } from '@/lib/adminMetrics';

type MetricsData = {
  snapshot: MetricsSnapshot;
  recent: RequestLogEntry[];
};

const fmtDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const fmtTs = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const fmtRelative = (ts: number): string => {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const statusClass = (code: number): string => {
  if (code < 300) return 'xrdb-admin-badge--ok';
  if (code < 500) return 'xrdb-admin-badge--warn';
  return 'xrdb-admin-badge--err';
};

function StatCard({
  label,
  value,
  sub,
  variant,
}: {
  label: string;
  value: string | number;
  sub?: string;
  variant?: 'hero' | 'secondary';
}) {
  return (
    <div className={`xrdb-admin-stat-card${variant ? ` xrdb-admin-stat-card--${variant}` : ''}`}>
      <div className="xrdb-admin-stat-label">{label}</div>
      <div className="xrdb-admin-stat-value">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {sub && <div className="xrdb-admin-stat-sub">{sub}</div>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="xrdb-admin-section-label">
      {children}
    </h3>
  );
}

export function AdminMetricsPanel() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'thumbnail' | 'proxy'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | '2xx' | '4xx' | '5xx'>('all');
  const [slowOnly, setSlowOnly] = useState(false);
  const [prewarmTriggeredAt, setPrewarmTriggeredAt] = useState<number | null>(null);
  const [prewarmDisabled, setPrewarmDisabled] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/metrics?limit=200');
      if (!res.ok) throw new Error(res.statusText);
      setData(await res.json());
      setError(null);
    } catch {
      setError('Failed to load metrics.');
    }
  }, []);

  useEffect(() => {
    load();
    const interval = prewarmDisabled ? 3_000 : 30_000;
    const id = setInterval(load, interval);
    return () => clearInterval(id);
  }, [load, prewarmDisabled]);

  useEffect(() => {
    if (!prewarmDisabled) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [prewarmDisabled]);

  const clearLog = async () => {
    if (!window.confirm('Clear the request log? This cannot be undone.')) return;
    setClearing(true);
    try {
      await fetch('/api/admin/metrics', { method: 'DELETE' });
      await load();
    } finally {
      setClearing(false);
    }
  };

  const filteredRecent = useMemo(() => {
    const source = data?.recent ?? [];
    return source.filter((r) => {
      if (typeFilter !== 'all' && r.routeType !== typeFilter) return false;
      if (statusFilter === '2xx' && (r.statusCode < 200 || r.statusCode >= 300)) return false;
      if (statusFilter === '4xx' && (r.statusCode < 400 || r.statusCode >= 500)) return false;
      if (statusFilter === '5xx' && r.statusCode < 500) return false;
      if (slowOnly && r.durationMs < 3000) return false;
      return true;
    });
  }, [data?.recent, typeFilter, statusFilter, slowOnly]);

  if (error) {
    return (
      <div className="xrdb-admin-section">
        <div className="xrdb-admin-section-header">
          <h2 className="xrdb-admin-section-title">Requests</h2>
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
          <h2 className="xrdb-admin-section-title">Requests</h2>
        </div>
        <div className="xrdb-admin-empty" role="status">Loading…</div>
      </div>
    );
  }

  const { snapshot } = data;
  const paged = filteredRecent.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filteredRecent.length / PAGE_SIZE);
  const pw = snapshot.prewarmLastSummary;

  const prewarmComplete =
    prewarmTriggeredAt !== null &&
    snapshot.prewarmLastRunAt !== null &&
    snapshot.prewarmLastRunAt > prewarmTriggeredAt;

  const triggerPrewarm = async () => {
    setPrewarmDisabled(true);
    try {
      const res = await fetch('/api/admin/prewarm', { method: 'POST' });
      if (res.ok) {
        const body = await res.json() as { started: boolean };
        if (body.started) {
          setPrewarmTriggeredAt(Date.now());
        } else {
          setPrewarmDisabled(false);
        }
      } else {
        setPrewarmDisabled(false);
      }
    } catch {
      setPrewarmDisabled(false);
    }
  };

  if (prewarmComplete && prewarmDisabled) {
    setPrewarmDisabled(false);
    setPrewarmTriggeredAt(null);
  }

  return (
    <div className="xrdb-admin-section">
      <div className="xrdb-admin-section-header">
        <h2 className="xrdb-admin-section-title">Requests</h2>
        <div className="xrdb-admin-header-actions">
          <span className="xrdb-admin-refresh">
            <span className="xrdb-admin-refresh-dot xrdb-admin-refresh-dot--live" />
            Live
          </span>
          <button className="xrdb-admin-btn xrdb-admin-btn--danger" onClick={clearLog} disabled={clearing}>
            {clearing ? 'Clearing…' : 'Clear log'}
          </button>
        </div>
      </div>
      <div className="xrdb-admin-section-body">

        <SectionLabel>Volume</SectionLabel>
        <div className="xrdb-admin-stat-grid">
          <StatCard label="Total requests" value={snapshot.totalRequests} />
          <StatCard label="Requests (1h)" value={snapshot.requestsLastHour} />
          <StatCard label="Requests (24h)" value={snapshot.requestsLast24Hours} />
          {snapshot.uptimeSince && (
            <StatCard
              label="First request"
              value={new Date(snapshot.uptimeSince).toLocaleDateString()}
              sub={fmtTs(snapshot.uptimeSince)}
            />
          )}
        </div>
        <div className="xrdb-admin-stat-grid">
          <StatCard label="P50 latency" variant="hero" value={snapshot.latencyP50Ms != null ? fmtDuration(snapshot.latencyP50Ms) : '—'} sub="median (24h)" />
          <StatCard label="P95 latency" value={snapshot.latencyP95Ms != null ? fmtDuration(snapshot.latencyP95Ms) : '—'} sub="95th pct (24h)" />
          <StatCard label="P99 latency" value={snapshot.latencyP99Ms != null ? fmtDuration(snapshot.latencyP99Ms) : '—'} sub="99th pct (24h)" />
        </div>
        <div className="xrdb-admin-stat-grid">
          <StatCard
            label="4xx rate (24h)"
            variant="hero"
            value={`${(snapshot.errorRate4xxLast24h * 100).toFixed(1)}%`}
            sub="client errors"
          />
          <StatCard
            label="5xx rate (24h)"
            variant="hero"
            value={`${(snapshot.errorRate5xxLast24h * 100).toFixed(1)}%`}
            sub="server errors"
          />
        </div>

        <SectionLabel>By type</SectionLabel>
        <div className="xrdb-admin-stat-grid">
          {Object.entries(snapshot.countsByType).map(([type, n]) => (
            <StatCard key={type} label={type} value={n} />
          ))}
        </div>

        <SectionLabel>Cache</SectionLabel>
        <div className="xrdb-admin-stat-grid">
          <StatCard
            label="Hit rate"
            variant="hero"
            value={`${(snapshot.cacheHitRate * 100).toFixed(1)}%`}
            sub={`${snapshot.cacheHits.toLocaleString()} hits / ${snapshot.cacheMisses.toLocaleString()} misses`}
          />
          <StatCard label="Sets" variant="secondary" value={snapshot.cacheSets} />
          <StatCard label="Deletes" variant="secondary" value={snapshot.cacheDeletes} />
          <StatCard label="Lookups (24h)" variant="secondary" value={snapshot.cacheEventsLast24Hours} />
        </div>
        <div className="xrdb-admin-stat-grid">
          <StatCard
            label="Final image hit rate"
            variant="hero"
            value={`${(snapshot.finalImageCacheHitRate * 100).toFixed(1)}%`}
            sub={`${snapshot.finalImageCacheHits.toLocaleString()} hits / ${snapshot.finalImageCacheMisses.toLocaleString()} misses`}
          />
          <StatCard label="Final image sets" variant="secondary" value={snapshot.finalImageCacheSets} />
          <StatCard label="Final image deletes" variant="secondary" value={snapshot.finalImageCacheDeletes} />
          <StatCard label="Final image events (24h)" variant="secondary" value={snapshot.finalImageCacheEventsLast24Hours} />
        </div>
        {snapshot.finalImageCacheCohorts.length > 0 && (
          <div className="xrdb-admin-subsection">
            <div className="xrdb-admin-subsection-label">UUID cohorts</div>
            <div className="xrdb-admin-table-wrap">
              <table className="xrdb-admin-table">
                <thead>
                  <tr>
                    <th>Cohort</th>
                    <th>Hit rate</th>
                    <th>Hits</th>
                    <th>Misses</th>
                    <th>24h events</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.finalImageCacheCohorts.map((cohort) => (
                    <tr key={cohort.cohortHash}>
                      <td className="cell-muted xrdb-admin-id">{cohort.cohortHash.slice(0, 10)}</td>
                      <td>{(cohort.hitRate * 100).toFixed(1)}%</td>
                      <td>{cohort.hits.toLocaleString()}</td>
                      <td>{cohort.misses.toLocaleString()}</td>
                      <td>{cohort.eventsLast24Hours.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <SectionLabel>Active users</SectionLabel>
        <div className="xrdb-admin-stat-grid">
          <StatCard
            label="Active (1h)"
            value={snapshot.activeUsersLastHour}
            sub="unique users"
          />
          <StatCard
            label="Active (24h)"
            value={snapshot.activeUsersLast24Hours}
            sub={`${snapshot.activeConfigUsersLast24Hours} config / ${snapshot.activeKeyUsersLast24Hours} key`}
          />
          <StatCard
            label="Keyed requests (24h)"
            value={snapshot.trackedIdentityRequestsLast24Hours}
            sub={`${snapshot.anonymousRequestsLast24Hours.toLocaleString()} anonymous`}
          />
          <StatCard
            label="Config profiles"
            value={snapshot.totalActiveConfigProfiles}
            sub={`${snapshot.totalInactiveConfigProfiles.toLocaleString()} inactive`}
          />
        </div>
        {(snapshot.topKeysByVolume.length > 0 || snapshot.anonymousRequestsLast24Hours > 0) && (
          <div className="xrdb-admin-subsection">
            <div className="xrdb-admin-subsection-label">Top keys (24h)</div>
            <div className="xrdb-admin-table-wrap">
              <table className="xrdb-admin-table">
                <thead>
                  <tr>
                    <th>Key hash</th>
                    <th>Requests</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.topKeysByVolume.map((k) => (
                    <tr key={k.keyHash}>
                      <td className="cell-muted xrdb-admin-id">{k.keyHash.slice(0, 8)}</td>
                      <td>{k.requests.toLocaleString()}</td>
                    </tr>
                  ))}
                  {snapshot.anonymousRequestsLast24Hours > 0 && (
                    <tr>
                      <td className="cell-muted" style={{ fontStyle: 'italic' }}>anonymous</td>
                      <td>{snapshot.anonymousRequestsLast24Hours.toLocaleString()}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <SectionLabel>Latency</SectionLabel>
        <div className="xrdb-admin-stat-grid">
          <StatCard label="P50 latency" variant="hero" value={snapshot.latencyP50Ms != null ? fmtDuration(snapshot.latencyP50Ms) : '—'} sub="median (24h)" />
        </div>

        <SectionLabel>Prewarm</SectionLabel>
        <div className="xrdb-admin-control-row">
          <button
            className="xrdb-admin-btn"
            onClick={triggerPrewarm}
            disabled={prewarmDisabled}
            style={{ fontSize: '0.6875rem' }}
          >
            {prewarmDisabled ? 'In progress…' : 'Run prewarm now'}
          </button>
          {prewarmDisabled && prewarmTriggeredAt !== null && (() => {
            const elapsed = Math.floor((now - prewarmTriggeredAt) / 1000);
            const m = Math.floor(elapsed / 60);
            const s = elapsed % 60;
            const elapsedStr = m > 0 ? `${m}m ${s}s` : `${s}s`;
            const hint = pw?.targetCount ? ` — ${pw.targetCount} posters expected` : '';
            return (
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                {elapsedStr} elapsed{hint}
              </span>
            );
          })()}
        </div>
        <div className="xrdb-admin-stat-grid">
          <StatCard label="Total runs" value={snapshot.prewarmRuns} />
          <StatCard label="Total warmed" value={snapshot.prewarmTotalWarmed} />
          <StatCard label="Total failed" value={snapshot.prewarmTotalFailed} />
          {snapshot.prewarmLastRunAt ? (
            <StatCard
              label="Last run"
              value={fmtRelative(snapshot.prewarmLastRunAt)}
              sub={fmtTs(snapshot.prewarmLastRunAt)}
            />
          ) : (
            <StatCard label="Last run" value="—" />
          )}
        </div>
        {pw && (
          <div className="xrdb-admin-stat-grid" style={{ marginTop: '0.5rem' }}>
            <StatCard label="Last warmed" value={pw.warmed} sub={`${pw.skipped} skipped / ${pw.failed} failed`} />
            <StatCard label="Target" value={pw.targetCount} sub={`${pw.staticCount} static / ${pw.tmdbCount} TMDB / ${pw.mdblistCount} MDBList`} />
            <StatCard label="IMDb" value={pw.imdbCount} sub={`${pw.recentCount} recent / ${pw.snapshotCount} snapshot`} />
          </div>
        )}

        <SectionLabel>Request log</SectionLabel>
        <div style={{ marginTop: '0.25rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem', alignItems: 'center' }}>
            <select
              className="xrdb-admin-select"
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value as typeof typeFilter); setPage(0); }}
            >
              <option value="all">All types</option>
              <option value="image">Image</option>
              <option value="thumbnail">Thumbnail</option>
              <option value="proxy">Proxy</option>
            </select>
            <select
              className="xrdb-admin-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(0); }}
            >
              <option value="all">All statuses</option>
              <option value="2xx">2xx</option>
              <option value="4xx">4xx</option>
              <option value="5xx">5xx</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--muted)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={slowOnly}
                onChange={(e) => { setSlowOnly(e.target.checked); setPage(0); }}
              />
              Slow only (&ge;3s)
            </label>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginLeft: 'auto' }}>
              {filteredRecent.length} of {data.recent.length} rows
            </span>
          </div>
          <div className="xrdb-admin-table-wrap">
            <table className="xrdb-admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Media ID</th>
                  <th>Config</th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '1.5rem 1rem' }}>
                      <div>No requests recorded yet.</div>
                      <div style={{ fontSize: '0.75rem', marginTop: '0.375rem', opacity: 0.75 }}>Requests will appear here once any image, thumbnail, or proxy endpoint receives traffic.</div>
                    </td>
                  </tr>
                ) : (
                  paged.map((r) => (
                    <tr key={r.id}>
                      <td className="cell-muted">{fmtTs(r.createdAt)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{r.routeType}</td>
                      <td>
                        <span className={`xrdb-admin-badge ${statusClass(r.statusCode)}`}>
                          {r.statusCode}
                        </span>
                      </td>
                      <td className="cell-muted">{fmtDuration(r.durationMs)}</td>
                      <td className="cell-muted xrdb-admin-id">{r.mediaId ?? '—'}</td>
                      <td className="cell-muted xrdb-admin-id">
                        {r.configId ? r.configId.slice(0, 8) + '…' : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="xrdb-admin-pagination">
              <span>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredRecent.length)} of{' '}
                {filteredRecent.length}
              </span>
              <div className="xrdb-admin-btn-row">
                <button
                  className="xrdb-admin-btn"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Prev
                </button>
                <button
                  className="xrdb-admin-btn"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
