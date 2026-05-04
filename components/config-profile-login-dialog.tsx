'use client';

import { useEffect, useRef } from 'react';

import { useFocusTrap } from '@/lib/useFocusTrap';

export function ConfigProfileLoginDialog({
  open,
  onClose,
  profileId,
  password,
  busy,
  error,
  onProfileIdChange,
  onPasswordChange,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  profileId: string;
  password: string;
  busy: boolean;
  error: string | null;
  onProfileIdChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="xrdb-dialog-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="xrdb-dialog-panel xrdb-login-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="xrdb-login-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="xrdb-dialog-header">
          <div>
            <h2 id="xrdb-login-dialog-title" className="xrdb-dialog-title">Login</h2>
            <p className="xrdb-dialog-desc">Open an existing profile.</p>
          </div>
          <button
            className="xrdb-dialog-close"
            onClick={onClose}
            type="button"
            aria-label="Close login dialog"
          >
            Close
          </button>
        </div>

        <form
          className="xrdb-dialog-body"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="xrdb-save-inline-grid">
            <input
              type="text"
              value={profileId}
              onChange={(event) => onProfileIdChange(event.target.value)}
              placeholder="Profile UUID"
              aria-label="Profile UUID"
              className="xrdb-save-input"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Profile password"
              aria-label="Profile password"
              className="xrdb-save-input"
            />
          </div>

          {error ? <p className="xrdb-save-status xrdb-save-status-error" role="alert">{error}</p> : null}

          <div className="xrdb-save-config-actions">
            <button className="xrdb-save-action-btn xrdb-save-action-primary" type="submit" disabled={busy || !profileId.trim() || !password}>
              {busy ? 'Working' : 'Login'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}