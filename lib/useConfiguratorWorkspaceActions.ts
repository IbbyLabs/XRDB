import { useCallback, type Dispatch, type SetStateAction } from 'react';

import {
  DEFAULT_PROVIDER_ICON_SCALE_PERCENT,
  DEFAULT_STACKED_ACCENT_MODE,
  DEFAULT_STACKED_ELEMENT_OFFSET_PX,
  DEFAULT_STACKED_LINE_GAP_PERCENT,
  DEFAULT_STACKED_LINE_HEIGHT_PERCENT,
  DEFAULT_STACKED_LINE_WIDTH_PERCENT,
  DEFAULT_STACKED_SURFACE_OPACITY_PERCENT,
  DEFAULT_STACKED_WIDTH_PERCENT,
  QUALITY_BADGE_OPTIONS,
  normalizeProviderIconScalePercent,
  normalizeStackedAccentMode,
  normalizeStackedElementOffsetPx,
  normalizeStackedLineGapPercent,
  normalizeStackedLineHeightPercent,
  normalizeStackedLineWidthPercent,
  normalizeStackedSurfaceOpacityPercent,
  normalizeStackedWidthPercent,
  type RatingProviderAppearanceOverride,
  type RatingProviderAppearanceOverrides,
} from '@/lib/badgeCustomization';
import { applyConfiguratorPreset, type ConfiguratorPresetId } from '@/lib/configuratorPresets';
import {
  filterThumbnailRatingPreferences,
  THUMBNAIL_RATING_PREFERENCES,
  type ThumbnailRatingPreference,
} from '@/lib/episodeIdentity';
import { enabledOrderedToRows, rowsToEnabledOrdered, type RatingProviderRow } from '@/lib/ratingProviderRows';
import { type RatingPreference } from '@/lib/ratingProviderCatalog';
import { type SavedUiConfig } from '@/lib/uiConfig';

type ProxyType = 'poster' | 'backdrop' | 'logo';

type QualityBadgePreferenceId = (typeof QUALITY_BADGE_OPTIONS)[number]['id'];

export function useConfiguratorWorkspaceActions({
  applyWorkspaceConfig,
  buildCurrentUiConfig,
  handleExitWizard,
  previewType,
  setActiveQualityBadgePreferences,
  setBackdropRatingRows,
  setLogoRatingRows,
  setPosterRatingRows,
  setRatingProviderAppearanceOverrides,
  setSelectedPresetId,
  setThumbnailRatingRows,
}: {
  applyWorkspaceConfig: (config: SavedUiConfig, status?: 'loaded' | 'imported' | 'preset') => void;
  buildCurrentUiConfig: () => SavedUiConfig;
  handleExitWizard: () => void;
  previewType: ProxyType;
  setActiveQualityBadgePreferences: Dispatch<SetStateAction<QualityBadgePreferenceId[]>>;
  setBackdropRatingRows: Dispatch<SetStateAction<RatingProviderRow[]>>;
  setLogoRatingRows: Dispatch<SetStateAction<RatingProviderRow[]>>;
  setPosterRatingRows: Dispatch<SetStateAction<RatingProviderRow[]>>;
  setRatingProviderAppearanceOverrides: Dispatch<SetStateAction<RatingProviderAppearanceOverrides>>;
  setSelectedPresetId: Dispatch<SetStateAction<ConfiguratorPresetId | null>>;
  setThumbnailRatingRows: Dispatch<SetStateAction<RatingProviderRow[]>>;
}) {
  const updateRatingRowsForType = useCallback(
    (type: ProxyType, updater: (current: RatingProviderRow[]) => RatingProviderRow[]) => {
      if (type === 'poster') {
        setPosterRatingRows(updater);
        return;
      }
      if (type === 'backdrop') {
        setBackdropRatingRows(updater);
        return;
      }
      setLogoRatingRows(updater);
    },
    [setBackdropRatingRows, setLogoRatingRows, setPosterRatingRows],
  );

  const toggleRatingPreference = useCallback(
    (rating: RatingPreference) => {
      updateRatingRowsForType(previewType, (current) =>
        current.map((row) =>
          row.id === rating
            ? {
                ...row,
                enabled: !row.enabled,
              }
            : row,
        ),
      );
    },
    [previewType, updateRatingRowsForType],
  );

  const setAllRatingPreferencesEnabled = useCallback(
    (enabled: boolean) => {
      updateRatingRowsForType(previewType, (current) =>
        current.map((row) => ({
          ...row,
          enabled,
        })),
      );
    },
    [previewType, updateRatingRowsForType],
  );

  const reorderRatingPreference = useCallback(
    (fromIndex: number, toIndex: number) => {
      updateRatingRowsForType(previewType, (current) => {
        if (
          fromIndex === toIndex ||
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= current.length ||
          toIndex >= current.length
        ) {
          return current;
        }

        const next = [...current];
        const [moved] = next.splice(fromIndex, 1);
        if (!moved) {
          return current;
        }
        next.splice(toIndex, 0, moved);
        return next;
      });
    },
    [previewType, updateRatingRowsForType],
  );

  const toggleQualityBadgePreference = useCallback(
    (badgeId: QualityBadgePreferenceId) => {
      setActiveQualityBadgePreferences((current) =>
        current.includes(badgeId)
          ? current.filter((entry) => entry !== badgeId)
          : [...current, badgeId],
      );
    },
    [setActiveQualityBadgePreferences],
  );

  const updateProviderAppearanceOverride = useCallback(
    (
      providerId: RatingPreference,
      updater: (current: RatingProviderAppearanceOverride) => RatingProviderAppearanceOverride,
    ) => {
      setRatingProviderAppearanceOverrides((current) => {
        const nextOverride = updater(current[providerId] || {});
        const trimmedIconUrl =
          typeof nextOverride.iconUrl === 'string' && nextOverride.iconUrl.trim()
            ? nextOverride.iconUrl.trim()
            : undefined;
        const normalizedColor =
          typeof nextOverride.accentColor === 'string' && nextOverride.accentColor.trim()
            ? nextOverride.accentColor.trim()
            : undefined;
        const normalizedScale = normalizeProviderIconScalePercent(
          nextOverride.iconScalePercent,
          DEFAULT_PROVIDER_ICON_SCALE_PERCENT,
        );
        const normalizedStackedLineWidth = normalizeStackedLineWidthPercent(
          nextOverride.stackedLineWidthPercent,
          DEFAULT_STACKED_LINE_WIDTH_PERCENT,
        );
        const normalizedStackedLineHeight = normalizeStackedLineHeightPercent(
          nextOverride.stackedLineHeightPercent,
          DEFAULT_STACKED_LINE_HEIGHT_PERCENT,
        );
        const normalizedStackedLineGap = normalizeStackedLineGapPercent(
          nextOverride.stackedLineGapPercent,
          DEFAULT_STACKED_LINE_GAP_PERCENT,
        );
        const normalizedStackedWidth = normalizeStackedWidthPercent(
          nextOverride.stackedWidthPercent,
          DEFAULT_STACKED_WIDTH_PERCENT,
        );
        const normalizedStackedSurfaceOpacity = normalizeStackedSurfaceOpacityPercent(
          nextOverride.stackedSurfaceOpacityPercent,
          DEFAULT_STACKED_SURFACE_OPACITY_PERCENT,
        );
        const normalizedStackedAccentMode = normalizeStackedAccentMode(
          nextOverride.stackedAccentMode,
          DEFAULT_STACKED_ACCENT_MODE,
        );
        const normalizedStackedLineOffsetX = normalizeStackedElementOffsetPx(
          nextOverride.stackedLineOffsetX,
          DEFAULT_STACKED_ELEMENT_OFFSET_PX,
        );
        const normalizedStackedLineOffsetY = normalizeStackedElementOffsetPx(
          nextOverride.stackedLineOffsetY,
          DEFAULT_STACKED_ELEMENT_OFFSET_PX,
        );
        const normalizedStackedIconOffsetX = normalizeStackedElementOffsetPx(
          nextOverride.stackedIconOffsetX,
          DEFAULT_STACKED_ELEMENT_OFFSET_PX,
        );
        const normalizedStackedIconOffsetY = normalizeStackedElementOffsetPx(
          nextOverride.stackedIconOffsetY,
          DEFAULT_STACKED_ELEMENT_OFFSET_PX,
        );
        const normalizedStackedValueOffsetX = normalizeStackedElementOffsetPx(
          nextOverride.stackedValueOffsetX,
          DEFAULT_STACKED_ELEMENT_OFFSET_PX,
        );
        const normalizedStackedValueOffsetY = normalizeStackedElementOffsetPx(
          nextOverride.stackedValueOffsetY,
          DEFAULT_STACKED_ELEMENT_OFFSET_PX,
        );

        const compactOverride: RatingProviderAppearanceOverride = {};
        if (trimmedIconUrl) {
          compactOverride.iconUrl = trimmedIconUrl;
        }
        if (normalizedColor) {
          compactOverride.accentColor = normalizedColor;
        }
        if (normalizedScale !== DEFAULT_PROVIDER_ICON_SCALE_PERCENT) {
          compactOverride.iconScalePercent = normalizedScale;
        }
        if (nextOverride.stackedLineVisible === false) {
          compactOverride.stackedLineVisible = false;
        }
        if (normalizedStackedLineWidth !== DEFAULT_STACKED_LINE_WIDTH_PERCENT) {
          compactOverride.stackedLineWidthPercent = normalizedStackedLineWidth;
        }
        if (normalizedStackedLineHeight !== DEFAULT_STACKED_LINE_HEIGHT_PERCENT) {
          compactOverride.stackedLineHeightPercent = normalizedStackedLineHeight;
        }
        if (normalizedStackedLineGap !== DEFAULT_STACKED_LINE_GAP_PERCENT) {
          compactOverride.stackedLineGapPercent = normalizedStackedLineGap;
        }
        if (normalizedStackedWidth !== DEFAULT_STACKED_WIDTH_PERCENT) {
          compactOverride.stackedWidthPercent = normalizedStackedWidth;
        }
        if (normalizedStackedSurfaceOpacity !== DEFAULT_STACKED_SURFACE_OPACITY_PERCENT) {
          compactOverride.stackedSurfaceOpacityPercent = normalizedStackedSurfaceOpacity;
        }
        if (normalizedStackedAccentMode !== DEFAULT_STACKED_ACCENT_MODE) {
          compactOverride.stackedAccentMode = normalizedStackedAccentMode;
        }
        if (normalizedStackedLineOffsetX !== DEFAULT_STACKED_ELEMENT_OFFSET_PX) {
          compactOverride.stackedLineOffsetX = normalizedStackedLineOffsetX;
        }
        if (normalizedStackedLineOffsetY !== DEFAULT_STACKED_ELEMENT_OFFSET_PX) {
          compactOverride.stackedLineOffsetY = normalizedStackedLineOffsetY;
        }
        if (normalizedStackedIconOffsetX !== DEFAULT_STACKED_ELEMENT_OFFSET_PX) {
          compactOverride.stackedIconOffsetX = normalizedStackedIconOffsetX;
        }
        if (normalizedStackedIconOffsetY !== DEFAULT_STACKED_ELEMENT_OFFSET_PX) {
          compactOverride.stackedIconOffsetY = normalizedStackedIconOffsetY;
        }
        if (normalizedStackedValueOffsetX !== DEFAULT_STACKED_ELEMENT_OFFSET_PX) {
          compactOverride.stackedValueOffsetX = normalizedStackedValueOffsetX;
        }
        if (normalizedStackedValueOffsetY !== DEFAULT_STACKED_ELEMENT_OFFSET_PX) {
          compactOverride.stackedValueOffsetY = normalizedStackedValueOffsetY;
        }

        const next = { ...current };
        if (Object.keys(compactOverride).length === 0) {
          delete next[providerId];
        } else {
          next[providerId] = compactOverride;
        }
        return next;
      });
    },
    [setRatingProviderAppearanceOverrides],
  );

  const toggleThumbnailRatingPreference = useCallback(
    (providerId: ThumbnailRatingPreference) => {
      setThumbnailRatingRows((current) => {
        const enabledSet = new Set(filterThumbnailRatingPreferences(rowsToEnabledOrdered(current)));
        if (enabledSet.has(providerId)) {
          enabledSet.delete(providerId);
        } else {
          enabledSet.add(providerId);
        }
        return enabledOrderedToRows(
          [...THUMBNAIL_RATING_PREFERENCES].filter((id) => enabledSet.has(id)),
        );
      });
    },
    [setThumbnailRatingRows],
  );

  const handleApplyPreset = useCallback(
    (presetId: ConfiguratorPresetId) => {
      applyWorkspaceConfig(applyConfiguratorPreset(buildCurrentUiConfig(), presetId), 'preset');
      setSelectedPresetId(presetId);
      handleExitWizard();
    },
    [applyWorkspaceConfig, buildCurrentUiConfig, handleExitWizard, setSelectedPresetId],
  );

  return {
    handleApplyPreset,
    reorderRatingPreference,
    setAllRatingPreferencesEnabled,
    toggleQualityBadgePreference,
    toggleRatingPreference,
    toggleThumbnailRatingPreference,
    updateProviderAppearanceOverride,
  };
}
