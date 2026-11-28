'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Link2, Unlink } from 'lucide-react';
import { useT } from '@/lib/i18n';
import {
  traktPollLink, traktStartLink, traktStatus, traktUnlink,
  type TraktLinkStart, type TraktStatus,
} from '@/lib/api';

// Links the loaded profile to its owner's Trakt account with Trakt's device
// sign-in: the owner types a code at Trakt and this polls until they approve.

interface TraktLinkProps {
  profileId?: string;
  hasPassword?: boolean;
  password?: string;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; status: TraktStatus }
  | { kind: 'linking'; start: TraktLinkStart };

export function TraktLink({ profileId, hasPassword, password }: TraktLinkProps) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);

  useEffect(() => {
    if (!profileId || !hasPassword) return;
    let live = true;
    traktStatus(profileId, password)
      .then(status => { if (live) setPhase({ kind: 'ready', status }); })
      .catch(e => { if (live) { setError((e as Error).message); setPhase({ kind: 'ready', status: { available: false, linked: false, pending: false, needsRelink: false } }); } });
    return () => { live = false; stopPolling(); };
  }, [profileId, hasPassword, password, stopPolling]);

  if (!profileId || !hasPassword) {
    return (
      <p className="hint" style={{ marginTop: 0 }}>
        {t('Save this config to a profile with a password, then link Trakt here.')}
      </p>
    );
  }

  const poll = (start: TraktLinkStart, deadline: number) => {
    pollTimer.current = setTimeout(async () => {
      if (Date.now() > deadline) {
        setError(t('The code expired before it was approved. Link Trakt again to get a new one.'));
        setPhase({ kind: 'ready', status: await traktStatus(profileId, password).catch(() => ({ available: true, linked: false, pending: false, needsRelink: false })) });
        return;
      }
      try {
        const state = await traktPollLink(profileId, password);
        if (state === 'linked') {
          setPhase({ kind: 'ready', status: await traktStatus(profileId, password) });
          return;
        }
        if (state === 'expired' || state === 'denied' || state === 'none') {
          setError(state === 'denied'
            ? t('Trakt says the link was declined.')
            : t('The code expired before it was approved. Link Trakt again to get a new one.'));
          setPhase({ kind: 'ready', status: await traktStatus(profileId, password) });
          return;
        }
        poll(start, deadline);
      } catch (e) {
        setError((e as Error).message);
        poll(start, deadline);
      }
    }, Math.max(5, start.interval) * 1000);
  };

  const link = async () => {
    setBusy(true);
    setError('');
    try {
      const start = await traktStartLink(profileId, password);
      setPhase({ kind: 'linking', start });
      poll(start, Date.now() + start.expiresIn * 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    setError('');
    try {
      setPhase({ kind: 'ready', status: await traktUnlink(profileId, password) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    stopPolling();
    void traktStatus(profileId, password)
      .then(status => setPhase({ kind: 'ready', status }))
      .catch(e => setError((e as Error).message));
  };

  return (
    <div className="cfg-fields" aria-live="polite">
      {error && <p className="hint hint-warn tabpanel-enter" style={{ marginTop: 0 }} role="alert">{error}</p>}

      {phase.kind === 'loading' && (
        <div className="skeleton" style={{ height: '2.25rem', width: '9rem' }} role="status" aria-label={t('Loading Trakt link')} />
      )}

      {phase.kind === 'ready' && !phase.status.available && (
        <p className="hint tabpanel-enter" style={{ marginTop: 0 }}>
          {t('This server is not set up to link Trakt accounts.')}
        </p>
      )}

      {phase.kind === 'ready' && phase.status.available && phase.status.linked && (
        <div className="toggle-row tabpanel-enter">
          <span className="hint" style={{ marginTop: 0 }}>{t('Trakt is linked. Bars update within a few minutes of watching.')}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void unlink()} disabled={busy}>
            <Unlink size={13} aria-hidden />
            {t('Unlink Trakt')}
          </button>
        </div>
      )}

      {phase.kind === 'ready' && phase.status.available && !phase.status.linked && (
        <div className="cfg-fields tabpanel-enter">
          {phase.status.needsRelink && (
            <p className="hint hint-warn" style={{ marginTop: 0 }}>{t('Trakt asked for the link to be made again.')}</p>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void link()} disabled={busy}>
            <Link2 size={13} aria-hidden />
            {t('Link Trakt')}
          </button>
        </div>
      )}

      {phase.kind === 'linking' && (
        <div className="cfg-fields tabpanel-enter">
          <span className="hint" style={{ marginTop: 0 }}>{t('Enter this code at Trakt, then come back here.')}</span>
          <strong className="mono" style={{ fontSize: 'var(--text-lg)', letterSpacing: '0.15em', alignSelf: 'flex-start' }}>
            {phase.start.userCode}
          </strong>
          <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
            <a className="btn btn-primary btn-sm" href={phase.start.verificationUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={13} aria-hidden />
              {t('Open Trakt')}
            </a>
            <button type="button" className="btn btn-ghost btn-sm" onClick={cancel}>
              {t('Cancel')}
            </button>
          </div>
          <span className="hint" style={{ marginTop: 0 }}>{t('Waiting for you to approve it on Trakt…')}</span>
        </div>
      )}
    </div>
  );
}
