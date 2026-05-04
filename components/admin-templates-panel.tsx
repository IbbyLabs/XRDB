'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CommunityTemplateRow } from '@/lib/communityTemplateStore';

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' });

export function AdminTemplatesPanel() {
  const [templates, setTemplates] = useState<CommunityTemplateRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/templates');
      if (!res.ok) throw new Error(res.statusText);
      const body = await res.json() as { templates: CommunityTemplateRow[] };
      setTemplates(body.templates);
      setError(null);
    } catch {
      setError('Failed to load templates.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (id: string) => {
    setWorking(id + ':approve');
    try {
      await fetch(`/api/admin/templates/${encodeURIComponent(id)}`, { method: 'PATCH' });
      await load();
    } finally {
      setWorking(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    setWorking(id + ':delete');
    try {
      await fetch(`/api/admin/templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await load();
    } finally {
      setWorking(null);
    }
  };

  if (error) {
    return (
      <div className="xrdb-admin-section">
        <div className="xrdb-admin-section-header">
          <h2 className="xrdb-admin-section-title">Community templates</h2>
        </div>
        <div className="xrdb-admin-empty" role="status">
          {error}
          <button className="xrdb-admin-btn" style={{ marginLeft: '0.75rem' }} onClick={load}>Retry</button>
        </div>
      </div>
    );
  }

  const pending = templates?.filter((t) => !t.approved) ?? [];
  const approved = templates?.filter((t) => t.approved) ?? [];

  return (
    <div className="xrdb-admin-section">
      <div className="xrdb-admin-section-header">
        <h2 className="xrdb-admin-section-title">Community templates</h2>
        {templates && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {pending.length > 0 && (
              <span className="xrdb-admin-badge xrdb-admin-badge--pending">
                {pending.length} pending
              </span>
            )}
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              {approved.length} approved
            </span>
          </div>
        )}
      </div>
      <div className="xrdb-admin-section-body" style={{ padding: 0 }}>
        {!templates ? (
          <div className="xrdb-admin-empty" role="status">Loading…</div>
        ) : templates.length === 0 ? (
          <div className="xrdb-admin-empty">
            <p>No community templates yet.</p>
            <p className="xrdb-admin-empty-hint">Community templates appear here once users submit their saved configs. Submitted templates require approval before they appear on the public templates page.</p>
          </div>
        ) : (
          <div className="xrdb-admin-table-wrap">
            <table className="xrdb-admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Author</th>
                  <th>Tags</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th style={{ width: '1px' }}></th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td style={{ maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.name}
                    </td>
                    <td className="cell-muted">{t.author || '—'}</td>
                    <td className="cell-muted" style={{ maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.tags.length > 0 ? t.tags.join(', ') : '—'}
                    </td>
                    <td className="cell-muted">{fmtDate(t.created_at)}</td>
                    <td>
                      {t.approved ? (
                        <span className="xrdb-admin-badge xrdb-admin-badge--ok">Approved</span>
                      ) : (
                        <span className="xrdb-admin-badge xrdb-admin-badge--pending">Pending</span>
                      )}
                    </td>
                    <td>
                      <div className="xrdb-admin-btn-row">
                        {!t.approved && (
                          <button
                            className="xrdb-admin-btn xrdb-admin-btn--primary"
                            onClick={() => approve(t.id)}
                            disabled={working !== null}
                          >
                            {working === t.id + ':approve' ? '…' : 'Approve'}
                          </button>
                        )}
                        <button
                          className="xrdb-admin-btn xrdb-admin-btn--danger"
                          onClick={() => remove(t.id)}
                          disabled={working !== null}
                        >
                          {working === t.id + ':delete' ? '…' : 'Delete'}
                        </button>
                      </div>
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
