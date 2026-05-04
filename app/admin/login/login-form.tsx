'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function AdminLoginForm() {
  const router = useRouter();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      if (res.ok) {
        router.push('/admin');
        router.refresh();
      } else {
        setError('Invalid admin key. Check your ADMIN_KEY environment variable.');
      }
    } catch {
      setError('Request failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="xrdb-admin-login">
      <div className="xrdb-admin-login-card">
        <p className="xrdb-admin-login-title">Admin login</p>
        <p className="xrdb-admin-login-subtitle">Enter your ADMIN_KEY to continue.</p>
        {error && <p className="xrdb-admin-login-error">{error}</p>}
        <form onSubmit={submit}>
          <div className="xrdb-admin-login-field">
            <label className="xrdb-admin-login-label" htmlFor="admin-key">
              Admin key
            </label>
            <input
              id="admin-key"
              type="password"
              className="xrdb-admin-login-input"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter key"
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" className="xrdb-admin-login-btn" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
