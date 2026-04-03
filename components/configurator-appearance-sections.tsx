'use client';

import { hexToRgbaCss } from '@/lib/hexToRgbaCss';
import {
  DEFAULT_POSTER_EDGE_OFFSET,
  MAX_POSTER_EDGE_OFFSET,
  normalizePosterEdgeOffset,
} from '@/lib/posterEdgeOffset';
import {
  AGGREGATE_ACCENT_MODE_OPTIONS,
  AGGREGATE_RATING_SOURCE_ACCENTS,
  DEFAULT_AGGREGATE_DYNAMIC_STOPS,
  AGGREGATE_RATING_SOURCE_OPTIONS,
  RATING_PRESENTATION_OPTIONS,
  normalizeAggregateDynamicStops,
  usesDualAggregateRatingPresentation,
  type AggregateAccentMode,
  type AggregateRatingSource,
  type RatingPresentation,
} from '@/lib/ratingPresentation';
import {
  BACKDROP_RATING_LAYOUT_OPTIONS,
  type BackdropRatingLayout,
} from '@/lib/backdropLayoutOptions';
import {
  DEFAULT_POSTER_RATINGS_MAX_PER_SIDE,
  POSTER_RATING_LAYOUT_OPTIONS,
  POSTER_RATINGS_MAX_PER_SIDE_MIN,
  isVerticalPosterRatingLayout,
  type PosterRatingLayout,
} from '@/lib/posterLayoutOptions';
import {
  DEFAULT_BADGE_SCALE_PERCENT,
  DEFAULT_NO_BACKGROUND_BADGE_OUTLINE_COLOR,
  DEFAULT_NO_BACKGROUND_BADGE_OUTLINE_WIDTH_PX,
  MAX_GENRE_BADGE_BORDER_WIDTH_PX,
  MAX_NO_BACKGROUND_BADGE_OUTLINE_WIDTH_PX,
  MAX_THUMBNAIL_RATING_BADGE_SCALE_PERCENT,
  MIN_GENRE_BADGE_BORDER_WIDTH_PX,
  MIN_NO_BACKGROUND_BADGE_OUTLINE_WIDTH_PX,
  MAX_BADGE_SCALE_PERCENT,
  MAX_GENRE_BADGE_SCALE_PERCENT,
  MAX_QUALITY_BADGE_SCALE_PERCENT,
  MIN_BADGE_SCALE_PERCENT,
  QUALITY_BADGE_OPTIONS,
  normalizeBadgeScalePercent,
  normalizeGenreBadgeBorderWidthPx,
  normalizeGenreBadgeScalePercent,
  normalizeNoBackgroundBadgeOutlineWidthPx,
  normalizeQualityBadgeScalePercent,
  normalizeThumbnailRatingBadgeScalePercent,
} from '@/lib/badgeCustomization';
import {
  DEFAULT_QUALITY_BADGES_STYLE,
  QUALITY_BADGE_STYLE_OPTIONS,
  RATING_STYLE_OPTIONS,
  type QualityBadgeStyle,
  type RatingStyle,
} from '@/lib/ratingAppearance';
import {
  DEFAULT_GENRE_BADGE_ANIME_GROUPING,
  DEFAULT_GENRE_BADGE_MODE,
  DEFAULT_GENRE_BADGE_POSITION,
  DEFAULT_GENRE_BADGE_STYLE,
  GENRE_BADGE_MODE_OPTIONS,
  GENRE_BADGE_POSITION_OPTIONS,
  GENRE_BADGE_STYLE_OPTIONS,
  type GenreBadgeAnimeGrouping,
  type GenreBadgeMode,
  type GenreBadgePosition,
  type GenreBadgeStyle,
} from '@/lib/genreBadge';
import {
  DEFAULT_RATING_VALUE_MODE,
  RATING_VALUE_MODE_OPTIONS,
  type RatingValueMode,
} from '@/lib/ratingDisplay';
import {
  MAX_RATING_STACK_OFFSET_PX,
  MIN_RATING_STACK_OFFSET_PX,
  normalizeRatingStackOffsetPx,
} from '@/lib/ratingStackOffset';
import { type PosterCompactRingSource } from '@/lib/posterCompactRing';
import {
  DEFAULT_SIDE_RATING_OFFSET,
  SIDE_RATING_POSITION_OPTIONS,
  type SideRatingPosition,
} from '@/lib/sideRatingPosition';
import type {
  ArtworkSource,
  BackdropImageSize,
  BackdropImageTextPreference,
  EpisodeArtworkMode,
  LogoBackground,
  PosterImageSize,
  PosterImageTextPreference,
  RandomPosterFallbackMode,
  RandomPosterLanguageMode,
  RandomPosterTextMode,
} from '@/lib/uiConfig';

type PreviewType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';
type SelectionOption<T extends string> = {
  id: T;
  label: string;
};
type DetailedSelectionOption<T extends string> = SelectionOption<T> & {
  description?: string;
};
type QualityBadgeOptionId = (typeof QUALITY_BADGE_OPTIONS)[number]['id'];

const selectorGroupClass = 'flex flex-wrap gap-1 rounded-lg border border-white/10 bg-zinc-900 p-1';
const selectorButtonClass = (active: boolean) =>
  `rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
    active ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
  }`;
const settingsCardClass = 'rounded-xl border border-white/10 bg-zinc-900/50 p-3 space-y-2';

const normalizeOptionalBadgeCountInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  if (normalized < POSTER_RATINGS_MAX_PER_SIDE_MIN) return null;
  return normalized;
};

const normalizeOptionalNonNegativeIntegerInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  if (normalized < 0) return 0;
  return normalized;
};

const normalizeOptionalVoteAverageInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, Number(parsed.toFixed(2))));
};

const RANDOM_POSTER_TEXT_OPTIONS: Array<DetailedSelectionOption<RandomPosterTextMode>> = [
  {
    id: 'any',
    label: 'Any',
    description: 'Allow text and textless posters.',
  },
  {
    id: 'text',
    label: 'Text',
    description: 'Only allow posters with language text metadata.',
  },
  {
    id: 'textless',
    label: 'Textless',
    description: 'Only allow posters with no language text metadata.',
  },
];

const RANDOM_POSTER_LANGUAGE_OPTIONS: Array<DetailedSelectionOption<RandomPosterLanguageMode>> = [
  {
    id: 'any',
    label: 'Any',
    description: 'Allow any poster language metadata.',
  },
  {
    id: 'requested',
    label: 'Requested',
    description: 'Require the requested language when metadata is available.',
  },
  {
    id: 'fallback',
    label: 'Fallback',
    description: 'Require the fallback language when metadata is available.',
  },
];

const RANDOM_POSTER_FALLBACK_OPTIONS: Array<DetailedSelectionOption<RandomPosterFallbackMode>> = [
  {
    id: 'best',
    label: 'Best Match',
    description: 'Use the highest ranked TMDB poster when filters find no match.',
  },
  {
    id: 'original',
    label: 'Original',
    description: 'Fall back to the canonical original poster when filters find no match.',
  },
];

export function PresentationSection({
  presentationOrder,
  previewType,
  activeRatingPresentation,
  layoutPlacementHelp,
  isEditorialPresentation,
  isCompactRingPresentation,
  activePresentationPreservesLayout,
  usesAggregatePresentation,
  showsAggregateRatingSource,
  showsAggregateAccentBarOffset,
  activeAggregateAccent,
  activeAggregateRatingSource,
  posterRingValueSource,
  posterRingProgressSource,
  posterCompactRingSourceOptions,
  aggregateAccentMode,
  aggregateAccentColor,
  aggregateCriticsAccentColor,
  aggregateAudienceAccentColor,
  aggregateDynamicStops,
  aggregateAccentBarVisible,
  aggregateAccentBarOffset,
  onSelectRatingPresentation,
  onSelectAggregateRatingSource,
  onSelectPosterRingValueSource,
  onSelectPosterRingProgressSource,
  onSelectAggregateAccentMode,
  onSelectAggregateAccentColor,
  onSelectAggregateCriticsAccentColor,
  onSelectAggregateAudienceAccentColor,
  onSelectAggregateDynamicStops,
  onToggleAggregateAccentBarVisible,
  onSelectAggregateAccentBarOffset,
}: {
  presentationOrder: RatingPresentation[];
  previewType: PreviewType;
  activeRatingPresentation: RatingPresentation;
  layoutPlacementHelp: string | null;
  isEditorialPresentation: boolean;
  isCompactRingPresentation: boolean;
  activePresentationPreservesLayout: boolean;
  usesAggregatePresentation: boolean;
  showsAggregateRatingSource: boolean;
  showsAggregateAccentBarOffset: boolean;
  activeAggregateAccent: string;
  activeAggregateRatingSource: AggregateRatingSource;
  posterRingValueSource: PosterCompactRingSource;
  posterRingProgressSource: PosterCompactRingSource;
  posterCompactRingSourceOptions: Array<DetailedSelectionOption<PosterCompactRingSource>>;
  aggregateAccentMode: AggregateAccentMode;
  aggregateAccentColor: string;
  aggregateCriticsAccentColor: string;
  aggregateAudienceAccentColor: string;
  aggregateDynamicStops: string;
  aggregateAccentBarVisible: boolean;
  aggregateAccentBarOffset: number;
  onSelectRatingPresentation: (value: RatingPresentation) => void;
  onSelectAggregateRatingSource: (value: AggregateRatingSource) => void;
  onSelectPosterRingValueSource: (value: PosterCompactRingSource) => void;
  onSelectPosterRingProgressSource: (value: PosterCompactRingSource) => void;
  onSelectAggregateAccentMode: (value: AggregateAccentMode) => void;
  onSelectAggregateAccentColor: (value: string) => void;
  onSelectAggregateCriticsAccentColor: (value: string) => void;
  onSelectAggregateAudienceAccentColor: (value: string) => void;
  onSelectAggregateDynamicStops: (value: string) => void;
  onToggleAggregateAccentBarVisible: () => void;
  onSelectAggregateAccentBarOffset: (value: number) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-3">
      <div className="text-[11px] font-semibold text-zinc-400">Presentation</div>
      <div className="grid gap-2 md:grid-cols-2">
        {presentationOrder.map((id) => {
          const option = RATING_PRESENTATION_OPTIONS.find((entry) => entry.id === id);
          if (!option) return null;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelectRatingPresentation(option.id)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                activeRatingPresentation === option.id
                  ? 'border-violet-500/60 bg-violet-500/10 text-white'
                  : 'border-white/10 bg-zinc-900/60 text-zinc-300 hover:border-white/20 hover:bg-zinc-900'
              }`}
            >
              <div className="flex min-h-[3rem] flex-col items-start gap-2">
                <span className="min-w-0 break-words text-sm font-semibold">{option.label}</span>
                {activeRatingPresentation === option.id ? (
                  <span className="shrink-0 whitespace-nowrap rounded-full border border-violet-400/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
                    Selected
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                {option.description}
              </p>
            </button>
          );
        })}
      </div>
      {layoutPlacementHelp ? (
        <p className="text-[11px] leading-relaxed text-zinc-500">
          {isEditorialPresentation
            ? previewType === 'poster'
              ? 'Editorial uses a fixed top left score mark that feels printed into the poster. Layout controls stay saved for when you switch back to another mode.'
              : 'Editorial has its custom treatment on posters. Here it falls back to one clean average badge.'
            : isCompactRingPresentation
              ? previewType === 'poster'
                ? 'Compact Ring uses a fixed top right score ring. Layout controls stay saved for when you switch back to another mode.'
                : 'Compact Ring is poster only. Here it falls back to one clean average badge.'
            : activePresentationPreservesLayout
              ? `This mode still respects the selected layout below, so you can move ratings to ${layoutPlacementHelp}.`
              : `Blockbuster uses a fixed ${previewType === 'poster' ? 'left/right poster stack' : 'right vertical backdrop stack'}. Switch to another presentation to use ${layoutPlacementHelp}.`}
        </p>
      ) : (
        <p className="text-[11px] leading-relaxed text-zinc-500">
          {isEditorialPresentation
            ? 'Editorial keeps its unique treatment on posters. Logo output falls back to one clean average badge.'
            : isCompactRingPresentation
              ? 'Compact Ring stays pinned to the poster corner. Logo output falls back to one clean average badge.'
            : 'Logo presentation keeps the output controls below available.'}
        </p>
      )}
      {usesAggregatePresentation || isCompactRingPresentation ? (
        <div
          className="rounded-xl border bg-zinc-900/50 p-3 space-y-2"
          style={{
            borderColor: hexToRgbaCss(activeAggregateAccent, 0.24),
            backgroundImage: `linear-gradient(145deg, ${hexToRgbaCss(activeAggregateAccent, 0.12)}, rgba(24,24,27,0.78) 58%)`,
          }}
        >
          {isCompactRingPresentation ? (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Compact Ring Sources</div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Center Value</div>
                  <div className="flex flex-wrap gap-1">
                    {posterCompactRingSourceOptions.map((option) => (
                      <button
                        key={`poster-ring-value-${option.id}`}
                        type="button"
                        onClick={() => onSelectPosterRingValueSource(option.id)}
                        className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                          posterRingValueSource === option.id
                            ? 'bg-zinc-800 text-white'
                            : 'border-white/10 bg-zinc-900 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Ring Progress</div>
                  <div className="flex flex-wrap gap-1">
                    {posterCompactRingSourceOptions.map((option) => (
                      <button
                        key={`poster-ring-progress-${option.id}`}
                        type="button"
                        onClick={() => onSelectPosterRingProgressSource(option.id)}
                        className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                          posterRingProgressSource === option.id
                            ? 'bg-zinc-800 text-white'
                            : 'border-white/10 bg-zinc-900 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                XRDB normalizes both selected sources to a 0 to 100 score so the ring fill and center number stay comparable.
              </p>
            </>
          ) : null}
          {showsAggregateRatingSource ? (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Average Source</div>
              <div className="flex flex-wrap gap-1">
                {AGGREGATE_RATING_SOURCE_OPTIONS.map((option) => {
                  const accentColor = AGGREGATE_RATING_SOURCE_ACCENTS[option.id];
                  const isSelected = activeAggregateRatingSource === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onSelectAggregateRatingSource(option.id)}
                      className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                        isSelected
                          ? 'bg-zinc-800 text-white'
                          : 'border-white/10 bg-zinc-900 text-zinc-400 hover:text-white'
                      }`}
                      style={
                        isSelected
                          ? {
                              borderColor: hexToRgbaCss(accentColor, 0.7),
                              backgroundImage: `linear-gradient(135deg, ${hexToRgbaCss(accentColor, 0.28)}, rgba(24,24,27,0.96))`,
                              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px ${hexToRgbaCss(accentColor, 0.12)}`,
                            }
                          : undefined
                      }
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: accentColor,
                            boxShadow: `0 0 0 2px ${hexToRgbaCss(accentColor, 0.16)}`,
                          }}
                        />
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                {AGGREGATE_RATING_SOURCE_OPTIONS.find((option) => option.id === activeAggregateRatingSource)?.description}
              </p>
            </>
          ) : null}
          <div className="pt-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              {isCompactRingPresentation ? 'Ring Accent' : 'Accent'}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {AGGREGATE_ACCENT_MODE_OPTIONS.map((option) => {
                const isSelected = aggregateAccentMode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onSelectAggregateAccentMode(option.id)}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                      isSelected
                        ? 'bg-zinc-800 text-white'
                        : 'border-white/10 bg-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              {AGGREGATE_ACCENT_MODE_OPTIONS.find((option) => option.id === aggregateAccentMode)?.description}
              {aggregateAccentMode === 'genre'
                ? isCompactRingPresentation
                  ? ' Compact Ring can pick up the resolved genre colour for the ring glow and stroke.'
                  : ' Editorial already behaves like this on posters; this extends genre matching to the other aggregate badge styles too.'
                : ''}
            </p>
          </div>
          {aggregateAccentMode === 'custom' ? (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <ColorField
                label="Custom Accent"
                value={aggregateAccentColor}
                onChange={onSelectAggregateAccentColor}
              >
                <div className="px-5 pb-4 pt-3 text-[11px] text-zinc-500">
                  Mapped anime IDs such as AniList, MAL, TVDB, and AniDB resolve when mapping data is available for the title.
                </div>
              </ColorField>
              {usesDualAggregateRatingPresentation(activeRatingPresentation) ? (
                <>
                  <ColorField
                    label="Critics Accent"
                    value={aggregateCriticsAccentColor}
                    onChange={onSelectAggregateCriticsAccentColor}
                  />
                  <ColorField
                    label="Audience Accent"
                    value={aggregateAudienceAccentColor}
                    onChange={onSelectAggregateAudienceAccentColor}
                  />
                </>
              ) : null}
            </div>
          ) : null}
          {aggregateAccentMode === 'dynamic' ? (
            <div className="space-y-2 pt-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block">
                Dynamic Stops
              </label>
              <input
                type="text"
                value={aggregateDynamicStops}
                onChange={(event) => onSelectAggregateDynamicStops(event.target.value)}
                onBlur={(event) =>
                  onSelectAggregateDynamicStops(
                    normalizeAggregateDynamicStops(event.target.value, DEFAULT_AGGREGATE_DYNAMIC_STOPS),
                  )
                }
                placeholder={DEFAULT_AGGREGATE_DYNAMIC_STOPS}
                className="w-full bg-black border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:border-violet-500/50 outline-none"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => onSelectAggregateDynamicStops(DEFAULT_AGGREGATE_DYNAMIC_STOPS)}
                  className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                >
                  Reset Stops
                </button>
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                Use comma-separated threshold and colour pairs like 0:#7f1d1d,40:#dc2626,60:#f59e0b,75:#84cc16,85:#16a34a.
              </p>
            </div>
          ) : null}
          {showsAggregateAccentBarOffset ? (
            <div className="pt-1">
              <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Accent Bar
                </span>
                <button
                  type="button"
                  onClick={onToggleAggregateAccentBarVisible}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    aggregateAccentBarVisible
                      ? 'border-violet-500/60 bg-violet-500/20 text-white'
                      : 'border-white/10 bg-black text-zinc-400 hover:text-white'
                  }`}
                >
                  {aggregateAccentBarVisible ? 'Visible' : 'Hidden'}
                </button>
              </div>
              <RangeField
                label="Accent Bar Offset"
                value={aggregateAccentBarOffset}
                min={-24}
                max={24}
                suffix="px"
                onChange={onSelectAggregateAccentBarOffset}
              />
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                Negative values move the aggregate accent bar upward a few pixels. You can hide the line entirely with the toggle above in compact and labeled average badge layouts.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function LookSection({
  previewType,
  styleLabel,
  textLabel,
  activeRatingStyle,
  activeImageTextOptions,
  activeImageText,
  activeImageTextDescription,
  ratingValueMode,
  ratingXOffsetPillGlass,
  ratingYOffsetPillGlass,
  ratingXOffsetSquare,
  ratingYOffsetSquare,
  activeGenreBadgeMode,
  activeGenreBadgeStyle,
  activeGenreBadgePosition,
  activeGenreBadgeAnimeGrouping,
  activeArtworkSourceOptions,
  activeArtworkSource,
  activeArtworkSourceDescription,
  posterImageSizeOptions,
  posterImageSize,
  randomPosterText,
  randomPosterLanguage,
  randomPosterMinVoteCount,
  randomPosterMinVoteAverage,
  randomPosterMinWidth,
  randomPosterMinHeight,
  randomPosterFallback,
  backdropImageSizeOptions,
  backdropImageSize,
  activePosterImageSizeDescription,
  activeBackdropImageSizeDescription,
  posterRatingsLayout,
  posterRatingsMaxPerSide,
  posterRatingsMax,
  backdropRatingsLayout,
  backdropRatingsMax,
  backdropBottomRatingsRow,
  thumbnailRatingsLayout,
  thumbnailRatingsMax,
  thumbnailBottomRatingsRow,
  thumbnailEpisodeArtwork,
  posterEdgeOffset,
  shouldShowSideRatingPlacement,
  activeSideRatingsPosition,
  activeSideRatingsOffset,
  logoArtworkSourceOptions,
  logoArtworkSource,
  activeLogoSourceDescription,
  logoBackground,
  logoRatingsMax,
  logoBottomRatingsRow,
  logoQualityBadgesStyle,
  logoQualityBadgesMax,
  logoQualityBadgePreferences,
  activeRatingBadgeScale,
  activeGenreBadgeScale,
  activeGenreBadgeBorderWidth,
  activeQualityBadgeScale,
  posterNoBackgroundBadgeOutlineColor,
  posterNoBackgroundBadgeOutlineWidth,
  onSelectRatingStyle,
  onSelectImageText,
  onSelectRatingValueMode,
  onSelectRatingXOffsetPillGlass,
  onSelectRatingYOffsetPillGlass,
  onSelectRatingXOffsetSquare,
  onSelectRatingYOffsetSquare,
  onSelectGenreBadgeMode,
  onSelectGenreBadgeStyle,
  onSelectGenreBadgePosition,
  onSelectGenreBadgeAnimeGrouping,
  onSelectBackdropArtworkSource,
  onSelectThumbnailArtworkSource,
  onSelectPosterArtworkSource,
  onSelectPosterImageSize,
  onSelectRandomPosterText,
  onSelectRandomPosterLanguage,
  onSelectRandomPosterMinVoteCount,
  onSelectRandomPosterMinVoteAverage,
  onSelectRandomPosterMinWidth,
  onSelectRandomPosterMinHeight,
  onSelectRandomPosterFallback,
  onSelectBackdropImageSize,
  onSelectPosterRatingsLayout,
  onSelectPosterRatingsMaxPerSide,
  onSelectPosterRatingsMax,
  onSelectBackdropRatingsLayout,
  onSelectBackdropRatingsMax,
  onToggleBackdropBottomRatingsRow,
  onSelectThumbnailRatingsLayout,
  onSelectThumbnailRatingsMax,
  onToggleThumbnailBottomRatingsRow,
  onSelectThumbnailEpisodeArtwork,
  onSelectPosterEdgeOffset,
  onResetPosterEdgeOffset,
  onSelectSideRatingsPosition,
  onSelectSideRatingsOffset,
  onSelectLogoArtworkSource,
  onSelectLogoBackground,
  onSelectLogoRatingsMax,
  onToggleLogoBottomRatingsRow,
  onSelectLogoQualityBadgesStyle,
  onSelectLogoQualityBadgesMax,
  onToggleQualityBadgePreference,
  onSelectRatingBadgeScale,
  onSelectGenreBadgeScale,
  onSelectGenreBadgeBorderWidth,
  onSelectQualityBadgeScale,
  onSelectPosterNoBackgroundBadgeOutlineColor,
  onSelectPosterNoBackgroundBadgeOutlineWidth,
}: {
  previewType: PreviewType;
  styleLabel: string;
  textLabel: string;
  activeRatingStyle: RatingStyle;
  activeImageTextOptions: Array<
    DetailedSelectionOption<PosterImageTextPreference | BackdropImageTextPreference>
  >;
  activeImageText: PosterImageTextPreference | BackdropImageTextPreference;
  activeImageTextDescription: string | null;
  ratingValueMode: RatingValueMode;
  ratingXOffsetPillGlass: number;
  ratingYOffsetPillGlass: number;
  ratingXOffsetSquare: number;
  ratingYOffsetSquare: number;
  activeGenreBadgeMode: GenreBadgeMode;
  activeGenreBadgeStyle: GenreBadgeStyle;
  activeGenreBadgePosition: GenreBadgePosition;
  activeGenreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  activeArtworkSourceOptions: Array<DetailedSelectionOption<ArtworkSource>>;
  activeArtworkSource: ArtworkSource;
  activeArtworkSourceDescription: string | null;
  posterImageSizeOptions: Array<DetailedSelectionOption<PosterImageSize>>;
  posterImageSize: PosterImageSize;
  randomPosterText: RandomPosterTextMode;
  randomPosterLanguage: RandomPosterLanguageMode;
  randomPosterMinVoteCount: number | null;
  randomPosterMinVoteAverage: number | null;
  randomPosterMinWidth: number | null;
  randomPosterMinHeight: number | null;
  randomPosterFallback: RandomPosterFallbackMode;
  backdropImageSizeOptions: Array<DetailedSelectionOption<BackdropImageSize>>;
  backdropImageSize: BackdropImageSize;
  activePosterImageSizeDescription: string;
  activeBackdropImageSizeDescription: string;
  posterRatingsLayout: PosterRatingLayout;
  posterRatingsMaxPerSide: number | null;
  posterRatingsMax: number | null;
  backdropRatingsLayout: BackdropRatingLayout;
  backdropRatingsMax: number | null;
  backdropBottomRatingsRow: boolean;
  thumbnailRatingsLayout: BackdropRatingLayout;
  thumbnailRatingsMax: number | null;
  thumbnailBottomRatingsRow: boolean;
  thumbnailEpisodeArtwork: EpisodeArtworkMode;
  posterEdgeOffset: number;
  shouldShowSideRatingPlacement: boolean;
  activeSideRatingsPosition: SideRatingPosition;
  activeSideRatingsOffset: number;
  logoArtworkSourceOptions: Array<DetailedSelectionOption<ArtworkSource>>;
  logoArtworkSource: ArtworkSource;
  activeLogoSourceDescription: string | null;
  logoBackground: LogoBackground;
  logoRatingsMax: number | null;
  logoBottomRatingsRow: boolean;
  logoQualityBadgesStyle: QualityBadgeStyle;
  logoQualityBadgesMax: number | null;
  logoQualityBadgePreferences: QualityBadgeOptionId[];
  activeRatingBadgeScale: number;
  activeGenreBadgeScale: number;
  activeGenreBadgeBorderWidth: number;
  activeQualityBadgeScale: number;
  posterNoBackgroundBadgeOutlineColor: string;
  posterNoBackgroundBadgeOutlineWidth: number;
  onSelectRatingStyle: (value: RatingStyle) => void;
  onSelectImageText: (
    value: PosterImageTextPreference | BackdropImageTextPreference,
  ) => void;
  onSelectRatingValueMode: (value: RatingValueMode) => void;
  onSelectRatingXOffsetPillGlass: (value: number) => void;
  onSelectRatingYOffsetPillGlass: (value: number) => void;
  onSelectRatingXOffsetSquare: (value: number) => void;
  onSelectRatingYOffsetSquare: (value: number) => void;
  onSelectGenreBadgeMode: (value: GenreBadgeMode) => void;
  onSelectGenreBadgeStyle: (value: GenreBadgeStyle) => void;
  onSelectGenreBadgePosition: (value: GenreBadgePosition) => void;
  onSelectGenreBadgeAnimeGrouping: (value: GenreBadgeAnimeGrouping) => void;
  onSelectBackdropArtworkSource: (value: ArtworkSource) => void;
  onSelectThumbnailArtworkSource: (value: ArtworkSource) => void;
  onSelectPosterArtworkSource: (value: ArtworkSource) => void;
  onSelectPosterImageSize: (value: PosterImageSize) => void;
  onSelectRandomPosterText: (value: RandomPosterTextMode) => void;
  onSelectRandomPosterLanguage: (value: RandomPosterLanguageMode) => void;
  onSelectRandomPosterMinVoteCount: (value: number | null) => void;
  onSelectRandomPosterMinVoteAverage: (value: number | null) => void;
  onSelectRandomPosterMinWidth: (value: number | null) => void;
  onSelectRandomPosterMinHeight: (value: number | null) => void;
  onSelectRandomPosterFallback: (value: RandomPosterFallbackMode) => void;
  onSelectBackdropImageSize: (value: BackdropImageSize) => void;
  onSelectPosterRatingsLayout: (value: PosterRatingLayout) => void;
  onSelectPosterRatingsMaxPerSide: (value: number | null) => void;
  onSelectPosterRatingsMax: (value: number | null) => void;
  onSelectBackdropRatingsLayout: (value: BackdropRatingLayout) => void;
  onSelectBackdropRatingsMax: (value: number | null) => void;
  onToggleBackdropBottomRatingsRow: () => void;
  onSelectThumbnailRatingsLayout: (value: BackdropRatingLayout) => void;
  onSelectThumbnailRatingsMax: (value: number | null) => void;
  onToggleThumbnailBottomRatingsRow: () => void;
  onSelectThumbnailEpisodeArtwork: (value: EpisodeArtworkMode) => void;
  onSelectPosterEdgeOffset: (value: number) => void;
  onResetPosterEdgeOffset: () => void;
  onSelectSideRatingsPosition: (value: SideRatingPosition) => void;
  onSelectSideRatingsOffset: (value: number) => void;
  onSelectLogoArtworkSource: (value: ArtworkSource) => void;
  onSelectLogoBackground: (value: LogoBackground) => void;
  onSelectLogoRatingsMax: (value: number | null) => void;
  onToggleLogoBottomRatingsRow: () => void;
  onSelectLogoQualityBadgesStyle: (value: QualityBadgeStyle) => void;
  onSelectLogoQualityBadgesMax: (value: number | null) => void;
  onToggleQualityBadgePreference: (value: QualityBadgeOptionId) => void;
  onSelectRatingBadgeScale: (value: number) => void;
  onSelectGenreBadgeScale: (value: number) => void;
  onSelectGenreBadgeBorderWidth: (value: number) => void;
  onSelectQualityBadgeScale: (value: number) => void;
  onSelectPosterNoBackgroundBadgeOutlineColor: (value: string) => void;
  onSelectPosterNoBackgroundBadgeOutlineWidth: (value: number) => void;
}) {
  const supportsStyleStackOffsets =
    activeRatingStyle === 'glass' || activeRatingStyle === 'square';
  const activeStyleStackOffsetX =
    activeRatingStyle === 'glass' ? ratingXOffsetPillGlass : ratingXOffsetSquare;
  const activeStyleStackOffsetY =
    activeRatingStyle === 'glass' ? ratingYOffsetPillGlass : ratingYOffsetSquare;
  const handleStyleStackOffsetXChange = (value: number) => {
    const normalized = normalizeRatingStackOffsetPx(value);
    if (activeRatingStyle === 'glass') {
      onSelectRatingXOffsetPillGlass(normalized);
      return;
    }
    onSelectRatingXOffsetSquare(normalized);
  };
  const handleStyleStackOffsetYChange = (value: number) => {
    const normalized = normalizeRatingStackOffsetPx(value);
    if (activeRatingStyle === 'glass') {
      onSelectRatingYOffsetPillGlass(normalized);
      return;
    }
    onSelectRatingYOffsetSquare(normalized);
  };
  const styleStackOffsetLabel =
    activeRatingStyle === 'glass' ? 'Pill Stack Offset' : 'Square Stack Offset';
  const showRandomPosterFilters = previewType === 'poster' && activeImageText === 'random';
  const ratingBadgeScaleMax =
    previewType === 'thumbnail' ? MAX_THUMBNAIL_RATING_BADGE_SCALE_PERCENT : MAX_BADGE_SCALE_PERCENT;
  const handleRatingBadgeScaleChange = (value: number) => {
    if (previewType === 'thumbnail') {
      onSelectRatingBadgeScale(normalizeThumbnailRatingBadgeScalePercent(String(value)));
      return;
    }
    onSelectRatingBadgeScale(normalizeBadgeScalePercent(String(value)));
  };

  return (
    <>
      <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-3">
        <div className="text-[11px] font-semibold text-zinc-400">Appearance</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className={settingsCardClass}>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">{styleLabel}</span>
            <div className={selectorGroupClass}>
              {RATING_STYLE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectRatingStyle(option.id)}
                  className={selectorButtonClass(activeRatingStyle === option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {previewType !== 'logo' ? (
            <div className={settingsCardClass}>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">{textLabel}</span>
              <div className={selectorGroupClass}>
                {activeImageTextOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onSelectImageText(option.id)}
                    className={selectorButtonClass(activeImageText === option.id)}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className={settingsCardClass}>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">Rating Values</span>
            <div className={selectorGroupClass}>
              {RATING_VALUE_MODE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectRatingValueMode(option.id)}
                  className={selectorButtonClass(ratingValueMode === option.id)}
                  title={option.description}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {supportsStyleStackOffsets ? (
            <div className={settingsCardClass}>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">
                {styleStackOffsetLabel}
              </span>
              <div className="space-y-2">
                <RangeField
                  label="X Offset"
                  value={activeStyleStackOffsetX}
                  min={MIN_RATING_STACK_OFFSET_PX}
                  max={MAX_RATING_STACK_OFFSET_PX}
                  suffix="px"
                  onChange={handleStyleStackOffsetXChange}
                />
                <RangeField
                  label="Y Offset"
                  value={activeStyleStackOffsetY}
                  min={MIN_RATING_STACK_OFFSET_PX}
                  max={MAX_RATING_STACK_OFFSET_PX}
                  suffix="px"
                  onChange={handleStyleStackOffsetYChange}
                />
              </div>
            </div>
          ) : null}
          <div className={settingsCardClass}>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">Genre Badge</span>
            <div className={selectorGroupClass}>
              {GENRE_BADGE_MODE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectGenreBadgeMode(option.id)}
                  className={selectorButtonClass(activeGenreBadgeMode === option.id)}
                  title={option.description}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className={settingsCardClass}>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">Genre Badge Style</span>
            <div className={selectorGroupClass}>
              {GENRE_BADGE_STYLE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectGenreBadgeStyle(option.id)}
                  className={selectorButtonClass(activeGenreBadgeStyle === option.id)}
                  title={option.description}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className={settingsCardClass}>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">Genre Badge Position</span>
            <div className={selectorGroupClass}>
              {GENRE_BADGE_POSITION_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectGenreBadgePosition(option.id)}
                  className={selectorButtonClass(activeGenreBadgePosition === option.id)}
                  title={option.description}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className={settingsCardClass}>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">Anime Grouping</span>
            <div className={selectorGroupClass}>
              {[
                { id: 'split', label: 'Split', description: 'Keep anime separate from animation.' },
                { id: 'merge', label: 'Merge', description: 'Treat anime like the broader animation family.' },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectGenreBadgeAnimeGrouping(option.id as GenreBadgeAnimeGrouping)}
                  className={selectorButtonClass(activeGenreBadgeAnimeGrouping === option.id)}
                  title={option.description}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-zinc-500">
          {RATING_VALUE_MODE_OPTIONS.find((option) => option.id === ratingValueMode)?.description}{' '}
          Genre badges use a small curated bucket set. Clear genres such as horror, comedy, drama, sci fi, fantasy, crime, documentary, animation, and anime resolve. When drama appears beside a stronger supported family, the more specific bucket still wins. The active preview type keeps its own badge mode, style, position, and scale.
        </p>
        {previewType === 'poster' || previewType === 'backdrop' || previewType === 'thumbnail' ? (
          <div className={settingsCardClass}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Artwork Source</div>
            <div className={selectorGroupClass}>
              {activeArtworkSourceOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    if (previewType === 'backdrop') {
                      onSelectBackdropArtworkSource(option.id);
                      return;
                    }
                    if (previewType === 'thumbnail') {
                      onSelectThumbnailArtworkSource(option.id);
                      return;
                    }
                    onSelectPosterArtworkSource(option.id);
                  }}
                  className={selectorButtonClass(activeArtworkSource === option.id)}
                  title={option.description}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {activeArtworkSourceDescription ? (
              <p className="text-[11px] leading-relaxed text-zinc-500">
                {previewType === 'backdrop'
                  ? activeArtworkSourceDescription.replace('poster', 'backdrop')
                  : previewType === 'thumbnail'
                    ? activeArtworkSourceDescription.replace('poster', 'thumbnail')
                  : activeArtworkSourceDescription}
                {activeArtworkSource === 'fanart'
                  ? ' Original and clean use the top ranked fanart image. Alternative uses the next ranked fanart image when one exists.'
                  : ''}
              </p>
            ) : null}
            {previewType === 'thumbnail' ? (
              <>
                <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Episode Artwork
                </div>
                <div className={selectorGroupClass}>
                  {[
                    { id: 'still', label: 'Still' },
                    { id: 'series', label: 'Series' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onSelectThumbnailEpisodeArtwork(option.id as EpisodeArtworkMode)}
                      className={selectorButtonClass(thumbnailEpisodeArtwork === option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Still keeps episode thumbnails tied to the TMDB episode frame when one exists. Series uses the normal backdrop artwork stack instead.
                </p>
              </>
            ) : null}
            {previewType === 'poster' ? (
              <>
                <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Poster Size
                </div>
                <div className={selectorGroupClass}>
                  {posterImageSizeOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onSelectPosterImageSize(option.id)}
                      className={selectorButtonClass(posterImageSize === option.id)}
                      title={option.description}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  {activePosterImageSizeDescription}
                </p>
                {showRandomPosterFilters ? (
                  <>
                    <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      Random Poster Filters
                    </div>
                    <div className="space-y-3 rounded-lg border border-white/10 bg-zinc-950/60 p-3">
                      <div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                          Text
                        </div>
                        <div className={selectorGroupClass}>
                          {RANDOM_POSTER_TEXT_OPTIONS.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => onSelectRandomPosterText(option.id)}
                              className={selectorButtonClass(randomPosterText === option.id)}
                              title={option.description}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                          Language
                        </div>
                        <div className={selectorGroupClass}>
                          {RANDOM_POSTER_LANGUAGE_OPTIONS.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => onSelectRandomPosterLanguage(option.id)}
                              className={selectorButtonClass(randomPosterLanguage === option.id)}
                              title={option.description}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                            Min Vote Count
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={randomPosterMinVoteCount ?? ''}
                              onChange={(event) =>
                                onSelectRandomPosterMinVoteCount(
                                  normalizeOptionalNonNegativeIntegerInput(event.target.value),
                                )
                              }
                              placeholder="Any"
                              className="w-full bg-black border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:border-violet-500/50 outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => onSelectRandomPosterMinVoteCount(null)}
                              className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                            >
                              Auto
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                            Min Vote Average
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={randomPosterMinVoteAverage ?? ''}
                              onChange={(event) =>
                                onSelectRandomPosterMinVoteAverage(
                                  normalizeOptionalVoteAverageInput(event.target.value),
                                )
                              }
                              placeholder="Any"
                              className="w-full bg-black border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:border-violet-500/50 outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => onSelectRandomPosterMinVoteAverage(null)}
                              className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                            >
                              Auto
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                            Min Width
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={randomPosterMinWidth ?? ''}
                              onChange={(event) =>
                                onSelectRandomPosterMinWidth(
                                  normalizeOptionalNonNegativeIntegerInput(event.target.value),
                                )
                              }
                              placeholder="Any"
                              className="w-full bg-black border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:border-violet-500/50 outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => onSelectRandomPosterMinWidth(null)}
                              className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                            >
                              Auto
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                            Min Height
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={randomPosterMinHeight ?? ''}
                              onChange={(event) =>
                                onSelectRandomPosterMinHeight(
                                  normalizeOptionalNonNegativeIntegerInput(event.target.value),
                                )
                              }
                              placeholder="Any"
                              className="w-full bg-black border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:border-violet-500/50 outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => onSelectRandomPosterMinHeight(null)}
                              className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                            >
                              Auto
                            </button>
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                          No Match Fallback
                        </div>
                        <div className={selectorGroupClass}>
                          {RANDOM_POSTER_FALLBACK_OPTIONS.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => onSelectRandomPosterFallback(option.id)}
                              className={selectorButtonClass(randomPosterFallback === option.id)}
                              title={option.description}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="text-[11px] leading-relaxed text-zinc-500">
                        Applies to TMDB random poster picks. Filters only affect random poster selection and keep deterministic seed behavior.
                      </p>
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
            {previewType === 'backdrop' ? (
              <>
                <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Backdrop Size
                </div>
                <div className={selectorGroupClass}>
                  {backdropImageSizeOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onSelectBackdropImageSize(option.id)}
                      className={selectorButtonClass(backdropImageSize === option.id)}
                      title={option.description}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  {activeBackdropImageSizeDescription}
                </p>
              </>
            ) : null}
          </div>
        ) : null}
        {previewType !== 'logo' && activeImageTextDescription ? (
          <p className="text-[11px] leading-relaxed text-zinc-500">
            {activeImageTextDescription}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-3">
        <div className="text-[11px] font-semibold text-zinc-400">Layouts</div>
        {previewType === 'poster' ? (
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-3 space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Poster Layout</div>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <div className="flex flex-wrap gap-1">
                  {POSTER_RATING_LAYOUT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onSelectPosterRatingsLayout(option.id)}
                      className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                        posterRatingsLayout === option.id
                          ? 'border-violet-500/60 bg-zinc-800 text-white'
                          : 'border-white/10 bg-zinc-900 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              {isVerticalPosterRatingLayout(posterRatingsLayout) ? (
                <OptionalCountField
                  label="Max/side"
                  value={posterRatingsMaxPerSide}
                  buttonLabel="Auto"
                  onChange={onSelectPosterRatingsMaxPerSide}
                />
              ) : null}
              <OptionalCountField
                label="Max ratings"
                value={posterRatingsMax}
                buttonLabel="Auto"
                onChange={onSelectPosterRatingsMax}
              />
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Use this to cap how many rating badges render after ordering. Keep the provider list below enabled for the sources you still want available.
            </p>
          </div>
        ) : null}

        {previewType === 'backdrop' || previewType === 'thumbnail' ? (
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-3 space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              {previewType === 'thumbnail' ? 'Thumbnail Layout' : 'Backdrop Layout'}
            </div>
            <div className="flex flex-wrap gap-1">
              {BACKDROP_RATING_LAYOUT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() =>
                    previewType === 'thumbnail'
                      ? onSelectThumbnailRatingsLayout(option.id)
                      : onSelectBackdropRatingsLayout(option.id)
                  }
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                    (previewType === 'thumbnail' ? thumbnailRatingsLayout : backdropRatingsLayout) === option.id
                      ? 'border-violet-500/60 bg-zinc-800 text-white'
                      : 'border-white/10 bg-zinc-900 text-zinc-400 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Ratings Row</div>
              <div className={selectorGroupClass}>
                <button
                  type="button"
                  onClick={() => {
                    if (previewType === 'thumbnail') {
                      if (thumbnailBottomRatingsRow) {
                        onToggleThumbnailBottomRatingsRow();
                      }
                      return;
                    }
                    if (backdropBottomRatingsRow) {
                      onToggleBackdropBottomRatingsRow();
                    }
                  }}
                  className={selectorButtonClass(
                    !(previewType === 'thumbnail' ? thumbnailBottomRatingsRow : backdropBottomRatingsRow),
                  )}
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (previewType === 'thumbnail') {
                      if (!thumbnailBottomRatingsRow) {
                        onToggleThumbnailBottomRatingsRow();
                      }
                      return;
                    }
                    if (!backdropBottomRatingsRow) {
                      onToggleBackdropBottomRatingsRow();
                    }
                  }}
                  className={selectorButtonClass(
                    previewType === 'thumbnail' ? thumbnailBottomRatingsRow : backdropBottomRatingsRow,
                  )}
                >
                  Bottom Row
                </button>
              </div>
            </div>
            <OptionalCountField
              label="Max ratings"
              value={previewType === 'thumbnail' ? thumbnailRatingsMax : backdropRatingsMax}
              buttonLabel="Auto"
              onChange={
                previewType === 'thumbnail'
                  ? onSelectThumbnailRatingsMax
                  : onSelectBackdropRatingsMax
              }
            />
            <p className="text-[11px] leading-relaxed text-zinc-500">
              {previewType === 'thumbnail'
                ? thumbnailBottomRatingsRow
                  ? 'Bottom Row overrides the saved thumbnail layout until you switch it off.'
                  : 'Thumbnail output can stay dense, but this cap keeps badge stacks inside the episode frame when you only want the strongest sources.'
                : backdropBottomRatingsRow
                  ? 'Bottom Row overrides the saved backdrop layout until you switch it off.'
                  : 'Backdrop output can stay dense, but this cap gives users a cleaner badge row when they only want the top few sources.'}
            </p>
          </div>
        ) : null}

        {previewType === 'poster' ? (
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-3 space-y-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Poster Edge Offset
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="range"
                min={0}
                max={MAX_POSTER_EDGE_OFFSET}
                step={1}
                value={posterEdgeOffset}
                onChange={(event) => onSelectPosterEdgeOffset(Number(event.target.value))}
                className="h-2 w-40 accent-violet-500"
              />
              <input
                type="number"
                min={0}
                max={MAX_POSTER_EDGE_OFFSET}
                step={1}
                value={posterEdgeOffset}
                onChange={(event) => {
                  onSelectPosterEdgeOffset(normalizePosterEdgeOffset(event.target.value));
                }}
                className="w-16 bg-black border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:border-violet-500/50 outline-none"
              />
              <button
                type="button"
                onClick={onResetPosterEdgeOffset}
                className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
              >
                Reset
              </button>
              <span className="text-[11px] text-zinc-500">Extra inset from poster edges</span>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Moves poster side rating stacks, side quality columns, and corner genre badges inward so external app buttons are less likely to cover them.
            </p>
          </div>
        ) : null}

        {shouldShowSideRatingPlacement ? (
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-3 space-y-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Side Rating Placement
            </div>
            <div className="flex flex-wrap gap-1">
              {SIDE_RATING_POSITION_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectSideRatingsPosition(option.id)}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                    activeSideRatingsPosition === option.id
                      ? 'border-violet-500/60 bg-zinc-800 text-white'
                      : 'border-white/10 bg-zinc-900 text-zinc-400 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {activeSideRatingsPosition === 'custom' ? (
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  Vertical Offset
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={activeSideRatingsOffset}
                  onChange={(event) => onSelectSideRatingsOffset(Number(event.target.value))}
                  className="h-2 w-40 accent-violet-500"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={activeSideRatingsOffset}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    onSelectSideRatingsOffset(
                      Number.isFinite(parsed)
                        ? Math.max(0, Math.min(100, Math.round(parsed)))
                        : DEFAULT_SIDE_RATING_OFFSET
                    );
                  }}
                  className="w-16 bg-black border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:border-violet-500/50 outline-none"
                />
                <span className="text-[11px] text-zinc-500">0 = top, 100 = bottom</span>
              </div>
            ) : null}
            <p className="text-[11px] leading-relaxed text-zinc-500">
              {previewType === 'backdrop'
                ? 'Applies only to the backdrop right vertical stack, including blockbuster mode.'
                : previewType === 'thumbnail'
                  ? 'Applies only to the thumbnail right vertical stack, including blockbuster mode.'
                : 'Applies only to poster side stacks, including blockbuster mode.'}
            </p>
          </div>
        ) : null}

        {previewType === 'logo' ? (
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-3 space-y-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Logo Output</div>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">Artwork Source</span>
                <div className="xrdb-toggle-group flex gap-1 p-1 bg-zinc-900 rounded-lg border border-white/10">
                  {logoArtworkSourceOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onSelectLogoArtworkSource(option.id)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        logoArtworkSource === option.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                      }`}
                      title={option.description}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">Background</span>
                <div className="xrdb-toggle-group flex gap-1 p-1 bg-zinc-900 rounded-lg border border-white/10">
                  {(['transparent', 'dark'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => onSelectLogoBackground(option)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        logoBackground === option ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {option === 'dark' ? 'Dark' : 'Transparent'}
                    </button>
                  ))}
                </div>
              </div>
              <OptionalCountField
                label="Max ratings"
                value={logoRatingsMax}
                buttonLabel="Default"
                widthClassName="w-20"
                onChange={onSelectLogoRatingsMax}
              />
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">Ratings Row</span>
                <div className="xrdb-toggle-group flex gap-1 p-1 bg-zinc-900 rounded-lg border border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      if (logoBottomRatingsRow) {
                        onToggleLogoBottomRatingsRow();
                      }
                    }}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      !logoBottomRatingsRow ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!logoBottomRatingsRow) {
                        onToggleLogoBottomRatingsRow();
                      }
                    }}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      logoBottomRatingsRow ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Bottom Row
                  </button>
                </div>
              </div>
            </div>
            <div className="space-y-2 rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Logo Quality Badges</div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">Quality Badge Style</span>
                <div className="flex flex-wrap gap-1">
                  {QUALITY_BADGE_STYLE_OPTIONS.map((option) => (
                    <button
                      key={`logo-quality-style-${option.id}`}
                      type="button"
                      onClick={() => onSelectLogoQualityBadgesStyle(option.id)}
                      className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                        logoQualityBadgesStyle === option.id
                          ? 'border-violet-500/60 bg-zinc-800 text-white'
                          : 'border-white/10 bg-zinc-900 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <OptionalCountField
                label="Max badges"
                value={logoQualityBadgesMax}
                buttonLabel="Auto"
                onChange={onSelectLogoQualityBadgesMax}
              />
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">Visible Quality Badges</span>
                <div className="flex flex-wrap gap-1.5">
                  {QUALITY_BADGE_OPTIONS.map((option) => (
                    <button
                      key={`logo-quality-${option.id}`}
                      type="button"
                      onClick={() => onToggleQualityBadgePreference(option.id)}
                      className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                        logoQualityBadgePreferences.includes(option.id)
                          ? 'border-violet-500/60 bg-zinc-800 text-white'
                          : 'border-white/10 bg-zinc-900 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {activeLogoSourceDescription ? (
              <p className="text-[11px] leading-relaxed text-zinc-500">
                {activeLogoSourceDescription.replace('artwork', 'logo assets')}
                {logoBottomRatingsRow
                  ? ' Ratings stay on the Bottom Row, which is most noticeable in denser presentations.'
                  : ''}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-3 space-y-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Badge Sizing</div>
          <div className="grid gap-3 md:grid-cols-3">
            <ScaleField
              label="Rating badges"
              value={activeRatingBadgeScale}
              min={MIN_BADGE_SCALE_PERCENT}
              max={ratingBadgeScaleMax}
              onChange={handleRatingBadgeScaleChange}
            />
            <ScaleField
              label="Genre badge"
              value={activeGenreBadgeScale}
              min={MIN_BADGE_SCALE_PERCENT}
              max={MAX_GENRE_BADGE_SCALE_PERCENT}
              onChange={(value) => onSelectGenreBadgeScale(normalizeGenreBadgeScalePercent(String(value)))}
            />
            {activeGenreBadgeStyle === 'glass' ? (
              <ScaleField
                label="Genre border"
                value={activeGenreBadgeBorderWidth}
                min={MIN_GENRE_BADGE_BORDER_WIDTH_PX}
                max={MAX_GENRE_BADGE_BORDER_WIDTH_PX}
                step={0.1}
                suffix="px"
                onChange={(value) =>
                  onSelectGenreBadgeBorderWidth(normalizeGenreBadgeBorderWidthPx(String(value)))
                }
              />
            ) : null}
            <ScaleField
              label="Quality badges"
              value={activeQualityBadgeScale}
              min={MIN_BADGE_SCALE_PERCENT}
              max={MAX_QUALITY_BADGE_SCALE_PERCENT}
              onChange={(value) => onSelectQualityBadgeScale(normalizeQualityBadgeScalePercent(String(value)))}
            />
          </div>
          {previewType === 'poster' ? (
            <div className="grid gap-3 md:grid-cols-2">
              <ColorField
                label="No Background Outline Color"
                value={posterNoBackgroundBadgeOutlineColor}
                onChange={onSelectPosterNoBackgroundBadgeOutlineColor}
              />
              <div className="space-y-2">
                <RangeField
                  label="No Background Outline Width"
                  value={posterNoBackgroundBadgeOutlineWidth}
                  min={MIN_NO_BACKGROUND_BADGE_OUTLINE_WIDTH_PX}
                  max={MAX_NO_BACKGROUND_BADGE_OUTLINE_WIDTH_PX}
                  suffix="px"
                  onChange={(value) =>
                    onSelectPosterNoBackgroundBadgeOutlineWidth(
                      normalizeNoBackgroundBadgeOutlineWidthPx(String(value)),
                    )
                  }
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectPosterNoBackgroundBadgeOutlineColor(
                        DEFAULT_NO_BACKGROUND_BADGE_OUTLINE_COLOR,
                      );
                      onSelectPosterNoBackgroundBadgeOutlineWidth(
                        DEFAULT_NO_BACKGROUND_BADGE_OUTLINE_WIDTH_PX,
                      );
                    }}
                    className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                  >
                    Reset Outline
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <p className="text-[11px] leading-relaxed text-zinc-500">
            These sliders let people increase badge and tag legibility without forcing a new layout. XRDB will still fit the final output back into the selected poster, backdrop, or logo frame.
          </p>
        </div>
      </div>
    </>
  );
}

function ColorField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-14 rounded-md border border-white/10 bg-black"
        />
        <div className="rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs text-zinc-300">
          {value}
        </div>
      </div>
      {children}
    </div>
  );
}

function OptionalCountField({
  label,
  value,
  buttonLabel,
  widthClassName = 'w-16',
  onChange,
}: {
  label: string;
  value: number | null;
  buttonLabel: string;
  widthClassName?: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
      <input
        type="number"
        value={value ?? ''}
        onChange={(event) => onChange(normalizeOptionalBadgeCountInput(event.target.value))}
        placeholder="Auto"
        min={POSTER_RATINGS_MAX_PER_SIDE_MIN}
        className={`${widthClassName} bg-black border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:border-violet-500/50 outline-none`}
      />
      <button
        type="button"
        onClick={() => onChange(null)}
        className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          {label}
        </span>
        <span className="text-[11px] text-zinc-400">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 h-2 w-full accent-violet-500"
      />
    </>
  );
}

function ScaleField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '%',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const displayValue = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
        <span className="text-[11px] text-zinc-400">
          {displayValue}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full accent-violet-500"
      />
    </div>
  );
}
