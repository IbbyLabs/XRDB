'use client';

import type { ChangeEvent, RefObject } from 'react';
import { ChevronRight, Globe2, Image as ImageIcon, Layers, MonitorPlay } from 'lucide-react';

import type {
  ConfiguratorExperienceMode,
} from '@/lib/configuratorPresets';
import type { TmdbIdScopeMode } from '@/lib/uiConfig';

type ProxyType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';

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
    <div className="rounded-2xl border border-violet-500/20 bg-[linear-gradient(180deg,rgba(32,20,54,0.92),rgba(16,10,28,0.98))] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200/90">
            Setup Mode
          </div>
          <h4 className="mt-2 text-lg font-semibold text-white">
            {experienceMode === 'simple' ? 'Simple View' : 'Advanced View'}
          </h4>
          <p className="mt-2 max-w-2xl text-[12px] leading-6 text-zinc-400">
            {experienceMode === 'simple'
              ? 'Simple keeps the high signal controls in front of you. Presets, keys, media targeting, and the most visible artwork switches stay easy to reach.'
              : 'Advanced exposes the full XRDB configurator, including provider ordering, sizing, stacked badge tuning, and manual layout controls.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenIntro}
          className="shrink-0 self-start rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-300 hover:bg-black/50"
        >
          Reopen Intro
        </button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {([
          {
            id: 'simple',
            label: 'Simple',
            description: 'Essentials only, tuned around presets and the most visible artwork controls.',
          },
          {
            id: 'advanced',
            label: 'Advanced',
            description: 'Everything in the current configurator, reorganized so the dense controls stay easier to scan.',
          },
        ] as const).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelectExperienceMode(option.id)}
            className={`rounded-2xl border p-4 text-left transition-colors ${
              experienceMode === option.id
                ? 'border-violet-500/60 bg-violet-500/12 text-white'
                : 'border-white/10 bg-black/25 text-zinc-300 hover:border-white/20 hover:bg-black/35'
            }`}
          >
            <div className="flex min-h-[3rem] flex-col items-start gap-2">
              <div className="min-w-0 text-base font-semibold">{option.label}</div>
              <span
                className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                  experienceMode === option.id
                    ? 'bg-violet-500/20 text-violet-100'
                    : 'bg-white/5 text-zinc-500'
                }`}
              >
                {experienceMode === option.id ? 'Active' : 'Switch'}
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-zinc-500">{option.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function WorkspaceManagementSection({
  workspaceImportInputRef,
  onImportWorkspace,
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
  onSaveWorkspace: () => void;
  onDownloadWorkspace: () => void;
  onPromptWorkspaceImport: () => void;
  onClearSavedWorkspace: () => void;
  configAutoSave: boolean;
  onToggleConfigAutoSave: (event: ChangeEvent<HTMLInputElement>) => void;
  savedConfigStatus: string | null;
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold text-zinc-400">Workspace</div>
      <p className="mb-2 text-[11px] text-zinc-500">
        Save the shared XRDB settings plus proxy manifest setup to this browser, or export them as a JSON file.
      </p>
      <p className="mb-2 text-[11px] text-zinc-500">
        Saved workspace values only affect this page. Share the config string or the generated proxy manifest if you want the same settings somewhere else.
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
          className="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-800"
        >
          Save workspace
        </button>
        <button
          type="button"
          onClick={onDownloadWorkspace}
          className="rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-900"
        >
          Download JSON
        </button>
        <button
          type="button"
          onClick={onPromptWorkspaceImport}
          className="rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-900"
        >
          Import JSON
        </button>
        <button
          type="button"
          onClick={onClearSavedWorkspace}
          className="rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-400 hover:bg-zinc-900 hover:text-zinc-300"
        >
          Clear saved
        </button>
        <label className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300">
          <input
            type="checkbox"
            checked={configAutoSave}
            onChange={onToggleConfigAutoSave}
            className="h-3 w-3 accent-violet-500"
          />
          <span>Auto save</span>
        </label>
        {savedConfigStatus ? (
          <span
            className={`text-[10px] ${
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
                        ? 'Invalid workspace file.'
                        : 'Unable to access local storage.'}
          </span>
        ) : null}
      </div>
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
          <input type="password" value={xrdbKey} onChange={(event) => onXrdbKeyChange(event.target.value)} placeholder="Optional key" className="w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs text-white outline-none focus:border-violet-500/50" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">TMDB</label>
          <input type="password" value={tmdbKey} onChange={(event) => onTmdbKeyChange(event.target.value)} placeholder="v3 Key" className="w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs text-white outline-none focus:border-violet-500/50" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">MDBList</label>
          <input type="password" value={mdblistKey} onChange={(event) => onMdblistKeyChange(event.target.value)} placeholder="Key" className="w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs text-white outline-none focus:border-violet-500/50" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Fanart</label>
          <input type="password" value={fanartKey} onChange={(event) => onFanartKeyChange(event.target.value)} placeholder="Optional key" className="w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs text-white outline-none focus:border-violet-500/50" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">SIMKL</label>
          <input type="password" value={simklClientId} onChange={(event) => onSimklClientIdChange(event.target.value)} placeholder="client_id (optional)" className="w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs text-white outline-none focus:border-violet-500/50" />
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
  onPreviewTypeChange,
  onMediaIdChange,
  onLangChange,
}: {
  previewType: ProxyType;
  mediaId: string;
  tmdbKey: string;
  lang: string;
  supportedLanguages: Array<{ code: string; label: string; flag: string }>;
  onPreviewTypeChange: (value: ProxyType) => void;
  onMediaIdChange: (value: string) => void;
  onLangChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold text-zinc-400">Media Target</div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Type</span>
          <div className="xrdb-toggle-group flex gap-1 rounded-lg border border-white/10 bg-zinc-900 p-1">
            {(['poster', 'backdrop', 'thumbnail', 'logo'] as const).map((type) => (
              <button key={type} onClick={() => onPreviewTypeChange(type)} className={`flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${previewType === type ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'}`}>
                {type === 'poster' && <ImageIcon className="h-3.5 w-3.5" />}
                {type === 'backdrop' && <MonitorPlay className="h-3.5 w-3.5" />}
                {type === 'thumbnail' && <ImageIcon className="h-3.5 w-3.5" />}
                {type === 'logo' && <Layers className="h-3.5 w-3.5" />}
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="min-w-[140px] flex-1">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Media ID</span>
          <input
            type="text"
            value={mediaId}
            onChange={(event) => onMediaIdChange(event.target.value)}
            placeholder={previewType === 'thumbnail' ? 'tt0944947:1:1' : 'tt0133093'}
            className="w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs text-white outline-none focus:border-violet-500/50"
          />
        </div>
        {tmdbKey ? (
          <div className="w-32">
            <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500"><Globe2 className="h-3 w-3" /> Lang</span>
            <div className="relative">
              <select value={lang} onChange={(event) => onLangChange(event.target.value)} className="w-full appearance-none rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs text-white outline-none focus:border-violet-500/50">
                {supportedLanguages.map((language) => (
                  <option key={language.code} value={language.code} className="bg-zinc-900">
                    {language.flag} {language.code}
                  </option>
                ))}
              </select>
              <ChevronRight className="pointer-events-none absolute right-2 top-2.5 h-3 w-3 rotate-90 stroke-2 text-zinc-500" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black p-2 text-[10px] text-zinc-500">
            <Globe2 className="h-3 w-3 shrink-0" /> Add TMDB key for lang
          </div>
        )}
      </div>
      {previewType === 'thumbnail' ? (
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          Thumbnail previews need an episode target in `seriesId:season:episode` form, for example `tt0944947:1:1` or `tmdb:tv:1399:1:1`.
        </p>
      ) : null}
    </div>
  );
}
