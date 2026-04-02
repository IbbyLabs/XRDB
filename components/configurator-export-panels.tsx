'use client';

import { Check, ChevronRight, Clipboard, Code2, Eye, EyeOff } from 'lucide-react';

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

const EPISODE_ID_MODE_OPTIONS: Array<{
  id: EpisodeIdMode;
  label: string;
  description: string;
}> = [
  {
    id: DEFAULT_EPISODE_ID_MODE,
    label: 'IMDb',
    description: 'Standard IMDb IDs. Best for broad compatibility and lighter configs.',
  },
  {
    id: 'xrdbid',
    label: 'XRDBID',
    description: 'Use the XRDBID episode resolver before artwork lookup when IMDb episode matching needs stronger canonical mapping.',
  },
  {
    id: 'tvdb',
    label: 'TVDB',
    description: 'Use TVDB IDs directly when your source metadata already carries TVDB episode references.',
  },
  {
    id: 'kitsu',
    label: 'Kitsu',
    description: 'Best when anime episode metadata arrives with Kitsu IDs instead of TMDB or IMDb IDs.',
  },
  {
    id: 'anilist',
    label: 'AniList',
    description: 'Use AniList episode family IDs when your anime source is AniList based.',
  },
  {
    id: 'mal',
    label: 'MAL',
    description: 'Use MyAnimeList episode family IDs when your anime source is MAL based.',
  },
  {
    id: 'anidb',
    label: 'AniDB',
    description: 'Use AniDB episode family IDs when your source metadata is AniDB based.',
  },
];

const EPISODE_ARTWORK_MODE_OPTIONS: Array<{
  id: EpisodeArtworkMode;
  label: string;
  description: string;
}> = [
  {
    id: 'still',
    label: 'Episode still',
    description: 'Use the TMDB episode still when one exists.',
  },
  {
    id: 'series',
    label: 'Series backdrop',
    description: 'Use the normal series backdrop selection instead.',
  },
];

export type AiometadataPatternRow = {
  key: string;
  label: string;
  value: string;
  description: string;
};

export function ConfiguratorExportPanels({
  isConfigStringOpen,
  isAiometadataOpen,
  onToggleConfigString,
  onToggleAiometadata,
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
}: {
  isConfigStringOpen: boolean;
  isAiometadataOpen: boolean;
  onToggleConfigString: () => void;
  onToggleAiometadata: () => void;
  displayedConfigString: string;
  canGenerateConfig: boolean;
  configCopied: boolean;
  showConfigString: boolean;
  onCopyConfig: () => void;
  onToggleShowConfigString: () => void;
  aiometadataPatternRows: AiometadataPatternRow[];
  aiometadataCopied: boolean;
  onCopyAiometadata: () => void;
  posterIdMode: PosterIdMode;
  onSelectPosterIdMode: (value: PosterIdMode) => void;
  episodeIdMode: EpisodeIdMode;
  onSelectEpisodeIdMode: (value: EpisodeIdMode) => void;
  thumbnailEpisodeArtwork: EpisodeArtworkMode;
  onSelectThumbnailEpisodeArtwork: (value: EpisodeArtworkMode) => void;
  backdropEpisodeArtwork: EpisodeArtworkMode;
  onSelectBackdropEpisodeArtwork: (value: EpisodeArtworkMode) => void;
  thumbnailRatingPreferences: ThumbnailRatingPreference[];
  onToggleThumbnailRatingPreference: (providerId: ThumbnailRatingPreference) => void;
  hideAiometadataCredentials: boolean;
  onToggleHideAiometadataCredentials: (value: boolean) => void;
}) {
  const effectivePosterIdMode = posterIdMode === 'tmdb' ? 'auto' : posterIdMode;

  return (
    <div id="workspace-export" className="scroll-mt-24">
      <div className="space-y-3">
        <div className="xrdb-panel xrdb-panel-emphasis rounded-3xl border border-white/10 bg-zinc-900/60 p-4">
          <button
            type="button"
            onClick={onToggleConfigString}
            className="xrdb-panel-head flex w-full items-center justify-between gap-4 text-left"
          >
            <div>
              <p className="xrdb-panel-eyebrow font-mono">Export</p>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Code2 className="w-5 h-5 text-violet-500" /> XRDB Config String
              </h3>
              <p className="mt-1 text-sm text-zinc-400">
                Base64url string containing API keys and all settings. Base URL is detected automatically from the current domain.
              </p>
            </div>
            <ChevronRight className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${isConfigStringOpen ? 'rotate-90 text-violet-300' : ''}`} />
          </button>
          <div className="xrdb-accordion-body" data-open={isConfigStringOpen}>
            <div className="xrdb-accordion-inner">
              <p className="mt-3 text-[11px] leading-5 text-zinc-500">
                Use this when another tool expects one XRDB config field. The settings travel inside this string, not inside your saved workspace by itself.
              </p>
              <div className="mt-3 rounded-2xl border border-white/10 bg-black/70 p-4 overflow-hidden">
                <div className={`font-mono text-xs text-zinc-300 break-all${!showConfigString && displayedConfigString ? ' select-none' : ''}`}>
                  {displayedConfigString || 'Add TMDB key and MDBList key to generate the config string.'}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onCopyConfig}
                  disabled={!canGenerateConfig}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${canGenerateConfig ? (configCopied ? 'bg-green-500 text-white' : 'bg-violet-500 text-white hover:bg-violet-400') : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
                >
                  {configCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>COPIED</span>
                    </>
                  ) : (
                    <>
                      <Clipboard className="w-3.5 h-3.5" />
                      <span>COPY STRING</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onToggleShowConfigString}
                  disabled={!canGenerateConfig}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${canGenerateConfig ? 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 hover:text-white border border-violet-500/30' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5'}`}
                  aria-label={showConfigString ? 'Hide config string' : 'Show config string'}
                >
                  {showConfigString ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showConfigString ? 'HIDE' : 'SHOW'}</span>
                </button>
              </div>
              {!canGenerateConfig ? (
                <p className="mt-3 text-[11px] text-zinc-500">
                  Add TMDB key and MDBList key to generate a valid config string.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="xrdb-panel xrdb-panel-emphasis rounded-3xl border border-white/10 bg-zinc-900/60 p-4">
          <button
            type="button"
            onClick={onToggleAiometadata}
            className="xrdb-panel-head flex w-full items-center justify-between gap-4 text-left"
          >
            <div>
              <p className="xrdb-panel-eyebrow font-mono">Export</p>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Code2 className="w-5 h-5 text-violet-500" /> AIOMetadata URLs
              </h3>
              <p className="mt-1 text-sm text-zinc-400">
                Ready to paste URL patterns for the AIOMetadata art override fields.
              </p>
            </div>
            <ChevronRight className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${isAiometadataOpen ? 'rotate-90 text-violet-300' : ''}`} />
          </button>
          <div className="xrdb-accordion-body" data-open={isAiometadataOpen}>
            <div className="xrdb-accordion-inner">
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={onCopyAiometadata}
                  disabled={!aiometadataPatternRows.length}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                    aiometadataPatternRows.length
                      ? aiometadataCopied
                        ? 'bg-green-500 text-white'
                        : 'bg-violet-500 text-white hover:bg-violet-400'
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  {aiometadataCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>COPIED</span>
                    </>
                  ) : (
                    <>
                      <Clipboard className="w-3.5 h-3.5" />
                      <span>COPY ALL</span>
                    </>
                  )}
                </button>
              </div>
              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="mt-3 text-[11px] leading-5 text-zinc-500">
                  These presets keep background and logo on type aware TMDB IDs. Poster follows the selected poster mode. Episode thumbs follow the selected episode mode and keep their own thumbnail ratings, artwork, text, and layout settings.
                </p>
                <div className="mt-4 space-y-4 rounded-2xl border border-white/10 bg-black/35 p-4">
                  <div className="grid gap-4">
                    <div className="rounded-xl border border-white/10 bg-zinc-950/70 p-3">
                      <div className="text-[11px] font-semibold text-zinc-200">Poster ID source</div>
                      <p className="mt-2 text-[10px] leading-4 text-zinc-500 mb-3">
                        Determines which database ID to include in poster URLs. Auto and typed TMDB are the same export mode, so the UI only shows the two distinct behaviors.
                      </p>
                      <div className="space-y-3">
                        <PosterModeOption
                          mode="auto"
                          currentMode={effectivePosterIdMode}
                          label="Auto"
                          description="Uses typed TMDB IDs for poster URLs. This is the recommended mode for broader poster coverage."
                          onSelect={onSelectPosterIdMode}
                        />
                        <PosterModeOption
                          mode="imdb"
                          currentMode={effectivePosterIdMode}
                          label="IMDb"
                          description="Only use this if your setup requires IMDb compatibility. Poster delivery may fail if IMDb IDs are not available."
                          onSelect={onSelectPosterIdMode}
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-zinc-950/70 p-3">
                      <div className="text-[11px] font-semibold text-zinc-200">Episode ID source</div>
                      <p className="mt-2 text-[10px] leading-4 text-zinc-500 mb-3">
                        Pick the episode ID family that matches the source best. XRDBID provides stronger canonical mapping for difficult episodic cases.
                      </p>
                      <div className="space-y-3">
                        {EPISODE_ID_MODE_OPTIONS.map((option) => (
                          <label key={option.id} className="flex items-start gap-3 cursor-pointer group">
                            <input
                              type="radio"
                              name="episodeIdMode"
                              value={option.id}
                              checked={episodeIdMode === option.id}
                              onChange={(event) => onSelectEpisodeIdMode(event.target.value as EpisodeIdMode)}
                              className="mt-1 h-4 w-4 rounded-full border-white/20 bg-black accent-violet-500"
                            />
                            <span className="space-y-1">
                              <span className="block text-[11px] font-medium text-zinc-300">{option.label}</span>
                              <span className="block text-[10px] text-zinc-600">{option.description}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-4 border-t border-white/10 pt-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Thumbnail episode artwork</div>
                        <p className="mt-2 text-[10px] leading-4 text-zinc-600">
                          Default is episode still for thumbnails so they stay distinct from normal backdrops.
                        </p>
                        <div className="mt-3 space-y-3">
                          {EPISODE_ARTWORK_MODE_OPTIONS.map((option) => (
                            <label key={`thumbnail-${option.id}`} className="flex items-start gap-3 cursor-pointer group">
                              <input
                                type="radio"
                                name="thumbnailEpisodeArtwork"
                                value={option.id}
                                checked={thumbnailEpisodeArtwork === option.id}
                                onChange={(event) => onSelectThumbnailEpisodeArtwork(event.target.value as EpisodeArtworkMode)}
                                className="mt-1 h-4 w-4 rounded-full border-white/20 bg-black accent-violet-500"
                              />
                              <span className="space-y-1">
                                <span className="block text-[11px] font-medium text-zinc-300">{option.label}</span>
                                <span className="block text-[10px] text-zinc-600">{option.description}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 border-t border-white/10 pt-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Backdrop episode artwork</div>
                        <p className="mt-2 text-[10px] leading-4 text-zinc-600">
                          Default is series backdrop for episodic backdrops. Switch this on only if you want backdrop and thumbnail to share the still.
                        </p>
                        <div className="mt-3 space-y-3">
                          {EPISODE_ARTWORK_MODE_OPTIONS.map((option) => (
                            <label key={`backdrop-${option.id}`} className="flex items-start gap-3 cursor-pointer group">
                              <input
                                type="radio"
                                name="backdropEpisodeArtwork"
                                value={option.id}
                                checked={backdropEpisodeArtwork === option.id}
                                onChange={(event) => onSelectBackdropEpisodeArtwork(event.target.value as EpisodeArtworkMode)}
                                className="mt-1 h-4 w-4 rounded-full border-white/20 bg-black accent-violet-500"
                              />
                              <span className="space-y-1">
                                <span className="block text-[11px] font-medium text-zinc-300">{option.label}</span>
                                <span className="block text-[10px] text-zinc-600">{option.description}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 border-t border-white/10 pt-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Thumbnail Ratings</div>
                        <p className="mt-2 text-[10px] leading-4 text-zinc-600">
                          Episode thumbs only support TMDB and IMDb today.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {THUMBNAIL_RATING_PREFERENCES.map((providerId) => {
                            const providerMeta =
                              RATING_PROVIDER_OPTIONS.find((provider) => provider.id === providerId) || null;
                            const isEnabled = thumbnailRatingPreferences.includes(providerId);
                            return (
                              <button
                                key={providerId}
                                type="button"
                                onClick={() => onToggleThumbnailRatingPreference(providerId)}
                                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                                  isEnabled
                                    ? 'border-violet-500/60 bg-zinc-800 text-white'
                                    : 'border-white/10 bg-zinc-900 text-zinc-400 hover:text-white'
                                }`}
                              >
                                {providerMeta?.label || providerId}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-zinc-950/70 p-3">
                      <div className="text-[11px] font-semibold text-zinc-200">Preset mapping</div>
                      <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                        Poster: <span className="font-mono text-zinc-300">{effectivePosterIdMode === 'imdb' ? '{imdb_id}' : 'tmdb:{type}:{tmdb_id}'}</span>
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                        Background: <span className="font-mono text-zinc-300">tmdb:{'{type}'}:{'{tmdb_id}'}</span>
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                        Logo: <span className="font-mono text-zinc-300">tmdb:{'{type}'}:{'{tmdb_id}'}</span>
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                        Episode thumb:{' '}
                        <span className="font-mono text-zinc-300">
                          {episodeIdMode === 'xrdbid'
                            ? 'xrdbid:{imdb_id}'
                            : episodeIdMode === 'tvdb'
                              ? 'tvdb:{tvdb_id}'
                              : episodeIdMode === 'kitsu'
                                ? 'kitsu:{kitsu_id}'
                                : episodeIdMode === 'anilist'
                                  ? 'anilist:{anilist_id}'
                                  : episodeIdMode === 'mal'
                                    ? 'mal:{mal_id}'
                                    : episodeIdMode === 'anidb'
                                      ? 'anidb:{anidb_id}'
                                      : '{imdb_id}'}
                        </span>
                        , <span className="font-mono text-zinc-300">{'{season}'}</span>, <span className="font-mono text-zinc-300">{'{episode}'}</span>
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                        Thumbnail episode artwork: <span className="font-mono text-zinc-300">{thumbnailEpisodeArtwork}</span>
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                        Backdrop episode artwork: <span className="font-mono text-zinc-300">{backdropEpisodeArtwork}</span>
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                        Thumbnail ratings: <span className="font-mono text-zinc-300">{thumbnailRatingPreferences.join(',') || '(off)'}</span>
                      </p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-zinc-950/70 p-3">
                      <div className="space-y-3">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={hideAiometadataCredentials}
                            onChange={(event) => onToggleHideAiometadataCredentials(event.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black accent-violet-500"
                          />
                          <span className="space-y-1">
                            <span className="block text-[11px] font-semibold text-zinc-200">Hide credentials</span>
                            <span className="block text-[11px] leading-5 text-zinc-500">
                              Only affects the exported AIOMetadata patterns below. Live XRDB request URLs still use the real keys you provide and are replaced here with placeholders such as <span className="font-mono text-zinc-300">{'{xrdb_key}'}</span>, <span className="font-mono text-zinc-300">{'{tmdb_key}'}</span>, <span className="font-mono text-zinc-300">{'{mdblist_key}'}</span>, and <span className="font-mono text-zinc-300">{'{fanart_key}'}</span> when needed.
                            </span>
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {aiometadataPatternRows.map((row) => (
                      <div key={row.key} className="rounded-xl border border-white/10 bg-black/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-[11px] font-semibold text-zinc-200">{row.label}</div>
                            <div className="mt-1 text-[11px] leading-5 text-zinc-500">{row.description}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(row.value);
                            }}
                            className="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-800"
                          >
                            Copy
                          </button>
                        </div>
                        <div className="mt-3 rounded-lg border border-white/10 bg-zinc-950/80 p-3 font-mono text-[11px] leading-5 text-zinc-300 break-all">
                          {row.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PosterModeOption({
  mode,
  currentMode,
  label,
  description,
  onSelect,
}: {
  mode: PosterIdMode;
  currentMode: PosterIdMode;
  label: string;
  description: string;
  onSelect: (value: PosterIdMode) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <input
        type="radio"
        name="posterIdMode"
        value={mode}
        checked={currentMode === mode}
        onChange={(event) => onSelect(event.target.value as PosterIdMode)}
        className="mt-1 h-4 w-4 rounded-full border-white/20 bg-black accent-violet-500"
      />
      <span className="space-y-1">
        <span className="block text-[11px] font-medium text-zinc-300">{label}</span>
        <span className="block text-[10px] text-zinc-600">{description}</span>
      </span>
    </label>
  );
}
