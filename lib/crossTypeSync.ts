import type { MediaSearchPreviewType } from './configuratorMediaSearch.ts';
import type {
  AggregateAccentMode,
  AggregateProviderWeights,
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
import type { IconShape, QualityBadgeStyle, RatingStyle } from './ratingAppearance.ts';
import type { RatingPreference } from './ratingProviderCatalog.ts';
import type { SharedXrdbSettings, StreamBadgesSetting } from './uiConfig.ts';
import { buildProfileParams, coerceNonPosterPresentation } from './uiConfig.ts';
import { filterThumbnailRatingPreferences } from './episodeIdentity.ts';

type ParamDiffEntry = { key: string; oldValue: string; newValue: string };

type SyncableTypeSettings = {
  ratingPreferences: RatingPreference[];
  ratingStyle: RatingStyle;
  iconShape: IconShape;
  ratingPresentation: RatingPresentation;
  aggregateRatingSource: AggregateRatingSource;
  aggregateProviderWeights: AggregateProviderWeights;
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
        ratingStyle: settings.posterRatingStyle,
        iconShape: settings.posterIconShape,
        ratingPresentation: settings.posterRatingPresentation,
        aggregateRatingSource: settings.posterAggregateRatingSource,
        aggregateProviderWeights: settings.posterAggregateProviderWeights,
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
        ratingStyle: settings.backdropRatingStyle,
        iconShape: settings.backdropIconShape,
        ratingPresentation: settings.backdropRatingPresentation,
        aggregateRatingSource: settings.backdropAggregateRatingSource,
        aggregateProviderWeights: settings.backdropAggregateProviderWeights,
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
        ratingStyle: settings.thumbnailRatingStyle,
        iconShape: settings.thumbnailIconShape,
        ratingPresentation: settings.thumbnailRatingPresentation,
        aggregateRatingSource: settings.thumbnailAggregateRatingSource,
        aggregateProviderWeights: settings.thumbnailAggregateProviderWeights,
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
        ratingStyle: settings.logoRatingStyle,
        iconShape: settings.logoIconShape,
        ratingPresentation: settings.logoRatingPresentation,
        aggregateRatingSource: settings.logoAggregateRatingSource,
        aggregateProviderWeights: settings.logoAggregateProviderWeights,
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
        posterRatingStyle: incoming.ratingStyle,
        posterIconShape: incoming.iconShape,
        posterRatingPresentation: incoming.ratingPresentation,
        posterAggregateRatingSource: incoming.aggregateRatingSource,
        posterAggregateProviderWeights: incoming.aggregateProviderWeights,
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
        backdropRatingStyle: incoming.ratingStyle,
        backdropIconShape: incoming.iconShape,
        backdropRatingPresentation: coerceNonPosterPresentation(incoming.ratingPresentation),
        backdropAggregateRatingSource: incoming.aggregateRatingSource,
        backdropAggregateProviderWeights: incoming.aggregateProviderWeights,
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
        thumbnailRatingStyle: incoming.ratingStyle,
        thumbnailIconShape: incoming.iconShape,
        thumbnailRatingPresentation: coerceNonPosterPresentation(incoming.ratingPresentation),
        thumbnailAggregateRatingSource: incoming.aggregateRatingSource,
        thumbnailAggregateProviderWeights: incoming.aggregateProviderWeights,
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
        logoRatingStyle: incoming.ratingStyle,
        logoIconShape: incoming.iconShape,
        logoRatingPresentation: coerceNonPosterPresentation(incoming.ratingPresentation),
        logoAggregateRatingSource: incoming.aggregateRatingSource,
        logoAggregateProviderWeights: incoming.aggregateProviderWeights,
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

export const SYNCABLE_TARGET_KEY_MAP: Record<keyof SyncableTypeSettings, string> = {
  ratingPreferences: 'RatingPreferences',
  ratingStyle: 'RatingStyle',
  iconShape: 'IconShape',
  ratingPresentation: 'RatingPresentation',
  aggregateRatingSource: 'AggregateRatingSource',
  aggregateProviderWeights: 'AggregateProviderWeights',
  ratingBadgeScale: 'RatingBadgeScale',
  qualityBadgeScale: 'QualityBadgeScale',
  genreBadgeMode: 'GenreBadgeMode',
  genreBadgeStyle: 'GenreBadgeStyle',
  genreBadgePosition: 'GenreBadgePosition',
  genreBadgeScale: 'GenreBadgeScale',
  genreBadgeBorderWidth: 'GenreBadgeBorderWidth',
  genreBadgeBackgroundOpacity: 'GenreBadgeBackgroundOpacity',
  genreBadgeAnimeGrouping: 'GenreBadgeAnimeGrouping',
  qualityBadgePreferences: 'QualityBadgePreferences',
  qualityBadgesStyle: 'QualityBadgesStyle',
  qualityBadgesMax: 'QualityBadgesMax',
  streamBadges: 'StreamBadges',
  aggregateAccentMode: 'aggregateAccentMode',
  aggregateAccentColor: 'aggregateAccentColor',
  aggregateCriticsAccentColor: 'aggregateCriticsAccentColor',
  aggregateAudienceAccentColor: 'aggregateAudienceAccentColor',
  aggregateValueColor: 'aggregateValueColor',
  aggregateCriticsValueColor: 'aggregateCriticsValueColor',
  aggregateAudienceValueColor: 'aggregateAudienceValueColor',
  aggregateDynamicStops: 'aggregateDynamicStops',
  aggregateAccentBarOffset: 'aggregateAccentBarOffset',
  aggregateAccentBarVisible: 'aggregateAccentBarVisible',
  ratingValueMode: 'ratingValueMode',
};

export const SYNCABLE_GLOBAL_KEYS = new Set<keyof SyncableTypeSettings>([
  'aggregateAccentMode',
  'aggregateAccentColor',
  'aggregateCriticsAccentColor',
  'aggregateAudienceAccentColor',
  'aggregateValueColor',
  'aggregateCriticsValueColor',
  'aggregateAudienceValueColor',
  'aggregateDynamicStops',
  'aggregateAccentBarOffset',
  'aggregateAccentBarVisible',
  'ratingValueMode',
]);

const stringifySyncableValue = (value: unknown): string => {
  if (value == null) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(',');
  }
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return JSON.stringify(
      Object.keys(objectValue)
        .sort((a, b) => a.localeCompare(b))
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = objectValue[key];
          return acc;
        }, {}),
    );
  }
  return String(value);
};

export const SYNC_SPECIAL_RULES = [
  'Only the fields listed in the matrix are synchronized across types.',
  'Poster-only presentations are coerced to standard on backdrop, thumbnail, and logo targets.',
  'Thumbnail provider sync keeps only episode-safe providers.',
  'Stream badges are excluded when syncing into logo.',
] as const;

const buildSyncableParamKey = (
  targetType: MediaSearchPreviewType,
  field: keyof SyncableTypeSettings,
): string => {
  const mappedKey = SYNCABLE_TARGET_KEY_MAP[field];
  if (SYNCABLE_GLOBAL_KEYS.has(field)) {
    return mappedKey;
  }
  return `${targetType}${mappedKey}`;
};

export const computeSyncDiffForTarget = (
  before: SharedXrdbSettings,
  after: SharedXrdbSettings,
  targetType: MediaSearchPreviewType,
): { entries: ParamDiffEntry[]; totalChanged: number } => {
  const beforeSyncable = extractSyncableSettings(before, targetType);
  const afterSyncable = extractSyncableSettings(after, targetType);
  const keys = new Set<keyof SyncableTypeSettings>([
    ...Object.keys(beforeSyncable),
    ...Object.keys(afterSyncable),
  ] as Array<keyof SyncableTypeSettings>);

  const all: ParamDiffEntry[] = [];
  for (const key of keys) {
    const oldValue = stringifySyncableValue(beforeSyncable[key]);
    const newValue = stringifySyncableValue(afterSyncable[key]);
    if (oldValue !== newValue) {
      all.push({ key: buildSyncableParamKey(targetType, key), oldValue, newValue });
    }
  }

  all.sort((a, b) => a.key.localeCompare(b.key));
  return {
    entries: all.slice(0, SYNC_DIFF_MAX_VISIBLE),
    totalChanged: all.length,
  };
};

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
    result[targetType] = computeSyncDiffForTarget(settings, after, targetType);
  }
  return result;
};
