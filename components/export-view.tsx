'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Check, ChevronDown, Clipboard, Code2, Eye, EyeOff } from 'lucide-react';

import { useConfiguratorContext } from '@/lib/configuratorProvider';
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
import { type EpisodeArtworkMode } from '@/lib/uiConfig';

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
];

export function ExportView() {
  const { workspaceColumnsProps } = useConfiguratorContext();
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
  } = exportPanelsProps;

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
        <div className="xrdb-panel rounded-2xl p-4">
          <WorkspaceManagementSection {...workspaceManagementProps} />
        </div>

        <AiometadataSection
          aiometadataPatternRows={aiometadataPatternRows}
          aiometadataCopied={aiometadataCopied}
          onCopyAiometadata={onCopyAiometadata}
        />

        <ConfigStringSection
          displayedConfigString={displayedConfigString}
          canGenerateConfig={canGenerateConfig}
          configCopied={configCopied}
          showConfigString={showConfigString}
          onCopyConfig={onCopyConfig}
          onToggleShowConfigString={onToggleShowConfigString}
        />

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
}: {
  aiometadataPatternRows: Array<{ key: string; label: string; value: string; description: string }>;
  aiometadataCopied: boolean;
  onCopyAiometadata: () => void;
}) {
  return (
    <div className="xrdb-panel rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Code2 className="w-4 h-4 text-violet-500" /> AIOMetadata URLs
        </h2>
        <button
          type="button"
          onClick={onCopyAiometadata}
          disabled={!aiometadataPatternRows.length}
          className={`rounded-full px-4 py-2 text-xs font-semibold flex items-center gap-2 transition-colors ${
            aiometadataPatternRows.length
              ? aiometadataCopied
                ? 'bg-green-500 text-white'
                : 'bg-violet-600 text-white hover:bg-violet-500'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          }`}
        >
          {aiometadataCopied ? (
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
      {aiometadataPatternRows.length === 0 ? (
        <p className="text-[13px] text-zinc-500">Add API keys and configure settings to generate URLs.</p>
      ) : (
        <div className="space-y-2">
          {aiometadataPatternRows.map((row) => (
            <div key={row.key} className="rounded-xl border border-white/10 bg-black/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[12px] font-semibold text-zinc-200">{row.label}</div>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(row.value);
                  }}
                  className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-medium text-zinc-300 hover:text-white transition-colors"
                >
                  Copy
                </button>
              </div>
              <div className="mt-2 rounded-lg border border-white/10 bg-zinc-950/80 p-3 font-mono text-[11px] leading-5 text-zinc-300 break-all">
                {row.value}
              </div>
            </div>
          ))}
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
        Base64url string containing API keys and all settings.
      </p>
      <div className="rounded-xl border border-white/10 bg-black/70 p-3 overflow-hidden">
        <div className={`font-mono text-[11px] text-zinc-300 break-all${!showConfigString && displayedConfigString ? ' select-none' : ''}`}>
          {displayedConfigString || 'Add TMDB key and MDBList key to generate.'}
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
            {tmdbKeyPresent ? 'No preview available.' : 'Add a TMDB key to unlock preview.'}
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
