'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CommunityThemeRow } from '@/lib/communityThemeStore';
import type { XRDBPalette } from '@/lib/theme';

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' });

type SwatchPreviewProps = { palette: XRDBPalette };

function SwatchPreview({ palette }: SwatchPreviewProps) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: '1.25rem',
        height: '1.25rem',
        borderRadius: '4px',
        background: palette.bgBase,
        border: `3px solid ${palette.accent}`,
        flexShrink: 0,
      }}
    />
  );
}

export function AdminThemesPanel() {
  const [themes, setThemes] = useState<CommunityThemeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [renameMap, setRenameMap] = useState<Record<string, string>>({});
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/themes');
      if (!res.ok) throw new Error(res.statusText);
      const body = await res.json() as { themes: CommunityThemeRow[] };
      setThemes(body.themes);
      setError(null);
    } catch {
      setError('Failed to load themes.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, action: 'approve' | 'deny') => {
    setWorking(id + ':' + action);
    try {
      await fetch(`/api/admin/themes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          name: renameMap[id]?.trim() || undefined,
          admin_note: noteMap[id]?.trim() || undefined,
        }),
      });
      await load();
    } finally {
      setWorking(null);
    }
  };

  if (error) {
    return (
      <div className="xrdb-admin-section">
        <div className="xrdb-admin-section-header">
          <h2 className="xrdb-admin-section-title">Community themes</h2>
        </div>
        <div className="xrdb-admin-empty" role="status">
          {error}
          <button className="xrdb-admin-btn" style={{ marginLeft: '0.75rem' }} onClick={load}>Retry</button>
        </div>
      </div>
    );
  }

  const pending = themes?.filter((t) => t.status === 'pending') ?? [];
  const approved = themes?.filter((t) => t.status === 'approved') ?? [];
  const denied = themes?.filter((t) => t.status === 'denied') ?? [];

  return (
    <div className="xrdb-admin-section">
      <div className="xrdb-admin-section-header">
        <h2 className="xrdb-admin-section-title">Community themes</h2>
        {themes && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {pending.length > 0 && (
              <span className="xrdb-admin-badge xrdb-admin-badge--pending">
                {pending.length} pending
              </span>
            )}
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              {approved.length} approved &middot; {denied.length} denied
            </span>
          </div>
        )}
      </div>
      <div className="xrdb-admin-section-body" style={{ padding: 0 }}>
        {!themes ? (
          <div className="xrdb-admin-empty" role="status">Loading…</div>
        ) : themes.length === 0 ? (
          <div className="xrdb-admin-empty">
            <p>No community themes yet.</p>
            <p className="xrdb-admin-empty-hint">
              Themes submitted via the theme panel appear here for review before being listed publicly.
            </p>
          </div>
        ) : (
          <div className="xrdb-admin-table-wrap">
            <table className="xrdb-admin-table">
              <thead>
                <tr>
                  <th style={{ width: '1.5rem' }}></th>
                  <th>Name</th>
                  <th>Author</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th style={{ minWidth: '14rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {themes.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <SwatchPreview palette={t.palette} />
                    </td>
                    <td style={{ maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.name}
                    </td>
                    <td className="cell-muted">{t.author || '—'}</td>
                    <td className="cell-muted">{fmtDate(t.submitted_at)}</td>
                    <td>
                      {t.status === 'approved' && (
                        <span className="xrdb-admin-badge xrdb-admin-badge--ok">Approved</span>
                      )}
                      {t.status === 'pending' && (
                        <span className="xrdb-admin-badge xrdb-admin-badge--pending">Pending</span>
                      )}
                      {t.status === 'denied' && (
                        <span className="xrdb-admin-badge xrdb-admin-badge--danger">Denied</span>
                      )}
                    </td>
                    <td>
                      {t.status === 'pending' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '13rem' }}>
                          <input
                            className="xrdb-admin-input"
                            placeholder={`Rename (leave blank to keep "${t.name}")`}
                            value={renameMap[t.id] ?? ''}
                            onChange={(e) => setRenameMap((prev) => ({ ...prev, [t.id]: e.target.value }))}
                            maxLength={60}
                          />
                          <input
                            className="xrdb-admin-input"
                            placeholder="Admin note (optional)"
                            value={noteMap[t.id] ?? ''}
                            onChange={(e) => setNoteMap((prev) => ({ ...prev, [t.id]: e.target.value }))}
                            maxLength={200}
                          />
                          <div className="xrdb-admin-btn-row">
                            <button
                              className="xrdb-admin-btn xrdb-admin-btn--primary"
                              onClick={() => act(t.id, 'approve')}
                              disabled={working !== null}
                            >
                              {working === t.id + ':approve' ? '…' : 'Approve'}
                            </button>
                            <button
                              className="xrdb-admin-btn xrdb-admin-btn--danger"
                              onClick={() => act(t.id, 'deny')}
                              disabled={working !== null}
                            >
                              {working === t.id + ':deny' ? '…' : 'Deny'}
                            </button>
                          </div>
                        </div>
                      )}
                      {t.status !== 'pending' && t.admin_note && (
                        <span className="cell-muted" style={{ fontSize: '0.78rem' }}>{t.admin_note}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
