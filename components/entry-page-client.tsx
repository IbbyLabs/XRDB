'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ConfigProfileLoginDialog } from '@/components/config-profile-login-dialog';
import { InstanceBrandingSlot } from '@/components/instance-branding-slot';
import { buildRevealedConfigState } from '@/lib/configProfileClientState';
import { useConfiguratorContext } from '@/lib/configuratorProvider';
import { BRAND_FULL_NAME, BRAND_GITHUB_URL, BRAND_NAME } from '@/lib/siteBrand';

type EntryPageClientProps = {
  instanceHtml: string;
};

const CONFIG_UNLOCK_HEADER = 'x-xrdb-config-unlock';

async function readErrorMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || fallback;
}

export function EntryPageClient({ instanceHtml }: EntryPageClientProps) {
  const {
    experienceMode,
    handleSelectExperienceMode,
    applySavedUiConfig,
    setConfigProfileUnlockSession,
    configProfileUnlockSession,
  } = useConfiguratorContext();
  const simpleModeRef = useRef<HTMLButtonElement>(null);
  const advancedModeRef = useRef<HTMLButtonElement>(null);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [profileIdInput, setProfileIdInput] = useState('');
  const [profilePasswordInput, setProfilePasswordInput] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const modeOrder: Array<'simple' | 'advanced'> = ['simple', 'advanced'];

  function focusMode(nextMode: 'simple' | 'advanced') {
    if (nextMode === 'simple') {
      simpleModeRef.current?.focus();
      return;
    }

    advancedModeRef.current?.focus();
  }

  function handleModeKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, currentMode: 'simple' | 'advanced') {
    const currentIndex = modeOrder.indexOf(currentMode);

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const nextMode = modeOrder[(currentIndex + 1) % modeOrder.length];
      handleSelectExperienceMode(nextMode);
      focusMode(nextMode);
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const nextMode = modeOrder[(currentIndex - 1 + modeOrder.length) % modeOrder.length];
      handleSelectExperienceMode(nextMode);
      focusMode(nextMode);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      handleSelectExperienceMode('simple');
      focusMode('simple');
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      handleSelectExperienceMode('advanced');
      focusMode('advanced');
    }
  }

  useEffect(() => {
    if (!configProfileUnlockSession?.profileId) {
      return;
    }

    setProfileIdInput(configProfileUnlockSession.profileId);
  }, [configProfileUnlockSession]);

  const handleLoginProfile = useCallback(async () => {
    const id = profileIdInput.trim();
    const password = profilePasswordInput;
    if (!id || !password) {
      setProfileError('Enter your profile UUID and password.');
      return;
    }

    setProfileBusy(true);
    setProfileError(null);

    try {
      const unlockResponse = await fetch(`/api/config/${encodeURIComponent(id)}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!unlockResponse.ok) {
        setProfileError(await readErrorMessage(unlockResponse, 'Unable to unlock the profile.'));
        return;
      }

      const unlockData = (await unlockResponse.json()) as { token?: string; expiresAt?: number };
      if (!unlockData.token || typeof unlockData.expiresAt !== 'number') {
        setProfileError('Unlock token was missing from server response.');
        return;
      }

      const revealResponse = await fetch(`/api/config/${encodeURIComponent(id)}/reveal`, {
        headers: {
          [CONFIG_UNLOCK_HEADER]: unlockData.token,
        },
      });

      if (!revealResponse.ok) {
        setProfileError(await readErrorMessage(revealResponse, 'Unable to load the saved profile.'));
        return;
      }

      const params = (await revealResponse.json()) as Record<string, string>;
      const { normalizedConfig } = buildRevealedConfigState(params);
      applySavedUiConfig(normalizedConfig);
      setConfigProfileUnlockSession({
        profileId: id,
        token: unlockData.token,
        expiresAt: unlockData.expiresAt,
      });
      setProfilePasswordInput('');
      setLoginDialogOpen(false);
    } finally {
      setProfileBusy(false);
    }
  }, [applySavedUiConfig, profileIdInput, profilePasswordInput, setConfigProfileUnlockSession]);

  return (
    <>
      <div className="xrdb-entry">
        <div className="xrdb-entry-content">
        <div className="xrdb-entry-brand">
          <span className="xrdb-entry-name">{BRAND_NAME}</span>
          <span className="xrdb-entry-full">{BRAND_FULL_NAME}</span>
        </div>
        <p className="xrdb-entry-tagline">
          Design custom movie and show posters with ratings, badges, and full styling control.
        </p>
        <InstanceBrandingSlot html={instanceHtml} />
        <div className="xrdb-mode-cards" role="group" aria-label="Setup mode">
          <div role="radiogroup" aria-label="Complexity mode" className="xrdb-mode-radio-group">
          <button
            ref={simpleModeRef}
            className={`xrdb-mode-card${experienceMode === 'simple' ? ' xrdb-mode-card-active' : ''}`}
            onClick={() => handleSelectExperienceMode('simple')}
            onKeyDown={(event) => handleModeKeyDown(event, 'simple')}
            role="radio"
            aria-checked={experienceMode === 'simple'}
            tabIndex={experienceMode === 'simple' ? 0 : -1}
            type="button"
          >
            <span className="xrdb-mode-card-title">Simple</span>
            <span className="xrdb-mode-card-body">Quick setup with guided defaults.</span>
          </button>
          <button
            ref={advancedModeRef}
            className={`xrdb-mode-card${experienceMode === 'advanced' ? ' xrdb-mode-card-active' : ''}`}
            onClick={() => handleSelectExperienceMode('advanced')}
            onKeyDown={(event) => handleModeKeyDown(event, 'advanced')}
            role="radio"
            aria-checked={experienceMode === 'advanced'}
            tabIndex={experienceMode === 'advanced' ? 0 : -1}
            type="button"
          >
            <span className="xrdb-mode-card-title">Advanced</span>
            <span className="xrdb-mode-card-body">Full manual control across all settings.</span>
          </button>
          </div>
          <Link
            href="/templates"
            className="xrdb-mode-card"
          >
          <span className="xrdb-mode-card-title">Template</span>
          <span className="xrdb-mode-card-body">Start from a community preset or your own saved config.</span>
          </Link>
        </div>
        {configProfileUnlockSession?.profileId ? (
          <p className="xrdb-entry-signed-in">
            <span className="xrdb-entry-signed-in-dot" aria-hidden="true" />
            Signed in &middot; <span className="xrdb-entry-signed-in-id">{configProfileUnlockSession.profileId.slice(0, 8)}&hellip;</span>
          </p>
        ) : null}
        <div className="xrdb-entry-actions xrdb-entry-actions-spaced">
          <Link href="/integrations" className="xrdb-btn xrdb-btn-primary xrdb-entry-btn">
            Start
          </Link>
          {configProfileUnlockSession?.profileId ? (
            <Link href="/save" className="xrdb-btn xrdb-btn-secondary xrdb-entry-btn">
              Save &amp; Export
            </Link>
          ) : (
            <button
              className="xrdb-btn xrdb-btn-secondary xrdb-entry-btn"
              onClick={() => setLoginDialogOpen(true)}
              type="button"
            >
              Login
            </button>
          )}
        </div>
        <a
          href={BRAND_GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="xrdb-entry-docs-link"
        >
          Documentation &amp; README
        </a>
      </div>
      </div>
      <ConfigProfileLoginDialog
        open={loginDialogOpen}
        onClose={() => {
          setLoginDialogOpen(false);
          setProfileError(null);
        }}
        profileId={profileIdInput}
        password={profilePasswordInput}
        busy={profileBusy}
        error={profileError}
        onProfileIdChange={setProfileIdInput}
        onPasswordChange={setProfilePasswordInput}
        onSubmit={() => void handleLoginProfile()}
      />
    </>
  );
}