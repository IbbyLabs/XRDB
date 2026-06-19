'use client';

import { useState, useEffect, useCallback, useId, useRef } from 'react';
import { Check, AlertCircle, X, Plug, Eye, EyeOff, Trash2, ChevronDown } from 'lucide-react';
import { fetchSettings, setSetting, deleteSetting } from '@/lib/api';

// ── Provider definitions ──────────────────────────────────────────────────────

interface Integration {
  id: string;
  name: string;
  description: string;
  docsUrl: string;
  keys: { key: string; label: string; placeholder: string; hint?: string }[];
  accent: string;
}

const INTEGRATIONS: Integration[] = [
  {
    id: 'tmdb',
    name: 'TMDB',
    description: 'Artwork, metadata, and ratings — required for most features.',
    docsUrl: 'https://developer.themoviedb.org/docs/getting-started',
    accent: '#01b4e4',
    keys: [
      {
        key: 'tmdb_read_token',
        label: 'Read Access Token',
        placeholder: 'eyJhbGciOiJIUzI1NiJ9…',
        hint: 'Preferred — longer token starting with eyJ',
      },
      {
        key: 'tmdb_api_key',
        label: 'API Key (v3)',
        placeholder: '8a7bcdef…',
        hint: 'Legacy key, use the read token when possible',
      },
    ],
  },
  {
    id: 'mdblist',
    name: 'MDBList',
    description: 'Aggregated ratings from IMDb, RT, Metacritic, Letterboxd, and more.',
    docsUrl: 'https://mdblist.com/api/',
    accent: '#8b5cf6',
    keys: [
      {
        key: 'mdblist_api_key',
        label: 'API Key',
        placeholder: 'ywgmcfc1…',
      },
    ],
  },
  {
    id: 'omdb',
    name: 'OMDB',
    description: 'Supplemental ratings and data from the Open Movie Database.',
    docsUrl: 'https://www.omdbapi.com/apikey.aspx',
    accent: '#f59e0b',
    keys: [
      {
        key: 'omdb_api_key',
        label: 'API Key',
        placeholder: 'abcd1234',
      },
    ],
  },
  {
    id: 'fanart',
    name: 'Fanart.tv',
    description: 'High-quality fan-made artwork: logos, art posters, and thumbs.',
    docsUrl: 'https://fanart.tv/get-an-api-key/',
    accent: '#10b981',
    keys: [
      {
        key: 'fanart_api_key',
        label: 'API Key',
        placeholder: 'a1b2c3d4…',
      },
    ],
  },
  {
    id: 'trakt',
    name: 'Trakt',
    description: 'Direct Trakt community ratings with automatic IMDb ID lookup.',
    docsUrl: 'https://trakt.tv/oauth/applications',
    accent: '#ed1c24',
    keys: [
      {
        key: 'trakt_client_id',
        label: 'Client ID',
        placeholder: 'abc123def456…',
        hint: 'From your Trakt API application',
      },
    ],
  },
  {
    id: 'simkl',
    name: 'SIMKL',
    description: 'SIMKL community ratings with automatic IMDb ID lookup.',
    docsUrl: 'https://simkl.com/apps/',
    accent: '#1cb0f6',
    keys: [
      {
        key: 'simkl_client_id',
        label: 'Client ID',
        placeholder: 'abc123…',
        hint: 'From your SIMKL app registration',
      },
    ],
  },
];

const TMDB_ONBOARDING_KEY = 'xrdb-integrations-tmdb-onboarding-v1';

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeError(e: unknown): string {
  const msg = (e as Error).message ?? 'Unknown error';
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError'))
    return 'Could not reach the backend.';
  if (msg.includes('unauthorized') || msg.includes('401'))
    return 'Admin key required. Set XRDB_ADMIN_KEY on the server.';
  return msg;
}

// ── Notice ────────────────────────────────────────────────────────────────────

function Notice({
  type, message, onDismiss, actionLabel, onAction,
}: { type: 'error' | 'success' | 'info'; message: string; onDismiss?: () => void; actionLabel?: string; onAction?: () => void }) {
  return (
    <div
      className={`notice notice-${type}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      {type === 'error' ? <AlertCircle size={14} aria-hidden /> : <Check size={14} aria-hidden />}
      <span style={{ flex: 1 }}>{message}</span>
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn btn-ghost btn-sm">
          {actionLabel}
        </button>
      )}
      {onDismiss && (
        <button onClick={onDismiss} className="notice-dismiss" aria-label="Dismiss">
          <X size={12} aria-hidden />
        </button>
      )}
    </div>
  );
}

// ── Key input row ─────────────────────────────────────────────────────────────

function KeyRow({
  keyDef, isSet, onSave, onDelete,
}: {
  keyDef: Integration['keys'][0];
  isSet: boolean;
  onSave: (value: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const uid = useId();
  const [value, setValue] = useState('');
  const [show, setShow]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSave = async () => {
    if (!value.trim()) { setLocalError('Enter a value to save'); return; }
    setSaving(true);
    setLocalError('');
    try {
      await onSave(value.trim());
      setValue('');
    } catch (e) {
      setLocalError(normalizeError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="field">
      <label className="label" htmlFor={uid}>
        {keyDef.label}
        {isSet && <span className="sr-only"> (configured)</span>}
      </label>
      {keyDef.hint && <span className="hint" style={{ marginTop: 0 }}>{keyDef.hint}</span>}
      <div className="key-row" style={{ marginTop: 'var(--sp-1)' }}>
        <div className="key-input-wrap">
          <input
            id={uid}
            className="input"
            type={show ? 'text' : 'password'}
            value={value}
            onChange={e => { setValue(e.target.value); setLocalError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            placeholder={isSet ? '••••••••  (set — enter new value to replace)' : keyDef.placeholder}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            className="key-show-btn"
            type="button"
            onClick={() => setShow(v => !v)}
            aria-label={show ? 'Hide key' : 'Show key'}
          >
            {show ? <EyeOff size={13} aria-hidden /> : <Eye size={13} aria-hidden />}
          </button>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || !value.trim()}
          style={{ flexShrink: 0 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {isSet && (
          <button
            className="btn btn-ghost"
            onClick={async () => {
              if (deleting) return;
              setDeleting(true);
              setLocalError('');
              try { await onDelete(); } catch (e) { setLocalError(normalizeError(e)); } finally { setDeleting(false); }
            }}
            disabled={saving || deleting}
            aria-label={`Remove ${keyDef.label}`}
            style={{ flexShrink: 0 }}
          >
            <Trash2 size={13} aria-hidden />
          </button>
        )}
      </div>
      {localError && (
        <span className="hint hint-error" role="alert">{localError}</span>
      )}
    </div>
  );
}

// ── Provider row (progressive disclosure) ─────────────────────────────────────

function ProviderRow({
  integration, statuses, onSave, onDelete, defaultOpen, rowId,
}: {
  integration: Integration;
  statuses: Record<string, boolean>;
  onSave: (key: string, value: string) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
  defaultOpen: boolean;
  rowId?: string;
}) {
  const uid = useId();
  const [open, setOpen] = useState(defaultOpen);
  const anySet = integration.keys.some(k => statuses[k.key]);

  return (
    <div className={`provider${open ? ' provider--open' : ''}`} id={rowId}>
      <button
        className="provider-summary"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-controls={`${uid}-detail`}
      >
        <span className="provider-dot" style={{ background: integration.accent }} aria-hidden />
        <span className="provider-name">{integration.name}</span>
        <span className="provider-blurb">{integration.description}</span>
        <span
          className={`provider-state${anySet ? ' provider-state--on' : ''}`}
        >
          {anySet ? (
            <><Check size={10} aria-hidden /> Connected</>
          ) : (
            <><Plug size={10} aria-hidden /> Not connected</>
          )}
        </span>
        <ChevronDown size={14} className="provider-chevron" aria-hidden />
      </button>

      <div className="provider-detail" id={`${uid}-detail`}>
        <div className="provider-detail-inner">
          <div className="provider-detail-pad">
            <p className="hint provider-desc" style={{ marginTop: 0 }}>{integration.description}</p>
            {integration.keys.map(k => (
              <KeyRow
                key={k.key}
                keyDef={k}
                isSet={!!statuses[k.key]}
                onSave={(value) => onSave(k.key, value)}
                onDelete={() => onDelete(k.key)}
              />
            ))}
            <a
              href={integration.docsUrl}
              className="docs-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              Get an API key →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function IntegrationsClient() {
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [loading, setLoading]   = useState(true);
  const [settingsUnauthorized, setSettingsUnauthorized] = useState(false);
  const [settingsLoadFailed, setSettingsLoadFailed] = useState(false);
  const [notice, setNotice]     = useState<{ type: 'error' | 'success' | 'info'; message: string } | null>(null);
  const [showTmdbPrompt, setShowTmdbPrompt] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tmdbConfigured = !!statuses.tmdb_api_key || !!statuses.tmdb_read_token;

  const focusTmdbRow = useCallback(() => {
    const row = document.getElementById('integrations-tmdb');
    if (!row) return;
    const summary = row.querySelector<HTMLButtonElement>('.provider-summary');
    if (summary?.getAttribute('aria-expanded') === 'false') {
      summary.click();
    }
    row.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const input = row.querySelector<HTMLInputElement>('input');
    window.setTimeout(() => input?.focus(), 0);
  }, []);

  const flash = useCallback((type: 'error' | 'success' | 'info', msg: string) => {
    setNotice({ type, message: msg });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    if (type !== 'error') {
      noticeTimer.current = setTimeout(() => setNotice(null), 4000);
    }
  }, []);

  const loadStatuses = useCallback(async () => {
    try {
      const data = await fetchSettings();
      const map: Record<string, boolean> = {};
      for (const s of data) map[s.key] = s.set;
      setStatuses(map);
      setSettingsUnauthorized(false);
      setSettingsLoadFailed(false);
    } catch (e) {
      // 401 is expected when no admin key is set — show non-blocking info
      const msg = normalizeError(e);
      if (msg.includes('Admin key')) {
        setSettingsUnauthorized(true);
        setSettingsLoadFailed(false);
        flash('info', 'Admin key required to view/edit integration settings. Set XRDB_ADMIN_KEY in your environment.');
      } else {
        setSettingsUnauthorized(false);
        setSettingsLoadFailed(true);
        flash('error', msg);
      }
    } finally {
      setLoading(false);
    }
  }, [flash]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadStatuses(); }, [loadStatuses]);

  useEffect(() => {
    if (loading) return;
    if (settingsLoadFailed) {
      setShowTmdbPrompt(false);
      return;
    }
    if (settingsUnauthorized) {
      setShowTmdbPrompt(false);
      return;
    }
    if (tmdbConfigured) {
      setShowTmdbPrompt(false);
      try { localStorage.setItem(TMDB_ONBOARDING_KEY, 'seen'); } catch { /* unavailable */ }
      return;
    }
    try {
      setShowTmdbPrompt(localStorage.getItem(TMDB_ONBOARDING_KEY) !== 'seen');
    } catch {
      setShowTmdbPrompt(true);
    }
  }, [loading, tmdbConfigured, settingsUnauthorized, settingsLoadFailed]);

  const dismissTmdbPrompt = () => {
    setShowTmdbPrompt(false);
    try { localStorage.setItem(TMDB_ONBOARDING_KEY, 'seen'); } catch { /* unavailable */ }
  };

  const handleSave = async (key: string, value: string) => {
    await setSetting(key, value);
    setStatuses(s => ({ ...s, [key]: true }));
    flash('success', 'Key saved');
  };

  const handleDelete = async (key: string) => {
    await deleteSetting(key);
    setStatuses(s => ({ ...s, [key]: false }));
    flash('success', 'Key removed');
  };

  const connectedCount = INTEGRATIONS.filter(int =>
    int.keys.some(k => statuses[k.key]),
  ).length;

  return (
    <div className="page-inner" style={{ maxWidth: '920px' }}>
      <div className="page-head">
        <h1 className="page-title">Integrations</h1>
        <p className="page-sub">
          Connect third-party services. Keys are stored in the database and override environment variables.
          {!loading && ` ${connectedCount}/${INTEGRATIONS.length} configured.`}
        </p>
      </div>

      {!loading && !settingsLoadFailed && !settingsUnauthorized && showTmdbPrompt && !tmdbConfigured && (
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <Notice
            type="info"
            message="Shuffle and search need TMDB. Add that key first so the rest of the app works out of the box."
            actionLabel="Set up TMDB"
            onAction={focusTmdbRow}
            onDismiss={dismissTmdbPrompt}
          />
        </div>
      )}

      {notice && (
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <Notice {...notice} onDismiss={() => setNotice(null)} />
        </div>
      )}

      {loading ? (
        <div className="provider-list" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeleton" style={{ height: '3.6rem', borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      ) : (
        <div className="provider-list">
          {INTEGRATIONS.map((int, i) => (
            <ProviderRow
              key={int.id}
              integration={int}
              statuses={statuses}
              onSave={handleSave}
              onDelete={handleDelete}
              defaultOpen={i === 0 && connectedCount === 0}
              rowId={int.id === 'tmdb' ? 'integrations-tmdb' : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
