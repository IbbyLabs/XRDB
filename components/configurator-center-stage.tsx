'use client';

import Image from 'next/image';
import { ChevronRight } from 'lucide-react';
import type { MouseEvent } from 'react';

import {
  GENRE_BADGE_FAMILY_META,
  GENRE_BADGE_MODE_OPTIONS,
  type GenreBadgeMode,
  type GenreBadgePreviewSample,
} from '@/lib/genreBadge';
import { hexToRgbaCss } from '@/lib/hexToRgbaCss';

type PreviewType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';
type WorkspaceCenterView = 'showcase' | 'preview' | 'guide';
type WorkspaceCenterViewOption = {
  id: WorkspaceCenterView;
  label: string;
  description: string;
};
type GenrePreviewCard = {
  sample: GenreBadgePreviewSample;
  url: string;
};

export function ConfiguratorCenterStage({
  isOpen,
  onToggle,
  workspaceCenterView,
  workspaceCenterViewOptions,
  onSelectWorkspaceCenterView,
  previewType,
  onSelectPreviewType,
  previewUrl,
  previewErrored,
  previewErrorDetails,
  tmdbKeyPresent,
  onPreviewImageError,
  onPreviewImageLoad,
  activeTypeLabel,
  activePresentationLabel,
  activeRatingStyleLabel,
  enabledProviderCount,
  currentSetupItems,
  selectedPresetLabel,
  genrePreviewMode,
  onSelectGenrePreviewMode,
  showcaseGenreCards,
  genrePreviewCards,
  onAnchorClick,
  onOpenPreview,
}: {
  isOpen: boolean;
  onToggle: () => void;
  workspaceCenterView: WorkspaceCenterView;
  workspaceCenterViewOptions: WorkspaceCenterViewOption[];
  onSelectWorkspaceCenterView: (value: WorkspaceCenterView) => void;
  previewType: PreviewType;
  onSelectPreviewType: (value: PreviewType) => void;
  previewUrl: string;
  previewErrored: boolean;
  previewErrorDetails: string;
  tmdbKeyPresent: boolean;
  onPreviewImageError: (url: string) => void | Promise<void>;
  onPreviewImageLoad: (url: string) => void;
  activeTypeLabel: string;
  activePresentationLabel: string;
  activeRatingStyleLabel: string;
  enabledProviderCount: number;
  currentSetupItems: Array<{ label: string; value: string }>;
  selectedPresetLabel: string;
  genrePreviewMode: GenreBadgeMode;
  onSelectGenrePreviewMode: (value: GenreBadgeMode) => void;
  showcaseGenreCards: GenrePreviewCard[];
  genrePreviewCards: GenrePreviewCard[];
  onAnchorClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  onOpenPreview: () => void;
}) {
  const centerViewMeta =
    workspaceCenterViewOptions.find((option) => option.id === workspaceCenterView) ||
    workspaceCenterViewOptions[0];

  const previewFrame = (
    <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.12),_transparent_58%),linear-gradient(180deg,rgba(12,10,20,0.92),rgba(6,6,10,0.96))] p-4">
      <div className="rounded-2xl border border-white/10 bg-black/70 p-4 min-h-[360px] sm:min-h-[420px] flex items-center justify-center flex-col">
        {previewUrl && !previewErrored ? (
          <div className="z-10 w-full flex flex-col items-center gap-8">
            <div
              className={`relative shadow-2xl shadow-black ring-1 ring-white/10 rounded-2xl overflow-hidden ${
                previewType === 'poster'
                  ? workspaceCenterView === 'preview'
                    ? 'aspect-[2/3] w-full max-w-[24rem]'
                    : 'aspect-[2/3] w-full max-w-[18rem]'
                  : previewType === 'logo'
                    ? workspaceCenterView === 'preview'
                      ? 'h-56 w-full max-w-2xl'
                      : 'h-48 w-full max-w-xl'
                    : workspaceCenterView === 'preview'
                      ? 'aspect-video w-full max-w-4xl'
                      : 'aspect-video w-full max-w-2xl'
              }`}
            >
              <Image
                key={previewUrl}
                src={previewUrl}
                alt="Preview"
                unoptimized
                fill
                className={previewType === 'logo' ? 'object-contain' : 'object-cover'}
                onLoad={() => {
                  onPreviewImageLoad(previewUrl);
                }}
                onError={() => {
                  void onPreviewImageError(previewUrl);
                }}
              />
            </div>
          </div>
        ) : (
          <div className="w-full max-w-md text-center">
            <div className="mx-auto flex h-52 w-full max-w-[15rem] items-end justify-center rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.18),_transparent_62%),linear-gradient(180deg,rgba(28,20,46,0.95),rgba(10,8,18,0.98))] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
              <div className="grid w-full grid-cols-[1fr_auto] gap-3">
                <div className="flex items-end">
                  <div className="rounded-full border border-white/10 bg-black/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-200">
                    {activeTypeLabel}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-12 w-12 rounded-2xl border border-white/10 bg-white/10" />
                  <div className="h-12 w-12 rounded-2xl border border-white/10 bg-white/10" />
                </div>
                <div className="col-span-2 flex flex-wrap gap-2">
                  <div className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">4K</div>
                  <div className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">HDR</div>
                  <div className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">DV</div>
                </div>
              </div>
            </div>
            <div className="mt-5 text-sm text-zinc-400 leading-6">
              {previewErrored
                ? previewErrorDetails || 'Preview could not be rendered with the current media ID or settings.'
                : tmdbKeyPresent
                  ? 'No preview available.'
                  : 'Add a TMDB key to unlock the live render. The center stage will swap this placeholder for the real output.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div id="workspace-preview" className="space-y-3 scroll-mt-24">
      <div className="xrdb-panel xrdb-panel-preview rounded-3xl border border-white/10 bg-zinc-900/60 p-4">
          <button type="button" onClick={onToggle} className="xrdb-panel-head flex w-full items-center justify-between gap-4 text-left">
            <div>
              <p className="xrdb-panel-eyebrow font-mono">Output</p>
              <h3 className="text-xl font-semibold text-white">Center View</h3>
              <p className="mt-1 text-sm text-zinc-400">
                Switch between a richer showcase board, a focused preview, or a guide summary without leaving the workspace.
              </p>
            </div>
            <ChevronRight className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${isOpen ? 'rotate-90 text-violet-300' : ''}`} />
          </button>
          <div className="xrdb-accordion-body" data-open={isOpen}>
            <div className="xrdb-accordion-inner">
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1 rounded-xl border border-white/10 bg-zinc-950/80 p-1">
                  {workspaceCenterViewOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onSelectWorkspaceCenterView(option.id)}
                      className={`rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                        workspaceCenterView === option.id
                          ? 'bg-violet-500/20 text-white ring-1 ring-inset ring-violet-400/40'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                      title={option.description}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 min-[861px]:hidden">
                <a
                  href="#workspace-settings"
                  onClick={onAnchorClick}
                  className="xrdb-nav-link text-[11px]"
                >
                  Back to settings
                </a>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {(['poster', 'backdrop', 'thumbnail', 'logo'] as const).map((type) => (
                    <button
                      key={`preview-pill-${type}`}
                      type="button"
                      onClick={() => onSelectPreviewType(type)}
                      className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                        previewType === type
                          ? 'border-violet-500/60 bg-zinc-800 text-white'
                          : 'border-white/10 bg-zinc-950 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    {centerViewMeta?.label}
                  </div>
                  <div className="mt-1 text-[11px] leading-5 text-zinc-400 max-w-xs">
                    {centerViewMeta?.description}
                  </div>
                </div>
              </div>
              {workspaceCenterView === 'showcase' ? (
                <div className="workspace-showcase-grid mt-3">
                  <div className="z-30 space-y-4">
                    {previewFrame}
                    <div className="workspace-showcase-meta-grid">
                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Presentation</div>
                        <div className="mt-2 break-words text-sm font-semibold leading-5 text-white">
                          {activePresentationLabel}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Style</div>
                        <div className="mt-2 break-words text-sm font-semibold leading-5 text-white">
                          {activeRatingStyleLabel}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Providers</div>
                        <div className="mt-2 break-words text-sm font-semibold leading-5 text-white">{enabledProviderCount} active</div>
                      </div>
                    </div>
                  </div>
                  <div className="relative z-10 space-y-4">
                    <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.14),_transparent_65%),linear-gradient(180deg,rgba(24,18,38,0.95),rgba(14,10,24,0.98))] p-4">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Genre samples</div>
                      <p className="mt-2 text-[11px] leading-5 text-zinc-400">
                        Curated renders show how the current genre badge choices land across media types.
                      </p>
                      <div className="workspace-showcase-mode-group mt-3 rounded-lg border border-white/10 bg-zinc-950/80 p-1">
                        {GENRE_BADGE_MODE_OPTIONS.map((option) => (
                          <button
                            key={`genre-preview-mode-${option.id}`}
                            type="button"
                            onClick={() => onSelectGenrePreviewMode(option.id)}
                            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                              genrePreviewMode === option.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                            }`}
                            title={option.description}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      {tmdbKeyPresent ? (
                        <div className="workspace-showcase-card-grid mt-4">
                          {showcaseGenreCards.map(({ sample, url }) => {
                            const family = GENRE_BADGE_FAMILY_META[sample.familyId];
                            const accentStyle = {
                              borderColor: hexToRgbaCss(family.accentColor, 0.45),
                              backgroundImage: `linear-gradient(145deg, ${hexToRgbaCss(family.accentColor, 0.18)}, rgba(24,24,27,0.88) 62%)`,
                            };
                            const mediaFrameClass =
                              sample.previewType === 'poster'
                                ? 'aspect-[2/3]'
                                : sample.previewType === 'logo'
                                  ? 'h-24'
                                  : 'aspect-video';

                            return (
                              <article key={sample.key} className="flex h-full flex-col gap-2 rounded-2xl border border-white/10 bg-zinc-950/60 p-2.5">
                                <div className="workspace-showcase-card-head">
                                  <div className="workspace-showcase-card-copy">
                                    <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                                      {sample.typeLabel}
                                    </div>
                                    <h4 className="workspace-showcase-card-title text-[11px] font-semibold text-white">{sample.title}</h4>
                                  </div>
                                  <span
                                    className="workspace-showcase-card-badge rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-white"
                                    style={accentStyle}
                                  >
                                    {family.label}
                                  </span>
                                </div>
                                <div className={`relative overflow-hidden rounded-xl border border-white/10 bg-black/70 ${mediaFrameClass}`}>
                                  <Image
                                    key={url}
                                    src={url}
                                    alt={`${sample.title} ${sample.typeLabel} genre sample`}
                                    unoptimized
                                    fill
                                    className={sample.previewType === 'logo' ? 'object-contain' : 'object-cover'}
                                  />
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-zinc-950/40 px-4 py-5 text-[11px] leading-5 text-zinc-500">
                          Add a TMDB key to load the sample board.
                        </div>
                      )}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Quick notes</div>
                      <div className="mt-3 space-y-3">
                        <p className="text-[11px] leading-5 text-zinc-400">
                          Showcase keeps the live render visible while the side tiles explain badge choices and the current output mode.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-200">
                            {activeTypeLabel}
                          </span>
                          <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-200">
                            {activePresentationLabel}
                          </span>
                          <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-200">
                            {enabledProviderCount} active
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : workspaceCenterView === 'preview' ? (
                <div className="mt-3">
                  <div className="z-30 space-y-3">
                    {previewFrame}
                    <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(19,15,33,0.92),rgba(10,8,18,0.98))] p-4">
                      <div className="flex flex-wrap gap-2">
                        {currentSetupItems.map((item) => (
                          <div key={item.label} className="rounded-full border border-white/10 bg-zinc-950/70 px-3 py-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{item.label}</span>
                            <span className="ml-2 text-[11px] font-semibold text-white">{item.value}</span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-[12px] leading-6 text-zinc-400">
                        Preview stays focused on the live render so badge balance, artwork crop, and spacing stay easy to judge without the sample board competing for attention.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="z-30">
                    <div className="space-y-3">
                      {previewFrame}
                      <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(22,16,37,0.94),rgba(11,9,21,0.98))] p-4">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Current setup</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {currentSetupItems.map((item) => (
                            <div key={item.label} className="rounded-full border border-white/10 bg-zinc-950/70 px-3 py-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{item.label}</span>
                              <span className="ml-2 text-[11px] font-semibold text-white">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Preset</div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {selectedPresetLabel}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Output</div>
                      <div className="mt-2 text-lg font-semibold text-white">{activeTypeLabel}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Presentation</div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {activePresentationLabel}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Providers</div>
                      <div className="mt-2 text-lg font-semibold text-white">{enabledProviderCount} active</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(44,28,76,0.9),rgba(24,16,38,0.96))] p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/20 text-sm font-semibold text-white">1</div>
                        <div>
                          <div className="text-sm font-semibold text-white">Add keys</div>
                          <p className="mt-1 text-[12px] leading-5 text-zinc-300">
                            TMDB powers the live render. MDBList and the optional source keys round out provider coverage and exports.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(33,24,58,0.92),rgba(20,14,34,0.98))] p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/20 text-sm font-semibold text-white">2</div>
                        <div>
                          <div className="text-sm font-semibold text-white">Tune output</div>
                          <p className="mt-1 text-[12px] leading-5 text-zinc-300">
                            Keep the left rail for layout, presentation, genre badges, quality badges, and provider order.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(28,21,50,0.92),rgba(16,12,29,0.98))] p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/20 text-sm font-semibold text-white">3</div>
                        <div>
                          <div className="text-sm font-semibold text-white">Copy result</div>
                          <p className="mt-1 text-[12px] leading-5 text-zinc-300">
                            Export a config string, manifest URL, or AIOMetadata pattern once the center view looks right.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onOpenPreview}
                      className="rounded-xl border border-violet-400/30 bg-violet-500/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white transition-colors hover:bg-violet-500/30"
                    >
                      Open preview
                    </button>
                    <a
                      href="#workspace-export"
                      onClick={onAnchorClick}
                      className="rounded-xl border border-white/10 bg-zinc-950/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-200 transition-colors hover:text-white"
                    >
                      Open export
                    </a>
                  </div>
                </div>
              )}
              {workspaceCenterView === 'showcase' && !tmdbKeyPresent ? (
                <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-zinc-950/40 px-4 py-5 text-[11px] leading-5 text-zinc-500">
                  Add a TMDB key if you want the showcase sample board to render alongside the live preview.
                </div>
              ) : null}

              {workspaceCenterView === 'preview' ? null : (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        {workspaceCenterView === 'guide' ? 'Reference Board' : 'Genre Badge Samples'}
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                        {workspaceCenterView === 'guide'
                          ? 'Keep a visual reference board nearby while you answer the setup questions or review the recommended preset.'
                          : 'Curated movie, show, animation, and anime renders that keep the badge decision fixed while you compare mode, style, and placement.'}
                      </p>
                    </div>
                    <div className="flex gap-1 p-1 rounded-lg border border-white/10 bg-zinc-900">
                      {GENRE_BADGE_MODE_OPTIONS.map((option) => (
                        <button
                          key={`genre-preview-mode-${option.id}`}
                          type="button"
                          onClick={() => onSelectGenrePreviewMode(option.id)}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                            genrePreviewMode === option.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                          }`}
                          title={option.description}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {tmdbKeyPresent ? (
                    <div className="mt-3 grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1">
                      {genrePreviewCards.map(({ sample, url }) => {
                        const family = GENRE_BADGE_FAMILY_META[sample.familyId];
                        const accentStyle = {
                          borderColor: hexToRgbaCss(family.accentColor, 0.45),
                          backgroundImage: `linear-gradient(145deg, ${hexToRgbaCss(family.accentColor, 0.18)}, rgba(24,24,27,0.88) 62%)`,
                        };
                        const mediaFrameClass =
                          sample.previewType === 'poster'
                            ? 'aspect-[2/3]'
                            : sample.previewType === 'logo'
                              ? 'h-40'
                              : 'aspect-video';

                        return (
                          <article key={sample.key} className="flex h-full flex-col gap-3 rounded-2xl border border-white/10 bg-zinc-950/60 p-3">
                            <div className="flex min-h-[3.5rem] flex-col items-start gap-2">
                              <div className="min-w-0">
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                  {sample.typeLabel}
                                </div>
                                <h4 className="mt-1 text-sm font-semibold text-white">{sample.title}</h4>
                              </div>
                              <span
                                className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] text-white"
                                style={accentStyle}
                              >
                                {family.label}
                              </span>
                            </div>
                            <div className={`relative overflow-hidden rounded-xl border border-white/10 bg-black/70 shadow-xl shadow-black/40 ${mediaFrameClass}`}>
                              <Image
                                key={url}
                                src={url}
                                alt={`${sample.title} ${sample.typeLabel} genre sample`}
                                unoptimized
                                fill
                                className={sample.previewType === 'logo' ? 'object-contain' : 'object-cover'}
                              />
                            </div>
                            <p className="text-[11px] leading-5 text-zinc-400">{sample.decision}</p>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-zinc-950/40 px-4 py-5 text-[11px] leading-5 text-zinc-500">
                      Add a TMDB key above to load the curated sample board.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
      </div>
    </div>
  );
}
