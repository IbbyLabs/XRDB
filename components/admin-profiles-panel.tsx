'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ConfigProfileMetadata } from '@/lib/dbCore';

const fmtDate = (ts: number | null): string =>
  ts ? new Date(ts).toLocaleDateString(undefined, { dateStyle: 'short' }) : '—';

function highlightMatch(id: string, query: string): React.ReactNode {
  if (!query.trim()) return id;
  const idx = id.toLowerCase().indexOf(query.toLowerCase().trim());
  if (idx === -1) return id;
  return (
    <>
      {id.slice(0, idx)}
      <mark>{id.slice(idx, idx + query.trim().length)}</mark>
      {id.slice(idx + query.trim().length)}
    </>
  );
}

type DropdownOption<T extends string> = { value: T; label: string };

function AdminDropdown<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const label = options.find((o) => o.value === value)?.label ?? value;

  const reposition = useCallback(() => {
    if (!triggerRef.current) {
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const topGuardPx = 64;
    const triggerOutOfView =
      rect.bottom < topGuardPx
      || rect.top > window.innerHeight
      || rect.right < 0
      || rect.left > window.innerWidth;

    if (triggerOutOfView) {
      setOpen(false);
      return;
    }

    setPanelStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
      minWidth: rect.width,
      zIndex: 9999,
    });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, reposition]);

  const handleOpen = () => {
    reposition();
    setOpen((o) => !o);
  };

  const panel = open ? (
    <div ref={ref} className="xrdb-admin-dropdown-panel" role="listbox" style={panelStyle}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="option"
          aria-selected={o.value === value}
          className={`xrdb-admin-dropdown-item${o.value === value ? ' xrdb-admin-dropdown-item--selected' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onChange(o.value);
            setOpen(false);
          }}
        >
          {o.value === value && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="1,5 4,8 9,2" />
            </svg>
          )}
          {o.value !== value && <span style={{ width: 10, display: 'inline-block' }} />}
          {o.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className="xrdb-admin-dropdown">
      <button
        ref={triggerRef}
        type="button"
        className="xrdb-admin-dropdown-trigger"
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{label}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`xrdb-admin-dropdown-chevron${open ? ' xrdb-admin-dropdown-chevron--open' : ''}`}
        >
          <polyline points="1,3 5,7 9,3" />
        </svg>
      </button>
      {typeof document !== 'undefined' && createPortal(panel, document.body)}
    </div>
  );
}

export function AdminProfilesPanel() {
  const [profiles, setProfiles] = useState<ConfigProfileMetadata[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inspectData, setInspectData] = useState<Record<string, Record<string, unknown>>>({});
  const [searchInput, setSearchInput] = useState('');
  const [passwordFilter, setPasswordFilter] = useState<'any' | 'set' | 'none'>('any');
  const [lockFilter, setLockFilter] = useState<'any' | 'locked' | 'ok'>('any');
  const [inactiveFilter, setInactiveFilter] = useState<'any' | 'active' | 'inactive'>('any');
  const [activeQuery, setActiveQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [comboOpen, setComboOpen] = useState(false);
  const [comboIndex, setComboIndex] = useState(-1);
  const comboRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setComboOpen(false);
        setComboIndex(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const load = useCallback(async (q = '') => {
    try {
      const url = q.trim() ? `/api/admin/profiles?q=${encodeURIComponent(q.trim())}` : '/api/admin/profiles';
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.statusText);
      const body = await res.json() as { profiles: ConfigProfileMetadata[] };
      setProfiles(body.profiles);
      setError(null);
    } catch {
      setError('Failed to load profiles.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setActiveQuery(searchInput);
      load(searchInput);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput, load]);

  const deleteProfile = async (id: string) => {
    if (!confirm('Delete this profile? This cannot be undone.')) return;
    setWorking(id + ':delete');
    try {
      await fetch(`/api/admin/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await load(activeQuery);
    } finally {
      setWorking(null);
    }
  };

  const resetPassword = async (id: string) => {
    if (!confirm('Reset password for this profile? It will become accessible without a password.')) return;
    setWorking(id + ':reset');
    try {
      await fetch(`/api/admin/profiles/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-password' }),
      });
      await load(activeQuery);
    } finally {
      setWorking(null);
    }
  };

  const unlockProfile = async (id: string) => {
    setWorking(id + ':unlock');
    try {
      await fetch(`/api/admin/profiles/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unlock' }),
      });
      await load(activeQuery);
    } finally {
      setWorking(null);
    }
  };

  const filteredProfiles = useMemo(() => {
    if (!profiles) return [];
    return profiles.filter((p) => {
      if (passwordFilter === 'set' && !p.hasPassword) return false;
      if (passwordFilter === 'none' && p.hasPassword) return false;
      const isLocked = p.lockedUntil !== null && p.lockedUntil > Date.now();
      if (lockFilter === 'locked' && !isLocked) return false;
      if (lockFilter === 'ok' && isLocked) return false;
      if (inactiveFilter === 'active' && p.isInactive) return false;
      if (inactiveFilter === 'inactive' && !p.isInactive) return false;
      return true;
    });
  }, [profiles, passwordFilter, lockFilter, inactiveFilter]);

  const comboSuggestions = useMemo(() => {
    if (!profiles || !searchInput.trim()) return [];
    const q = searchInput.toLowerCase().trim();
    return profiles.map((p) => p.id).filter((id) => id.toLowerCase().includes(q)).slice(0, 8);
  }, [profiles, searchInput]);

  const toggleInspect = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!inspectData[id]) {
      try {
        const res = await fetch(`/api/admin/profiles/${encodeURIComponent(id)}`);
        if (res.ok) {
          const body = await res.json() as { params: Record<string, unknown> };
          setInspectData((prev) => ({ ...prev, [id]: body.params }));
        }
      } catch {
      }
    }
  };

  if (error) {
    return (
      <div className="xrdb-admin-section">
        <div className="xrdb-admin-section-header">
          <h2 className="xrdb-admin-section-title">Config profiles</h2>
        </div>
        <div className="xrdb-admin-empty" role="status">
          {error}
          <button className="xrdb-admin-btn" style={{ marginLeft: '0.75rem' }} onClick={() => load()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="xrdb-admin-section">
      <div className="xrdb-admin-section-header">
        <h2 className="xrdb-admin-section-title">Config profiles</h2>
        {profiles && (
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            {filteredProfiles.length === profiles.length
              ? `${profiles.length} total`
              : `${filteredProfiles.length} of ${profiles.length}`}
          </span>
        )}
      </div>
      <div className="xrdb-admin-filter-bar">
        <div className="xrdb-admin-combobox" ref={comboRef}>
          <input
            type="search"
            className="xrdb-admin-input"
            placeholder="Search by ID…"
            value={searchInput}
            autoComplete="off"
            onChange={(e) => {
              setSearchInput(e.target.value);
              setComboOpen(true);
              setComboIndex(-1);
            }}
            onFocus={() => {
              if (comboSuggestions.length > 0) setComboOpen(true);
            }}
            onKeyDown={(e) => {
              if (!comboOpen || comboSuggestions.length === 0) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setComboIndex((i) => Math.min(i + 1, comboSuggestions.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setComboIndex((i) => Math.max(i - 1, -1));
              } else if (e.key === 'Enter' && comboIndex >= 0) {
                e.preventDefault();
                setSearchInput(comboSuggestions[comboIndex]);
                setComboOpen(false);
                setComboIndex(-1);
              } else if (e.key === 'Escape') {
                setComboOpen(false);
                setComboIndex(-1);
              }
            }}
          />
          {comboOpen && comboSuggestions.length > 0 && (
            <div className="xrdb-admin-combobox-list" role="listbox">
              {comboSuggestions.map((id, i) => (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={comboIndex === i}
                  className={`xrdb-admin-combobox-item${comboIndex === i ? ' xrdb-admin-combobox-item--active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSearchInput(id);
                    setComboOpen(false);
                    setComboIndex(-1);
                  }}
                >
                  {highlightMatch(id, searchInput)}
                </button>
              ))}
            </div>
          )}
        </div>
        <AdminDropdown
          value={passwordFilter}
          options={[
            { value: 'any', label: 'Password: any' },
            { value: 'set', label: 'Password: set' },
            { value: 'none', label: 'Password: none' },
          ]}
          onChange={setPasswordFilter}
        />
        <AdminDropdown
          value={lockFilter}
          options={[
            { value: 'any', label: 'Status: any' },
            { value: 'locked', label: 'Status: locked' },
            { value: 'ok', label: 'Status: OK' },
          ]}
          onChange={setLockFilter}
        />
        <AdminDropdown
          value={inactiveFilter}
          options={[
            { value: 'any', label: 'Activity: any' },
            { value: 'active', label: 'Activity: active' },
            { value: 'inactive', label: 'Activity: inactive' },
          ]}
          onChange={setInactiveFilter}
        />
      </div>
      <div className="xrdb-admin-section-body" style={{ padding: 0 }}>
        {!profiles ? (
          <div className="xrdb-admin-empty">Loading…</div>
        ) : profiles.length === 0 ? (
          <div className="xrdb-admin-empty">
            <p>No saved profiles yet.</p>
            <p className="xrdb-admin-empty-hint">Config profiles are created when a user saves their configurator settings. They will appear here once at least one profile has been saved.</p>
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="xrdb-admin-empty">No profiles match the current filter.</div>
        ) : (
          <div className="xrdb-admin-table-wrap">
            <table className="xrdb-admin-table">
              <caption className="sr-only">Config profiles</caption>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Created</th>
                  <th scope="col">Last accessed</th>
                  <th scope="col">Password</th>
                  <th scope="col">Status</th>
                  <th scope="col" style={{ width: '1px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map((p) => (
                  <>
                    <tr key={p.id}>
                      <td>
                        <span className="xrdb-admin-id" title={p.id}>{p.id}</span>
                      </td>
                      <td className="cell-muted">{fmtDate(p.createdAt)}</td>
                      <td className="cell-muted">{fmtDate(p.lastAccessedAt)}</td>
                      <td>
                        {p.hasPassword ? (
                          <span className="xrdb-admin-badge xrdb-admin-badge--ok">Set</span>
                        ) : (
                          <span className="xrdb-admin-badge xrdb-admin-badge--warn">None</span>
                        )}
                      </td>
                      <td>
                        {p.isInactive ? (
                          <span className="xrdb-admin-badge xrdb-admin-badge--warn">Inactive</span>
                        ) : p.lockedUntil && p.lockedUntil > Date.now() ? (
                          <span className="xrdb-admin-badge xrdb-admin-badge--err">Locked</span>
                        ) : p.failedAttempts > 0 ? (
                          <span className="xrdb-admin-badge xrdb-admin-badge--warn">{p.failedAttempts} failed</span>
                        ) : (
                          <span className="xrdb-admin-badge xrdb-admin-badge--ok">OK</span>
                        )}
                      </td>
                      <td>
                        <div className="xrdb-admin-btn-row">
                          <button
                            className="xrdb-admin-btn"
                            onClick={() => toggleInspect(p.id)}
                            disabled={working !== null}
                          >
                            {expandedId === p.id ? 'Hide' : 'Inspect'}
                          </button>
                          {p.lockedUntil && p.lockedUntil > Date.now() ? (
                            <button
                              className="xrdb-admin-btn"
                              onClick={() => unlockProfile(p.id)}
                              disabled={working !== null}
                            >
                              {working === p.id + ':unlock' ? '…' : 'Unlock'}
                            </button>
                          ) : null}
                          {p.hasPassword && (
                            <button
                              className="xrdb-admin-btn"
                              onClick={() => resetPassword(p.id)}
                              disabled={working !== null}
                            >
                              {working === p.id + ':reset' ? '…' : 'Reset password'}
                            </button>
                          )}
                          <button
                            className="xrdb-admin-btn xrdb-admin-btn--danger"
                            onClick={() => deleteProfile(p.id)}
                            disabled={working !== null}
                          >
                            {working === p.id + ':delete' ? '…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === p.id && (
                      <tr key={p.id + ':inspect'}>
                        <td colSpan={6} style={{ padding: '0.75rem 1rem', background: 'var(--surface-raised, var(--surface))' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                            <a
                              href={`/poster?config=${encodeURIComponent(p.id)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: '0.75rem', color: 'var(--accent)', textDecoration: 'none' }}
                            >
                              View in configurator →
                            </a>
                          </div>
                          {inspectData[p.id] ? (
                            <pre style={{ margin: 0, fontSize: '0.6875rem', maxHeight: '16rem', overflow: 'auto', color: 'var(--muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                              {JSON.stringify(inspectData[p.id], null, 2)}
                            </pre>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Loading…</span>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
