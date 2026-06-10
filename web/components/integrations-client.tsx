'use client';

import { useState, useEffect, useCallback, useId, useRef } from 'react';
import { Check, AlertCircle, X, Plug, Eye, EyeOff, Trash2 } from 'lucide-react';
import { fetchSettings, setSetting, deleteSetting, type SettingStatus } from '@/lib/api';

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
    description: 'Artwork, metadata, genres, content ratings, watch providers. Required for most features.',
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
    description: 'Aggregated ratings from IMDb, Rotten Tomatoes, Metacritic, Letterboxd, Trakt, and more in a single API call.',
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
    description: 'Direct Trakt community ratings. Accepts IMDb IDs. MDBList already includes Trakt scores — use this for a dedicated connection.',
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
    description: 'SIMKL community ratings. Use SIMKL IDs (simkl:12345) or IMDb IDs for automatic lookup.',
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeError(e: unknown): string {
  const msg = (e as Error).message ?? 'Unknown error';
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError'))
    return 'Could not reach the backend.';
  if (msg.includes('unauthorized') || msg.includes('401'))
    return 'Admin key required. Set XRDB_ADMIN_KEY on the server.';
  return msg;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Notice({
  type, message, onDismiss,
}: { type: 'error' | 'success' | 'info'; message: string; onDismiss?: () => void }) {
  return (
    <div
      className={`xrdb-notice xrdb-notice-${type}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      {type === 'error' ? <AlertCircle size={14} aria-hidden /> : <Check size={14} aria-hidden />}
      <span style={{ flex: 1 }}>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="xrdb-notice-dismiss" aria-label="Dismiss">
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
    <div className="int-key-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <label className="xrdb-label" htmlFor={uid}>{keyDef.label}</label>
        {keyDef.hint && <span className="xrdb-field-hint">{keyDef.hint}</span>}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              id={uid}
              className="xrdb-input"
              type={show ? 'text' : 'password'}
              value={value}
              onChange={e => { setValue(e.target.value); setLocalError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              placeholder={isSet ? '••••••••  (set — enter new value to replace)' : keyDef.placeholder}
              style={{ paddingRight: '2.5rem' }}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              className="int-show-btn"
              type="button"
              onClick={() => setShow(v => !v)}
              aria-label={show ? 'Hide key' : 'Show key'}
            >
              {show ? <EyeOff size={13} aria-hidden /> : <Eye size={13} aria-hidden />}
            </button>
          </div>
          <button
            className="xrdb-btn xrdb-btn-primary"
            onClick={handleSave}
            disabled={saving || !value.trim()}
            style={{ flexShrink: 0 }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {isSet && (
            <button
              className="xrdb-btn xrdb-btn-ghost"
              onClick={async () => {
                if (deleting) return;
                setDeleting(true);
                setLocalError('');
                try { await onDelete(); } catch (e) { setLocalError(normalizeError(e)); } finally { setDeleting(false); }
              }}
              disabled={saving || deleting}
              aria-label={`Remove ${keyDef.label}`}
              style={{ flexShrink: 0, color: 'var(--muted)' }}
            >
              <Trash2 size={13} aria-hidden />
            </button>
          )}
        </div>
        {localError && (
          <span className="xrdb-field-hint" style={{ color: 'var(--error, #ef4444)', marginTop: '0.25rem' }}>
            {localError}
          </span>
        )}
      </div>

      <div className="int-key-status" aria-label={isSet ? 'Configured' : 'Not configured'}>
        {isSet
          ? <span className="int-status-dot int-status-dot--set" title="Configured" aria-hidden />
          : <span className="int-status-dot int-status-dot--unset" title="Not configured" aria-hidden />}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function IntegrationsClient() {
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [loading, setLoading]   = useState(true);
  const [notice, setNotice]     = useState<{ type: 'error' | 'success' | 'info'; message: string } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    } catch (e) {
      // 401 is expected when no admin key is set — show non-blocking info
      const msg = normalizeError(e);
      if (msg.includes('Admin key')) {
        flash('info', 'Admin key required to view/edit integration settings. Set XRDB_ADMIN_KEY in your environment.');
      } else {
        flash('error', msg);
      }
    } finally {
      setLoading(false);
    }
  }, [flash]);

  useEffect(() => { loadStatuses(); }, [loadStatuses]);

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
    <div className="xrdb-page-inner">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className="xrdb-section-title">Integrations</h1>
        <p className="xrdb-section-sub">
          Connect third-party services. Keys are stored in the database and override environment variables.
          {!loading && (
            <span style={{ marginLeft: '0.5rem', color: 'var(--muted)' }}>
              {connectedCount}/{INTEGRATIONS.length} configured.
            </span>
          )}
        </p>
      </div>

      {notice && (
        <div style={{ marginBottom: '1.25rem' }}>
          <Notice {...notice} onDismiss={() => setNotice(null)} />
        </div>
      )}

      {loading ? (
        <div className="int-loading" aria-busy="true">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="xrdb-skeleton int-skeleton-card" />
          ))}
        </div>
      ) : (
        <div className="int-grid">
          {INTEGRATIONS.map(int => {
            const anySet = int.keys.some(k => statuses[k.key]);
            return (
              <div key={int.id} className="xrdb-card">
                <div className="xrdb-card-header">
                  <span
                    className="int-accent-dot"
                    style={{ background: int.accent }}
                    aria-hidden
                  />
                  <span className="xrdb-card-title">{int.name}</span>
                  <span
                    className={`int-badge${anySet ? ' int-badge--active' : ''}`}
                    aria-label={anySet ? 'Connected' : 'Not connected'}
                  >
                    {anySet ? (
                      <><Check size={10} aria-hidden /> Connected</>
                    ) : (
                      <><Plug size={10} aria-hidden /> Not connected</>
                    )}
                  </span>
                </div>

                <div className="xrdb-card-body">
                  <p className="int-description">{int.description}</p>

                  <div className="int-keys">
                    {int.keys.map(k => (
                      <KeyRow
                        key={k.key}
                        keyDef={k}
                        isSet={!!statuses[k.key]}
                        onSave={(value) => handleSave(k.key, value)}
                        onDelete={() => handleDelete(k.key)}
                      />
                    ))}
                  </div>

                  <a
                    href={int.docsUrl}
                    className="int-docs-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Get an API key →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
