'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ConfigProfileLoginDialog } from '@/components/config-profile-login-dialog';
import {
  buildConfigProfileFingerprint,
  buildRevealedConfigState,
  buildSavedProfileComparableParams,
  hasConfigProfileUnsavedChanges,
  toConfigModeAiometadataUrl,
} from '@/lib/configProfileClientState';
import { useConfiguratorContext } from '@/lib/configuratorProvider';
import type { AiometadataPatternRow } from '@/lib/configuratorHooks/ui';
import {
  AIOMETADATA_PUBLIC_BASE_URLS,
  AIOMETADATA_PUBLIC_INSTANCES,
  DEFAULT_AIOMETADATA_PUBLIC_INSTANCE,
} from '@/lib/aiometadataPublicInstances';
import { normalizeSavedUiConfig } from '@/lib/uiConfig';
import type { AiometadataEpisodeIdMode, AiometadataPosterIdMode, SavedUiConfig } from '@/lib/uiConfig';

const CONFIG_UNLOCK_HEADER = 'x-xrdb-config-unlock';

async function readErrorMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || fallback;
}

export default function SavePage() {
  const ctx = useConfiguratorContext();
  const { exportPanelsProps } = ctx.workspaceColumnsProps;
  const importInputRef = useRef<HTMLInputElement>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [profileIdInput, setProfileIdInput] = useState('');
  const [profilePasswordInput, setProfilePasswordInput] = useState('');
  const [savePasswordInput, setSavePasswordInput] = useState('');
  const [savePasswordConfirmInput, setSavePasswordConfirmInput] = useState('');
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [changePasswordExpanded, setChangePasswordExpanded] = useState(false);
  const [changePasswordInput, setChangePasswordInput] = useState('');
  const [changePasswordConfirmInput, setChangePasswordConfirmInput] = useState('');
  const [repairBaseUrl, setRepairBaseUrl] = useState<string>(DEFAULT_AIOMETADATA_PUBLIC_INSTANCE);
  const [repairProfileIdInput, setRepairProfileIdInput] = useState('');
  const [repairPasswordInput, setRepairPasswordInput] = useState('');
  const [repairAddonPasswordInput, setRepairAddonPasswordInput] = useState('');
  const [repairBusyAction, setRepairBusyAction] = useState<'install' | 'repair' | null>(null);
  const [instanceMenuOpen, setInstanceMenuOpen] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);
  const [repairStatus, setRepairStatus] = useState<string | null>(null);
  const [repairInstallUrl, setRepairInstallUrl] = useState('');
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'reset' | 'delete' | null>(null);
  const [savedProfileFingerprint, setSavedProfileFingerprint] = useState<string | null>(null);
  const [savedProfileSnapshotReady, setSavedProfileSnapshotReady] = useState(false);
  const [loginConflict, setLoginConflict] = useState<{ serverConfig: SavedUiConfig } | null>(null);
  const instanceMenuRef = useRef<HTMLDivElement | null>(null);
  const activeProfileId = ctx.configProfileUnlockSession?.profileId ?? null;
  const activeUnlockToken = ctx.configProfileUnlockSession?.token ?? null;
  const repairBusy = repairBusyAction !== null;

  useEffect(() => {
    if (activeProfileId) {
      setConfirmAction(null);
      setProfileIdInput(activeProfileId);
      setLoginDialogOpen(false);
      return;
    }
    setSavedProfileFingerprint(null);
    setSavedProfileSnapshotReady(false);
    setLoginConflict(null);
  }, [activeProfileId]);

  useEffect(() => {
    if (!instanceMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const root = instanceMenuRef.current;
      if (!root) {
        return;
      }
      if (!root.contains(event.target as Node)) {
        setInstanceMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setInstanceMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [instanceMenuOpen]);

  const currentSaveParams = exportPanelsProps.buildSaveParams();
  const currentComparableSaveParams = useMemo(
    () => buildSavedProfileComparableParams(currentSaveParams),
    [currentSaveParams],
  );

  useEffect(() => {
    if (!activeProfileId || !activeUnlockToken || savedProfileSnapshotReady) {
      return;
    }

    let active = true;

    void (async () => {
      try {
        const revealResponse = await fetch(`/api/config/${encodeURIComponent(activeProfileId)}/reveal`, {
          headers: {
            [CONFIG_UNLOCK_HEADER]: activeUnlockToken,
          },
        });

        if (!active) {
          return;
        }

        if (!revealResponse.ok) {
          if (revealResponse.status === 401 || revealResponse.status === 403) {
            ctx.clearConfigProfileUnlockSession();
            setProfileStatus('Session expired. Login again.');
            return;
          }

          setSavedProfileFingerprint(
            buildConfigProfileFingerprint(buildSavedProfileComparableParams(currentSaveParams)),
          );
          setSavedProfileSnapshotReady(true);
          return;
        }

        const params = (await revealResponse.json()) as Record<string, string>;
        const fingerprint = buildConfigProfileFingerprint(buildSavedProfileComparableParams(params));

        if (!active) {
          return;
        }

        setSavedProfileFingerprint(fingerprint);
        setSavedProfileSnapshotReady(true);
      } catch {
        if (!active) {
          return;
        }
        setSavedProfileFingerprint(
          buildConfigProfileFingerprint(buildSavedProfileComparableParams(currentSaveParams)),
        );
        setSavedProfileSnapshotReady(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    activeProfileId,
    activeUnlockToken,
    currentSaveParams,
    ctx,
    savedProfileSnapshotReady,
  ]);

  const handleLogoutProfile = useCallback(() => {
    ctx.clearConfigProfileUnlockSession();
    setProfilePasswordInput('');
    setLoginConflict(null);
    setProfileError(null);
    setProfileStatus('Logged out.');
  }, [ctx]);

  const copySingle = useCallback(async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      return;
    }
  }, []);

  const handleDownload = useCallback(() => {
    const config = ctx.buildCurrentUiConfig();
    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'xrdb-config.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [ctx]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(false);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as SavedUiConfig;
        ctx.applySavedUiConfig(parsed);
        setImportSuccess(true);
        setTimeout(() => setImportSuccess(false), 3000);
      } catch {
        setImportError('Invalid config file. Make sure it is a valid XRDB JSON export.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [ctx]);

  const displayedAiometadataPatternRows = useMemo<AiometadataPatternRow[]>(() => {
    if (!activeProfileId) {
      return [];
    }

    return exportPanelsProps.aiometadataPatternRows.map((row) => ({
      ...row,
      value: toConfigModeAiometadataUrl(row.value, activeProfileId),
    }));
  }, [activeProfileId, exportPanelsProps.aiometadataPatternRows]);

  const displayedAiometadataCopyBlock = useMemo(
    () => displayedAiometadataPatternRows.map((row) => `${row.label}\n${row.value}`).join('\n\n'),
    [displayedAiometadataPatternRows],
  );

  const installableAiometadataPatternRows = useMemo<AiometadataPatternRow[]>(() => {
    if (displayedAiometadataPatternRows.length) {
      return displayedAiometadataPatternRows;
    }

    return exportPanelsProps.aiometadataPatternRows;
  }, [displayedAiometadataPatternRows, exportPanelsProps.aiometadataPatternRows]);

  const installableAiometadataPatterns = useMemo(() => ({
    posterUrlPattern: installableAiometadataPatternRows.find((row) => row.key === 'poster')?.value ?? '',
    backgroundUrlPattern: installableAiometadataPatternRows.find((row) => row.key === 'background')?.value ?? '',
    logoUrlPattern: installableAiometadataPatternRows.find((row) => row.key === 'logo')?.value ?? '',
    episodeThumbnailUrlPattern: installableAiometadataPatternRows.find((row) => row.key === 'episode')?.value ?? '',
  }), [installableAiometadataPatternRows]);

  const selectedPublicAiometadataBaseUrl = useMemo(() => {
    const match = AIOMETADATA_PUBLIC_INSTANCES.find((instance) => instance.baseUrl === repairBaseUrl);
    return match?.baseUrl ?? '__custom__';
  }, [repairBaseUrl]);

  const selectedPublicAiometadataInstanceLabel = useMemo(() => {
    if (selectedPublicAiometadataBaseUrl === '__custom__') {
      return 'Custom instance';
    }
    const match = AIOMETADATA_PUBLIC_INSTANCES.find((instance) => instance.baseUrl === selectedPublicAiometadataBaseUrl);
    return match?.name ?? 'Custom instance';
  }, [selectedPublicAiometadataBaseUrl]);

  const handleSelectPublicAiometadataInstance = useCallback((value: string) => {
    if (value === '__custom__') {
      setRepairBaseUrl('');
      setInstanceMenuOpen(false);
      return;
    }
    setRepairBaseUrl(value);
    setInstanceMenuOpen(false);
  }, []);

  const isPublicAiometadataInstance = AIOMETADATA_PUBLIC_BASE_URLS.has(repairBaseUrl.trim().toLowerCase());

  const hasPendingSaveChanges = hasConfigProfileUnsavedChanges({
    currentParams: currentComparableSaveParams,
    savedFingerprint: savedProfileFingerprint,
    snapshotReady: Boolean(activeProfileId) && savedProfileSnapshotReady,
  });

  const handleCopyDisplayedAiometadata = useCallback(async () => {
    if (!displayedAiometadataCopyBlock) {
      return;
    }

    try {
      await navigator.clipboard.writeText(displayedAiometadataCopyBlock);
      setCopiedKey('all-aio');
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      return;
    }
  }, [displayedAiometadataCopyBlock]);

  const unlockAndLoadProfile = useCallback(async (id: string, password: string, successMessage: string, localParams?: Record<string, string> | null) => {
    const unlockResponse = await fetch(`/api/config/${encodeURIComponent(id)}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (!unlockResponse.ok) {
      setProfileError(await readErrorMessage(unlockResponse, 'Unable to unlock the profile.'));
      return false;
    }

    const unlockData = (await unlockResponse.json()) as { token?: string; expiresAt?: number };
    if (!unlockData.token || typeof unlockData.expiresAt !== 'number') {
      setProfileError('Unlock token was missing from server response.');
      return false;
    }

    const revealResponse = await fetch(`/api/config/${encodeURIComponent(id)}/reveal`, {
      headers: {
        [CONFIG_UNLOCK_HEADER]: unlockData.token,
      },
    });

    if (!revealResponse.ok) {
      setProfileError(await readErrorMessage(revealResponse, 'Unable to load the saved profile.'));
      return false;
    }

    const params = (await revealResponse.json()) as Record<string, string>;
    const { normalizedConfig } = buildRevealedConfigState(params);
    const savedComparableFingerprint = buildConfigProfileFingerprint(
      buildSavedProfileComparableParams(params),
    );
    const localComparableFingerprint = buildConfigProfileFingerprint(
      buildSavedProfileComparableParams(localParams),
    );

    const hasLocalConflict =
      localParams != null &&
      localComparableFingerprint !== savedComparableFingerprint;

    if (hasLocalConflict) {
      ctx.setConfigProfileUnlockSession({
        profileId: id,
        token: unlockData.token,
        expiresAt: unlockData.expiresAt,
      });
      setSavedProfileFingerprint(savedComparableFingerprint);
      setSavedProfileSnapshotReady(true);
      setLoginConflict({ serverConfig: normalizedConfig });
      setProfileIdInput(id);
      setProfilePasswordInput('');
      setProfileStatus(null);
      setProfileError(null);
      return true;
    }

    ctx.applySavedUiConfig(normalizedConfig);
    ctx.setConfigProfileUnlockSession({
      profileId: id,
      token: unlockData.token,
      expiresAt: unlockData.expiresAt,
    });
    setSavedProfileFingerprint(savedComparableFingerprint);
    setSavedProfileSnapshotReady(true);
    setProfileIdInput(id);
    setProfilePasswordInput('');
    setProfileStatus(successMessage);
    setProfileError(null);
    return true;
  }, [ctx]);

  const handleLoadProfile = useCallback(async () => {
    const id = profileIdInput.trim();
    const password = profilePasswordInput;
    if (!id || !password) {
      setProfileError('Enter your profile UUID and password.');
      return;
    }

    setProfileBusy(true);
    setProfileError(null);
    setProfileStatus(null);

    try {
      await unlockAndLoadProfile(id, password, 'Profile loaded.', exportPanelsProps.buildSaveParams());
    } finally {
      setProfileBusy(false);
    }
  }, [exportPanelsProps, profileIdInput, profilePasswordInput, unlockAndLoadProfile]);

  const handleSaveProfile = useCallback(async () => {
    const params = currentSaveParams;
    if (!params) {
      setProfileError('Cannot save profile until required settings are available.');
      return;
    }

    setProfileBusy(true);
    setProfileError(null);
    setProfileStatus(null);

    try {
      if (activeProfileId && activeUnlockToken) {
        const updateResponse = await fetch(`/api/config/${encodeURIComponent(activeProfileId)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            [CONFIG_UNLOCK_HEADER]: activeUnlockToken,
          },
          body: JSON.stringify(params),
        });

        if (!updateResponse.ok) {
          setProfileError(await readErrorMessage(updateResponse, 'Unable to update saved profile.'));
          return;
        }

        setSavedProfileFingerprint(
          buildConfigProfileFingerprint(buildSavedProfileComparableParams(params)),
        );
        setSavedProfileSnapshotReady(true);
        setProfileStatus('Profile saved.');
        return;
      }

      if (savePasswordInput.trim().length < 8) {
        setProfileError('Set a profile password with at least 8 characters.');
        return;
      }

      if (savePasswordInput !== savePasswordConfirmInput) {
        setProfileError('Password confirmation does not match.');
        return;
      }

      const createResponse = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          password: savePasswordInput,
        }),
      });

      if (!createResponse.ok) {
        setProfileError(await readErrorMessage(createResponse, 'Unable to save profile.'));
        return;
      }

      const createData = (await createResponse.json()) as { id?: string };
      if (!createData.id) {
        setProfileError('Saved profile id was missing from server response.');
        return;
      }

      const unlocked = await unlockAndLoadProfile(createData.id, savePasswordInput, 'UUID created and profile unlocked.');
      if (!unlocked) {
        return;
      }

      setSavePasswordInput('');
      setSavePasswordConfirmInput('');
    } finally {
      setProfileBusy(false);
    }
  }, [
    activeProfileId,
    activeUnlockToken,
    currentSaveParams,
    savePasswordConfirmInput,
    savePasswordInput,
    unlockAndLoadProfile,
  ]);

  const handleRotatePassword = useCallback(async () => {
    if (!activeProfileId || !activeUnlockToken) {
      setProfileError('Unlock a profile before changing the password.');
      return;
    }

    if (changePasswordInput.trim().length < 8) {
      setProfileError('Set a profile password with at least 8 characters.');
      return;
    }

    if (changePasswordInput !== changePasswordConfirmInput) {
      setProfileError('Password confirmation does not match.');
      return;
    }

    setProfileBusy(true);
    setProfileError(null);
    setProfileStatus(null);

    try {
      const response = await fetch(`/api/config/${encodeURIComponent(activeProfileId)}/rotate-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [CONFIG_UNLOCK_HEADER]: activeUnlockToken,
        },
        body: JSON.stringify({ newPassword: changePasswordInput }),
      });

      if (!response.ok) {
        setProfileError(await readErrorMessage(response, 'Unable to change the profile password.'));
        return;
      }

      const payload = (await response.json()) as { token?: string; expiresAt?: number };
      if (!payload.token || typeof payload.expiresAt !== 'number') {
        setProfileError('Updated unlock token was missing from server response.');
        return;
      }

      ctx.setConfigProfileUnlockSession({
        profileId: activeProfileId,
        token: payload.token,
        expiresAt: payload.expiresAt,
      });
      setChangePasswordInput('');
      setChangePasswordConfirmInput('');
      setChangePasswordExpanded(false);
      setProfileStatus('Password changed.');
    } finally {
      setProfileBusy(false);
    }
  }, [activeProfileId, activeUnlockToken, changePasswordConfirmInput, changePasswordInput, ctx]);

  const handleDeleteProfile = useCallback(async () => {
    if (!activeProfileId || !activeUnlockToken) {
      setProfileError('Unlock a profile before deleting it.');
      return;
    }

    setProfileBusy(true);
    setProfileError(null);
    setProfileStatus(null);

    try {
      const response = await fetch(`/api/config/${encodeURIComponent(activeProfileId)}`, {
        method: 'DELETE',
        headers: {
          [CONFIG_UNLOCK_HEADER]: activeUnlockToken,
        },
      });

      if (!response.ok) {
        setProfileError(await readErrorMessage(response, 'Unable to delete the profile.'));
        return;
      }

      ctx.clearConfigProfileUnlockSession();
      setSavedProfileFingerprint(null);
      setSavedProfileSnapshotReady(false);
      setProfileIdInput('');
      setProfilePasswordInput('');
      setSavePasswordInput('');
      setSavePasswordConfirmInput('');
      setProfileStatus('Profile deleted.');
    } finally {
      setProfileBusy(false);
    }
  }, [activeProfileId, activeUnlockToken, ctx]);

  const handleConfirmedReset = useCallback(() => {
    ctx.applySavedUiConfig(normalizeSavedUiConfig({}));
    setProfileError(null);
    setConfirmAction(null);
    setProfileStatus('Configuration reset.');
  }, [ctx, setConfirmAction]);

  const handleConfirmedDelete = useCallback(async () => {
    setConfirmAction(null);
    await handleDeleteProfile();
  }, [handleDeleteProfile]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        if (!profileBusy) {
          void handleSaveProfile();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [profileBusy, handleSaveProfile]);

  const buildAiometadataRequestPayload = useCallback(() => {
    const userUUID = repairProfileIdInput.trim();
    const baseUrl = repairBaseUrl.trim();

    if (!baseUrl) {
      setRepairError('Pick an AIOMetadata instance first.');
      return null;
    }

    try {
      new URL(baseUrl);
    } catch {
      setRepairError('Enter a valid AIOMetadata URL including http:// or https://.');
      return null;
    }

    if (!userUUID) {
      setRepairError('Enter the AIOMetadata profile UUID first.');
      return null;
    }

    if (!repairPasswordInput) {
      setRepairError('Enter the AIOMetadata profile password.');
      return null;
    }

    return {
      baseUrl,
      userUUID,
      password: repairPasswordInput,
      addonPassword: isPublicAiometadataInstance ? undefined : repairAddonPasswordInput.trim() || undefined,
    };
  }, [isPublicAiometadataInstance, repairAddonPasswordInput, repairBaseUrl, repairPasswordInput, repairProfileIdInput]);

  const handleInstallProfile = useCallback(async () => {
    const payload = buildAiometadataRequestPayload();
    if (!payload) {
      return;
    }

    if (!installableAiometadataPatterns.posterUrlPattern
      && !installableAiometadataPatterns.backgroundUrlPattern
      && !installableAiometadataPatterns.logoUrlPattern
      && !installableAiometadataPatterns.episodeThumbnailUrlPattern) {
      setRepairError('XRDB does not have any AIOMetadata patterns ready to install yet.');
      return;
    }

    setRepairBusyAction('install');
    setRepairError(null);
    setRepairStatus(null);
    setRepairInstallUrl('');

    try {
      const response = await fetch('/api/aiometadata/install-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          ...installableAiometadataPatterns,
        }),
      });

      if (!response.ok) {
        setRepairError(await readErrorMessage(response, 'Unable to install XRDB patterns into AIOMetadata.'));
        return;
      }

      const body = (await response.json()) as { installUrl?: string | null; message?: string };
      setRepairInstallUrl(body.installUrl ?? '');
      setRepairStatus(body.message ?? 'AIOMetadata profile updated.');
    } finally {
      setRepairBusyAction(null);
    }
  }, [buildAiometadataRequestPayload, installableAiometadataPatterns]);

  const handleRepairProfile = useCallback(async () => {
    const payload = buildAiometadataRequestPayload();
    if (!payload) {
      return;
    }

    setRepairBusyAction('repair');
    setRepairError(null);
    setRepairStatus(null);
    setRepairInstallUrl('');

    try {
      const response = await fetch('/api/aiometadata/repair-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setRepairError(await readErrorMessage(response, 'Unable to repair the install URL.'));
        return;
      }

      const repairResponse = (await response.json()) as { installUrl?: string };
      if (!repairResponse.installUrl) {
        setRepairError('Repair response did not include an install URL.');
        return;
      }

      setRepairInstallUrl(repairResponse.installUrl);
      setRepairStatus('AIOMetadata install URL repaired.');
    } finally {
      setRepairBusyAction(null);
    }
  }, [buildAiometadataRequestPayload]);

  const posterIdOptions: Array<{ value: AiometadataPosterIdMode; label: string }> = [
    { value: 'auto', label: 'Auto' },
    { value: 'imdb', label: 'IMDb' },
    { value: 'tmdb', label: 'TMDB' },
  ];

  const episodeIdOptions: Array<{ value: AiometadataEpisodeIdMode; label: string }> = [
    { value: 'auto', label: 'Auto' },
    { value: 'tmdb', label: 'TMDB' },
    { value: 'tvdb', label: 'TVDB' },
  ];

  const repairProfilePanel = (
    <div className="xrdb-save-login-panel">
      <div className="xrdb-save-section-head">
        <h3 className="xrdb-save-section-title">AIOMetadata profile</h3>
        <p className="xrdb-save-section-desc">Install XRDB custom art into AIOMetadata, or repair a profile that already saved double encoded URLs.</p>
      </div>
      <div className="xrdb-save-inline-grid">
        <div className="xrdb-save-instance-picker" ref={instanceMenuRef}>
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={instanceMenuOpen}
            aria-label="AIOMetadata instance"
            className="xrdb-save-instance-trigger"
            onClick={() => setInstanceMenuOpen((prev) => !prev)}
          >
            <span>{selectedPublicAiometadataInstanceLabel}</span>
            <span className={`xrdb-save-instance-caret${instanceMenuOpen ? ' xrdb-save-instance-caret-open' : ''}`} aria-hidden="true">▾</span>
          </button>
          {instanceMenuOpen ? (
            <div className="xrdb-save-instance-menu" role="listbox" aria-label="AIOMetadata instance options">
              {AIOMETADATA_PUBLIC_INSTANCES.map((instance) => (
                <button
                  key={instance.id}
                  type="button"
                  role="option"
                  aria-selected={selectedPublicAiometadataBaseUrl === instance.baseUrl}
                  className={`xrdb-save-instance-option${selectedPublicAiometadataBaseUrl === instance.baseUrl ? ' xrdb-save-instance-option-active' : ''}`}
                  onClick={() => handleSelectPublicAiometadataInstance(instance.baseUrl)}
                >
                  {instance.name}
                </button>
              ))}
              <button
                type="button"
                role="option"
                aria-selected={selectedPublicAiometadataBaseUrl === '__custom__'}
                className={`xrdb-save-instance-option${selectedPublicAiometadataBaseUrl === '__custom__' ? ' xrdb-save-instance-option-active' : ''}`}
                onClick={() => handleSelectPublicAiometadataInstance('__custom__')}
              >
                Custom instance
              </button>
            </div>
          ) : null}
        </div>
        <input
          type="text"
          value={repairBaseUrl}
          onChange={(event) => setRepairBaseUrl(event.target.value)}
          placeholder="https://your-aiometadata.example"
          aria-label="AIOMetadata base URL"
          className="xrdb-save-input"
          readOnly={selectedPublicAiometadataBaseUrl !== '__custom__'}
        />
        <input
          type="text"
          value={repairProfileIdInput}
          onChange={(event) => setRepairProfileIdInput(event.target.value)}
          placeholder="AIOMetadata UUID"
          aria-label="AIOMetadata UUID"
          className="xrdb-save-input"
        />
        <input
          type="password"
          value={repairPasswordInput}
          onChange={(event) => setRepairPasswordInput(event.target.value)}
          placeholder="AIOMetadata profile password"
          aria-label="AIOMetadata profile password"
          className="xrdb-save-input"
        />
        {selectedPublicAiometadataBaseUrl === '__custom__' ? (
          <input
            type="password"
            value={repairAddonPasswordInput}
            onChange={(event) => setRepairAddonPasswordInput(event.target.value)}
            placeholder="Addon password optional"
            aria-label="Addon password optional"
            className="xrdb-save-input"
          />
        ) : null}
      </div>
      <div className="xrdb-save-config-actions">
        <button
          className="xrdb-save-action-btn xrdb-save-action-primary"
          onClick={() => void handleInstallProfile()}
          type="button"
          disabled={repairBusy}
        >
          {repairBusyAction === 'install' ? 'Working' : 'Install now'}
        </button>
        <button
          className="xrdb-save-action-btn xrdb-save-action-secondary"
          onClick={() => void handleRepairProfile()}
          type="button"
          disabled={repairBusy}
        >
          {repairBusyAction === 'repair' ? 'Working' : 'Repair profile'}
        </button>
        {repairInstallUrl ? (
          <button
            className={`xrdb-save-url-copy${copiedKey === 'repair-install-url' ? ' xrdb-save-url-copy-done' : ''}`}
            onClick={() => void copySingle('repair-install-url', repairInstallUrl)}
            type="button"
          >
            {copiedKey === 'repair-install-url' ? 'Copied' : 'Copy repaired URL'}
          </button>
        ) : null}
      </div>
      {repairInstallUrl ? <code className="xrdb-save-url-value">{repairInstallUrl}</code> : null}
      {repairError ? <p className="xrdb-save-status xrdb-save-status-error" role="alert">{repairError}</p> : null}
      {repairStatus ? <p className="xrdb-save-status xrdb-save-status-ok" aria-live="polite">{repairStatus}</p> : null}
    </div>
  );

  return (
    <div className="xrdb-save-page">
      <header className="xrdb-save-header">
        <div className="xrdb-save-header-inner">
          <div className="xrdb-save-header-text">
            <h1 className="xrdb-save-title">Save &amp; Export</h1>
            <p className="xrdb-save-subtitle">Save a UUID backed profile, export your setup, and keep AIOMetadata links tied to one source of truth.</p>
          </div>
          <div className="xrdb-save-header-nav">
            <Link href="/logo" className="xrdb-save-back-btn">
              &larr; Back to Logo
            </Link>
            {activeProfileId ? (
              <button
                className="xrdb-save-action-btn xrdb-save-action-secondary"
                onClick={handleLogoutProfile}
                type="button"
                disabled={profileBusy}
              >
                Logout
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="xrdb-save-body xrdb-save-body-single">
        <div className="xrdb-save-main">

          <section className="xrdb-save-section" aria-labelledby="profile-heading">
            <div className="xrdb-save-section-head">
              <h2 className="xrdb-save-section-title" id="profile-heading">{activeProfileId ? 'Save configuration' : 'Create configuration'}</h2>
              <p className="xrdb-save-section-desc">
                {activeProfileId
                  ? 'Your current workspace is connected to a password protected UUID. Save changes here, then copy UUID based URLs below.'
                  : 'Create a new UUID protected profile first. If you already have one, you can open the login form when needed.'}
              </p>
            </div>
            {activeProfileId ? (
              <>
                <div className="xrdb-save-profile-card">
                  <div className="xrdb-save-profile-card-head">
                    <span className="xrdb-save-option-label">Your UUID</span>
                    <button
                      className={`xrdb-save-url-copy${copiedKey === 'profile-id' ? ' xrdb-save-url-copy-done' : ''}`}
                      onClick={() => void copySingle('profile-id', activeProfileId)}
                      type="button"
                    >
                      {copiedKey === 'profile-id' ? 'Copied' : 'Copy UUID'}
                    </button>
                  </div>
                  <strong className="xrdb-save-profile-uuid">{activeProfileId}</strong>
                  <p className="xrdb-save-url-desc">Save before copying UUID links so every AIOMetadata route points at the latest profile state.</p>
                </div>

                {loginConflict ? (
                  <div className="xrdb-save-conflict-banner" role="alert">
                    <p className="xrdb-save-conflict-msg">Your local settings differ from this profile. Save them to the profile, or discard local changes and load from profile.</p>
                    <div className="xrdb-save-conflict-actions">
                      <button
                        className="xrdb-save-action-btn xrdb-save-action-primary"
                        type="button"
                        onClick={() => setLoginConflict(null)}
                      >
                        Keep local and save
                      </button>
                      <button
                        className="xrdb-save-action-btn xrdb-save-action-secondary"
                        type="button"
                        onClick={() => {
                          ctx.applySavedUiConfig(loginConflict.serverConfig);
                          setLoginConflict(null);
                        }}
                      >
                        Discard and load profile
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="xrdb-save-profile-toolbar">
                  <button
                    className="xrdb-save-action-btn xrdb-save-action-primary"
                    onClick={() => void handleSaveProfile()}
                    type="button"
                      disabled={profileBusy || !hasPendingSaveChanges}
                  >
                      {profileBusy ? 'Working' : hasPendingSaveChanges ? 'Save changes' : 'Saved'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="xrdb-save-inline-grid">
                  <input
                    type="password"
                    value={savePasswordInput}
                    onChange={(event) => setSavePasswordInput(event.target.value)}
                    placeholder="Create a password"
                    aria-label="Create a password"
                    className="xrdb-save-input"
                  />
                  <input
                    type="password"
                    value={savePasswordConfirmInput}
                    onChange={(event) => setSavePasswordConfirmInput(event.target.value)}
                    placeholder="Confirm password"
                    aria-label="Confirm password"
                    className="xrdb-save-input"
                  />
                </div>

                <div className="xrdb-save-config-actions">
                  <button
                    className="xrdb-save-action-btn xrdb-save-action-primary"
                    onClick={() => void handleSaveProfile()}
                    type="button"
                    disabled={profileBusy}
                  >
                    {profileBusy ? 'Working' : 'Create UUID'}
                  </button>
                </div>
              </>
            )}

            {profileError ? <p className="xrdb-save-status xrdb-save-status-error" role="alert">{profileError}</p> : null}
            {profileStatus ? <p className="xrdb-save-status xrdb-save-status-ok" aria-live="polite">{profileStatus}</p> : null}
          </section>

          <section className="xrdb-save-section" aria-labelledby="backups-heading">
            <div className="xrdb-save-section-head">
              <h2 className="xrdb-save-section-title" id="backups-heading">Backups</h2>
              <p className="xrdb-save-section-desc">Export your workspace or restore it from a JSON backup.</p>
            </div>
            <div className="xrdb-save-config-actions">
              <button
                className="xrdb-save-action-btn xrdb-save-action-secondary"
                onClick={handleDownload}
                type="button"
                disabled={!exportPanelsProps.canGenerateConfig}
              >
                Export
              </button>
              <button
                className="xrdb-save-action-btn xrdb-save-action-secondary"
                onClick={() => importInputRef.current?.click()}
                type="button"
              >
                Import
              </button>
              <button
                className="xrdb-save-action-btn xrdb-save-action-secondary"
                onClick={exportPanelsProps.onCopyConfig}
                type="button"
                disabled={!exportPanelsProps.canGenerateConfig}
              >
                {exportPanelsProps.configCopied ? 'Copied!' : 'Copy JSON'}
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImport}
                className="xrdb-save-hidden-input"
                aria-hidden="true"
              />
            </div>
            {importError && <p className="xrdb-save-status xrdb-save-status-error" role="alert">{importError}</p>}
            {importSuccess && <p className="xrdb-save-status xrdb-save-status-ok" aria-live="polite">Config imported. Settings applied.</p>}
          </section>

          <section className="xrdb-save-section" aria-labelledby="aio-heading">
            <div className="xrdb-save-section-head">
              <h2 className="xrdb-save-section-title" id="aio-heading">AIOMetadata URLs</h2>
              <p className="xrdb-save-section-desc">When a UUID profile is active, XRDB copies config based URLs instead of long parameter strings.</p>
              {displayedAiometadataPatternRows.length ? (
                <button
                  className="xrdb-save-copy-all-btn"
                  onClick={() => void handleCopyDisplayedAiometadata()}
                  type="button"
                >
                  {copiedKey === 'all-aio' ? 'Copied!' : 'Copy all'}
                </button>
              ) : null}
            </div>

            {!displayedAiometadataPatternRows.length ? (
              <>
                <div className="xrdb-save-empty">
                  <p>Create or log in to a UUID profile first, then this section will switch to profile based AIOMetadata URLs.</p>
                </div>
                {repairProfilePanel}
              </>
            ) : (
              <>
                <div className="xrdb-save-options-inline">
                  <div className="xrdb-save-option-group">
                    <span className="xrdb-save-option-label">Poster ID</span>
                    <div className="xrdb-save-pill-row" role="group" aria-label="Poster ID mode">
                      {posterIdOptions.map(opt => (
                        <button
                          key={opt.value}
                          className={`xrdb-save-pill${exportPanelsProps.posterIdMode === opt.value ? ' xrdb-save-pill-active' : ''}`}
                          onClick={() => exportPanelsProps.onSelectPosterIdMode(opt.value)}
                          type="button"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="xrdb-save-option-group">
                    <span className="xrdb-save-option-label">Episode ID</span>
                    <div className="xrdb-save-pill-row" role="group" aria-label="Episode ID mode">
                      {episodeIdOptions.map(opt => (
                        <button
                          key={opt.value}
                          className={`xrdb-save-pill${exportPanelsProps.episodeIdMode === opt.value ? ' xrdb-save-pill-active' : ''}`}
                          onClick={() => exportPanelsProps.onSelectEpisodeIdMode(opt.value)}
                          type="button"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="xrdb-save-inline-note">
                    <span className="xrdb-save-option-label">Credentials</span>
                    <p className="xrdb-save-url-desc">UUID mode already strips credentials from copied AIOMetadata links.</p>
                  </div>
                </div>

                <div className="xrdb-save-url-rows">
                  <p className="xrdb-save-url-ready-hint">These URLs are ready to paste into your AIOMetadata custom art settings. Copy each one and add it to the matching art field in your AIOMetadata instance.</p>
                  {displayedAiometadataPatternRows.map((row: AiometadataPatternRow) => (
                    <div key={row.key} className="xrdb-save-url-row">
                      <div className="xrdb-save-url-row-head">
                        <span className="xrdb-save-url-label">{row.label}</span>
                        <button
                          className={`xrdb-save-url-copy${copiedKey === row.key ? ' xrdb-save-url-copy-done' : ''}`}
                          onClick={() => void copySingle(row.key, row.value)}
                          type="button"
                          aria-label={`Copy ${row.label}`}
                        >
                          {copiedKey === row.key ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <code className="xrdb-save-url-value">{row.value}</code>
                      <p className="xrdb-save-url-desc">{row.description}</p>
                    </div>
                  ))}
                </div>
                {repairProfilePanel}
              </>
            )}
          </section>

          <section className="xrdb-save-section xrdb-save-danger" aria-labelledby="danger-heading">
            <div className="xrdb-save-section-head">
              <h2 className="xrdb-save-section-title" id="danger-heading">Reset workspace</h2>
              <p className="xrdb-save-section-desc">Reset the local workspace, or manage the server stored UUID profile when one is unlocked.</p>
            </div>

            {activeProfileId ? (
              <>
                <div className="xrdb-save-config-actions">
                  <button
                    className="xrdb-save-action-btn xrdb-save-action-secondary"
                    onClick={() => setChangePasswordExpanded((current) => !current)}
                    type="button"
                  >
                    {changePasswordExpanded ? 'Hide password form' : 'Change password'}
                  </button>
                  <button
                    className="xrdb-save-action-btn xrdb-save-action-danger"
                    onClick={() => setConfirmAction('delete')}
                    type="button"
                    disabled={profileBusy}
                  >
                    Delete profile
                  </button>
                  <button
                    className="xrdb-save-action-btn xrdb-save-action-danger"
                    onClick={() => setConfirmAction('reset')}
                    type="button"
                  >
                    Reset configuration
                  </button>
                </div>

                {confirmAction === 'delete' ? (
                  <div className="xrdb-save-confirm-row" role="alert">
                    <p className="xrdb-save-confirm-label">This permanently deletes the server profile. This cannot be undone.</p>
                    <div className="xrdb-save-config-actions">
                      <button className="xrdb-save-action-btn xrdb-save-action-danger" onClick={() => void handleConfirmedDelete()} type="button" disabled={profileBusy}>Confirm delete</button>
                      <button className="xrdb-save-action-btn xrdb-save-action-secondary" onClick={() => setConfirmAction(null)} type="button">Cancel</button>
                    </div>
                  </div>
                ) : null}
                {confirmAction === 'reset' ? (
                  <div className="xrdb-save-confirm-row" role="alert">
                    <p className="xrdb-save-confirm-label">This clears all local configuration. Export a backup first if you want to restore later.</p>
                    <div className="xrdb-save-config-actions">
                      <button className="xrdb-save-action-btn xrdb-save-action-danger" onClick={handleConfirmedReset} type="button">Confirm reset</button>
                      <button className="xrdb-save-action-btn xrdb-save-action-secondary" onClick={() => setConfirmAction(null)} type="button">Cancel</button>
                    </div>
                  </div>
                ) : null}

                {changePasswordExpanded ? (
                  <div className="xrdb-save-login-panel">
                    <div className="xrdb-save-inline-grid">
                      <input
                        type="password"
                        value={changePasswordInput}
                        onChange={(event) => setChangePasswordInput(event.target.value)}
                        placeholder="New password"
                        aria-label="New password"
                        className="xrdb-save-input"
                      />
                      <input
                        type="password"
                        value={changePasswordConfirmInput}
                        onChange={(event) => setChangePasswordConfirmInput(event.target.value)}
                        placeholder="Confirm new password"
                        aria-label="Confirm new password"
                        className="xrdb-save-input"
                      />
                    </div>
                    <div className="xrdb-save-config-actions">
                      <button
                        className="xrdb-save-action-btn xrdb-save-action-primary"
                        onClick={() => void handleRotatePassword()}
                        type="button"
                        disabled={profileBusy}
                      >
                        {profileBusy ? 'Working' : 'Update password'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="xrdb-save-config-actions">
                  <button
                    className="xrdb-save-action-btn xrdb-save-action-danger"
                    onClick={() => setConfirmAction('reset')}
                    type="button"
                  >
                    Reset configuration
                  </button>
                </div>
                {confirmAction === 'reset' ? (
                  <div className="xrdb-save-confirm-row" role="alert">
                    <p className="xrdb-save-confirm-label">This clears all local configuration. Export a backup first if you want to restore later.</p>
                    <div className="xrdb-save-config-actions">
                      <button className="xrdb-save-action-btn xrdb-save-action-danger" onClick={handleConfirmedReset} type="button">Confirm reset</button>
                      <button className="xrdb-save-action-btn xrdb-save-action-secondary" onClick={() => setConfirmAction(null)} type="button">Cancel</button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </section>
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
        onSubmit={() => void handleLoadProfile()}
      />
    </div>
  );
}
