'use client';

import { useState, useCallback, useEffect } from 'react';
import { Activity, HardDrive, RefreshCw, AlertCircle, Check, Flame, ScrollText, SlidersHorizontal } from 'lucide-react';
import {
  fetchMetrics, fetchCacheStats, adminAuthHeaders,
  fetchLogLevel, setLogLevel, clearLogLevel,
  fetchMemoryLimit, setMemoryLimit, clearMemoryLimit,
  fetchTTLs, setTTL, clearTTL,
  type MetricsSnapshot, type CacheStats, type LogLevelState,
  type MemoryLimitState, type TTLEntry,
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

      {data.totalRequests === 0 && (
        <p className="page-sub" style={{ margin: 'var(--sp-3) 0 0' }}>
          No requests recorded yet — status codes and top routes will appear here once your
          library starts requesting artwork.
        </p>
      )}

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
      <p className="page-sub" style={{ margin: 'var(--sp-2) 0 0' }}>
        These are read-only diagnostics. Per-provider cache lifetimes (TTLs) are configured
        under the <strong>Runtime</strong> tab.
      </p>
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
  const [ok, setOk]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setState(await fetchLogLevel()); }
    catch (e) { setError((e as Error).message); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const apply = async (level: string) => {
    setBusy(level); setError(null); setOk(null);
    try { setState(await setLogLevel(level)); setOk(`Log level set to ${level} on the running server.`); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  const revert = async () => {
    setBusy('revert'); setError(null); setOk(null);
    try { const s = await clearLogLevel(); setState(s); setOk(`Reverted to the environment level (${s.level}).`); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  if (!state) {
    return error
      ? <div className="notice notice-error" role="alert"><AlertCircle size={14} aria-hidden />
          <span style={{ flex: 1 }}>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => void load()}>Try again</button></div>
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
      {ok && (
        <div className="notice notice-success" role="status">
          <Check size={14} aria-hidden />
          <span>{ok}</span>
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

// ── Runtime panel (memory limit + provider TTLs) ──────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  stored: 'set here',
  environment: 'from env var',
  default: 'default',
};

function RuntimePanel() {
  const [mem, setMem]       = useState<MemoryLimitState | null>(null);
  const [ttls, setTtls]     = useState<TTLEntry[] | null>(null);
  const [memDraft, setMemDraft] = useState('');
  const [busy, setBusy]     = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [ok, setOk]         = useState<string | null>(null);
  const [confirmLowMem, setConfirmLowMem] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [m, t] = await Promise.all([fetchMemoryLimit(), fetchTTLs()]);
      setMem(m); setMemDraft(m.limitMb ? String(m.limitMb) : ''); setTtls(t);
    } catch (e) { setError((e as Error).message); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const applyMem = async () => {
    const mb = memDraft.trim() === '' ? 0 : Number(memDraft);
    if (!Number.isFinite(mb) || mb < 0) { setError('Memory limit must be a non-negative number'); return; }
    const floored = Math.floor(mb);
    // A very low cap can send the live server straight into GC thrash or OOM, so
    // require a second press to confirm an under-128 MiB value.
    if (floored > 0 && floored < 128 && !confirmLowMem) {
      setError(`${floored} MiB is very low and could thrash GC or OOM the running server. Press Apply again to confirm.`);
      setConfirmLowMem(true);
      return;
    }
    setBusy('mem'); setError(null); setOk(null); setConfirmLowMem(false);
    try {
      const m = await setMemoryLimit(floored); setMem(m); setMemDraft(m.limitMb ? String(m.limitMb) : '');
      setOk(m.limitMb ? `Memory limit set to ${m.limitMb} MiB.` : 'Memory limit cleared — no cap.');
    }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };
  const revertMem = async () => {
    setBusy('mem'); setError(null); setOk(null); setConfirmLowMem(false);
    try {
      const m = await clearMemoryLimit(); setMem(m); setMemDraft(m.limitMb ? String(m.limitMb) : '');
      setOk(`Reverted to the environment memory limit (${m.limitMb ? `${m.limitMb} MiB` : 'no cap'}).`);
    }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  const applyTTL = async (provider: string, hours: number) => {
    setBusy('ttl:' + provider); setError(null); setOk(null);
    try { setTtls(await setTTL(provider, hours)); setOk(`${provider} cache TTL set to ${hours}h.`); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };
  const revertTTL = async (provider: string) => {
    setBusy('ttl:' + provider); setError(null); setOk(null);
    try { setTtls(await clearTTL(provider)); setOk(`${provider} cache TTL reverted to its environment value.`); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  };

  if (!mem || !ttls) {
    return error
      ? <div className="notice notice-error" role="alert"><AlertCircle size={14} aria-hidden />
          <span style={{ flex: 1 }}>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => void load()}>Try again</button></div>
      : <div className="skeleton" style={{ height: '12rem' }} aria-label="Loading runtime settings" aria-busy="true" />;
  }

  return (
    <div className="cfg-fields" style={{ maxWidth: '720px' }}>
      <p className="page-sub" style={{ margin: 0 }}>
        Operational limits applied to the running server. Changes take effect immediately
        and persist across restarts; clearing one reverts to its environment value.
      </p>

      {error && (
        <div className="notice notice-error" role="alert">
          <AlertCircle size={14} aria-hidden /><span>{error}</span>
        </div>
      )}
      {ok && (
        <div className="notice notice-success" role="status">
          <Check size={14} aria-hidden /><span>{ok}</span>
        </div>
      )}

      <div className="field">
        <label className="label" htmlFor="mem-limit">Memory limit (MiB)</label>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            id="mem-limit"
            className="input"
            inputMode="numeric"
            style={{ width: '9rem' }}
            placeholder="no limit"
            value={memDraft}
            onChange={e => { setMemDraft(e.target.value); setError(null); setConfirmLowMem(false); }}
          />
          <button className="btn btn-primary" onClick={() => void applyMem()} disabled={busy !== null}>
            {busy === 'mem' ? 'Applying…' : 'Apply'}
          </button>
          {mem.source === 'stored' && (
            <button className="btn btn-ghost" onClick={() => void revertMem()} disabled={busy !== null}>
              Revert
            </button>
          )}
          <span className="page-sub" style={{ margin: 0 }}>
            {mem.limitMb ? `${mem.limitMb} MiB` : 'no limit'} ({SOURCE_LABEL[mem.source] ?? mem.source})
          </span>
        </div>
        <p className="page-sub" style={{ margin: 'var(--sp-1) 0 0' }}>
          Soft heap cap so the runtime collects garbage before the container is OOM-killed. Empty means no limit.
        </p>
      </div>

      <div className="field">
        <span className="label">Provider cache TTLs (hours)</span>
        <p className="page-sub" style={{ margin: '0 0 var(--sp-2)' }}>
          How long each source&apos;s ratings stay cached. A render caches for the shortest contributing provider&apos;s TTL.
        </p>
        <div className="panel panel-table">
          <table className="table">
            <thead><tr><th scope="col">Provider</th><th scope="col">Hours</th><th scope="col">Source</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {ttls.map(t => <TTLRow key={`${t.provider}:${t.hours}:${t.source}`} entry={t} busy={busy} onApply={applyTTL} onRevert={revertTTL} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TTLRow({ entry, busy, onApply, onRevert }: {
  entry: TTLEntry;
  busy: string | null;
  onApply: (provider: string, hours: number) => void;
  onRevert: (provider: string) => void;
}) {
  // Seeded from the entry; the parent gives each row a key that includes the
  // value, so a revert or external change remounts the row with a fresh draft.
  const [draft, setDraft] = useState(String(entry.hours));
  const rowBusy = busy === 'ttl:' + entry.provider;
  return (
    <tr>
      <td><span className="mono">{entry.provider}</span></td>
      <td>
        <input
          className="input"
          inputMode="decimal"
          style={{ width: '6rem' }}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          aria-label={`${entry.provider} cache TTL in hours`}
        />
      </td>
      <td><span className="page-sub">{SOURCE_LABEL[entry.source] ?? entry.source}</span></td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => { const h = Number(draft); if (Number.isFinite(h) && h >= 0) onApply(entry.provider, h); }}
          disabled={busy !== null}
        >
          {rowBusy ? '…' : 'Set'}
        </button>
        {entry.source === 'stored' && (
          <button className="btn btn-ghost btn-sm" onClick={() => onRevert(entry.provider)} disabled={busy !== null}>
            Reset
          </button>
        )}
      </td>
    </tr>
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

type Tab = 'metrics' | 'cache' | 'logs' | 'runtime' | 'warm';

const TABS: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: 'metrics', label: 'Metrics', icon: Activity },
  { id: 'cache',   label: 'Cache',   icon: HardDrive },
  { id: 'logs',    label: 'Logs',    icon: ScrollText },
  { id: 'runtime', label: 'Runtime', icon: SlidersHorizontal },
  { id: 'warm',    label: 'Warm',    icon: Flame },
];

export function AdminClient() {
  const [tab, setTab]         = useState<Tab>('metrics');
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [cache, setCache]     = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async (t: Tab) => {
    if (t === 'warm' || t === 'logs' || t === 'runtime') return;
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
    if (t === 'warm' || t === 'logs' || t === 'runtime') return;
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
          disabled={loading || (tab !== 'metrics' && tab !== 'cache')}
          aria-label="Refresh data"
          title={tab === 'metrics' || tab === 'cache' ? 'Refresh this panel' : 'This panel loads on its own'}
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
          {id === 'runtime' && tab === 'runtime' && <RuntimePanel />}
          {id === 'warm' && tab === 'warm' && <WarmPanel />}
        </div>
      ))}
    </div>
  );
}
