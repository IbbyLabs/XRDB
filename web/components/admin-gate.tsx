'use client';

import { useState, useEffect, useId } from 'react';
import { Lock } from 'lucide-react';
import { adminAccessStatus } from '@/lib/api';
import { setAdminKey, clearAdminKey } from '@/lib/admin-key';

type GateState = 'checking' | 'open' | 'locked';

/**
 * Wraps owner-only pages. Probes an admin endpoint: when the instance has
 * XRDB_ADMIN_KEY set and this session doesn't hold it, shows a key prompt
 * instead of the page. An unreachable backend renders the page (its own
 * error states explain the situation better than a lock screen would).
 */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const uid = useId();
  const [state, setState] = useState<GateState>('checking');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adminAccessStatus().then(status => {
      if (!cancelled) setState(status === 'locked' ? 'locked' : 'open');
    });
    return () => { cancelled = true; };
  }, []);

  const handleUnlock = async () => {
    const trimmed = key.trim();
    if (!trimmed) { setError('Enter the admin key'); return; }
    setVerifying(true);
    setError('');
    const status = await adminAccessStatus(trimmed);
    setVerifying(false);
    if (status === 'locked') {
      clearAdminKey();
      setError('That key was rejected by the server.');
      return;
    }
    setAdminKey(trimmed);
    setState('open');
  };

  if (state === 'open') return <>{children}</>;

  if (state === 'checking') {
    return (
      <div className="page-inner" aria-busy="true">
        <div className="skeleton" style={{ height: '2rem', width: '12rem', marginBottom: 'var(--sp-4)' }} />
        <div className="skeleton" style={{ height: '10rem' }} />
      </div>
    );
  }

  return (
    <div className="page-inner admin-lock">
      <div className="panel admin-lock-panel">
        <div className="panel-body admin-lock-body">
          <Lock size={20} aria-hidden style={{ color: 'var(--muted)' }} />
          <h1 className="admin-lock-title">Admin access</h1>
          <p className="hint" style={{ marginTop: 0, textAlign: 'center' }}>
            This area is for the instance owner. Enter the admin key
            (<code>XRDB_ADMIN_KEY</code>) configured on the server.
          </p>
          <div className="field" style={{ width: '100%' }}>
            <label className="label" htmlFor={`${uid}-key`}>Admin key</label>
            <input
              id={`${uid}-key`}
              className="input"
              type="password"
              value={key}
              onChange={e => { setKey(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleUnlock(); }}
              autoComplete="off"
              spellCheck={false}
            />
            {error && <span className="hint hint-error" role="alert">{error}</span>}
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={handleUnlock}
            disabled={verifying || !key.trim()}
          >
            {verifying ? 'Checking…' : 'Unlock'}
          </button>
        </div>
      </div>
    </div>
  );
}
