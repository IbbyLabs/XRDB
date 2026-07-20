'use client';

import { useState, useCallback, useEffect } from 'react';
import { Activity, HardDrive, RefreshCw, AlertCircle, Flame, ScrollText } from 'lucide-react';
import {
  fetchMetrics, fetchCacheStats, adminAuthHeaders,
  fetchLogLevel, setLogLevel, clearLogLevel,
  type MetricsSnapshot, type CacheStats, type LogLevelState,
} from '@/lib/api';
import { tablistKeyNav } from './tablist';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

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
    <div>
      <div className="admin-section">
        <h2 className="admin-section-title">Latency</h2>
        <div className="stat-strip">
          {([
            { label: 'p50', value: fmt(data.p50Ms), unit: 'ms' },
            { label: 'p95', value: fmt(data.p95Ms), unit: 'ms' },
            { label: 'p99', value: fmt(data.p99Ms), unit: 'ms' },
            { label: 'Total requests', value: data.totalRequests.toLocaleString(), unit: '' },
            { label: 'Uptime', value: fmtUptime(data.uptimeSeconds), unit: '' },
          ] as { label: string; value: string; unit: string }[]).map(({ label, value, unit }) => (
            <div key={label} className="stat-cell">
              <span className="stat-label">{label}</span>
              <span className="stat-value">{value}{unit}</span>
            </div>
          ))}
        </div>
      </div>

      {statusEntries.length > 0 && (
        <div className="admin-section">
          <h2 className="admin-section-title">Status codes</h2>
          <div className="panel panel-table">
            <table className="table">
              <thead><tr><th scope="col">Status</th><th scope="col">Requests</th></tr></thead>
              <tbody>
                {statusEntries.map(([code, count]) => (
                  <tr key={code}>
                    <td><span className="mono">{code}</span></td>
                    <td>{count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {topRoutes.length > 0 && (
        <div className="admin-section">
          <h2 className="admin-section-title">Top routes</h2>
          <div className="panel panel-table">
            <table className="table">
              <thead><tr><th scope="col">Route</th><th scope="col">Requests</th></tr></thead>
              <tbody>
                {topRoutes.map(([route, count]) => (
                  <tr key={route}>
                    <td><span className="mono">{route}</span></td>
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
    return <div className="notice notice-info" role="status">{data.status}</div>;
  }
  return (
    <div className="admin-section">
      <div className="stat-strip">
        <div className="stat-cell"><span className="stat-label">Hot entries</span><span className="stat-value">{data.hotEntries}</span></div>
        <div className="stat-cell"><span className="stat-label">Disk entries</span><span className="stat-value">{data.diskEntries}</span></div>
        <div className="stat-cell"><span className="stat-label">TTL</span><span className="stat-value stat-value--sm">{data.ttl}</span></div>
      </div>
      <div className="panel">
        <div className="panel-body">
          <span className="label">Cache directory</span>
          <span className="mono" style={{ display: 'inline-block', marginTop: 'var(--sp-1)', wordBreak: 'break-all' }}>{data.dir}</span>
        </div>
      </div>
    </div>
  );
}

// ── Log level panel ───────────────────────────────────────────────────────────

/** How each level reads to an operator deciding what to switch to. */
const LEVEL_HINTS: Record<string, string> = {
  debug: 'Every render, provider miss, and cache decision. Noisy; use while diagnosing.',
  info:  'Lifecycle and one line per request. The normal setting.',
  warn:  'Degraded paths and fallbacks only.',
  error: 'Failures only. Quietest; hides the context around a problem.',
};

/** Plain-English explanation of which layer supplied the level in force. */
const SOURCE_HINTS: Record<string, string> = {
  stored:      'Set here, and kept across restarts.',
  environment: 'From XRDB_LOG_LEVEL. Changing it here overrides it.',
  default:     'Nothing configured it, so the built-in default applies.',
};

function LogLevelPanel() {
  const [state, setState]   = useState<LogLevelState | null>(null);
  const [busy, setBusy]     = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setState(await fetchLogLevel()); }
    catch (e) { setError((e as Error).message); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const apply = async (level: string) => {
    setBusy(level); setError(null);
    try { setState(await setLogLevel(level)); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  const revert = async () => {
    setBusy('revert'); setError(null);
    try { setState(await clearLogLevel()); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  if (!state) {
    return error
      ? <div className="notice notice-error" role="alert"><AlertCircle size={14} aria-hidden />
          <span>{error}</span></div>
      : <div className="skeleton" style={{ height: '9rem' }} aria-label="Loading log level" aria-busy="true" />;
  }

  return (
    <div className="cfg-fields" style={{ maxWidth: '640px' }}>
      <p className="page-sub" style={{ margin: 0 }}>
        Verbosity of the JSON logs on stdout. Changes apply to the running server straight
        away, so you can raise detail on a live problem without restarting and losing it.
      </p>

      <div className="field">
        <span className="label" id="log-level-label">Level</span>
        <div role="group" aria-labelledby="log-level-label" className="tabs" style={{ marginTop: 'var(--sp-1)' }}>
          {state.levels.map(level => (
            <button
              key={level}
              type="button"
              className="tab"
              aria-pressed={state.level === level}
              disabled={busy !== null}
              onClick={() => void apply(level)}
              title={LEVEL_HINTS[level]}
            >
              {busy === level ? '…' : level}
            </button>
          ))}
        </div>
        <p className="page-sub" style={{ margin: 'var(--sp-2) 0 0' }}>
          {LEVEL_HINTS[state.level]}
        </p>
      </div>

      <div className="panel">
        <div className="panel-body">
          <span className="label">Source</span>
          <p style={{ margin: 'var(--sp-1) 0 0' }}>
            {SOURCE_HINTS[state.source] ?? state.source}
          </p>
          {state.env && (
            <p className="page-sub" style={{ margin: 'var(--sp-2) 0 0' }}>
              XRDB_LOG_LEVEL is <span className="mono">{state.env}</span>
            </p>
          )}
          {!state.persisted && (
            <p className="page-sub" style={{ margin: 'var(--sp-2) 0 0' }}>
              The settings store is unavailable, so a change here lasts only until the next restart.
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="notice notice-error" role="alert">
          <AlertCircle size={14} aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {state.source === 'stored' && (
        <div>
          <button className="btn btn-ghost" onClick={() => void revert()} disabled={busy !== null}>
            {busy === 'revert' ? 'Reverting…' : 'Revert to environment'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Warm panel ────────────────────────────────────────────────────────────────

function WarmPanel() {
  const [ids, setIds]           = useState('');
  const [mediaType, setType]    = useState('poster');
  const [submitting, setSub]    = useState(false);
  const [result, setResult]     = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const handleWarm = async () => {
    const list = ids.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    if (list.length === 0) { setError('Enter at least one ID'); return; }
    setSub(true); setError(null); setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/warm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ ids: list, mediaType }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json() as { accepted: number; mediaType: string };
      setResult(`Warming ${data.accepted} ${data.mediaType}(s) in background.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSub(false);
    }
  };

  return (
    <div className="cfg-fields" style={{ maxWidth: '640px' }}>
      <p className="page-sub" style={{ margin: 0 }}>
        Pre-render posters into the cache. Accepts IMDb IDs, TMDB IDs, or any ID supported by your configured providers. One per line or comma-separated.
      </p>

      <div className="field">
        <label className="label" htmlFor="warm-ids">Media IDs</label>
        <textarea
          id="warm-ids"
          className="input"
          rows={6}
          value={ids}
          onChange={e => { setIds(e.target.value); setError(null); }}
          placeholder={"tt0111161\ntt0468569\ntt0816692"}
          style={{ fontFamily: 'var(--font-mono-stack)', resize: 'vertical' }}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="warm-type">Media type</label>
        <select
          id="warm-type"
          className="select"
          value={mediaType}
          onChange={e => setType(e.target.value)}
        >
          <option value="poster">Poster</option>
          <option value="backdrop">Backdrop</option>
          <option value="thumbnail">Thumbnail</option>
          <option value="logo">Logo</option>
        </select>
      </div>

      {error && (
        <div className="notice notice-error" role="alert">
          <AlertCircle size={14} aria-hidden />
          <span>{error}</span>
        </div>
      )}
      {result && (
        <div className="notice notice-success" role="status">
          <Flame size={14} aria-hidden />
          <span>{result}</span>
        </div>
      )}

      <div>
        <button
          className="btn btn-primary"
          onClick={handleWarm}
          disabled={submitting || !ids.trim()}
        >
          {submitting ? 'Queuing…' : 'Warm cache'}
        </button>
      </div>
    </div>
  );
}

type Tab = 'metrics' | 'cache' | 'logs' | 'warm';

const TABS: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: 'metrics', label: 'Metrics', icon: Activity },
  { id: 'cache',   label: 'Cache',   icon: HardDrive },
  { id: 'logs',    label: 'Logs',    icon: ScrollText },
  { id: 'warm',    label: 'Warm',    icon: Flame },
];

export function AdminClient() {
  const [tab, setTab]         = useState<Tab>('metrics');
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [cache, setCache]     = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async (t: Tab) => {
    if (t === 'warm' || t === 'logs') return;
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
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load('metrics'); }, [load]);

  const switchTab = (t: Tab) => {
    setTab(t);
    if (t === 'warm' || t === 'logs') return;
    if ((t === 'metrics' && !metrics) || (t === 'cache' && !cache)) {
      void load(t);
    }
  };

  return (
    <div className="page-inner">
      <div className="admin-header">
        <div>
          <h1 className="page-title">Admin</h1>
          <p className="page-sub">Runtime metrics, cache diagnostics, and log verbosity.</p>
        </div>
        <button
          className="btn btn-ghost"
          onClick={() => void load(tab)}
          disabled={loading}
          aria-label="Refresh data"
        >
          <RefreshCw size={13} aria-hidden="true" className={loading ? 'spin' : ''} />
          Refresh
        </button>
      </div>

      <div role="tablist" aria-label="Admin sections" className="tabs" style={{ marginBottom: 'var(--sp-4)' }} onKeyDown={tablistKeyNav}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            aria-controls={`panel-${id}`}
            onClick={() => switchTab(id)}
            className="tab"
          >
            <Icon size={13} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="notice notice-error" style={{ marginBottom: 'var(--sp-4)' }} role="alert">
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
          className={tab === id ? 'tabpanel-enter' : undefined}
        >
          {loading && tab === id && (
            <div className="stat-strip" aria-label="Loading data" aria-busy="true" style={{ border: 'none', background: 'transparent', gap: 'var(--sp-3)' }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: '5rem', flex: '1 1 9rem' }} />
              ))}
            </div>
          )}
          {!loading && id === 'metrics' && metrics && <MetricsPanel data={metrics} />}
          {!loading && id === 'cache'   && cache   && <CachePanel   data={cache}   />}
          {id === 'logs' && tab === 'logs' && <LogLevelPanel />}
          {id === 'warm' && tab === 'warm' && <WarmPanel />}
        </div>
      ))}
    </div>
  );
}
