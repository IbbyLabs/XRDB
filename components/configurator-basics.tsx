'use client';

import type { ChangeEvent, RefObject } from 'react';
import { ChevronRight, Globe2, Image as ImageIcon, Layers, MonitorPlay, Search, Shuffle } from 'lucide-react';
import type { MediaSearchItem } from '@/lib/configuratorMediaSearch';
import {
  buildEpisodePreviewMediaTarget,
  parseEpisodePreviewMediaTarget,
} from '@/lib/episodeIdentity';

import type {
  ConfiguratorExperienceMode,
} from '@/lib/configuratorPresets';
import type { TmdbIdScopeMode } from '@/lib/uiConfig';

type ProxyType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';

const PREVIEW_GUIDE = {
  poster: {
    title: 'Poster',
    fieldValue: 'tt0133093',
    routePath: '/poster/tt0133093.jpg',
    fieldHelp: 'Use one base title ID only. Movie, show, and anime poster lookups all start from a single base ID.',
    fieldExamples: ['tt0133093', 'tmdb:movie:603', 'tmdb:tv:1399', 'xrdbid:tt0944947', 'mal:16498'],
    routeExamples: ['/poster/tt0133093.jpg', '/poster/tmdb:movie:603.jpg', '/poster/tmdb:tv:1399.jpg'],
  },
  backdrop: {
    title: 'Backdrop',
    fieldValue: 'tmdb:tv:1399',
    routePath: '/backdrop/tmdb:tv:1399.jpg',
    fieldHelp: 'Use one base title ID only. Typed TMDB IDs are the safest choice when you need movie and TV lookups to stay separated.',
    fieldExamples: ['tt0944947', 'tmdb:movie:603', 'tmdb:tv:1399', 'xrdbid:tt0944947', 'tvdb:121361'],
    routeExamples: ['/backdrop/tt0944947.jpg', '/backdrop/tmdb:movie:603.jpg', '/backdrop/tmdb:tv:1399.jpg'],
  },
  thumbnail: {
    title: 'Thumbnail',
    fieldValue: 'tt0944947:1:1',
    routePath: '/thumbnail/tt0944947/S01E01.jpg',
    fieldHelp: 'Use an episode target. Standard episode IDs use seriesId:season:episode. Kitsu episode inputs also accept seriesId:episode when seasons are not available.',
    fieldExamples: [
      'tt0944947:1:1',
      'tmdb:tv:1399:1:1',
      'xrdbid:tt0944947:1:1',
      'tvdb:121361:1:1',
      'anilist:16498:1:1',
      'mal:16498:1:1',
      'anidb:5114:1:1',
      'kitsu:7442:1',
    ],
    routeExamples: [
      '/thumbnail/tt0944947/S01E01.jpg',
      '/thumbnail/tmdb:tv:1399/S01E01.jpg',
      '/thumbnail/xrdbid:tt0944947/S01E01.jpg',
      '/thumbnail/kitsu:7442/S01E01.jpg',
    ],
  },
  logo: {
    title: 'Logo',
    fieldValue: 'tmdb:movie:603',
    routePath: '/logo/tmdb:movie:603.png',
    fieldHelp: 'Use one base title ID only. Logos export as PNG and typed TMDB IDs are recommended because they avoid ambiguous movie versus TV matches.',
    fieldExamples: ['tmdb:movie:603', 'tmdb:tv:1399', 'tt0944947', 'xrdbid:tt0944947'],
    routeExamples: ['/logo/tmdb:movie:603.png', '/logo/tmdb:tv:1399.png', '/logo/tt0944947.png'],
  },
} satisfies Record<
  ProxyType,
  {
    title: string;
    fieldValue: string;
    routePath: string;
    fieldHelp: string;
    fieldExamples: string[];
    routeExamples: string[];
  }
>;

const BASE_ID_FAMILIES = [
  {
    label: 'IMDb',
    detail: 'Best general base ID for posters and simple movie or show lookups.',
    examples: ['tt0133093', 'tt0944947'],
  },
  {
    label: 'Typed TMDB',
    detail: 'Best when movie and TV type must stay explicit. Required by Strict TMDB scope for backdrop and logo requests.',
    examples: ['tmdb:movie:603', 'tmdb:tv:1399'],
  },
  {
    label: 'XRDB canon ID',
    detail: 'Keeps an IMDb base ID explicit in proxy and episodic workflows.',
    examples: ['xrdbid:tt0944947'],
  },
  {
    label: 'TVDB',
    detail: 'Supported for series and episode targeting when your upstream IDs come from TVDB.',
    examples: ['tvdb:121361'],
  },
  {
    label: 'Anime IDs',
    detail: 'Use the native anime provider ID when your source does not begin with IMDb or TMDB.',
    examples: ['anilist:16498', 'mal:16498', 'anidb:5114', 'kitsu:7442'],
  },
] as const;

const FORMAT_REFERENCE = [
  {
    label: 'Poster input',
    value: 'baseId',
    detail: 'Example: tt0133093 or tmdb:movie:603',
  },
  {
    label: 'Backdrop input',
    value: 'baseId',
    detail: 'Example: tmdb:tv:1399 or xrdbid:tt0944947',
  },
  {
    label: 'Logo input',
    value: 'baseId',
    detail: 'Example: tmdb:movie:603 or tmdb:tv:1399',
  },
  {
    label: 'Thumbnail input',
    value: 'seriesId:season:episode',
    detail: 'Example: tt0944947:1:1 or tmdb:tv:1399:1:1',
  },
  {
    label: 'Kitsu thumbnail input',
    value: 'seriesId:episode',
    detail: 'Example: kitsu:7442:1',
  },
] as const;

const QUERY_PARAM_REFERENCE = [
  {
    label: 'idSource=tmdb',
    detail: 'Pins poster, backdrop, and logo exports to typed TMDB route patterns.',
  },
  {
    label: 'tmdbIdScope=strict',
    detail: 'Requires tmdb:movie:id or tmdb:tv:id for backdrop and logo requests.',
  },
  {
    label: 'thumbnailEpisodeArtwork=still|series',
    detail: 'Controls whether thumbnails prefer the episode still or the series backdrop source.',
  },
  {
    label: 'thumbnailRatings=tmdb,imdb',
    detail: 'Chooses the thumbnail specific rating providers without affecting poster, backdrop, or logo routes.',
  },
] as const;

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
  mediaSearchQuery,
  mediaSearchLoading,
  mediaSearchError,
  mediaSearchResults,
  activePreviewTitle,
  onMediaSearchQueryChange,
  onMediaSearchSubmit,
  onSelectMediaSearchResult,
  onShuffleMediaTarget,
}: {
  previewType: ProxyType;
  mediaId: string;
  tmdbKey: string;
  lang: string;
  supportedLanguages: Array<{ code: string; label: string; flag: string }>;
  onPreviewTypeChange: (value: ProxyType) => void;
  onMediaIdChange: (value: string) => void;
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
}) {
  const activeGuide = PREVIEW_GUIDE[previewType];
  const thumbnailTarget =
    previewType === 'thumbnail' ? parseEpisodePreviewMediaTarget(mediaId) : null;
  const thumbnailBaseId = thumbnailTarget ? thumbnailTarget.mediaId : mediaId.trim();
  const thumbnailSeason = thumbnailTarget ? String(thumbnailTarget.seasonNumber) : '1';
  const thumbnailEpisode = thumbnailTarget ? String(thumbnailTarget.episodeNumber) : '1';

  const applyThumbnailTarget = ({
    nextBaseId,
    nextSeason,
    nextEpisode,
  }: {
    nextBaseId: string;
    nextSeason: string | number;
    nextEpisode: string | number;
  }) => {
    const nextMediaId = buildEpisodePreviewMediaTarget({
      mediaId: nextBaseId,
      seasonNumber: nextSeason,
      episodeNumber: nextEpisode,
    });
    if (nextMediaId) {
      onMediaIdChange(nextMediaId);
      return;
    }
    onMediaIdChange(nextBaseId);
  };

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
          <div className="w-44">
            <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500"><Globe2 className="h-3 w-3" /> Lang</span>
            <div className="relative">
              <select value={lang} onChange={(event) => onLangChange(event.target.value)} className="w-full appearance-none rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs text-white outline-none focus:border-violet-500/50">
                {supportedLanguages.map((language) => (
                  <option key={language.code} value={language.code} className="bg-zinc-900">
                    {language.flag} {language.label}
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
        <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr),120px,120px]">
            <div>
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Series ID</span>
              <input
                type="text"
                value={thumbnailBaseId}
                onChange={(event) =>
                  applyThumbnailTarget({
                    nextBaseId: event.target.value,
                    nextSeason: thumbnailSeason,
                    nextEpisode: thumbnailEpisode,
                  })}
                placeholder="tmdb:tv:1399"
                className="w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs text-white outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Season</span>
              <input
                type="number"
                min={1}
                step={1}
                value={thumbnailSeason}
                onChange={(event) =>
                  applyThumbnailTarget({
                    nextBaseId: thumbnailBaseId,
                    nextSeason: event.target.value,
                    nextEpisode: thumbnailEpisode,
                  })}
                className="w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs text-white outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Episode</span>
              <input
                type="number"
                min={1}
                step={1}
                value={thumbnailEpisode}
                onChange={(event) =>
                  applyThumbnailTarget({
                    nextBaseId: thumbnailBaseId,
                    nextSeason: thumbnailSeason,
                    nextEpisode: event.target.value,
                  })}
                className="w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs text-white outline-none focus:border-violet-500/50"
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
            Use TMDB TV, IMDb, TVDB, XRDBID, AniList, MAL, AniDB, or Kitsu series IDs here. The preview route stays `/thumbnail/{'{id}'}/S{'{season}'}E{'{episode}'}.jpg`.
          </p>
        </div>
      ) : null}
      <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[160px] flex-1">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Search by name</span>
            <input
              type="text"
              value={mediaSearchQuery}
              onChange={(event) => onMediaSearchQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onMediaSearchSubmit();
                }
              }}
              placeholder={previewType === 'thumbnail' ? 'Search for a series' : 'Search for a movie or series'}
              className="w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs text-white outline-none focus:border-violet-500/50"
            />
          </div>
          <button
            type="button"
            onClick={onMediaSearchSubmit}
            disabled={!tmdbKey || mediaSearchLoading || mediaSearchQuery.trim().length < 2}
            className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
              !tmdbKey || mediaSearchLoading || mediaSearchQuery.trim().length < 2
                ? 'cursor-not-allowed border-white/10 bg-zinc-950 text-zinc-500'
                : 'border-violet-500/40 bg-violet-500/15 text-violet-100 hover:bg-violet-500/25'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            {mediaSearchLoading ? 'Searching' : 'Search'}
          </button>
          <button
            type="button"
            onClick={onShuffleMediaTarget}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
          >
            <Shuffle className="h-3.5 w-3.5" />
            Shuffle sample
          </button>
        </div>
        {mediaSearchError ? (
          <p className="mt-2 text-[11px] leading-5 text-rose-300">{mediaSearchError}</p>
        ) : null}
        {activePreviewTitle ? (
          <p className="mt-2 text-[11px] leading-5 text-zinc-400">
            Preview title: <span className="font-semibold text-zinc-200">{activePreviewTitle}</span>
          </p>
        ) : null}
        {mediaSearchResults.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {mediaSearchResults.map((result) => (
              <button
                key={`${result.mediaId}-${result.title}`}
                type="button"
                onClick={() => onSelectMediaSearchResult(result)}
                className="rounded-lg border border-white/10 bg-zinc-950/80 px-3 py-2 text-left transition-colors hover:border-violet-500/50 hover:bg-zinc-900"
              >
                <div className="text-[12px] font-semibold text-zinc-100">{result.title}</div>
                <div className="mt-0.5 text-[11px] text-zinc-500">{result.subtitle}</div>
                <div className="mt-1 font-mono text-[10px] text-zinc-400">{result.mediaId}</div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {previewType === 'thumbnail' ? (
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          Thumbnail previews need an episode target in `seriesId:season:episode` form, for example `tt0944947:1:1` or `tmdb:tv:1399:1:1`.
        </p>
      ) : null}
      <div className="mt-4 overflow-hidden rounded-2xl border border-violet-500/25 bg-[linear-gradient(180deg,rgba(42,24,74,0.94),rgba(18,10,32,0.98))] shadow-[0_18px_48px_rgba(10,6,18,0.38)]">
        <div className="border-b border-white/10 px-4 py-4 sm:px-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200/90">
            XRDB ID Guide
          </div>
          <h4 className="mt-2 text-base font-semibold text-white">Accepted IDs, route shapes, and preview input rules</h4>
          <p className="mt-2 max-w-3xl text-[12px] leading-6 text-zinc-300">
            The Media ID field above accepts a base title ID for posters, backdrops, and logos. Thumbnail previews need an episode target. Use this guide to match the field input, the exported route, and the most common scoped query params without guessing.
          </p>
        </div>
        <div className="grid gap-3 px-4 py-4 sm:px-5 xl:grid-cols-[1.1fr,0.9fr]">
          <div className="rounded-2xl border border-violet-400/20 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200/80">Current preview type</div>
                <div className="mt-1 text-lg font-semibold text-white">{activeGuide.title}</div>
              </div>
              <span className="rounded-full border border-violet-400/30 bg-violet-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-100">
                {previewType}
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/35 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">What goes in Media ID</div>
                <div className="mt-2 rounded-lg border border-white/10 bg-black px-3 py-2 font-mono text-[12px] text-violet-100">
                  {activeGuide.fieldValue}
                </div>
                <p className="mt-2 text-[11px] leading-5 text-zinc-400">{activeGuide.fieldHelp}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/35 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Route XRDB generates</div>
                <div className="mt-2 rounded-lg border border-white/10 bg-black px-3 py-2 font-mono text-[12px] text-zinc-100">
                  {activeGuide.routePath}
                </div>
                <p className="mt-2 text-[11px] leading-5 text-zinc-400">
                  The preview input above is the ID payload. The final route keeps the same base ID, then adds the artwork path and file format for that image type.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Input examples</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeGuide.fieldExamples.map((example) => (
                    <span
                      key={`${previewType}-field-${example}`}
                      className="rounded-full border border-white/10 bg-black/35 px-2.5 py-1 font-mono text-[11px] text-zinc-200"
                    >
                      {example}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Route examples</div>
                <div className="mt-2 flex flex-col gap-2">
                  {activeGuide.routeExamples.map((example) => (
                    <div
                      key={`${previewType}-route-${example}`}
                      className="rounded-lg border border-white/10 bg-black/35 px-3 py-2 font-mono text-[11px] text-zinc-200"
                    >
                      {example}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Accepted base ID families</div>
              <div className="mt-3 grid gap-2">
                {BASE_ID_FAMILIES.map((family) => (
                  <div key={family.label} className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="text-sm font-semibold text-white">{family.label}</div>
                    <p className="mt-1 text-[11px] leading-5 text-zinc-400">{family.detail}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {family.examples.map((example) => (
                        <span
                          key={`${family.label}-${example}`}
                          className="rounded-full border border-white/10 bg-black/35 px-2.5 py-1 font-mono text-[10px] text-zinc-300"
                        >
                          {example}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Movie, show, and episode rules</div>
              <div className="mt-3 grid gap-2">
                {FORMAT_REFERENCE.map((item) => (
                  <div key={item.label} className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="text-[11px] font-semibold text-white">{item.label}</div>
                    <div className="mt-2 font-mono text-[11px] text-violet-100">{item.value}</div>
                    <p className="mt-1 text-[11px] leading-5 text-zinc-400">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 bg-black/15 px-4 py-4 sm:px-5">
          <div className="grid gap-3 lg:grid-cols-[1.15fr,0.85fr]">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Strict TMDB and route safety</div>
              <p className="mt-2 text-[12px] leading-6 text-zinc-300">
                If you enable Strict TMDB scope, backdrop and logo requests must stay typed as <span className="font-mono text-violet-100">tmdb:movie:603</span> or <span className="font-mono text-violet-100">tmdb:tv:1399</span>. Plain <span className="font-mono text-zinc-100">tmdb:603</span> is ambiguous and will be rejected.
              </p>
              <p className="mt-2 text-[11px] leading-5 text-zinc-400">
                Poster routes can stay on IMDb or another supported base ID when that fits your source better. The export panels below show the full scoped query string XRDB will generate for your current workspace.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">High signal query params</div>
              <div className="mt-3 grid gap-2">
                {QUERY_PARAM_REFERENCE.map((item) => (
                  <div key={item.label} className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="font-mono text-[11px] text-zinc-100">{item.label}</div>
                    <p className="mt-1 text-[11px] leading-5 text-zinc-400">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
