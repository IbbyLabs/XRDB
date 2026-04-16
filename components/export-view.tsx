'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { BookmarkPlus, Check, ChevronDown, Clipboard, Code2, Eye, EyeOff, RotateCcw, Trash2 } from 'lucide-react';

import { ConfirmDiffModal } from '@/components/confirm-diff-modal';
import {
  buildConfigProfileFingerprint,
  buildSavedProfileComparableParams,
  hasConfigProfileLoginConflict,
  buildRevealedConfigState,
  getNextAiometadataUrlMode,
  getActiveConfigProfileUnlockSession,
  hasConfigProfileUnsavedChanges,
  isProtectedConfigProfileId,
  shouldClearConfigProfileUnlockSession,
  toConfigModeAiometadataUrl,
} from '@/lib/configProfileClientState';import { useConfiguratorContext } from '@/lib/configuratorProvider';
import { WorkspaceManagementSection } from '@/components/configurator-basics';
import {
  DEFAULT_EPISODE_ID_MODE,
  THUMBNAIL_RATING_PREFERENCES,
  type EpisodeIdMode,
  type ThumbnailRatingPreference,
} from '@/lib/episodeIdentity';
import {
  RATING_PROVIDER_OPTIONS,
} from '@/lib/ratingProviderCatalog';
import { buildProfileParams, type AiometadataUrlPatterns, type EpisodeArtworkMode, type SavedUiConfig } from '@/lib/uiConfig';

const LEGACY_CONFIG_ID_RE = /^(xr_[0-9a-f]{8}|xrc_[0-9a-f]{16})$/i;
const CONFIG_UNLOCK_HEADER = 'x-xrdb-config-unlock';

type SavedConfigProfileStatus = {
  isLegacy: boolean;
  migrationDeadline: number | null;
  requiresPassword: boolean;
  failedAttempts: number;
  lockedUntil: number | null;
  isLocked: boolean;
};

const formatCountdown = (msRemaining: number): string => {
  if (msRemaining <= 0) return 'expired';
  const totalMinutes = Math.floor(msRemaining / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`;
  if (days >= 1) return `${plural(days, 'day')}, ${plural(hours, 'hour')} left`;
  if (hours >= 1) return `${plural(hours, 'hour')}, ${plural(minutes, 'minute')} left`;
  return `${plural(minutes, 'minute')} left`;
};

const readErrorMessage = async (response: Response, fallback: string) => {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || fallback;
};

type PosterIdMode = 'auto' | 'tmdb' | 'imdb';
type PreviewType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';

const EPISODE_ID_MODE_OPTIONS: Array<{
  id: EpisodeIdMode;
  label: string;
}> = [
  { id: DEFAULT_EPISODE_ID_MODE, label: 'IMDb' },
  { id: 'xrdbid', label: 'XRDBID' },
  { id: 'tvdb', label: 'TVDB' },
  { id: 'kitsu', label: 'Kitsu' },
  { id: 'anilist', label: 'AniList' },
  { id: 'mal', label: 'MAL' },
  { id: 'anidb', label: 'AniDB' },
];

const EPISODE_ARTWORK_MODE_OPTIONS: Array<{
  id: EpisodeArtworkMode;
  label: string;
}> = [
  { id: 'still', label: 'Episode still' },
  { id: 'series', label: 'Series backdrop' },
  { id: 'streaming', label: 'Streaming' },
];

export function ExportView() {
  const {
    clearConfigProfileUnlockSession,
    configProfileUnlockSession,
    workspaceColumnsProps,
  } = useConfiguratorContext();
  const { exportPanelsProps, centerStageProps, workspaceManagementProps } = workspaceColumnsProps;
  const [optionsOpen, setOptionsOpen] = useState(false);

  const {
    displayedConfigString,
    canGenerateConfig,
    configCopied,
    showConfigString,
    onCopyConfig,
    onToggleShowConfigString,
    aiometadataPatternRows,
    aiometadataCopied,
    onCopyAiometadata,
    posterIdMode,
    onSelectPosterIdMode,
    episodeIdMode,
    onSelectEpisodeIdMode,
    thumbnailEpisodeArtwork,
    onSelectThumbnailEpisodeArtwork,
    backdropEpisodeArtwork,
    onSelectBackdropEpisodeArtwork,
    thumbnailRatingPreferences,
    onToggleThumbnailRatingPreference,
    hideAiometadataCredentials,
    onToggleHideAiometadataCredentials,
    buildSaveParams,
  } = exportPanelsProps;

  const [savedProfileId, setSavedProfileId] = useState<string | null>(null);
  const [savedProfileIdLoaded, setSavedProfileIdLoaded] = useState(false);

  const handleProfileIdChange = useCallback((id: string | null) => {
    if (!id || configProfileUnlockSession?.profileId !== id) {
      clearConfigProfileUnlockSession();
    }
    setSavedProfileIdLoaded(true);
    setSavedProfileId(id);
    if (id) {
      localStorage.setItem('xrdb_config_profile_id', id);
    } else {
      localStorage.removeItem('xrdb_config_profile_id');
    }
  }, [clearConfigProfileUnlockSession, configProfileUnlockSession?.profileId]);

  useEffect(() => {
    const sync = () => {
      const stored = localStorage.getItem('xrdb_config_profile_id');
      setSavedProfileId((prev) => (prev === stored ? prev : stored));
      setSavedProfileIdLoaded(true);
    };
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener('xrdb-config-profile-cleared', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('xrdb-config-profile-cleared', sync);
    };
  }, []);

  useEffect(() => {
    if (!shouldClearConfigProfileUnlockSession({
      session: configProfileUnlockSession,
      profileIdLoaded: savedProfileIdLoaded,
      profileId: savedProfileId,
    })) {
      return;
    }

    clearConfigProfileUnlockSession();
  }, [
    clearConfigProfileUnlockSession,
    configProfileUnlockSession,
    savedProfileId,
    savedProfileIdLoaded,
  ]);

  const [aiometadataUrlMode, setAiometadataUrlMode] = useState<'inline' | 'config'>('inline');
  const aiometadataUrlModeOverrideRef = useRef(false);
  const hasUuidBackedProfile = Boolean(savedProfileId && !LEGACY_CONFIG_ID_RE.test(savedProfileId));
  const configModeAvailable = savedProfileIdLoaded && hasUuidBackedProfile;
  const effectiveAiometadataUrlMode: 'inline' | 'config' = configModeAvailable
    ? aiometadataUrlMode
    : 'inline';

  const handleSetAiometadataUrlMode = useCallback((mode: 'inline' | 'config') => {
    aiometadataUrlModeOverrideRef.current = true;
    setAiometadataUrlMode(mode);
  }, []);

  useEffect(() => {
    if (!configModeAvailable) {
      aiometadataUrlModeOverrideRef.current = false;
    }

    setAiometadataUrlMode((currentMode) => getNextAiometadataUrlMode({
      currentMode,
      hasProtectedProfile: configModeAvailable,
      hasExplicitOverride: aiometadataUrlModeOverrideRef.current,
    }));
  }, [configModeAvailable]);

  const {
    previewType,
    onSelectPreviewType,
    previewUrl,
    previewErrored,
    tmdbKeyPresent,
    onPreviewImageError,
    onPreviewImageLoad,
    activeTypeLabel,
  } = centerStageProps;

  const effectivePosterIdMode: PosterIdMode = posterIdMode === 'tmdb' ? 'auto' : posterIdMode;

  return (
    <div className="xrdb-export-layout w-full px-4 py-6 md:px-6 md:py-8">
      <div className="order-2 lg:order-1 min-w-0 space-y-4">
        <SaveConfigSection
          canSaveProfile={exportPanelsProps.canSaveProfile}
          buildSaveParams={buildSaveParams}
          pendingRestoreProfileId={workspaceManagementProps.pendingConfigProfileId}
          onClearPendingRestore={workspaceManagementProps.onClearPendingConfigProfileRestore}
          savedProfileId={savedProfileId}
          savedProfileIdLoaded={savedProfileIdLoaded}
          onProfileIdChange={handleProfileIdChange}
        />

        <AiometadataSection
          aiometadataPatternRows={aiometadataPatternRows}
          aiometadataCopied={aiometadataCopied}
          onCopyAiometadata={onCopyAiometadata}
          savedProfileId={savedProfileId}
          configUrlAvailable={configModeAvailable}
          aiometadataUrlMode={effectiveAiometadataUrlMode}
          onSetAiometadataUrlMode={handleSetAiometadataUrlMode}
        />

        <div className="xrdb-panel rounded-2xl p-4">
          <WorkspaceManagementSection {...workspaceManagementProps} />
        </div>

        <div className="xrdb-panel rounded-2xl">
          <button
            type="button"
            onClick={() => setOptionsOpen((prev) => !prev)}
            className="flex w-full items-center justify-between gap-3 p-4 text-left"
          >
            <span className="text-sm font-semibold text-white">Export options</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${optionsOpen ? 'rotate-180' : ''}`} />
          </button>
          {optionsOpen && (
            <div className="border-t border-white/10 p-4 space-y-4">
              <p className="text-[12px] leading-5 text-zinc-500">
                These export options stay on this device and do not affect Update saved profile.
              </p>
              <ExportOptionGroup label="Poster ID source">
                <div className="flex flex-wrap gap-2">
                  <OptionPill
                    active={effectivePosterIdMode === 'auto'}
                    onClick={() => onSelectPosterIdMode('auto')}
                    label="Auto"
                  />
                  <OptionPill
                    active={effectivePosterIdMode === 'imdb'}
                    onClick={() => onSelectPosterIdMode('imdb')}
                    label="IMDb"
                  />
                </div>
              </ExportOptionGroup>

              <ExportOptionGroup label="Episode ID source">
                <div className="flex flex-wrap gap-2">
                  {EPISODE_ID_MODE_OPTIONS.map((option) => (
                    <OptionPill
                      key={option.id}
                      active={episodeIdMode === option.id}
                      onClick={() => onSelectEpisodeIdMode(option.id)}
                      label={option.label}
                    />
                  ))}
                </div>
              </ExportOptionGroup>

              <ExportOptionGroup label="Thumbnail episode artwork">
                <div className="flex flex-wrap gap-2">
                  {EPISODE_ARTWORK_MODE_OPTIONS.map((option) => (
                    <OptionPill
                      key={`thumb-${option.id}`}
                      active={thumbnailEpisodeArtwork === option.id}
                      onClick={() => onSelectThumbnailEpisodeArtwork(option.id)}
                      label={option.label}
                    />
                  ))}
                </div>
              </ExportOptionGroup>

              <ExportOptionGroup label="Backdrop episode artwork">
                <div className="flex flex-wrap gap-2">
                  {EPISODE_ARTWORK_MODE_OPTIONS.map((option) => (
                    <OptionPill
                      key={`bd-${option.id}`}
                      active={backdropEpisodeArtwork === option.id}
                      onClick={() => onSelectBackdropEpisodeArtwork(option.id)}
                      label={option.label}
                    />
                  ))}
                </div>
              </ExportOptionGroup>

              <ExportOptionGroup label="Thumbnail ratings">
                <div className="flex flex-wrap gap-2">
                  {THUMBNAIL_RATING_PREFERENCES.map((providerId) => {
                    const providerMeta = RATING_PROVIDER_OPTIONS.find((p) => p.id === providerId) || null;
                    const isEnabled = thumbnailRatingPreferences.includes(providerId);
                    return (
                      <OptionPill
                        key={providerId}
                        active={isEnabled}
                        onClick={() => onToggleThumbnailRatingPreference(providerId)}
                        label={providerMeta?.label || providerId}
                      />
                    );
                  })}
                </div>
              </ExportOptionGroup>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideAiometadataCredentials}
                  onChange={(event) => onToggleHideAiometadataCredentials(event.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-black accent-violet-500"
                />
                <span className="text-[13px] font-medium text-zinc-300">Hide credentials</span>
              </label>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
            Advanced exports
          </div>
          <ConfigStringSection
            displayedConfigString={displayedConfigString}
            canGenerateConfig={canGenerateConfig}
            configCopied={configCopied}
            showConfigString={showConfigString}
            onCopyConfig={onCopyConfig}
            onToggleShowConfigString={onToggleShowConfigString}
          />
        </div>

      </div>

      <div className="order-1 lg:order-2 min-w-0 lg:sticky lg:top-20">
        <CompactPreview
          previewType={previewType as PreviewType}
          onSelectPreviewType={onSelectPreviewType as (value: PreviewType) => void}
          previewUrl={previewUrl as string}
          previewErrored={previewErrored as boolean}
          tmdbKeyPresent={tmdbKeyPresent as boolean}
          onPreviewImageError={onPreviewImageError as (url: string) => void | Promise<void>}
          onPreviewImageLoad={onPreviewImageLoad as (url: string) => void}
          activeTypeLabel={activeTypeLabel as string}
        />
      </div>
    </div>
  );
}

function AiometadataSection({
  aiometadataPatternRows,
  aiometadataCopied,
  onCopyAiometadata,
  savedProfileId,
  configUrlAvailable,
  aiometadataUrlMode,
  onSetAiometadataUrlMode,
}: {
  aiometadataPatternRows: Array<{ key: string; label: string; value: string; description: string }>;
  aiometadataCopied: boolean;
  onCopyAiometadata: () => void;
  savedProfileId: string | null;
  configUrlAvailable: boolean;
  aiometadataUrlMode: 'inline' | 'config';
  onSetAiometadataUrlMode: (mode: 'inline' | 'config') => void;
}) {
  const [copiedRowKey, setCopiedRowKey] = useState<string | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [configCopiedAll, setConfigCopiedAll] = useState(false);
  const configCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getDisplayValue = useCallback(
    (value: string) =>
      aiometadataUrlMode === 'config' && savedProfileId ? toConfigModeAiometadataUrl(value, savedProfileId) : value,
    [aiometadataUrlMode, savedProfileId],
  );

  const handleCopyRow = useCallback(
    (key: string, value: string) => {
      void navigator.clipboard.writeText(getDisplayValue(value));
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      setCopiedRowKey(key);
      copiedTimerRef.current = setTimeout(() => setCopiedRowKey(null), 1500);
    },
    [getDisplayValue],
  );

  const handleCopyAll = useCallback(() => {
    if (aiometadataUrlMode === 'config' && savedProfileId) {
      const text = aiometadataPatternRows
        .map((r) => toConfigModeAiometadataUrl(r.value, savedProfileId))
        .join('\n');
      void navigator.clipboard.writeText(text);
      if (configCopiedTimerRef.current) clearTimeout(configCopiedTimerRef.current);
      setConfigCopiedAll(true);
      configCopiedTimerRef.current = setTimeout(() => setConfigCopiedAll(false), 1500);
    } else {
      onCopyAiometadata();
    }
  }, [aiometadataUrlMode, savedProfileId, aiometadataPatternRows, onCopyAiometadata]);

  const isCopiedAll = aiometadataUrlMode === 'config' ? configCopiedAll : aiometadataCopied;

  return (
    <div className="xrdb-panel rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Code2 className="w-4 h-4 text-violet-500" /> AIOMetadata URLs
        </h2>
        <button
          type="button"
          onClick={handleCopyAll}
          disabled={!aiometadataPatternRows.length}
          className={`rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-2 transition-colors ${
            aiometadataPatternRows.length
              ? isCopiedAll
                ? 'bg-green-500 text-white'
                : 'bg-violet-600 text-white hover:bg-violet-500'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          }`}
        >
          {isCopiedAll ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Clipboard className="w-3.5 h-3.5" />
              <span>Copy all</span>
            </>
          )}
        </button>
      </div>
      <p className="text-[13px] leading-5 text-zinc-400">
        Ready to paste URL patterns for the AIOMetadata art override fields.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSetAiometadataUrlMode('inline')}
          className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
            aiometadataUrlMode === 'inline'
              ? 'border-violet-500/60 bg-zinc-800 text-white'
              : 'border-white/10 bg-zinc-950 text-zinc-400 hover:text-white'
          }`}
        >
          Inline
        </button>
        <button
          type="button"
          onClick={() => configUrlAvailable && onSetAiometadataUrlMode('config')}
          disabled={!configUrlAvailable}
          className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
            aiometadataUrlMode === 'config'
              ? 'border-violet-500/60 bg-zinc-800 text-white'
              : configUrlAvailable
                ? 'border-white/10 bg-zinc-950 text-zinc-400 hover:text-white'
                : 'border-white/5 bg-zinc-950 text-zinc-600 cursor-not-allowed'
          }`}
        >
          Config
        </button>
        {!configUrlAvailable && (
          <span className="text-[11px] text-zinc-600">
            {savedProfileId ? 'Migrate to a UUID profile to enable config URLs' : 'Save a profile to enable config URLs'}
          </span>
        )}
      </div>
      {aiometadataPatternRows.length === 0 ? (
        <p className="text-[13px] text-zinc-500">Configure server keys and settings to generate URLs.</p>
      ) : (
        <div className="space-y-2">
          {aiometadataPatternRows.map((row) => {
            const isRowCopied = copiedRowKey === row.key;
            const displayValue = getDisplayValue(row.value);
            return (
              <div key={row.key} className="rounded-xl border border-white/10 bg-black/40 p-3 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 text-[12px] font-semibold text-zinc-200">{row.label}</div>
                  <button
                    type="button"
                    onClick={() => handleCopyRow(row.key, row.value)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium flex items-center gap-1.5 transition-all ${
                      isRowCopied
                        ? 'border-green-500/60 bg-green-500 text-white'
                        : 'border-white/15 text-zinc-300 hover:text-white'
                    }`}
                  >
                    {isRowCopied ? (
                      <><Check className="w-3 h-3" /> Copied</>
                    ) : (
                      <><Clipboard className="w-3 h-3" /> Copy</>
                    )}
                  </button>
                </div>
                <div className="mt-2 rounded-lg border border-white/10 bg-zinc-950/80 p-3 font-mono text-[11px] leading-5 text-zinc-300 break-all overflow-hidden">
                  {displayValue}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfigStringSection({
  displayedConfigString,
  canGenerateConfig,
  configCopied,
  showConfigString,
  onCopyConfig,
  onToggleShowConfigString,
}: {
  displayedConfigString: string;
  canGenerateConfig: boolean;
  configCopied: boolean;
  showConfigString: boolean;
  onCopyConfig: () => void;
  onToggleShowConfigString: () => void;
}) {
  return (
    <div className="xrdb-panel rounded-2xl p-4 space-y-3">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2">
        <Code2 className="w-4 h-4 text-violet-500" /> Config String
      </h2>
      <p className="text-[13px] leading-5 text-zinc-400">
        Base64url string containing settings. Provider keys stay on the server.
      </p>
      <div className="rounded-xl border border-white/10 bg-black/70 p-3 overflow-hidden">
        <div className={`font-mono text-[11px] text-zinc-300 break-all${!showConfigString && displayedConfigString ? ' select-none' : ''}`}>
          {displayedConfigString || 'Configure server TMDB and MDBList keys to generate.'}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onCopyConfig}
          disabled={!canGenerateConfig}
          className={`rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-2 transition-colors ${
            canGenerateConfig
              ? configCopied
                ? 'bg-green-500 text-white'
                : 'bg-violet-600 text-white hover:bg-violet-500'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          }`}
        >
          {configCopied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Clipboard className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onToggleShowConfigString}
          disabled={!canGenerateConfig}
          className={`rounded-full px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors ${
            canGenerateConfig
              ? 'border border-white/15 text-zinc-300 hover:text-white'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5'
          }`}
        >
          {showConfigString ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span>{showConfigString ? 'Hide' : 'Show'}</span>
        </button>
      </div>
    </div>
  );
}

type ParamDiffEntry = { key: string; oldValue: string; newValue: string };
type ProfileLoginConflictState = {
  profileId: string;
  token: string;
  localParams: Record<string, string>;
  profileParams: Record<string, string>;
  diff: { entries: ParamDiffEntry[]; totalChanged: number };
};

const REVERT_DIFF_MAX_VISIBLE = 20;

function buildSnapshotParams(snapshot: SavedUiConfig): Record<string, string> {
  return buildProfileParams(snapshot.settings) ?? {};
}

function SensitiveField({
  label,
  value,
  onChange,
  placeholder,
  revealed,
  onToggleReveal,
  inputClassName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  revealed: boolean;
  onToggleReveal: () => void;
  inputClassName: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
      <div className="relative">
        <input
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`${inputClassName} pr-10`}
        />
        <button
          type="button"
          onClick={onToggleReveal}
          aria-label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-zinc-300"
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}

function computeParamDiff(
  current: Record<string, string>,
  saved: Record<string, string>,
): { entries: ParamDiffEntry[]; totalChanged: number } {
  const allKeys = new Set([...Object.keys(current), ...Object.keys(saved)]);
  const all: ParamDiffEntry[] = [];
  for (const key of allKeys) {
    const oldValue = saved[key] ?? '';
    const newValue = current[key] ?? '';
    if (oldValue !== newValue) {
      all.push({ key, oldValue, newValue });
    }
  }
  all.sort((a, b) => a.key.localeCompare(b.key));
  return {
    entries: all.slice(0, REVERT_DIFF_MAX_VISIBLE),
    totalChanged: all.length,
  };
}

function RevertDiffModal({
  diff,
  totalChanged,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  diff: ParamDiffEntry[];
  totalChanged: number;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDiffModal
      title="Confirm Changes"
      description="Review the changes you are about to revert to your saved configuration."
      confirmLabel={confirmLabel ?? 'Confirm & Revert'}
      sections={[{ entries: diff, totalChanged }]}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

function SaveConfigSection({
  canSaveProfile,
  buildSaveParams,
  pendingRestoreProfileId,
  onClearPendingRestore,
  savedProfileId,
  savedProfileIdLoaded,
  onProfileIdChange,
}: {
  canSaveProfile: boolean;
  buildSaveParams: () => Record<string, string> | null;
  pendingRestoreProfileId?: string | null;
  onClearPendingRestore?: () => void;
  savedProfileId: string | null;
  savedProfileIdLoaded: boolean;
  onProfileIdChange: (id: string | null) => void;
}) {
  const {
    applySavedUiConfig,
    clearConfigProfileUnlockSession,
    configProfileUnlockSession,
    setConfigProfileUnlockSession,
  } = useConfiguratorContext();

  const [isSaving, setIsSaving] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isRotatingPassword, setIsRotatingPassword] = useState(false);
  const [fragmentCopied, setFragmentCopied] = useState(false);
  const [expiredBanner, setExpiredBanner] = useState(false);
  const [migrationCompleteBanner, setMigrationCompleteBanner] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [rotationNotice, setRotationNotice] = useState<string | null>(null);
  const [migrationDeadline, setMigrationDeadline] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<SavedConfigProfileStatus | null>(null);
  const [accessPassword, setAccessPassword] = useState('');
  const [accessPasswordConfirm, setAccessPasswordConfirm] = useState('');
  const [rotationPassword, setRotationPassword] = useState('');
  const [rotationPasswordConfirm, setRotationPasswordConfirm] = useState('');
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [restoreProfileId, setRestoreProfileId] = useState('');
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [revertDiff, setRevertDiff] = useState<{ entries: ParamDiffEntry[]; totalChanged: number } | null>(null);
  const [modalMode, setModalMode] = useState<'revert' | 'save'>('revert');
  const [profileLoginConflictState, setProfileLoginConflictState] = useState<ProfileLoginConflictState | null>(null);
  const [isResolvingProfileLoginConflict, setIsResolvingProfileLoginConflict] = useState(false);
  const [showAccessPasswordFields, setShowAccessPasswordFields] = useState(false);
  const [showRestorePassword, setShowRestorePassword] = useState(false);
  const [showRotationPasswordFields, setShowRotationPasswordFields] = useState(false);
  const fragmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedParamsFingerprintRef = useRef<string | null>(null);
  const savedConfigSnapshot = useRef<SavedUiConfig | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [, setUnlockCountdownTick] = useState(0);

  const activeUnlockSession = getActiveConfigProfileUnlockSession(
    configProfileUnlockSession,
    savedProfileId,
  );
  const unlockToken = activeUnlockSession?.token ?? null;
  const unlockExpiresAt = activeUnlockSession?.expiresAt ?? null;

  const isLegacyId = profileStatus?.isLegacy ?? Boolean(savedProfileId && LEGACY_CONFIG_ID_RE.test(savedProfileId));
  const isUnlocked = Boolean(activeUnlockSession);

  const clearSnapshot = useCallback(() => {
    savedConfigSnapshot.current = null;
    savedParamsFingerprintRef.current = null;
    setSnapshotReady(false);
    setHasUnsavedChanges(false);
  }, []);

  const clearUnlockState = useCallback(() => {
    clearConfigProfileUnlockSession();
    clearSnapshot();
  }, [clearConfigProfileUnlockSession, clearSnapshot]);

  const applySnapshot = useCallback((
    params: Record<string, string>,
    options?: { applyToWorkspace?: boolean },
  ) => {
    const { normalizedConfig, serializedConfig } = buildRevealedConfigState(params);
    savedConfigSnapshot.current = normalizedConfig;
    if (options?.applyToWorkspace !== false) {
      applySavedUiConfig(normalizedConfig);
      try {
        localStorage.setItem('xrdb.uiConfig.v1', serializedConfig);
      } catch {}
    }
    savedParamsFingerprintRef.current = buildConfigProfileFingerprint(
      buildSavedProfileComparableParams(params),
    );
    setSnapshotReady(true);
    setHasUnsavedChanges(false);
  }, [applySavedUiConfig]);

  const loadProfileStatus = useCallback(async (
    id: string,
    options?: { clearActiveProfileOnMissing?: boolean },
  ) => {
    const clearActiveProfileOnMissing = options?.clearActiveProfileOnMissing ?? true;
    const res = await fetch(`/api/config/${id}/status`, { cache: 'no-store' });
    if (!res.ok) {
      if ((res.status === 404 || res.status === 410) && clearActiveProfileOnMissing) {
        if (LEGACY_CONFIG_ID_RE.test(id)) {
          setExpiredBanner(true);
        }
        setProfileStatus(null);
        onProfileIdChange(null);
      }
      return null;
    }

    const data = (await res.json()) as SavedConfigProfileStatus;
    setProfileStatus(data);

    const deadline = data.isLegacy ? data.migrationDeadline : null;
    setMigrationDeadline(deadline ?? null);
    setCountdown(deadline ? formatCountdown(deadline - Date.now()) : null);

    if (data.isLocked) {
      clearUnlockState();
    }

    return data;
  }, [clearUnlockState, onProfileIdChange]);

  const revealSavedProfile = useCallback(async (id: string, token: string) => {
    if (profileLoginConflictState) {
      setProfileNotice('Resolve the active profile conflict before unlocking again.');
      return false;
    }

    const res = await fetch(`/api/config/${id}/reveal`, {
      cache: 'no-store',
      headers: {
        [CONFIG_UNLOCK_HEADER]: token,
      },
    });

    if (res.status === 401) {
      clearUnlockState();
      setProfileNotice('Unlock expired. Enter your password again.');
      return false;
    }

    if (!res.ok) {
      setProfileNotice(await readErrorMessage(res, 'Unable to reveal the saved profile.'));
      return false;
    }

    const revealedParams = (await res.json()) as Record<string, string>;
    const localParams = buildSaveParams() ?? {};
    const profileParams = revealedParams;

    if (hasConfigProfileLoginConflict({ localParams, profileParams })) {
      setProfileLoginConflictState({
        profileId: id,
        token,
        localParams,
        profileParams,
        diff: computeParamDiff(localParams, profileParams),
      });
      setProfileNotice('Choose how to handle local changes before loading this profile.');
      setRestoreModalOpen(false);
      return false;
    }

    applySnapshot(revealedParams);
    return true;
  }, [applySnapshot, buildSaveParams, clearUnlockState, profileLoginConflictState]);

  useEffect(() => {
    if (!savedProfileId || !unlockToken || snapshotReady || profileLoginConflictState) {
      return;
    }

    let active = true;

    void (async () => {
      const res = await fetch(`/api/config/${savedProfileId}/reveal`, {
        cache: 'no-store',
        headers: {
          [CONFIG_UNLOCK_HEADER]: unlockToken,
        },
      });

      if (!active) {
        return;
      }

      if (res.status === 401) {
        clearUnlockState();
        setProfileNotice('Unlock expired. Enter your password again.');
        return;
      }

      if (!res.ok) {
        setProfileNotice(await readErrorMessage(res, 'Unable to reveal the saved profile.'));
        return;
      }

      applySnapshot((await res.json()) as Record<string, string>, { applyToWorkspace: false });
    })();

    return () => {
      active = false;
    };
  }, [applySnapshot, clearUnlockState, profileLoginConflictState, savedProfileId, snapshotReady, unlockToken]);

  const unlockProtectedProfile = useCallback(async (id: string, password: string) => {
    const res = await fetch(`/api/config/${id}/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });

    const data = (await res.json().catch(() => null)) as {
      error?: string;
      token?: string;
      expiresAt?: number;
      failedAttempts?: number;
      lockedUntil?: number | null;
    } | null;

    if (!res.ok || !data?.token || typeof data.expiresAt !== 'number') {
      const lockedUntil = typeof data?.lockedUntil === 'number' ? data.lockedUntil : null;
      setProfileStatus((current) => current ? {
        ...current,
        failedAttempts: typeof data?.failedAttempts === 'number' ? data.failedAttempts : current.failedAttempts,
        lockedUntil,
        isLocked: typeof lockedUntil === 'number' && lockedUntil > Date.now(),
      } : current);
      setProfileNotice(data?.error || 'Unable to unlock the profile.');
      return false;
    }

    setConfigProfileUnlockSession({
      profileId: id,
      token: data.token,
      expiresAt: data.expiresAt,
    });
    setProfileNotice(null);
    setProfileStatus((current) => current ? {
      ...current,
      failedAttempts: typeof data.failedAttempts === 'number' ? data.failedAttempts : 0,
      lockedUntil: data.lockedUntil ?? null,
      isLocked: false,
    } : current);
    return revealSavedProfile(id, data.token);
  }, [revealSavedProfile, setConfigProfileUnlockSession]);

  useEffect(() => {
    if (!savedProfileIdLoaded) {
      return;
    }

    if (!savedProfileId) {
      setProfileStatus(null);
      setMigrationDeadline(null);
      setCountdown(null);
      setProfileNotice(null);
      setRotationNotice(null);
      clearUnlockState();
      return;
    }

    setProfileNotice(null);
    setRotationNotice(null);
    setExpiredBanner(false);

    let active = true;
    void (async () => {
      const data = await loadProfileStatus(savedProfileId);
      if (!active || !data || !data.isLegacy) {
        return;
      }

      const deadline = data.migrationDeadline;
      if (!deadline) {
        return;
      }
      if (Date.now() > deadline) {
        if (active) {
          onProfileIdChange(null);
          setExpiredBanner(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [savedProfileId, savedProfileIdLoaded, loadProfileStatus, clearUnlockState, onProfileIdChange]);

  useEffect(() => {
    if (!pendingRestoreProfileId) {
      return;
    }

    setRestoreProfileId(pendingRestoreProfileId);
    setRestoreModalOpen(true);
    setProfileNotice('Saved profile link detected. Enter your password to open it on this device.');
  }, [pendingRestoreProfileId]);

  useEffect(() => {
    if (!unlockExpiresAt) {
      return;
    }

    const interval = window.setInterval(() => {
      setUnlockCountdownTick((current) => current + 1);
    }, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [unlockExpiresAt]);

  useEffect(() => {
    if (!savedProfileId || !isLegacyId) {
      setMigrationDeadline(null);
      setCountdown(null);
      return;
    }
  }, [savedProfileId, isLegacyId]);

  useEffect(() => {
    if (!migrationDeadline) return;
    const interval = setInterval(() => {
      const remaining = migrationDeadline - Date.now();
      if (remaining <= 0) {
        setCountdown('expired');
        clearInterval(interval);
      } else {
        setCountdown(formatCountdown(remaining));
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [migrationDeadline]);

  useEffect(() => {
    const params = buildSaveParams();
    const comparableParams = buildSavedProfileComparableParams(params);
    setHasUnsavedChanges(
      hasConfigProfileUnsavedChanges({
        currentParams: comparableParams,
        savedFingerprint: savedParamsFingerprintRef.current,
        snapshotReady,
      }),
    );
  }, [buildSaveParams, snapshotReady]);

  const handleSave = useCallback(async () => {
    const params = buildSaveParams();
    if (!params) return;

    setProfileNotice(null);
    setRotationNotice(null);

    if (!savedProfileId) {
      if (accessPassword.trim().length < 8) {
        setProfileNotice('Set a profile password with at least 8 characters.');
        return;
      }
      if (accessPassword !== accessPasswordConfirm) {
        setProfileNotice('Password confirmation does not match.');
        return;
      }

      setIsSaving(true);
      try {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...params,
            password: accessPassword,
          }),
        });
        if (!res.ok) {
          setProfileNotice(await readErrorMessage(res, 'Unable to save the config profile.'));
          return;
        }

        const data = (await res.json()) as { id: string };
        applySnapshot(params);
        onProfileIdChange(data.id);
        await loadProfileStatus(data.id);
        await unlockProtectedProfile(data.id, accessPassword);
        setAccessPasswordConfirm('');
        return;
      } finally {
        setIsSaving(false);
      }
    }

    if (isLegacyId) {
      setProfileNotice('Migrate this legacy profile before saving updates.');
      return;
    }

    if (!unlockToken || !isUnlocked) {
      setProfileNotice('Unlock this profile before saving updates.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/config/${savedProfileId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          [CONFIG_UNLOCK_HEADER]: unlockToken,
        },
        body: JSON.stringify(params),
      });
      if (res.status === 401) {
        clearUnlockState();
        setProfileNotice('Unlock expired. Enter your password again.');
        return;
      }
      if (!res.ok) {
        setProfileNotice(await readErrorMessage(res, 'Unable to update the saved profile.'));
        return;
      }

      applySnapshot(params);
      setProfileNotice('Saved profile updated.');
    } finally {
      setIsSaving(false);
    }
  }, [
    accessPassword,
    accessPasswordConfirm,
    applySnapshot,
    buildSaveParams,
    clearUnlockState,
    isLegacyId,
    isUnlocked,
    loadProfileStatus,
    onProfileIdChange,
    savedProfileId,
    unlockProtectedProfile,
    unlockToken,
  ]);

  const handleDelete = useCallback(async () => {
    if (!savedProfileId || isLegacyId || !unlockToken) {
      setProfileNotice(isLegacyId ? 'Forget this legacy profile locally or migrate it first.' : 'Unlock this profile before deleting it.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/config/${savedProfileId}`, {
        method: 'DELETE',
        headers: {
          [CONFIG_UNLOCK_HEADER]: unlockToken,
        },
      });
      if (res.status === 401) {
        clearUnlockState();
        setProfileNotice('Unlock expired. Enter your password again.');
        return;
      }
      if (res.ok) {
        clearUnlockState();
        setProfileStatus(null);
        onProfileIdChange(null);
      } else {
        setProfileNotice(await readErrorMessage(res, 'Unable to delete the saved profile.'));
      }
    } finally {
      setIsSaving(false);
    }
  }, [clearUnlockState, isLegacyId, onProfileIdChange, savedProfileId, unlockToken]);

  const handleMigrate = useCallback(async () => {
    if (!savedProfileId) return;
    const params = buildSaveParams();
    if (!params) return;

    if (accessPassword.trim().length < 8) {
      setProfileNotice('Set a profile password with at least 8 characters to migrate this profile.');
      return;
    }
    if (accessPassword !== accessPasswordConfirm) {
      setProfileNotice('Password confirmation does not match.');
      return;
    }

    setIsMigrating(true);
    try {
      const newRes = await fetch(`/api/config/${savedProfileId}/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: accessPassword }),
      });
      if (!newRes.ok) {
        setProfileNotice(await readErrorMessage(newRes, 'Unable to migrate the saved profile.'));
        return;
      }

      const { id: newId } = await newRes.json() as { id: string };
      applySnapshot(params);
      onProfileIdChange(newId);
      await loadProfileStatus(newId);
      await unlockProtectedProfile(newId, accessPassword);
      setMigrationCompleteBanner(true);
      setAccessPasswordConfirm('');
    } finally {
      setIsMigrating(false);
    }
  }, [
    accessPassword,
    accessPasswordConfirm,
    applySnapshot,
    buildSaveParams,
    loadProfileStatus,
    onProfileIdChange,
    savedProfileId,
    unlockProtectedProfile,
  ]);

  const handleUnlock = useCallback(async () => {
    if (!savedProfileId || isLegacyId) {
      return;
    }
    if (!accessPassword.trim()) {
      setProfileNotice('Enter your profile password to unlock this profile.');
      return;
    }

    setIsUnlocking(true);
    try {
      await unlockProtectedProfile(savedProfileId, accessPassword);
      await loadProfileStatus(savedProfileId);
    } finally {
      setIsUnlocking(false);
    }
  }, [accessPassword, isLegacyId, loadProfileStatus, savedProfileId, unlockProtectedProfile]);

  const handleRotatePassword = useCallback(async () => {
    if (!savedProfileId || !unlockToken || !isUnlocked) {
      setRotationNotice('Unlock this profile before rotating the password.');
      return;
    }
    if (rotationPassword.trim().length < 8) {
      setRotationNotice('Set a new password with at least 8 characters.');
      return;
    }
    if (rotationPassword !== rotationPasswordConfirm) {
      setRotationNotice('New password confirmation does not match.');
      return;
    }

    setIsRotatingPassword(true);
    try {
      const res = await fetch(`/api/config/${savedProfileId}/rotate-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [CONFIG_UNLOCK_HEADER]: unlockToken,
        },
        body: JSON.stringify({ newPassword: rotationPassword }),
      });
      if (res.status === 401) {
        clearUnlockState();
        setProfileNotice('Unlock expired. Enter your password again.');
        setRotationNotice(null);
        return;
      }
      if (!res.ok) {
        setRotationNotice(await readErrorMessage(res, 'Unable to rotate the profile password.'));
        return;
      }

      const data = (await res.json()) as { token: string; expiresAt: number };
      setConfigProfileUnlockSession({
        profileId: savedProfileId,
        token: data.token,
        expiresAt: data.expiresAt,
      });
      setRotationPassword('');
      setRotationPasswordConfirm('');
      setRotationNotice('Profile password rotated.');
      setProfileNotice('Unlock token refreshed with the new password.');
      await loadProfileStatus(savedProfileId);
    } finally {
      setIsRotatingPassword(false);
    }
  }, [
    clearUnlockState,
    isUnlocked,
    loadProfileStatus,
    rotationPassword,
    rotationPasswordConfirm,
    savedProfileId,
    setConfigProfileUnlockSession,
    unlockToken,
  ]);

  const handleForgetProfile = useCallback(() => {
    clearUnlockState();
    setProfileStatus(null);
    onProfileIdChange(null);
  }, [clearUnlockState, onProfileIdChange]);

  const handleOpenRestoreModal = useCallback(() => {
    setProfileNotice(null);
    setRestoreProfileId(
      pendingRestoreProfileId
      || (savedProfileId && !LEGACY_CONFIG_ID_RE.test(savedProfileId) ? savedProfileId : ''),
    );
    setRestoreModalOpen(true);
  }, [pendingRestoreProfileId, savedProfileId]);

  const handleCloseRestoreModal = useCallback(() => {
    setRestoreModalOpen(false);
    onClearPendingRestore?.();
  }, [onClearPendingRestore]);

  const handleRestoreProfile = useCallback(async () => {
    const nextProfileId = restoreProfileId.trim();
    if (!isProtectedConfigProfileId(nextProfileId)) {
      setProfileNotice('Enter a valid saved profile ID.');
      return;
    }
    if (!accessPassword.trim()) {
      setProfileNotice('Enter your profile password to open this profile.');
      return;
    }

    setIsUnlocking(true);
    try {
      const status = await loadProfileStatus(nextProfileId, { clearActiveProfileOnMissing: false });
      if (!status) {
        setProfileNotice('Saved profile not found.');
        return;
      }

      onProfileIdChange(nextProfileId);
      const restored = await unlockProtectedProfile(nextProfileId, accessPassword);
      if (!restored) {
        return;
      }

      await loadProfileStatus(nextProfileId);
      setRestoreModalOpen(false);
      onClearPendingRestore?.();
      setAccessPassword('');
      setProfileNotice('Saved profile opened on this device.');
    } finally {
      setIsUnlocking(false);
    }
  }, [accessPassword, loadProfileStatus, onClearPendingRestore, onProfileIdChange, restoreProfileId, unlockProtectedProfile]);

  const handleCopyFragment = useCallback(() => {
    if (!savedProfileId || isLegacyId) return;
    void navigator.clipboard.writeText(`?config=${savedProfileId}`);
    if (fragmentTimerRef.current) clearTimeout(fragmentTimerRef.current);
    setFragmentCopied(true);
    fragmentTimerRef.current = setTimeout(() => setFragmentCopied(false), 1500);
  }, [isLegacyId, savedProfileId]);

  const handleSaveClick = useCallback(() => {
    if (!savedProfileId) {
      void handleSave();
      return;
    }
    if (isLegacyId) {
      void handleMigrate();
      return;
    }
    if (!isUnlocked) {
      setProfileNotice('Unlock this profile before saving updates.');
      return;
    }
    if (!savedConfigSnapshot.current) return;
    const currentParams = buildSaveParams() ?? {};
    const savedParams = buildSnapshotParams(savedConfigSnapshot.current);
    const diff = computeParamDiff(currentParams, savedParams);
    if (diff.totalChanged === 0) return;
    setModalMode('save');
    setRevertDiff(diff);
    setShowRevertModal(true);
  }, [buildSaveParams, handleMigrate, handleSave, isLegacyId, isUnlocked, savedProfileId]);

  const handleRevertClick = useCallback(() => {
    if (!savedConfigSnapshot.current) return;
    const currentParams = buildSaveParams() ?? {};
    const savedParams = buildSnapshotParams(savedConfigSnapshot.current);
    const diff = computeParamDiff(currentParams, savedParams);
    if (diff.totalChanged === 0) return;
    setModalMode('revert');
    setRevertDiff(diff);
    setShowRevertModal(true);
  }, [buildSaveParams]);

  const handleConfirm = useCallback(() => {
    if (modalMode === 'save') {
      void handleSave();
      setShowRevertModal(false);
      setRevertDiff(null);
      return;
    }
    if (!savedConfigSnapshot.current) return;
    const params = buildSnapshotParams(savedConfigSnapshot.current);
    applySnapshot(params);
    setShowRevertModal(false);
    setRevertDiff(null);
  }, [applySnapshot, modalMode, handleSave]);

  const handleRevertCancel = useCallback(() => {
    setShowRevertModal(false);
    setRevertDiff(null);
  }, []);

  const handleKeepWebChanges = useCallback(async () => {
    if (!profileLoginConflictState) {
      return;
    }

    setIsResolvingProfileLoginConflict(true);
    try {
      const res = await fetch(`/api/config/${profileLoginConflictState.profileId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          [CONFIG_UNLOCK_HEADER]: profileLoginConflictState.token,
        },
        body: JSON.stringify(profileLoginConflictState.localParams),
      });
      if (res.status === 401) {
        clearUnlockState();
        setProfileNotice('Unlock expired. Enter your password again.');
        return;
      }
      if (!res.ok) {
        setProfileNotice(await readErrorMessage(res, 'Unable to update the saved profile.'));
        return;
      }

      applySnapshot(profileLoginConflictState.localParams, { applyToWorkspace: false });
      setProfileLoginConflictState(null);
      setProfileNotice('Web changes saved to profile.');
      await loadProfileStatus(profileLoginConflictState.profileId);
    } finally {
      setIsResolvingProfileLoginConflict(false);
    }
  }, [applySnapshot, clearUnlockState, loadProfileStatus, profileLoginConflictState]);

  const handleLoadProfileConfig = useCallback(() => {
    if (!profileLoginConflictState) {
      return;
    }

    applySnapshot(profileLoginConflictState.profileParams);
    setProfileLoginConflictState(null);
    setProfileNotice('Saved profile loaded.');
  }, [applySnapshot, profileLoginConflictState]);

  const handleCancelProfileConflict = useCallback(() => {
    setProfileLoginConflictState(null);
    setProfileNotice('Profile load canceled. Current web changes are still active.');
  }, []);

  const showRevertButton = hasUnsavedChanges && savedConfigSnapshot.current !== null;
  const showPasswordSetup = !savedProfileId || isLegacyId;
  const showUnlockControls = Boolean(savedProfileId && !isLegacyId && !isUnlocked);
  const showRotationControls = Boolean(savedProfileId && !isLegacyId && isUnlocked);
  const lockedUntil = profileStatus?.lockedUntil ?? null;
  const lockedCountdown = typeof lockedUntil === 'number' && lockedUntil > Date.now()
    ? formatCountdown(lockedUntil - Date.now())
    : null;

  return (
    <>
      {restoreModalOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm" onClick={handleCloseRestoreModal}>
          <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_54%),linear-gradient(180deg,rgba(12,10,20,0.98),rgba(6,5,12,0.98))] p-6 shadow-[0_40px_120px_-55px_rgba(0,0,0,0.95)]" onClick={(event) => event.stopPropagation()}>
            <div className="space-y-2">
              <div className="text-lg font-semibold tracking-tight text-white">Open saved profile</div>
              <p className="text-[13px] leading-relaxed text-zinc-400">
                Enter your UUID profile and password to load the same saved setup on this device.
              </p>
            </div>
            <div className="mt-5 space-y-3">
              <label className="space-y-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Profile ID</span>
                <input
                  type="text"
                  value={restoreProfileId}
                  onChange={(event) => setRestoreProfileId(event.target.value)}
                  placeholder="550e8400-e29b-41d4-a716-446655440000"
                  className="w-full rounded-2xl border border-white/10 bg-black/70 px-4 py-3 text-[13px] text-white placeholder:text-zinc-500 outline-none focus:border-cyan-500/50"
                />
              </label>
              <SensitiveField
                label="Profile password"
                value={accessPassword}
                onChange={setAccessPassword}
                placeholder="Enter password"
                revealed={showRestorePassword}
                onToggleReveal={() => setShowRestorePassword((current) => !current)}
                inputClassName="w-full rounded-2xl border border-white/10 bg-black/70 px-4 py-3 text-[13px] text-white placeholder:text-zinc-500 outline-none focus:border-cyan-500/50"
              />
            </div>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseRestoreModal}
                className="rounded-xl px-5 py-2 text-[13px] font-semibold text-zinc-400 transition-colors hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRestoreProfile()}
                disabled={isUnlocking || !restoreProfileId.trim() || !accessPassword.trim()}
                className={`rounded-xl px-5 py-2 text-[13px] font-semibold transition-colors ${
                  !isUnlocking && restoreProfileId.trim() && accessPassword.trim()
                    ? 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                {isUnlocking ? 'Opening...' : 'Open profile'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showRevertModal && revertDiff && (
        <RevertDiffModal
          diff={revertDiff.entries}
          totalChanged={revertDiff.totalChanged}
          confirmLabel={modalMode === 'save' ? 'Save changes' : undefined}
          onConfirm={handleConfirm}
          onCancel={handleRevertCancel}
        />
      )}
      {profileLoginConflictState ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm" onClick={handleCancelProfileConflict}>
          <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_54%),linear-gradient(180deg,rgba(12,10,20,0.98),rgba(6,5,12,0.98))] p-6 shadow-[0_40px_120px_-55px_rgba(0,0,0,0.95)]" onClick={(event) => event.stopPropagation()}>
            <div className="space-y-2">
              <div className="text-lg font-semibold tracking-tight text-white">Keep web changes or load saved profile</div>
              <p className="text-[13px] leading-relaxed text-zinc-400">
                Local web changes and saved profile values are different. Choose which one to keep.
              </p>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-3 text-[12px] text-zinc-300">
              {profileLoginConflictState.diff.totalChanged} setting{profileLoginConflictState.diff.totalChanged === 1 ? '' : 's'} differ.
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelProfileConflict}
                disabled={isResolvingProfileLoginConflict}
                className="rounded-xl px-5 py-2 text-[13px] font-semibold text-zinc-400 transition-colors hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void handleLoadProfileConfig(); }}
                disabled={isResolvingProfileLoginConflict}
                className="rounded-xl border border-white/15 px-5 py-2 text-[13px] font-semibold text-zinc-200 transition-colors hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:border-white/5 disabled:text-zinc-600"
              >
                Load saved profile
              </button>
              <button
                type="button"
                onClick={() => { void handleKeepWebChanges(); }}
                disabled={isResolvingProfileLoginConflict}
                className={`rounded-xl px-5 py-2 text-[13px] font-semibold transition-colors ${
                  isResolvingProfileLoginConflict
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
                }`}
              >
                {isResolvingProfileLoginConflict ? 'Saving...' : 'Keep web changes'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="xrdb-panel rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <BookmarkPlus className="w-4 h-4 text-violet-500" /> Saved Config Profile
          {hasUnsavedChanges && savedConfigSnapshot.current !== null && (
            <span className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-wide">
              unsaved changes
            </span>
          )}
        </h2>
        <p className="text-[13px] leading-5 text-zinc-400">
          Save the current artwork configuration used by saved profile URLs as a reusable ID for any device. Workspace, proxy, and export-only controls stay local to this browser. Use Open saved profile to load the same setup somewhere else, then append{' '}
          <span className="font-mono text-[12px] bg-zinc-900 px-1 rounded text-zinc-300">?config=&lt;id&gt;</span>{' '}
          to any image URL to apply this profile.
        </p>
        {!canSaveProfile && (
          <p className="text-[12px] leading-4 text-amber-400/90">
            Configure server TMDB and MDBList keys to save a profile.
          </p>
        )}
        {expiredBanner && (
          <div className="rounded-xl border border-orange-500/30 bg-orange-950/20 p-3">
            <p className="text-[12px] text-orange-300">
              Your saved profile expired and was removed. Save a new profile to continue using config URLs.
            </p>
          </div>
        )}
        {migrationCompleteBanner && (
          <div className="rounded-xl border border-green-500/30 bg-green-950/20 p-3 space-y-1">
            <p className="text-[12px] font-semibold text-green-300">Profile migrated successfully</p>
            <p className="text-[11px] text-green-400/80 leading-4">
              Your previous profile stored settings in an older format. This configurator now exports only the new UUID backed profile ID.
            </p>
          </div>
        )}
        {lockedCountdown && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3">
            <p className="text-[12px] text-rose-300">
              This profile is locked after repeated password attempts. Try again when the cooldown ends. <span className="font-semibold">{lockedCountdown}</span>
            </p>
          </div>
        )}
        {profileNotice && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-3">
            <p className="text-[12px] text-zinc-300">{profileNotice}</p>
          </div>
        )}
        {showPasswordSetup && (
          <div className="grid gap-3 md:grid-cols-2">
            <SensitiveField
              label={savedProfileId ? 'New profile password' : 'Profile password'}
              value={accessPassword}
              onChange={setAccessPassword}
              placeholder="At least 8 characters"
              revealed={showAccessPasswordFields}
              onToggleReveal={() => setShowAccessPasswordFields((current) => !current)}
              inputClassName="w-full rounded-xl border border-white/10 bg-black/70 px-3 py-2.5 text-[13px] text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50"
            />
            <SensitiveField
              label="Confirm password"
              value={accessPasswordConfirm}
              onChange={setAccessPasswordConfirm}
              placeholder="Repeat password"
              revealed={showAccessPasswordFields}
              onToggleReveal={() => setShowAccessPasswordFields((current) => !current)}
              inputClassName="w-full rounded-xl border border-white/10 bg-black/70 px-3 py-2.5 text-[13px] text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50"
            />
          </div>
        )}
        {showUnlockControls && (
          <div className="space-y-3 rounded-xl border border-white/10 bg-black/40 p-3">
            <div>
              <div className="text-[12px] font-semibold text-zinc-200">Unlock management</div>
              <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                Enter the profile password to reveal the saved settings, update this UUID profile, rotate its password, or delete it.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <SensitiveField
                label="Profile password"
                value={accessPassword}
                onChange={setAccessPassword}
                placeholder="Enter password"
                revealed={showAccessPasswordFields}
                onToggleReveal={() => setShowAccessPasswordFields((current) => !current)}
                inputClassName="w-full rounded-xl border border-white/10 bg-black/70 px-3 py-2.5 text-[13px] text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50"
              />
              <button
                type="button"
                onClick={() => void handleUnlock()}
                disabled={isUnlocking || !accessPassword.trim() || Boolean(lockedCountdown)}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                  !isUnlocking && accessPassword.trim() && !lockedCountdown
                    ? 'bg-violet-600 text-white hover:bg-violet-500'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                {isUnlocking ? 'Unlocking...' : 'Unlock'}
              </button>
            </div>
            {typeof profileStatus?.failedAttempts === 'number' && profileStatus.failedAttempts > 0 && !profileStatus.isLocked && (
              <p className="text-[11px] text-amber-400/90">
                Failed attempts: {profileStatus.failedAttempts} of 5 before cooldown.
              </p>
            )}
          </div>
        )}
        {showRotationControls && (
          <div className="space-y-3 rounded-xl border border-white/10 bg-black/40 p-3">
            <div>
              <div className="text-[12px] font-semibold text-zinc-200">Profile unlocked</div>
              <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                Management access remains active. {unlockExpiresAt ? formatCountdown(unlockExpiresAt - Date.now()) : 'Expires soon.'}
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <SensitiveField
                label="New password"
                value={rotationPassword}
                onChange={setRotationPassword}
                placeholder="At least 8 characters"
                revealed={showRotationPasswordFields}
                onToggleReveal={() => setShowRotationPasswordFields((current) => !current)}
                inputClassName="w-full rounded-xl border border-white/10 bg-black/70 px-3 py-2.5 text-[13px] text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50"
              />
              <SensitiveField
                label="Confirm new password"
                value={rotationPasswordConfirm}
                onChange={setRotationPasswordConfirm}
                placeholder="Repeat new password"
                revealed={showRotationPasswordFields}
                onToggleReveal={() => setShowRotationPasswordFields((current) => !current)}
                inputClassName="w-full rounded-xl border border-white/10 bg-black/70 px-3 py-2.5 text-[13px] text-white placeholder:text-zinc-500 outline-none focus:border-violet-500/50"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleRotatePassword()}
                disabled={isRotatingPassword}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                  !isRotatingPassword
                    ? 'border border-white/15 text-zinc-300 hover:text-white'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5'
                }`}
              >
                {isRotatingPassword ? 'Rotating...' : 'Rotate password'}
              </button>
              {rotationNotice && <span className="text-[11px] text-zinc-500">{rotationNotice}</span>}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenRestoreModal}
            className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-100 transition-colors hover:border-cyan-300/50 hover:bg-cyan-400/15"
          >
            Open saved profile
          </button>
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={
              !canSaveProfile
              || isSaving
              || (savedProfileId !== null && !isLegacyId && !hasUnsavedChanges)
              || (savedProfileId !== null && isLegacyId && isMigrating)
            }
            className={`rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-2 transition-colors ${
              canSaveProfile
              && !isSaving
              && (!savedProfileId || isLegacyId || hasUnsavedChanges)
                ? 'bg-violet-600 text-white hover:bg-violet-500'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span>
              {isSaving
                ? 'Saving...'
                : isMigrating
                  ? 'Migrating...'
                  : savedProfileId
                    ? isLegacyId
                      ? 'Migrate to protected profile'
                      : 'Update saved profile'
                    : 'Save protected profile'}
            </span>
          </button>
          {showRevertButton && (
            <button
              type="button"
              onClick={handleRevertClick}
              className="rounded-full px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-amber-500/30 text-amber-400 hover:text-amber-300 hover:border-amber-500/50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Revert to saved</span>
            </button>
          )}
          {savedProfileId && !isLegacyId && (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={isSaving}
              className="rounded-full px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-red-500/30 text-red-400 hover:text-red-300 hover:border-red-500/50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete profile</span>
            </button>
          )}
          {savedProfileId && isLegacyId && (
            <button
              type="button"
              onClick={handleForgetProfile}
              className="rounded-full px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-white/10 text-zinc-400 hover:text-zinc-300 hover:border-white/20"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Forget local reference</span>
            </button>
          )}
        </div>
        {savedProfileId && (
          <div className="space-y-2">
            {isLegacyId && countdown && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 space-y-2">
                <p className="text-[12px] font-semibold text-amber-300">Profile security upgrade required</p>
                <p className="text-[11px] text-amber-400/80 leading-4">
                  This profile uses an older ID format. Migrate to a secure profile before it expires.{' '}
                  <span className="font-semibold">{countdown}</span>
                </p>
                <button
                  type="button"
                  onClick={() => void handleMigrate()}
                  disabled={isMigrating || !canSaveProfile}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
                    !isMigrating && canSaveProfile
                      ? 'bg-amber-500 text-black hover:bg-amber-400'
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  {isMigrating ? 'Migrating...' : 'Migrate now'}
                </button>
              </div>
            )}
            <div className="rounded-xl border border-white/10 bg-black/40 p-3 min-w-0">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-[12px] font-semibold text-zinc-200">Profile ID</div>
                <button
                  type="button"
                  onClick={handleCopyFragment}
                  disabled={isLegacyId}
                  className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium flex items-center gap-1.5 transition-all ${
                    fragmentCopied
                      ? 'border-green-500/60 bg-green-500 text-white'
                      : isLegacyId
                        ? 'border-white/5 bg-zinc-950 text-zinc-600 cursor-not-allowed'
                        : 'border-white/15 text-zinc-300 hover:text-white'
                  }`}
                >
                  {fragmentCopied ? (
                    <><Check className="w-3 h-3" /> Copied</>
                  ) : (
                    <><Clipboard className="w-3 h-3" /> {isLegacyId ? 'Migrate to copy' : 'Copy UUID link'}</>
                  )}
                </button>
              </div>
              <div className="font-mono text-[11px] text-zinc-300 bg-zinc-950/80 rounded-lg border border-white/10 p-3 break-all">
                {savedProfileId}
              </div>
              {isLegacyId && (
                <p className="mt-2 text-[11px] leading-4 text-zinc-500">
                  Legacy profile IDs stay readable during migration, but new exports now copy only the protected UUID format.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ExportOptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-semibold text-zinc-300 mb-2">{label}</div>
      {children}
    </div>
  );
}

function OptionPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
        active
          ? 'border-violet-500/60 bg-zinc-800 text-white'
          : 'border-white/10 bg-zinc-950 text-zinc-400 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

function CompactPreview({
  previewType,
  onSelectPreviewType,
  previewUrl,
  previewErrored,
  tmdbKeyPresent,
  onPreviewImageError,
  onPreviewImageLoad,
  activeTypeLabel,
}: {
  previewType: PreviewType;
  onSelectPreviewType: (value: PreviewType) => void;
  previewUrl: string;
  previewErrored: boolean;
  tmdbKeyPresent: boolean;
  onPreviewImageError: (url: string) => void | Promise<void>;
  onPreviewImageLoad: (url: string) => void;
  activeTypeLabel: string;
}) {
  return (
    <div className="xrdb-panel rounded-2xl p-4 space-y-3">
      <div className="rounded-xl border border-white/10 bg-black/70 p-3 min-h-[200px] flex items-center justify-center">
        {previewUrl && !previewErrored ? (
          <div
            className={`relative shadow-xl shadow-black ring-1 ring-white/10 rounded-xl overflow-hidden ${
              previewType === 'poster'
                ? 'aspect-[2/3] w-full max-w-[14rem]'
                : previewType === 'logo'
                  ? 'h-32 w-full max-w-xs'
                  : 'aspect-video w-full max-w-sm'
            }`}
          >
            <Image
              key={previewUrl}
              src={previewUrl}
              alt="Preview"
              unoptimized
              fill
              className={previewType === 'logo' ? 'object-contain' : 'object-cover'}
              onLoad={() => { onPreviewImageLoad(previewUrl); }}
              onError={() => { void onPreviewImageError(previewUrl); }}
            />
          </div>
        ) : (
          <div className="text-center text-[13px] text-zinc-500">
            {tmdbKeyPresent ? 'No preview available.' : 'Configure a server TMDB key to unlock preview.'}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {(['poster', 'backdrop', 'thumbnail', 'logo'] as const).map((type) => (
          <button
            key={`export-preview-${type}`}
            type="button"
            onClick={() => onSelectPreviewType(type)}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
              previewType === type
                ? 'border-violet-500/60 bg-zinc-800 text-white'
                : 'border-white/10 bg-zinc-950 text-zinc-400 hover:text-white'
            }`}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
