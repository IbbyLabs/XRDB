'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';

import {
  DEFAULT_PROVIDER_ICON_SCALE_PERCENT,
  DEFAULT_STACKED_ACCENT_MODE,
  DEFAULT_STACKED_ELEMENT_OFFSET_PX,
  DEFAULT_STACKED_LINE_GAP_PERCENT,
  DEFAULT_STACKED_LINE_HEIGHT_PERCENT,
  DEFAULT_STACKED_LINE_WIDTH_PERCENT,
  DEFAULT_STACKED_SURFACE_OPACITY_PERCENT,
  DEFAULT_STACKED_WIDTH_PERCENT,
  MAX_PROVIDER_ICON_SCALE_PERCENT,
  MAX_STACKED_ELEMENT_OFFSET_PX,
  MAX_STACKED_LINE_GAP_PERCENT,
  MAX_STACKED_LINE_HEIGHT_PERCENT,
  MAX_STACKED_LINE_WIDTH_PERCENT,
  MAX_STACKED_SURFACE_OPACITY_PERCENT,
  MAX_STACKED_WIDTH_PERCENT,
  MIN_PROVIDER_ICON_SCALE_PERCENT,
  MIN_STACKED_ELEMENT_OFFSET_PX,
  MIN_STACKED_LINE_GAP_PERCENT,
  MIN_STACKED_LINE_HEIGHT_PERCENT,
  MIN_STACKED_LINE_WIDTH_PERCENT,
  MIN_STACKED_SURFACE_OPACITY_PERCENT,
  MIN_STACKED_WIDTH_PERCENT,
  QUALITY_BADGE_OPTIONS,
  normalizeProviderIconScalePercent,
  normalizeStackedElementOffsetPx,
  normalizeStackedLineGapPercent,
  normalizeStackedLineHeightPercent,
  normalizeStackedLineWidthPercent,
  normalizeStackedSurfaceOpacityPercent,
  normalizeStackedWidthPercent,
  type RatingProviderAppearanceOverride,
  type RatingProviderAppearanceOverrides,
} from '@/lib/badgeCustomization';
import { GENRE_BADGE_MODE_OPTIONS, type GenreBadgeMode } from '@/lib/genreBadge';
import { type RemuxDisplayMode } from '@/lib/mediaFeatures';
import { POSTER_RATINGS_MAX_PER_SIDE_MIN } from '@/lib/posterLayoutOptions';
import { RATING_PROVIDER_OPTIONS, type RatingPreference } from '@/lib/ratingProviderCatalog';
import { type RatingPresentation } from '@/lib/ratingPresentation';
import { type RatingProviderRow } from '@/lib/ratingProviderRows';
import {
  QUALITY_BADGE_STYLE_OPTIONS,
  RATING_STYLE_OPTIONS,
  type QualityBadgeStyle,
  type RatingStyle,
} from '@/lib/ratingAppearance';
import type {
  ArtworkSource,
  BackdropImageSize,
  BackdropImageTextPreference,
  LogoBackground,
  PosterImageSize,
  PosterImageTextPreference,
  PosterQualityBadgesPosition,
  QualityBadgesSide,
  StreamBadgesSetting,
} from '@/lib/uiConfig';

const RatingProviderSortableList = dynamic(
  () =>
    import('@/components/configurator-rating-provider-sortable-list').then((module) => ({
      default: module.RatingProviderSortableList,
    })),
  {
    ssr: false,
  }
);

type PreviewType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';
type SelectionOption<T extends string> = {
  id: T;
  label: string;
};
type DetailedSelectionOption<T extends string> = SelectionOption<T> & {
  description?: string;
};
type ProviderMeta = (typeof RATING_PROVIDER_OPTIONS)[number];
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

export function QualitySection({
  previewType,
  qualityBadgeTypeLabel,
  activeStreamBadges,
  activeQualityBadgesStyle,
  activeQualityBadgesMax,
  qualityBadgesSide,
  posterQualityBadgesPosition,
  shouldShowQualityBadgesSide,
  shouldShowQualityBadgesPosition,
  activeQualityBadgePreferences,
  streamBadgeOptions,
  qualityBadgeSideOptions,
  qualityBadgePositionOptions,
  onSelectStreamBadges,
  onSelectQualityBadgeStyle,
  onSelectQualityBadgesMax,
  onSelectQualityBadgesSide,
  onSelectPosterQualityBadgePosition,
  onToggleQualityBadgePreference,
  activeRemuxDisplayMode,
  onSelectRemuxDisplayMode,
}: {
  previewType: PreviewType;
  qualityBadgeTypeLabel: string;
  activeStreamBadges: StreamBadgesSetting;
  activeQualityBadgesStyle: QualityBadgeStyle;
  activeQualityBadgesMax: number | null;
  qualityBadgesSide: QualityBadgesSide;
  posterQualityBadgesPosition: PosterQualityBadgesPosition;
  shouldShowQualityBadgesSide: boolean;
  shouldShowQualityBadgesPosition: boolean;
  activeQualityBadgePreferences: QualityBadgeOptionId[];
  streamBadgeOptions: Array<SelectionOption<StreamBadgesSetting>>;
  qualityBadgeSideOptions: Array<SelectionOption<QualityBadgesSide>>;
  qualityBadgePositionOptions: Array<SelectionOption<PosterQualityBadgesPosition>>;
  onSelectStreamBadges: (value: StreamBadgesSetting) => void;
  onSelectQualityBadgeStyle: (value: QualityBadgeStyle) => void;
  onSelectQualityBadgesMax: (value: number | null) => void;
  onSelectQualityBadgesSide: (value: QualityBadgesSide) => void;
  onSelectPosterQualityBadgePosition: (value: PosterQualityBadgesPosition) => void;
  onToggleQualityBadgePreference: (value: QualityBadgeOptionId) => void;
  activeRemuxDisplayMode: RemuxDisplayMode;
  onSelectRemuxDisplayMode: (value: RemuxDisplayMode) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-3">
      <div className="text-[11px] font-semibold text-zinc-400">
        Quality Badges · {qualityBadgeTypeLabel}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {previewType !== 'logo' ? (
          <div className={settingsCardClass}>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">Stream Badges</span>
            <div className={selectorGroupClass}>
              {streamBadgeOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectStreamBadges(option.id)}
                  className={selectorButtonClass(activeStreamBadges === option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className={settingsCardClass}>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">Badge Style</span>
          <div className={selectorGroupClass}>
            {QUALITY_BADGE_STYLE_OPTIONS.map((option) => (
              <button
                key={`quality-style-${option.id}`}
                type="button"
                onClick={() => onSelectQualityBadgeStyle(option.id)}
                className={selectorButtonClass(activeQualityBadgesStyle === option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className={settingsCardClass}>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Max badges</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={activeQualityBadgesMax ?? ''}
              onChange={(event) =>
                onSelectQualityBadgesMax(normalizeOptionalBadgeCountInput(event.target.value))
              }
              placeholder="Auto"
              min={POSTER_RATINGS_MAX_PER_SIDE_MIN}
              className="w-16 bg-black border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:border-violet-500/50 outline-none"
            />
            <button
              type="button"
              onClick={() => onSelectQualityBadgesMax(null)}
              className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
            >
              Auto
            </button>
          </div>
        </div>
        {shouldShowQualityBadgesSide ? (
          <div className={settingsCardClass}>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">Side</span>
            <div className={selectorGroupClass}>
              {qualityBadgeSideOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectQualityBadgesSide(option.id)}
                  className={selectorButtonClass(qualityBadgesSide === option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {shouldShowQualityBadgesPosition ? (
          <div className={settingsCardClass}>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">Position</span>
            <div className={selectorGroupClass}>
              {qualityBadgePositionOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectPosterQualityBadgePosition(option.id)}
                  className={selectorButtonClass(posterQualityBadgesPosition === option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className={settingsCardClass}>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">
          Visible Quality Badges
        </span>
        <div className="flex flex-wrap gap-1.5">
          {QUALITY_BADGE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onToggleQualityBadgePreference(option.id)}
              className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                activeQualityBadgePreferences.includes(option.id)
                  ? 'border-violet-500/60 bg-zinc-800 text-white'
                  : 'border-white/10 bg-zinc-900 text-zinc-400 hover:text-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className={settingsCardClass}>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">
          Remux Display
        </span>
        <div className={selectorGroupClass}>
          <button
            type="button"
            onClick={() => onSelectRemuxDisplayMode('composite')}
            className={selectorButtonClass(activeRemuxDisplayMode === 'composite')}
          >
            BD Remux
          </button>
          <button
            type="button"
            onClick={() => onSelectRemuxDisplayMode('separate')}
            className={selectorButtonClass(activeRemuxDisplayMode === 'separate')}
          >
            Show Both
          </button>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Keep only the quality marks that matter for your setup. The toggles stay visible while you edit so you can compare badge coverage, placement, no background styling, and silver mark styling without losing context.
      </p>
    </div>
  );
}

export function ProvidersSection({
  providersLabel,
  ratingProviderRows,
  ratingProviderAppearanceOverrides,
  activeProviderEditorId,
  activeRatingStyle,
  onSelectAllRatingPreferencesEnabled,
  onReorderRatingPreference,
  onToggleRatingPreference,
  onSelectActiveProviderEditorId,
  onUpdateProviderAppearanceOverride,
}: {
  providersLabel: string;
  ratingProviderRows: RatingProviderRow[];
  ratingProviderAppearanceOverrides: RatingProviderAppearanceOverrides;
  activeProviderEditorId: RatingPreference;
  activeRatingStyle: RatingStyle;
  onSelectAllRatingPreferencesEnabled: (enabled: boolean) => void;
  onReorderRatingPreference: (fromIndex: number, toIndex: number) => void;
  onToggleRatingPreference: (rating: RatingPreference) => void;
  onSelectActiveProviderEditorId: (value: RatingPreference) => void;
  onUpdateProviderAppearanceOverride: (
    id: RatingPreference,
    update: (current: RatingProviderAppearanceOverride) => RatingProviderAppearanceOverride,
  ) => void;
}) {
  const activeProviderMeta =
    RATING_PROVIDER_OPTIONS.find((provider) => provider.id === activeProviderEditorId) ||
    RATING_PROVIDER_OPTIONS[0];
  const activeProviderAppearanceOverride =
    (activeProviderMeta && ratingProviderAppearanceOverrides[activeProviderMeta.id]) || {};
  const usesStackedRatingStyle = activeRatingStyle === 'stacked';

  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block">
            {providersLabel} · drag to reorder
          </span>
          <div className="mt-1 text-[11px] text-zinc-500">
            {ratingProviderRows.filter((row) => row.enabled).length} of {ratingProviderRows.length} enabled
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onSelectAllRatingPreferencesEnabled(false)}
            className="rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-900"
          >
            Hide All Ratings
          </button>
          <button
            type="button"
            onClick={() => onSelectAllRatingPreferencesEnabled(true)}
            className="rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-900"
          >
            Enable All
          </button>
        </div>
      </div>
      <p className="text-[10px] leading-4 text-zinc-500">
        XRDB respects this order when rendering badges. Disabled providers stay available but are skipped. When every provider is off, the image renders without rating badges.
      </p>
      <RatingProviderSortableList
        rows={ratingProviderRows}
        onReorder={onReorderRatingPreference}
        onToggle={onToggleRatingPreference}
        fillDirection="row"
      />
      <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Provider Styling
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
              Customise the icon URL, accent colour, icon size, and stacked accent line behavior per source. Leave a field blank to keep the default XRDB art.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              activeProviderMeta
                ? onUpdateProviderAppearanceOverride(activeProviderMeta.id, () => ({}))
                : null
            }
            className="rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-900"
          >
            Reset {activeProviderMeta?.label}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ratingProviderRows.map((row) => {
            const meta = RATING_PROVIDER_OPTIONS.find((provider) => provider.id === row.id);
            const isSelected = row.id === activeProviderEditorId;
            const hasOverride = Boolean(ratingProviderAppearanceOverrides[row.id]);
            return (
              <button
                key={`provider-editor-${row.id}`}
                type="button"
                onClick={() => onSelectActiveProviderEditorId(row.id)}
                className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  isSelected
                    ? 'border-violet-500/60 bg-zinc-800 text-white'
                    : 'border-white/10 bg-zinc-900 text-zinc-400 hover:text-white'
                }`}
              >
                {meta?.label || row.id}
                {hasOverride ? ' *' : ''}
              </button>
            );
          })}
        </div>
        {activeProviderMeta ? (
          <div className="provider-editor-layout">
            <div className="min-w-0 space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">
                    Accent Colour
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={
                        activeProviderAppearanceOverride.accentColor ||
                        activeProviderMeta.accentColor
                      }
                      onChange={(event) =>
                        onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                          ...current,
                          accentColor: event.target.value,
                        }))
                      }
                      className="h-10 w-14 rounded-md border border-white/10 bg-black"
                    />
                    <div className="rounded-lg border border-white/10 bg-black px-2.5 py-2 text-xs text-zinc-300">
                      {activeProviderAppearanceOverride.accentColor ||
                        activeProviderMeta.accentColor}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">
                    Icon Size
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={MIN_PROVIDER_ICON_SCALE_PERCENT}
                      max={MAX_PROVIDER_ICON_SCALE_PERCENT}
                      step={1}
                      value={
                        activeProviderAppearanceOverride.iconScalePercent ||
                        DEFAULT_PROVIDER_ICON_SCALE_PERCENT
                      }
                      onChange={(event) =>
                        onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                          ...current,
                          iconScalePercent: normalizeProviderIconScalePercent(
                            event.target.value,
                          ),
                        }))
                      }
                      className="h-2 w-full accent-violet-500"
                    />
                    <span className="w-14 text-right text-[11px] text-zinc-400">
                      {activeProviderAppearanceOverride.iconScalePercent ||
                        DEFAULT_PROVIDER_ICON_SCALE_PERCENT}
                      %
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-zinc-950/50 p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      Stacked Badge
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                      Applies when the current rating style is stacked. Fine tune width, body opacity, accent behavior, and per element X and Y offsets for the top line, logo, and value.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black px-2.5 py-1.5 text-[11px] font-medium text-zinc-300">
                    <input
                      type="checkbox"
                      checked={activeProviderAppearanceOverride.stackedLineVisible !== false}
                      onChange={(event) =>
                        onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                          ...current,
                          stackedLineVisible: event.target.checked ? undefined : false,
                        }))
                      }
                      className="h-3.5 w-3.5 accent-violet-500"
                    />
                    <span>{activeProviderAppearanceOverride.stackedLineVisible === false ? 'Hidden' : 'Visible'}</span>
                  </label>
                </div>
                <div className={`grid gap-3 ${usesStackedRatingStyle ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-3 opacity-75'}`}>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Badge Width</span>
                      <span className="text-[11px] text-zinc-400">
                        {activeProviderAppearanceOverride.stackedWidthPercent ||
                          DEFAULT_STACKED_WIDTH_PERCENT}
                        %
                      </span>
                    </div>
                    <input
                      type="range"
                      min={MIN_STACKED_WIDTH_PERCENT}
                      max={MAX_STACKED_WIDTH_PERCENT}
                      step={1}
                      value={
                        activeProviderAppearanceOverride.stackedWidthPercent ||
                        DEFAULT_STACKED_WIDTH_PERCENT
                      }
                      onChange={(event) =>
                        onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                          ...current,
                          stackedWidthPercent: normalizeStackedWidthPercent(
                            event.target.value,
                          ),
                        }))
                      }
                      className="h-2 w-full accent-violet-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Body Opacity</span>
                      <span className="text-[11px] text-zinc-400">
                        {activeProviderAppearanceOverride.stackedSurfaceOpacityPercent ||
                          DEFAULT_STACKED_SURFACE_OPACITY_PERCENT}
                        %
                      </span>
                    </div>
                    <input
                      type="range"
                      min={MIN_STACKED_SURFACE_OPACITY_PERCENT}
                      max={MAX_STACKED_SURFACE_OPACITY_PERCENT}
                      step={1}
                      value={
                        activeProviderAppearanceOverride.stackedSurfaceOpacityPercent ||
                        DEFAULT_STACKED_SURFACE_OPACITY_PERCENT
                      }
                      onChange={(event) =>
                        onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                          ...current,
                          stackedSurfaceOpacityPercent: normalizeStackedSurfaceOpacityPercent(
                            event.target.value,
                          ),
                        }))
                      }
                      className="h-2 w-full accent-violet-500"
                    />
                  </div>
                  <div className="space-y-2 xl:col-span-1 md:col-span-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Accent Placement</span>
                      <span className="text-[11px] text-zinc-400">
                        {activeProviderAppearanceOverride.stackedAccentMode === 'logo'
                          ? 'Logo only'
                          : 'Badge'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                            ...current,
                            stackedAccentMode: 'badge',
                          }))
                        }
                        className={`rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition-colors ${
                          (activeProviderAppearanceOverride.stackedAccentMode ||
                            DEFAULT_STACKED_ACCENT_MODE) === 'badge'
                            ? 'border-violet-500/60 bg-violet-500/20 text-white'
                            : 'border-white/10 bg-black text-zinc-400 hover:text-white'
                        }`}
                      >
                        Badge
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                            ...current,
                            stackedAccentMode: 'logo',
                          }))
                        }
                        className={`rounded-lg border px-2.5 py-2 text-[11px] font-semibold transition-colors ${
                          (activeProviderAppearanceOverride.stackedAccentMode ||
                            DEFAULT_STACKED_ACCENT_MODE) === 'logo'
                            ? 'border-violet-500/60 bg-violet-500/20 text-white'
                            : 'border-white/10 bg-black text-zinc-400 hover:text-white'
                        }`}
                      >
                        Logo only
                      </button>
                    </div>
                  </div>
                  <StackedRangeField
                    label="Line Width"
                    value={activeProviderAppearanceOverride.stackedLineWidthPercent || DEFAULT_STACKED_LINE_WIDTH_PERCENT}
                    min={MIN_STACKED_LINE_WIDTH_PERCENT}
                    max={MAX_STACKED_LINE_WIDTH_PERCENT}
                    suffix="%"
                    onChange={(value) =>
                      onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                        ...current,
                        stackedLineWidthPercent: normalizeStackedLineWidthPercent(value),
                      }))
                    }
                  />
                  <StackedRangeField
                    label="Line Thickness"
                    value={activeProviderAppearanceOverride.stackedLineHeightPercent || DEFAULT_STACKED_LINE_HEIGHT_PERCENT}
                    min={MIN_STACKED_LINE_HEIGHT_PERCENT}
                    max={MAX_STACKED_LINE_HEIGHT_PERCENT}
                    suffix="%"
                    onChange={(value) =>
                      onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                        ...current,
                        stackedLineHeightPercent: normalizeStackedLineHeightPercent(value),
                      }))
                    }
                  />
                  <StackedRangeField
                    label="Line Gap"
                    value={activeProviderAppearanceOverride.stackedLineGapPercent || DEFAULT_STACKED_LINE_GAP_PERCENT}
                    min={MIN_STACKED_LINE_GAP_PERCENT}
                    max={MAX_STACKED_LINE_GAP_PERCENT}
                    suffix="%"
                    onChange={(value) =>
                      onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                        ...current,
                        stackedLineGapPercent: normalizeStackedLineGapPercent(value),
                      }))
                    }
                  />
                  <StackedRangeField
                    label="Line X Offset"
                    value={activeProviderAppearanceOverride.stackedLineOffsetX || DEFAULT_STACKED_ELEMENT_OFFSET_PX}
                    min={MIN_STACKED_ELEMENT_OFFSET_PX}
                    max={MAX_STACKED_ELEMENT_OFFSET_PX}
                    suffix="px"
                    onChange={(value) =>
                      onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                        ...current,
                        stackedLineOffsetX: normalizeStackedElementOffsetPx(value),
                      }))
                    }
                  />
                  <StackedRangeField
                    label="Line Y Offset"
                    value={activeProviderAppearanceOverride.stackedLineOffsetY || DEFAULT_STACKED_ELEMENT_OFFSET_PX}
                    min={MIN_STACKED_ELEMENT_OFFSET_PX}
                    max={MAX_STACKED_ELEMENT_OFFSET_PX}
                    suffix="px"
                    onChange={(value) =>
                      onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                        ...current,
                        stackedLineOffsetY: normalizeStackedElementOffsetPx(value),
                      }))
                    }
                  />
                  <StackedRangeField
                    label="Logo X Offset"
                    value={activeProviderAppearanceOverride.stackedIconOffsetX || DEFAULT_STACKED_ELEMENT_OFFSET_PX}
                    min={MIN_STACKED_ELEMENT_OFFSET_PX}
                    max={MAX_STACKED_ELEMENT_OFFSET_PX}
                    suffix="px"
                    onChange={(value) =>
                      onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                        ...current,
                        stackedIconOffsetX: normalizeStackedElementOffsetPx(value),
                      }))
                    }
                  />
                  <StackedRangeField
                    label="Logo Y Offset"
                    value={activeProviderAppearanceOverride.stackedIconOffsetY || DEFAULT_STACKED_ELEMENT_OFFSET_PX}
                    min={MIN_STACKED_ELEMENT_OFFSET_PX}
                    max={MAX_STACKED_ELEMENT_OFFSET_PX}
                    suffix="px"
                    onChange={(value) =>
                      onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                        ...current,
                        stackedIconOffsetY: normalizeStackedElementOffsetPx(value),
                      }))
                    }
                  />
                  <StackedRangeField
                    label="Rating X Offset"
                    value={activeProviderAppearanceOverride.stackedValueOffsetX || DEFAULT_STACKED_ELEMENT_OFFSET_PX}
                    min={MIN_STACKED_ELEMENT_OFFSET_PX}
                    max={MAX_STACKED_ELEMENT_OFFSET_PX}
                    suffix="px"
                    onChange={(value) =>
                      onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                        ...current,
                        stackedValueOffsetX: normalizeStackedElementOffsetPx(value),
                      }))
                    }
                  />
                  <StackedRangeField
                    label="Rating Y Offset"
                    value={activeProviderAppearanceOverride.stackedValueOffsetY || DEFAULT_STACKED_ELEMENT_OFFSET_PX}
                    min={MIN_STACKED_ELEMENT_OFFSET_PX}
                    max={MAX_STACKED_ELEMENT_OFFSET_PX}
                    suffix="px"
                    onChange={(value) =>
                      onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                        ...current,
                        stackedValueOffsetY: normalizeStackedElementOffsetPx(value),
                      }))
                    }
                  />
                </div>
                {!usesStackedRatingStyle ? (
                  <p className="text-[11px] leading-relaxed text-zinc-500">
                    You can set these now and they will apply the moment this output switches to stacked badges.
                  </p>
                ) : null}
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-2">
                  Value Position
                </label>
                <div className="grid gap-2">
                  <StackedRangeField
                    label="Value X Offset"
                    value={activeProviderAppearanceOverride.valueOffsetX || DEFAULT_STACKED_ELEMENT_OFFSET_PX}
                    min={MIN_STACKED_ELEMENT_OFFSET_PX}
                    max={MAX_STACKED_ELEMENT_OFFSET_PX}
                    suffix="px"
                    onChange={(value) =>
                      onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                        ...current,
                        valueOffsetX: normalizeStackedElementOffsetPx(value),
                      }))
                    }
                  />
                  <StackedRangeField
                    label="Value Y Offset"
                    value={activeProviderAppearanceOverride.valueOffsetY || DEFAULT_STACKED_ELEMENT_OFFSET_PX}
                    min={MIN_STACKED_ELEMENT_OFFSET_PX}
                    max={MAX_STACKED_ELEMENT_OFFSET_PX}
                    suffix="px"
                    onChange={(value) =>
                      onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                        ...current,
                        valueOffsetY: normalizeStackedElementOffsetPx(value),
                      }))
                    }
                  />
                </div>
                {!(activeRatingStyle === 'glass' || activeRatingStyle === 'square') ? (
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                    You can set these now and they will apply when the output uses glass or square badges.
                  </p>
                ) : null}
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 block mb-1">
                  Custom Icon URL
                </label>
                <input
                  type="url"
                  value={activeProviderAppearanceOverride.iconUrl || ''}
                  onChange={(event) =>
                    onUpdateProviderAppearanceOverride(activeProviderMeta.id, (current) => ({
                      ...current,
                      iconUrl: event.target.value,
                    }))
                  }
                  placeholder="https://example.com/logo.svg or data:image/svg+xml,..."
                  className="w-full bg-black border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:border-violet-500/50 outline-none"
                />
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                  Paste a direct image URL or a data URI. The expected format stays visible here while you edit so you do not have to remember it after adding a custom logo.
                </p>
              </div>
            </div>
            <div className="provider-editor-preview self-start rounded-xl border border-white/10 bg-black/60 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Active Preview
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[auto,1fr] sm:items-start">
                <div
                  className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/10 shadow-[0_14px_34px_rgba(0,0,0,0.28)]"
                  style={{
                    backgroundColor:
                      activeProviderAppearanceOverride.accentColor ||
                      activeProviderMeta.accentColor,
                  }}
                >
                  <Image
                    src={activeProviderAppearanceOverride.iconUrl || activeProviderMeta.iconUrl}
                    alt={`${activeProviderMeta.label} icon`}
                    width={32}
                    height={32}
                    unoptimized
                    className="max-h-8 max-w-8 object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">
                    {activeProviderMeta.label}
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                    Current icon and accent preview for poster, backdrop, and logo output. Stacked controls adjust width, surface opacity, and accent placement for this source.
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SimpleQuickTuneSection({
  previewType,
  quickPresentationOptions,
  activeRatingPresentation,
  activeRatingStyle,
  activeImageTextOptions,
  activeImageText,
  logoBackground,
  posterImageSizeOptions,
  posterImageSize,
  backdropImageSizeOptions,
  backdropImageSize,
  logoArtworkSourceOptions,
  activeArtworkSourceOptions,
  logoArtworkSource,
  activeArtworkSource,
  activeGenreBadgeMode,
  activeStreamBadges,
  streamBadgeOptions,
  onSelectRatingPresentation,
  onSelectRatingStyle,
  onSelectImageText,
  onSelectLogoBackground,
  onSelectPosterImageSize,
  onSelectBackdropImageSize,
  onSelectLogoArtworkSource,
  onSelectBackdropArtworkSource,
  onSelectThumbnailArtworkSource,
  onSelectPosterArtworkSource,
  onSelectGenreBadgeMode,
  onSelectStreamBadges,
}: {
  previewType: PreviewType;
  quickPresentationOptions: Array<DetailedSelectionOption<RatingPresentation>>;
  activeRatingPresentation: RatingPresentation;
  activeRatingStyle: RatingStyle;
  activeImageTextOptions: Array<
    SelectionOption<PosterImageTextPreference | BackdropImageTextPreference>
  >;
  activeImageText: PosterImageTextPreference | BackdropImageTextPreference;
  logoBackground: LogoBackground;
  posterImageSizeOptions: Array<DetailedSelectionOption<PosterImageSize>>;
  posterImageSize: PosterImageSize;
  backdropImageSizeOptions: Array<DetailedSelectionOption<BackdropImageSize>>;
  backdropImageSize: BackdropImageSize;
  logoArtworkSourceOptions: Array<SelectionOption<ArtworkSource>>;
  activeArtworkSourceOptions: Array<SelectionOption<ArtworkSource>>;
  logoArtworkSource: ArtworkSource;
  activeArtworkSource: ArtworkSource;
  activeGenreBadgeMode: GenreBadgeMode;
  activeStreamBadges: StreamBadgesSetting;
  streamBadgeOptions: Array<SelectionOption<StreamBadgesSetting>>;
  onSelectRatingPresentation: (value: RatingPresentation) => void;
  onSelectRatingStyle: (value: RatingStyle) => void;
  onSelectImageText: (
    value: PosterImageTextPreference | BackdropImageTextPreference,
  ) => void;
  onSelectLogoBackground: (value: LogoBackground) => void;
  onSelectPosterImageSize: (value: PosterImageSize) => void;
  onSelectBackdropImageSize: (value: BackdropImageSize) => void;
  onSelectLogoArtworkSource: (value: ArtworkSource) => void;
  onSelectBackdropArtworkSource: (value: ArtworkSource) => void;
  onSelectThumbnailArtworkSource: (value: ArtworkSource) => void;
  onSelectPosterArtworkSource: (value: ArtworkSource) => void;
  onSelectGenreBadgeMode: (value: GenreBadgeMode) => void;
  onSelectStreamBadges: (value: StreamBadgesSetting) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Presentation
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {quickPresentationOptions.map((option) => (
            <button
              key={`simple-presentation-${option.id}`}
              type="button"
              onClick={() => onSelectRatingPresentation(option.id)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                activeRatingPresentation === option.id
                  ? 'border-violet-500/60 bg-violet-500/12 text-white'
                  : 'border-white/10 bg-black/30 text-zinc-300 hover:border-white/20 hover:bg-black/40'
              }`}
            >
              <div className="text-sm font-semibold">{option.label}</div>
              <div className="mt-1 text-[11px] leading-5 text-zinc-500">{option.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Rating Style
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {RATING_STYLE_OPTIONS.map((option) => (
              <button
                key={`simple-style-${option.id}`}
                type="button"
                onClick={() => onSelectRatingStyle(option.id)}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  activeRatingStyle === option.id
                    ? 'border-violet-500/60 bg-violet-500/12 text-white'
                    : 'border-white/10 bg-black text-zinc-400 hover:border-white/20 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {previewType !== 'logo' ? (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Artwork Text
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {activeImageTextOptions.map((option) => (
                <button
                  key={`simple-text-${option.id}`}
                  type="button"
                  onClick={() => onSelectImageText(option.id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    activeImageText === option.id
                      ? 'border-violet-500/60 bg-violet-500/12 text-white'
                      : 'border-white/10 bg-black text-zinc-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Logo Background
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {(['transparent', 'dark'] as const).map((option) => (
                <button
                  key={`simple-logo-background-${option}`}
                  type="button"
                  onClick={() => onSelectLogoBackground(option)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    logoBackground === option
                      ? 'border-violet-500/60 bg-violet-500/12 text-white'
                      : 'border-white/10 bg-black text-zinc-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  {option === 'dark' ? 'Dark' : 'Transparent'}
                </button>
              ))}
            </div>
          </div>
        )}

        {previewType === 'poster' ? (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Poster Size
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {posterImageSizeOptions.map((option) => (
                <button
                  key={`simple-poster-size-${option.id}`}
                  type="button"
                  onClick={() => onSelectPosterImageSize(option.id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    posterImageSize === option.id
                      ? 'border-violet-500/60 bg-violet-500/12 text-white'
                      : 'border-white/10 bg-black text-zinc-400 hover:border-white/20 hover:text-white'
                  }`}
                  title={option.description}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {previewType === 'backdrop' ? (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Backdrop Size
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {backdropImageSizeOptions.map((option) => (
                <button
                  key={`simple-backdrop-size-${option.id}`}
                  type="button"
                  onClick={() => onSelectBackdropImageSize(option.id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    backdropImageSize === option.id
                      ? 'border-violet-500/60 bg-violet-500/12 text-white'
                      : 'border-white/10 bg-black text-zinc-400 hover:border-white/20 hover:text-white'
                  }`}
                  title={option.description}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Artwork Source
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {(previewType === 'logo' ? logoArtworkSourceOptions : activeArtworkSourceOptions).map((option) => (
              <button
                key={`simple-art-${option.id}`}
                type="button"
                onClick={() => {
                  if (previewType === 'logo') {
                    onSelectLogoArtworkSource(option.id);
                    return;
                  }
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
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  (previewType === 'logo' ? logoArtworkSource : activeArtworkSource) === option.id
                    ? 'border-violet-500/60 bg-violet-500/12 text-white'
                    : 'border-white/10 bg-black text-zinc-400 hover:border-white/20 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Genre Badge
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {GENRE_BADGE_MODE_OPTIONS.filter((option) =>
              option.id === 'off' || option.id === 'text' || option.id === 'both',
            ).map((option) => (
              <button
                key={`simple-genre-${option.id}`}
                type="button"
                onClick={() => onSelectGenreBadgeMode(option.id)}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  activeGenreBadgeMode === option.id
                    ? 'border-violet-500/60 bg-violet-500/12 text-white'
                    : 'border-white/10 bg-black text-zinc-400 hover:border-white/20 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {previewType !== 'logo' ? (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Stream Badges
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {streamBadgeOptions.map((option) => (
                <button
                  key={`simple-stream-${option.id}`}
                  type="button"
                  onClick={() => onSelectStreamBadges(option.id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                    activeStreamBadges === option.id
                      ? 'border-violet-500/60 bg-violet-500/12 text-white'
                      : 'border-white/10 bg-black text-zinc-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StackedRangeField({
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
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
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
        onChange={(event) => onChange(event.target.value)}
        className="h-2 w-full accent-violet-500"
      />
    </div>
  );
}
