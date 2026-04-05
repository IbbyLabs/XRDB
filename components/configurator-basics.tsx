'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownToLine, ArrowUpFromLine, ChevronRight, Globe2, Layers, Link2, Pin, PinOff, Save, Shuffle, Trash2, X } from 'lucide-react';
import type { MediaSearchItem, PinnedTarget } from '@/lib/configuratorMediaSearch';
import { isMediaIdPattern } from '@/lib/configuratorMediaSearch';
import Link from 'next/link';
import {
  buildEpisodePreviewMediaTarget,
  parseEpisodePreviewMediaTarget,
} from '@/lib/episodeIdentity';

import type {
  ConfiguratorExperienceMode,
} from '@/lib/configuratorPresets';
import type { SupportedLanguageOption } from '@/lib/configuratorPageOptions';
import type { TmdbIdScopeMode } from '@/lib/uiConfig';

type ProxyType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';

function ThemedDropdown({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SupportedLanguageOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedOptionRef = useRef<HTMLButtonElement | null>(null);
  const listboxId = useId();
  const activeOption =
    options.find((option) => option.code === value) ||
    options.find((option) => option.code === 'en') ||
    options[0] ||
    null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      selectedOptionRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen]);

  if (!activeOption) {
    return null;
  }

  return (
    <div ref={rootRef} className="relative w-[12.5rem] max-w-full">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={label}
        onClick={() => setIsOpen((current) => !current)}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-[linear-gradient(180deg,rgba(38,22,66,0.96),rgba(14,9,26,0.98))] px-3 py-2.5 text-left shadow-[0_14px_32px_rgba(8,5,16,0.28)] outline-none transition-all ${
          isOpen
            ? 'border-violet-300/45 text-white'
            : 'border-violet-400/20 text-zinc-100 hover:border-violet-300/30'
        } focus-visible:border-violet-300/45`}
      >
        <span className="min-w-0">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-violet-200/70">Selected language</span>
          <span className="mt-1 flex min-w-0 items-center gap-2 text-xs font-semibold">
            <span className="shrink-0 text-sm leading-none">{activeOption.flag}</span>
            <span className="truncate">{activeOption.label}</span>
          </span>
        </span>
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 stroke-[2.25] text-violet-200/70 transition-transform ${
            isOpen ? 'rotate-90' : ''
          }`}
        />
      </button>
      {isOpen ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-[15.5rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-violet-400/20 bg-[linear-gradient(180deg,rgba(31,18,52,0.98),rgba(11,8,22,0.98))] shadow-[0_28px_72px_rgba(6,4,14,0.62)] backdrop-blur-xl">
          <div className="border-b border-white/8 px-3 py-2">
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-violet-200/75">
              {label}
            </div>
          </div>
          <div id={listboxId} role="listbox" aria-label={label} className="max-h-80 overflow-y-auto p-1.5">
            {options.map((option) => {
              const isSelected = option.code === activeOption.code;
              return (
                <button
                  key={option.code}
                  ref={isSelected ? selectedOptionRef : null}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(option.code);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                    isSelected
                      ? 'bg-violet-500/20 text-white'
                      : 'text-zinc-300 hover:bg-white/6 hover:text-white'
                  }`}
                >
                  <span className="shrink-0 text-sm leading-none">{option.flag}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{option.label}</span>
                  {isSelected ? (
                    <span className="rounded-full border border-violet-300/25 bg-violet-500/18 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-violet-100">
                      Current
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SetupModeSection({
  experienceMode,
  onOpenIntro,
  onSelectExperienceMode,
}: {
  experienceMode: ConfiguratorExperienceMode;
  onOpenIntro: () => void;
  onSelectExperienceMode: (mode: ConfiguratorExperienceMode) => void;
}) {
  return (
    <section className="relative isolate overflow-hidden rounded-2xl border border-violet-500/20 bg-[linear-gradient(180deg,rgba(32,20,54,0.92),rgba(16,10,28,0.98))]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(130%_90%_at_0%_0%,rgba(139,92,246,0.2),transparent_58%),radial-gradient(120%_80%_at_100%_100%,rgba(56,189,248,0.1),transparent_62%)]" />
      <div className="relative z-10 flex flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Setup Mode
          </div>
          <h4 className="mt-1 text-sm font-semibold text-white">
            {experienceMode === 'simple' ? 'Simple is active' : 'Advanced is active'}
          </h4>
          <p className="mt-0.5 max-w-2xl text-[11px] leading-5 text-zinc-500">
            Switch between the tighter presets first surface and the full XRDB control stack.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenIntro}
          className="shrink-0 self-start rounded-full border border-white/10 bg-black px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300 transition-colors hover:border-white/20 hover:bg-zinc-900"
        >
          Reopen Intro
        </button>
      </div>
      <div className="relative z-10 grid gap-2 border-t border-white/10 px-4 py-3 md:grid-cols-2">
        {([
          {
            id: 'simple',
            label: 'Simple',
            description: 'Presets, keys, targets, and the highest signal artwork controls stay in view.',
          },
          {
            id: 'advanced',
            label: 'Advanced',
            description: 'Full access to provider ordering, layout tuning, badge controls, and manual overrides.',
          },
        ] as const).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelectExperienceMode(option.id)}
            className={`group rounded-xl border px-3 py-3 text-left transition-colors ${
              experienceMode === option.id
                ? 'border-violet-500/70 bg-violet-500/12 text-white'
                : 'border-white/10 bg-black text-zinc-300 hover:border-white/20 hover:bg-zinc-900'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">{option.label}</div>
              </div>
              <span
                className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                  experienceMode === option.id
                    ? 'border-violet-400/40 bg-violet-500/20 text-violet-100'
                    : 'border-white/10 bg-white/5 text-zinc-500 transition-colors group-hover:text-zinc-300'
                }`}
              >
                {experienceMode === option.id ? 'Active' : 'Switch'}
              </span>
            </div>
            <p
              className={`mt-2 text-[11px] leading-5 ${
                experienceMode === option.id ? 'text-zinc-200/90' : 'text-zinc-500'
              }`}
            >
              {option.description}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}

export function WorkspaceManagementSection({
  workspaceImportInputRef,
  onImportWorkspace,
  onOpenImportLinkModal,
  onCloseImportLinkModal,
  onImportLinkValueChange,
  onSubmitImportLink,
  importLinkModalOpen,
  importLinkValue,
  onSaveWorkspace,
  onDownloadWorkspace,
  onPromptWorkspaceImport,
  onClearSavedWorkspace,
  configAutoSave,
  onToggleConfigAutoSave,
  savedConfigStatus,
}: {
  workspaceImportInputRef: RefObject<HTMLInputElement | null>;
  onImportWorkspace: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenImportLinkModal: () => void;
  onCloseImportLinkModal: () => void;
  onImportLinkValueChange: (value: string) => void;
  onSubmitImportLink: () => void;
  importLinkModalOpen: boolean;
  importLinkValue: string;
  onSaveWorkspace: () => void;
  onDownloadWorkspace: () => void;
  onPromptWorkspaceImport: () => void;
  onClearSavedWorkspace: () => void;
  configAutoSave: boolean;
  onToggleConfigAutoSave: (event: ChangeEvent<HTMLInputElement>) => void;
  savedConfigStatus: string | null;
}) {
  const importLinkInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (importLinkModalOpen) {
      requestAnimationFrame(() => importLinkInputRef.current?.focus());
    }
  }, [importLinkModalOpen]);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2">
        <Layers className="w-4 h-4 text-violet-500" /> Workspace
      </h2>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Save settings to this browser or export them as JSON. Paste a shared XRDB URL with Import link to apply the same settings here.
      </p>
      <input
        ref={workspaceImportInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={onImportWorkspace}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSaveWorkspace}
          className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-3.5 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-500 transition-colors"
        >
          <Save className="w-3 h-3" />
          Save
        </button>
        <button
          type="button"
          onClick={onDownloadWorkspace}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
        >
          <ArrowDownToLine className="w-3 h-3" />
          Download JSON
        </button>
        <button
          type="button"
          onClick={onPromptWorkspaceImport}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
        >
          <ArrowUpFromLine className="w-3 h-3" />
          Import JSON
        </button>
        <button
          type="button"
          onClick={onOpenImportLinkModal}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Link2 className="w-3 h-3" />
          Import link
        </button>
        <button
          type="button"
          onClick={onClearSavedWorkspace}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-semibold text-zinc-400 hover:bg-white/10 hover:text-zinc-300 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Clear
        </button>
        <label className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-semibold text-zinc-300 cursor-pointer hover:bg-white/10 transition-colors">
          <input
            type="checkbox"
            checked={configAutoSave}
            onChange={onToggleConfigAutoSave}
            className="h-3 w-3 accent-violet-500"
          />
          <span>Auto save</span>
        </label>
      </div>
      {savedConfigStatus ? (
        <div
          className={`text-[11px] font-medium ${
            savedConfigStatus === 'error' || savedConfigStatus === 'invalid'
              ? 'text-rose-400'
              : 'text-zinc-500'
          }`}
        >
          {savedConfigStatus === 'loaded'
            ? 'Saved workspace loaded.'
            : savedConfigStatus === 'saved'
              ? 'Workspace saved.'
              : savedConfigStatus === 'cleared'
                ? 'Saved workspace cleared.'
                : savedConfigStatus === 'imported'
                  ? 'Workspace imported.'
                  : savedConfigStatus === 'preset'
                    ? 'Preset applied.'
                    : savedConfigStatus === 'invalid'
                      ? 'Invalid workspace import.'
                      : 'Unable to access local storage.'}
        </div>
      ) : null}
      {importLinkModalOpen ? createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm" onClick={onCloseImportLinkModal}>
          <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(12,10,20,0.98),rgba(6,5,12,0.98))] p-6 shadow-[0_40px_120px_-55px_rgba(0,0,0,0.95)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10">
                <Link2 className="w-4 h-4 text-violet-300" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight text-white">Import from link</h3>
            </div>
            <p className="text-[13px] leading-relaxed text-zinc-400 mb-4">Paste a shared XRDB URL to apply the same settings to your workspace.</p>
            <input
              ref={importLinkInputRef}
              type="text"
              value={importLinkValue}
              onChange={(event) => onImportLinkValueChange(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') onSubmitImportLink(); if (event.key === 'Escape') onCloseImportLinkModal(); }}
              placeholder="https://..."
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-[13px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-violet-500/40 focus:bg-white/[0.07] transition-colors"
            />
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCloseImportLinkModal}
                className="rounded-xl px-5 py-2 text-[13px] font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmitImportLink}
                disabled={!importLinkValue.trim()}
                className={`rounded-xl px-5 py-2 text-[13px] font-semibold transition-colors ${
                  importLinkValue.trim()
                    ? 'bg-violet-600 text-white hover:bg-violet-500'
                    : 'bg-white/5 text-zinc-600 cursor-not-allowed'
                }`}
              >
                Import
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

export function AccessKeysSection({
  xrdbKey,
  tmdbKey,
  mdblistKey,
  fanartKey,
  simklClientId,
  tmdbIdScope,
  onXrdbKeyChange,
  onTmdbKeyChange,
  onMdblistKeyChange,
  onFanartKeyChange,
  onSimklClientIdChange,
  onTmdbIdScopeChange,
  tmdbIdScopeOptions,
  xrdbRequestKeyHelpCopy,
  fanartKeyHelpCopy,
}: {
  xrdbKey: string;
  tmdbKey: string;
  mdblistKey: string;
  fanartKey: string;
  simklClientId: string;
  tmdbIdScope: TmdbIdScopeMode;
  onXrdbKeyChange: (value: string) => void;
  onTmdbKeyChange: (value: string) => void;
  onMdblistKeyChange: (value: string) => void;
  onFanartKeyChange: (value: string) => void;
  onSimklClientIdChange: (value: string) => void;
  onTmdbIdScopeChange: (value: TmdbIdScopeMode) => void;
  tmdbIdScopeOptions: Array<{
    id: TmdbIdScopeMode;
    label: string;
    description: string;
  }>;
  xrdbRequestKeyHelpCopy: string;
  fanartKeyHelpCopy: string;
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold text-zinc-400">Access Keys</div>
      <div className="grid gap-2 md:grid-cols-5">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">XRDB Request</label>
          <input type="password" value={xrdbKey} onChange={(event) => onXrdbKeyChange(event.target.value)} placeholder="Optional key" className="w-full max-w-[20rem] rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs leading-5 text-white outline-none focus:border-violet-500/50" />
        </div>
        <div>
          <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-violet-300 hover:text-violet-200">TMDB</a>
          <input type="password" value={tmdbKey} onChange={(event) => onTmdbKeyChange(event.target.value)} placeholder="v3 Key" className="w-full max-w-[20rem] rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs leading-5 text-white outline-none focus:border-violet-500/50" />
        </div>
        <div>
          <a href="https://mdblist.com/preferences/" target="_blank" rel="noreferrer" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-violet-300 hover:text-violet-200">MDBList</a>
          <input type="password" value={mdblistKey} onChange={(event) => onMdblistKeyChange(event.target.value)} placeholder="Key" className="w-full max-w-[20rem] rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs leading-5 text-white outline-none focus:border-violet-500/50" />
        </div>
        <div>
          <a href="https://fanart.tv/get-an-api-key/" target="_blank" rel="noreferrer" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-violet-300 hover:text-violet-200">Fanart</a>
          <input type="password" value={fanartKey} onChange={(event) => onFanartKeyChange(event.target.value)} placeholder="Optional key" className="w-full max-w-[20rem] rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs leading-5 text-white outline-none focus:border-violet-500/50" />
        </div>
        <div>
          <a href="https://simkl.com/settings/developer/" target="_blank" rel="noreferrer" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-violet-300 hover:text-violet-200">SIMKL</a>
          <input type="password" value={simklClientId} onChange={(event) => onSimklClientIdChange(event.target.value)} placeholder="Optional key" className="w-full max-w-[20rem] rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs leading-5 text-white outline-none focus:border-violet-500/50" />
        </div>
      </div>
      <div className="mt-3">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">TMDB ID Scope</label>
        <div className="grid gap-2 md:grid-cols-2">
          {tmdbIdScopeOptions.map((option) => {
            const isActive = tmdbIdScope === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onTmdbIdScopeChange(option.id)}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  isActive
                    ? 'border-violet-500/70 bg-violet-500/12 text-white'
                    : 'border-white/10 bg-black text-zinc-300 hover:border-white/20 hover:bg-zinc-900'
                }`}
              >
                <div className="font-semibold">{option.label}</div>
                <div className="mt-0.5 text-[11px] text-zinc-400">{option.description}</div>
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        {xrdbRequestKeyHelpCopy}
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        Soft is recommended for compatibility. Switch to Strict if you sometimes see incorrect logo or backdrop artwork from TMDB ID collisions.
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        {fanartKeyHelpCopy}
      </p>
    </div>
  );
}

export function MediaTargetSection({
  previewType,
  mediaId,
  tmdbKey,
  lang,
  supportedLanguages,
  onMediaIdChange,
  onThumbnailEpisodeChange,
  onLangChange,
  mediaSearchQuery,
  mediaSearchLoading,
  mediaSearchError,
  mediaSearchResults,
  activePreviewTitle,
  onMediaSearchQueryChange,
  onMediaSearchSubmit,
  onSelectMediaSearchResult,
  onShuffleMediaTarget,
  pinnedTargets,
  isPinnedLimitReached,
  isPinned,
  onTogglePin,
  onPinSearchResult,
  onRemovePinnedTarget,
  onSelectPinnedTarget,
}: {
  previewType: ProxyType;
  mediaId: string;
  tmdbKey: string;
  lang: string;
  supportedLanguages: SupportedLanguageOption[];
  onMediaIdChange: (value: string) => void;
  onThumbnailEpisodeChange: (value: string) => void;
  onLangChange: (value: string) => void;
  mediaSearchQuery: string;
  mediaSearchLoading: boolean;
  mediaSearchError: string;
  mediaSearchResults: MediaSearchItem[];
  activePreviewTitle: string;
  onMediaSearchQueryChange: (value: string) => void;
  onMediaSearchSubmit: () => void;
  onSelectMediaSearchResult: (result: MediaSearchItem) => void;
  onShuffleMediaTarget: () => void;
  pinnedTargets: PinnedTarget[];
  isPinnedLimitReached: boolean;
  isPinned: (mediaId: string) => boolean;
  onTogglePin: () => void;
  onPinSearchResult: (result: MediaSearchItem) => void;
  onRemovePinnedTarget: (mediaId: string) => void;
  onSelectPinnedTarget: (target: PinnedTarget) => void;
}) {
  const thumbnailTarget =
    previewType === 'thumbnail' ? parseEpisodePreviewMediaTarget(mediaId) : null;
  const thumbnailBaseId = thumbnailTarget ? thumbnailTarget.mediaId : mediaId.trim();
  const thumbnailSeason = thumbnailTarget ? String(thumbnailTarget.seasonNumber) : '1';
  const thumbnailEpisode = thumbnailTarget ? String(thumbnailTarget.episodeNumber) : '1';

  const [localSeason, setLocalSeason] = useState(thumbnailSeason);
  const [localEpisode, setLocalEpisode] = useState(thumbnailEpisode);

  useEffect(() => {
    setLocalSeason(thumbnailSeason);
  }, [thumbnailSeason]);

  useEffect(() => {
    setLocalEpisode(thumbnailEpisode);
  }, [thumbnailEpisode]);

  const [unifiedInput, setUnifiedInput] = useState(mediaId);
  const [inputFocused, setInputFocused] = useState(false);

  const isUnifiedIdMode = isMediaIdPattern(unifiedInput);
  const normalizedMediaSearchQuery = isUnifiedIdMode ? '' : unifiedInput.trim();
  const showSearchDropdown =
    Boolean(tmdbKey) &&
    !isUnifiedIdMode &&
    normalizedMediaSearchQuery.length >= 1 &&
    (mediaSearchLoading || mediaSearchResults.length > 0);

  const handleUnifiedInputChange = (value: string) => {
    setUnifiedInput(value);
    if (isMediaIdPattern(value)) {
      onMediaIdChange(value);
      onMediaSearchQueryChange('');
    } else {
      onMediaSearchQueryChange(value);
    }
  };

  const handleActivateInput = () => {
    setUnifiedInput(activePreviewTitle || mediaId);
    setInputFocused(true);
  };

  const applyThumbnailTarget = ({
    nextSeason,
    nextEpisode,
  }: {
    nextSeason: string;
    nextEpisode: string;
  }) => {
    const nextMediaId = buildEpisodePreviewMediaTarget({
      mediaId: thumbnailBaseId,
      seasonNumber: nextSeason,
      episodeNumber: nextEpisode,
    });
    if (nextMediaId) {
      onThumbnailEpisodeChange(nextMediaId);
    }
  };

  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold text-zinc-400">Search</div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[160px] max-w-[28rem] flex-1">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Search by name or enter ID</span>
          {activePreviewTitle && !inputFocused ? (
            <button
              type="button"
              onClick={handleActivateInput}
              className="flex w-full flex-col rounded-lg border border-white/10 bg-black px-2.5 py-2 text-left"
            >
              <span className="truncate text-xs font-semibold leading-5 text-white">{activePreviewTitle}</span>
              <span className="truncate font-mono text-[10px] leading-4 text-zinc-500">{mediaId}</span>
            </button>
          ) : (
            <input
              type="text"
              autoFocus={inputFocused}
              value={unifiedInput}
              onChange={(event) => handleUnifiedInputChange(event.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !isUnifiedIdMode) {
                  event.preventDefault();
                  onMediaSearchSubmit();
                }
              }}
              placeholder={previewType === 'thumbnail' ? 'Search by name or enter ID (tt0944947:1:1)' : 'Search by name or enter ID'}
              className="w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs leading-5 text-white outline-none focus:border-violet-500/50"
            />
          )}
          {showSearchDropdown ? (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-white/10 bg-zinc-950/95 p-1 shadow-2xl shadow-black/50">
              {mediaSearchLoading ? (
                <div className="rounded-md px-2.5 py-2 text-[11px] text-zinc-400">Searching titles</div>
              ) : (
                mediaSearchResults.map((result) => (
                  <div
                    key={`${result.mediaId}-${result.title}`}
                    className="flex items-start gap-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectMediaSearchResult(result)}
                      className="flex min-w-0 flex-1 items-start gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-zinc-900"
                    >
                      <div className="relative h-[72px] w-12 shrink-0 overflow-hidden rounded-md border border-white/10 bg-zinc-900">
                        {result.posterUrl ? (
                          <div
                            aria-hidden="true"
                            className="h-full w-full bg-cover bg-center"
                            style={{ backgroundImage: `url("${result.posterUrl}")` }}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center px-1 text-center text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            No poster
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-semibold text-zinc-100">{result.title}</div>
                        <div className="mt-0.5 text-[11px] text-zinc-500">{result.subtitle}</div>
                        <div className="mt-1 truncate font-mono text-[10px] text-zinc-400">{result.mediaId}</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onPinSearchResult(result); }}
                      disabled={isPinned(result.mediaId) || isPinnedLimitReached}
                      className="mt-2 shrink-0 rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-violet-400 disabled:opacity-30 disabled:cursor-not-allowed"
                      title={isPinned(result.mediaId) ? 'Already pinned' : 'Pin this target'}
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
        {tmdbKey ? (
          <div className="w-[12.5rem] max-w-full">
            <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500"><Globe2 className="h-3 w-3" /> Lang</span>
            <ThemedDropdown label="Language" options={supportedLanguages} value={lang} onChange={onLangChange} />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black p-2 text-[10px] text-zinc-500">
            <Globe2 className="h-3 w-3 shrink-0" /> Add TMDB key for lang
          </div>
        )}
      </div>
      {previewType === 'thumbnail' ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Season</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={localSeason}
                onChange={(event) => {
                  const raw = event.target.value;
                  setLocalSeason(raw);
                  applyThumbnailTarget({
                    nextSeason: raw,
                    nextEpisode: localEpisode,
                  });
                }}
                className="w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs leading-5 text-white outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Episode</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={localEpisode}
                onChange={(event) => {
                  const raw = event.target.value;
                  setLocalEpisode(raw);
                  applyThumbnailTarget({
                    nextSeason: localSeason,
                    nextEpisode: raw,
                  });
                }}
                className="w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs leading-5 text-white outline-none focus:border-violet-500/50"
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
            Thumbnail previews need an episode target in `seriesId:season:episode` form, for example `tt0944947:1:1` or `tmdb:tv:1399:1:1`.
          </p>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onShuffleMediaTarget}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
          >
            <Shuffle className="h-3.5 w-3.5" />
            Shuffle sample
          </button>
          <button
            type="button"
            onClick={onTogglePin}
            disabled={!mediaId.trim() || (!isPinned(mediaId) && isPinnedLimitReached)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-2 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={isPinned(mediaId) ? 'Unpin this target' : 'Pin this target'}
          >
            {isPinned(mediaId) ? (
              <PinOff className="h-3.5 w-3.5 text-violet-400" />
            ) : (
              <Pin className="h-3.5 w-3.5 text-zinc-400" />
            )}
          </button>
      </div>
      {mediaSearchError ? (
          <p className="mt-2 text-[11px] leading-5 text-rose-300">{mediaSearchError}</p>
        ) : null}
      {pinnedTargets.length > 0 ? (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'thin' }}>
            {pinnedTargets.map((pin) => (
              <button
                key={pin.mediaId}
                type="button"
                onClick={() => onSelectPinnedTarget(pin)}
                className="group inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <span className="max-w-[140px] truncate">{pin.title}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onRemovePinnedTarget(pin.mediaId); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onRemovePinnedTarget(pin.mediaId); } }}
                  className="ml-0.5 rounded-full p-0.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
                >
                  <X className="h-3 w-3" />
                </span>
              </button>
            ))}
          </div>
        ) : null}
      {previewType === 'thumbnail' ? (
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          Thumbnail previews need an episode target in `seriesId:season:episode` form, for example `tt0944947:1:1` or `tmdb:tv:1399:1:1`.
        </p>
      ) : null}
      <div className="mt-4 flex items-center gap-2 text-[11px] text-zinc-500">
        <span>Need help with IDs or route shapes?</span>
        <Link href="/reference#id-formats" className="text-violet-300 underline underline-offset-2 hover:text-violet-200">ID format reference</Link>
      </div>
    </div>
  );
}
