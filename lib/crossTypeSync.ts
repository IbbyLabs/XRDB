import type { MediaSearchPreviewType } from './configuratorMediaSearch.ts';
import type {
  AggregateAccentMode,
  AggregateRatingSource,
  RatingPresentation,
} from './ratingPresentation.ts';
import type { RatingValueMode } from './ratingDisplay.ts';
import type {
  GenreBadgeAnimeGrouping,
  GenreBadgeMode,
  GenreBadgePosition,
  GenreBadgeStyle,
} from './genreBadge.ts';
import type { MediaFeatureBadgeKey } from './mediaFeatures.ts';
import type { QualityBadgeStyle } from './ratingAppearance.ts';
import type { RatingPreference } from './ratingProviderCatalog.ts';
import type { SharedXrdbSettings, StreamBadgesSetting } from './uiConfig.ts';
import { buildProfileParams, coerceNonPosterPresentation } from './uiConfig.ts';
import { filterThumbnailRatingPreferences } from './episodeIdentity.ts';

export type ParamDiffEntry = { key: string; oldValue: string; newValue: string };

export type SyncableTypeSettings = {
  ratingPreferences: RatingPreference[];
  ratingPresentation: RatingPresentation;
  aggregateRatingSource: AggregateRatingSource;
  ratingBadgeScale: number;
  qualityBadgeScale: number;
  genreBadgeMode: GenreBadgeMode;
  genreBadgeStyle: GenreBadgeStyle;
  genreBadgePosition: GenreBadgePosition;
  genreBadgeScale: number;
  genreBadgeBorderWidth: number;
  genreBadgeBackgroundOpacity: number;
  genreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  qualityBadgePreferences: MediaFeatureBadgeKey[];
  qualityBadgesStyle: QualityBadgeStyle;
  qualityBadgesMax: number | null;
  streamBadges?: StreamBadgesSetting;
  aggregateAccentMode: AggregateAccentMode;
  aggregateAccentColor: string;
  aggregateCriticsAccentColor: string;
  aggregateAudienceAccentColor: string;
  aggregateValueColor: string;
  aggregateCriticsValueColor: string;
  aggregateAudienceValueColor: string;
  aggregateDynamicStops: string;
  aggregateAccentBarOffset: number;
  aggregateAccentBarVisible: boolean;
  ratingValueMode: RatingValueMode;
};

const globalAccentFields = (s: SharedXrdbSettings) => ({
  aggregateAccentMode: s.aggregateAccentMode,
  aggregateAccentColor: s.aggregateAccentColor,
  aggregateCriticsAccentColor: s.aggregateCriticsAccentColor,
  aggregateAudienceAccentColor: s.aggregateAudienceAccentColor,
  aggregateValueColor: s.aggregateValueColor,
  aggregateCriticsValueColor: s.aggregateCriticsValueColor,
  aggregateAudienceValueColor: s.aggregateAudienceValueColor,
  aggregateDynamicStops: s.aggregateDynamicStops,
  aggregateAccentBarOffset: s.aggregateAccentBarOffset,
  aggregateAccentBarVisible: s.aggregateAccentBarVisible,
  ratingValueMode: s.ratingValueMode,
});

export const extractSyncableSettings = (
  settings: SharedXrdbSettings,
  sourceType: MediaSearchPreviewType,
): SyncableTypeSettings => {
  const global = globalAccentFields(settings);
  switch (sourceType) {
    case 'poster':
      return {
        ratingPreferences: [...settings.posterRatingPreferences],
        ratingPresentation: settings.posterRatingPresentation,
        aggregateRatingSource: settings.posterAggregateRatingSource,
        ratingBadgeScale: settings.posterRatingBadgeScale,
        qualityBadgeScale: settings.posterQualityBadgeScale,
        genreBadgeMode: settings.posterGenreBadgeMode,
        genreBadgeStyle: settings.posterGenreBadgeStyle,
        genreBadgePosition: settings.posterGenreBadgePosition,
        genreBadgeScale: settings.posterGenreBadgeScale,
        genreBadgeBorderWidth: settings.posterGenreBadgeBorderWidth,
        genreBadgeBackgroundOpacity: settings.posterGenreBadgeBackgroundOpacity,
        genreBadgeAnimeGrouping: settings.posterGenreBadgeAnimeGrouping,
        qualityBadgePreferences: [...settings.posterQualityBadgePreferences],
        qualityBadgesStyle: settings.posterQualityBadgesStyle,
        qualityBadgesMax: settings.posterQualityBadgesMax,
        streamBadges: settings.posterStreamBadges,
        ...global,
      };
    case 'backdrop':
      return {
        ratingPreferences: [...settings.backdropRatingPreferences],
        ratingPresentation: settings.backdropRatingPresentation,
        aggregateRatingSource: settings.backdropAggregateRatingSource,
        ratingBadgeScale: settings.backdropRatingBadgeScale,
        qualityBadgeScale: settings.backdropQualityBadgeScale,
        genreBadgeMode: settings.backdropGenreBadgeMode,
        genreBadgeStyle: settings.backdropGenreBadgeStyle,
        genreBadgePosition: settings.backdropGenreBadgePosition,
        genreBadgeScale: settings.backdropGenreBadgeScale,
        genreBadgeBorderWidth: settings.backdropGenreBadgeBorderWidth,
        genreBadgeBackgroundOpacity: settings.backdropGenreBadgeBackgroundOpacity,
        genreBadgeAnimeGrouping: settings.backdropGenreBadgeAnimeGrouping,
        qualityBadgePreferences: [...settings.backdropQualityBadgePreferences],
        qualityBadgesStyle: settings.backdropQualityBadgesStyle,
        qualityBadgesMax: settings.backdropQualityBadgesMax,
        streamBadges: settings.backdropStreamBadges,
        ...global,
      };
    case 'thumbnail':
      return {
        ratingPreferences: [...settings.thumbnailRatingPreferences],
        ratingPresentation: settings.thumbnailRatingPresentation,
        aggregateRatingSource: settings.thumbnailAggregateRatingSource,
        ratingBadgeScale: settings.thumbnailRatingBadgeScale,
        qualityBadgeScale: settings.thumbnailQualityBadgeScale,
        genreBadgeMode: settings.thumbnailGenreBadgeMode,
        genreBadgeStyle: settings.thumbnailGenreBadgeStyle,
        genreBadgePosition: settings.thumbnailGenreBadgePosition,
        genreBadgeScale: settings.thumbnailGenreBadgeScale,
        genreBadgeBorderWidth: settings.thumbnailGenreBadgeBorderWidth,
        genreBadgeBackgroundOpacity: settings.thumbnailGenreBadgeBackgroundOpacity,
        genreBadgeAnimeGrouping: settings.thumbnailGenreBadgeAnimeGrouping,
        qualityBadgePreferences: [...settings.thumbnailQualityBadgePreferences],
        qualityBadgesStyle: settings.thumbnailQualityBadgesStyle,
        qualityBadgesMax: settings.thumbnailQualityBadgesMax,
        streamBadges: settings.thumbnailStreamBadges,
        ...global,
      };
    default:
      return {
        ratingPreferences: [...settings.logoRatingPreferences],
        ratingPresentation: settings.logoRatingPresentation,
        aggregateRatingSource: settings.logoAggregateRatingSource,
        ratingBadgeScale: settings.logoRatingBadgeScale,
        qualityBadgeScale: settings.logoQualityBadgeScale,
        genreBadgeMode: settings.logoGenreBadgeMode,
        genreBadgeStyle: settings.logoGenreBadgeStyle,
        genreBadgePosition: settings.logoGenreBadgePosition,
        genreBadgeScale: settings.logoGenreBadgeScale,
        genreBadgeBorderWidth: settings.logoGenreBadgeBorderWidth,
        genreBadgeBackgroundOpacity: settings.logoGenreBadgeBackgroundOpacity,
        genreBadgeAnimeGrouping: settings.logoGenreBadgeAnimeGrouping,
        qualityBadgePreferences: [...settings.logoQualityBadgePreferences],
        qualityBadgesStyle: settings.logoQualityBadgesStyle,
        qualityBadgesMax: settings.logoQualityBadgesMax,
        ...global,
      };
  }
};

export const applySyncableSettings = (
  settings: SharedXrdbSettings,
  targetType: MediaSearchPreviewType,
  incoming: SyncableTypeSettings,
): SharedXrdbSettings => {
  const globalOverrides: Partial<SharedXrdbSettings> = {
    aggregateAccentMode: incoming.aggregateAccentMode,
    aggregateAccentColor: incoming.aggregateAccentColor,
    aggregateCriticsAccentColor: incoming.aggregateCriticsAccentColor,
    aggregateAudienceAccentColor: incoming.aggregateAudienceAccentColor,
    aggregateValueColor: incoming.aggregateValueColor,
    aggregateCriticsValueColor: incoming.aggregateCriticsValueColor,
    aggregateAudienceValueColor: incoming.aggregateAudienceValueColor,
    aggregateDynamicStops: incoming.aggregateDynamicStops,
    aggregateAccentBarOffset: incoming.aggregateAccentBarOffset,
    aggregateAccentBarVisible: incoming.aggregateAccentBarVisible,
    ratingValueMode: incoming.ratingValueMode,
  };

  switch (targetType) {
    case 'poster':
      return {
        ...settings,
        ...globalOverrides,
        posterRatingPreferences: incoming.ratingPreferences,
        posterRatingPresentation: incoming.ratingPresentation,
        posterAggregateRatingSource: incoming.aggregateRatingSource,
        posterRatingBadgeScale: incoming.ratingBadgeScale,
        posterQualityBadgeScale: incoming.qualityBadgeScale,
        posterGenreBadgeMode: incoming.genreBadgeMode,
        posterGenreBadgeStyle: incoming.genreBadgeStyle,
        posterGenreBadgePosition: incoming.genreBadgePosition,
        posterGenreBadgeScale: incoming.genreBadgeScale,
        posterGenreBadgeBorderWidth: incoming.genreBadgeBorderWidth,
        posterGenreBadgeBackgroundOpacity: incoming.genreBadgeBackgroundOpacity,
        posterGenreBadgeAnimeGrouping: incoming.genreBadgeAnimeGrouping,
        posterQualityBadgePreferences: incoming.qualityBadgePreferences,
        posterQualityBadgesStyle: incoming.qualityBadgesStyle,
        posterQualityBadgesMax: incoming.qualityBadgesMax,
        ...(incoming.streamBadges !== undefined ? { posterStreamBadges: incoming.streamBadges } : {}),
      };
    case 'backdrop':
      return {
        ...settings,
        ...globalOverrides,
        backdropRatingPreferences: incoming.ratingPreferences,
        backdropRatingPresentation: coerceNonPosterPresentation(incoming.ratingPresentation),
        backdropAggregateRatingSource: incoming.aggregateRatingSource,
        backdropRatingBadgeScale: incoming.ratingBadgeScale,
        backdropQualityBadgeScale: incoming.qualityBadgeScale,
        backdropGenreBadgeMode: incoming.genreBadgeMode,
        backdropGenreBadgeStyle: incoming.genreBadgeStyle,
        backdropGenreBadgePosition: incoming.genreBadgePosition,
        backdropGenreBadgeScale: incoming.genreBadgeScale,
        backdropGenreBadgeBorderWidth: incoming.genreBadgeBorderWidth,
        backdropGenreBadgeBackgroundOpacity: incoming.genreBadgeBackgroundOpacity,
        backdropGenreBadgeAnimeGrouping: incoming.genreBadgeAnimeGrouping,
        backdropQualityBadgePreferences: incoming.qualityBadgePreferences,
        backdropQualityBadgesStyle: incoming.qualityBadgesStyle,
        backdropQualityBadgesMax: incoming.qualityBadgesMax,
        ...(incoming.streamBadges !== undefined ? { backdropStreamBadges: incoming.streamBadges } : {}),
      };
    case 'thumbnail': {
      const filteredProviders = filterThumbnailRatingPreferences(incoming.ratingPreferences);
      return {
        ...settings,
        ...globalOverrides,
        thumbnailRatingPreferences:
          filteredProviders.length > 0 ? filteredProviders : settings.thumbnailRatingPreferences,
        thumbnailRatingPresentation: coerceNonPosterPresentation(incoming.ratingPresentation),
        thumbnailAggregateRatingSource: incoming.aggregateRatingSource,
        thumbnailRatingBadgeScale: incoming.ratingBadgeScale,
        thumbnailQualityBadgeScale: incoming.qualityBadgeScale,
        thumbnailGenreBadgeMode: incoming.genreBadgeMode,
        thumbnailGenreBadgeStyle: incoming.genreBadgeStyle,
        thumbnailGenreBadgePosition: incoming.genreBadgePosition,
        thumbnailGenreBadgeScale: incoming.genreBadgeScale,
        thumbnailGenreBadgeBorderWidth: incoming.genreBadgeBorderWidth,
        thumbnailGenreBadgeBackgroundOpacity: incoming.genreBadgeBackgroundOpacity,
        thumbnailGenreBadgeAnimeGrouping: incoming.genreBadgeAnimeGrouping,
        thumbnailQualityBadgePreferences: incoming.qualityBadgePreferences,
        thumbnailQualityBadgesStyle: incoming.qualityBadgesStyle,
        thumbnailQualityBadgesMax: incoming.qualityBadgesMax,
        ...(incoming.streamBadges !== undefined
          ? { thumbnailStreamBadges: incoming.streamBadges }
          : {}),
      };
    }
    default:
      return {
        ...settings,
        ...globalOverrides,
        logoRatingPreferences: incoming.ratingPreferences,
        logoRatingPresentation: coerceNonPosterPresentation(incoming.ratingPresentation),
        logoAggregateRatingSource: incoming.aggregateRatingSource,
        logoRatingBadgeScale: incoming.ratingBadgeScale,
        logoQualityBadgeScale: incoming.qualityBadgeScale,
        logoGenreBadgeMode: incoming.genreBadgeMode,
        logoGenreBadgeStyle: incoming.genreBadgeStyle,
        logoGenreBadgePosition: incoming.genreBadgePosition,
        logoGenreBadgeScale: incoming.genreBadgeScale,
        logoGenreBadgeBorderWidth: incoming.genreBadgeBorderWidth,
        logoGenreBadgeBackgroundOpacity: incoming.genreBadgeBackgroundOpacity,
        logoGenreBadgeAnimeGrouping: incoming.genreBadgeAnimeGrouping,
        logoQualityBadgePreferences: incoming.qualityBadgePreferences,
        logoQualityBadgesStyle: incoming.qualityBadgesStyle,
        logoQualityBadgesMax: incoming.qualityBadgesMax,
      };
  }
};

const SYNC_DIFF_MAX_VISIBLE = 20;

export const computeSyncDiff = (
  before: SharedXrdbSettings,
  after: SharedXrdbSettings,
): { entries: ParamDiffEntry[]; totalChanged: number } => {
  const beforeParams = buildProfileParams(before, {
    allowMissingTmdbKey: true,
    allowMissingMdblistKey: true,
    omitProviderCredentials: true,
  }) ?? {};
  const afterParams = buildProfileParams(after, {
    allowMissingTmdbKey: true,
    allowMissingMdblistKey: true,
    omitProviderCredentials: true,
  }) ?? {};
  const keys = new Set([...Object.keys(beforeParams), ...Object.keys(afterParams)]);
  const all: ParamDiffEntry[] = [];
  for (const key of keys) {
    const oldValue = beforeParams[key] ?? '';
    const newValue = afterParams[key] ?? '';
    if (oldValue !== newValue) {
      all.push({ key, oldValue, newValue });
    }
  }
  all.sort((a, b) => a.key.localeCompare(b.key));
  return {
    entries: all.slice(0, SYNC_DIFF_MAX_VISIBLE),
    totalChanged: all.length,
  };
};

export const computeSyncToAllDiff = (
  settings: SharedXrdbSettings,
  sourceType: MediaSearchPreviewType,
): Record<MediaSearchPreviewType, { entries: ParamDiffEntry[]; totalChanged: number }> => {
  const allTypes: MediaSearchPreviewType[] = ['poster', 'backdrop', 'thumbnail', 'logo'];
  const extracted = extractSyncableSettings(settings, sourceType);
  const result = {} as Record<
    MediaSearchPreviewType,
    { entries: ParamDiffEntry[]; totalChanged: number }
  >;
  for (const targetType of allTypes) {
    if (targetType === sourceType) {
      result[targetType] = { entries: [], totalChanged: 0 };
      continue;
    }
    const after = applySyncableSettings(settings, targetType, extracted);
    result[targetType] = computeSyncDiff(settings, after);
  }
  return result;
};
