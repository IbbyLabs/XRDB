import {
  createDefaultSavedUiConfig,
  type SavedUiConfig,
  type SharedXrdbSettings,
} from './uiConfig.ts';

export type ConfiguratorResetSectionId =
  | 'presentation'
  | 'look'
  | 'quality'
  | 'providers'
  | 'quicktune';

export type ConfiguratorResetPreviewType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';

type SettingsKey = keyof SharedXrdbSettings;

const PRESENTATION_SHARED_KEYS: readonly SettingsKey[] = [
  'aggregateAccentMode',
  'aggregateAccentColor',
  'aggregateCriticsAccentColor',
  'aggregateAudienceAccentColor',
  'aggregateValueColor',
  'aggregateCriticsValueColor',
  'aggregateAudienceValueColor',
  'aggregateDynamicStops',
  'aggregateAccentBarVisible',
  'aggregateAccentBarOffset',
];

const PRESENTATION_PREVIEW_KEYS: Record<ConfiguratorResetPreviewType, readonly SettingsKey[]> = {
  poster: [
    'posterRatingPresentation',
    'posterAggregateRatingSource',
    'posterRingValueSource',
    'posterRingProgressSource',
  ],
  backdrop: ['backdropRatingPresentation', 'backdropAggregateRatingSource'],
  thumbnail: ['thumbnailRatingPresentation', 'thumbnailAggregateRatingSource'],
  logo: ['logoRatingPresentation', 'logoAggregateRatingSource'],
};

const LOOK_SHARED_KEYS: readonly SettingsKey[] = ['ratingValueMode'];

const LOOK_PREVIEW_KEYS: Record<ConfiguratorResetPreviewType, readonly SettingsKey[]> = {
  poster: [
    'posterRatingStyle',
    'posterImageText',
    'posterArtworkSource',
    'posterImageSize',
    'randomPosterText',
    'randomPosterLanguage',
    'randomPosterMinVoteCount',
    'randomPosterMinVoteAverage',
    'randomPosterMinWidth',
    'randomPosterMinHeight',
    'randomPosterFallback',
    'posterGenreBadgeMode',
    'posterGenreBadgeStyle',
    'posterGenreBadgePosition',
    'posterGenreBadgeAnimeGrouping',
    'posterGenreBadgeScale',
    'posterGenreBadgeBorderWidth',
    'posterRatingBadgeScale',
    'posterQualityBadgeScale',
    'posterRatingsLayout',
    'posterRatingsMaxPerSide',
    'posterRatingsMax',
    'posterEdgeOffset',
    'posterSideRatingsPosition',
    'posterSideRatingsOffset',
    'posterNoBackgroundBadgeOutlineColor',
    'posterNoBackgroundBadgeOutlineWidth',
    'posterRatingXOffsetPillGlass',
    'posterRatingYOffsetPillGlass',
    'posterRatingXOffsetSquare',
    'posterRatingYOffsetSquare',
  ],
  backdrop: [
    'backdropRatingStyle',
    'backdropImageText',
    'backdropArtworkSource',
    'backdropImageSize',
    'backdropEpisodeArtwork',
    'backdropGenreBadgeMode',
    'backdropGenreBadgeStyle',
    'backdropGenreBadgePosition',
    'backdropGenreBadgeAnimeGrouping',
    'backdropGenreBadgeScale',
    'backdropGenreBadgeBorderWidth',
    'backdropRatingBadgeScale',
    'backdropQualityBadgeScale',
    'backdropRatingsLayout',
    'backdropRatingsMax',
    'backdropBottomRatingsRow',
    'backdropSideRatingsPosition',
    'backdropSideRatingsOffset',
    'backdropRatingXOffsetPillGlass',
    'backdropRatingYOffsetPillGlass',
    'backdropRatingXOffsetSquare',
    'backdropRatingYOffsetSquare',
  ],
  thumbnail: [
    'thumbnailRatingStyle',
    'thumbnailImageText',
    'thumbnailArtworkSource',
    'thumbnailEpisodeArtwork',
    'thumbnailGenreBadgeMode',
    'thumbnailGenreBadgeStyle',
    'thumbnailGenreBadgePosition',
    'thumbnailGenreBadgeAnimeGrouping',
    'thumbnailGenreBadgeScale',
    'thumbnailGenreBadgeBorderWidth',
    'thumbnailRatingBadgeScale',
    'thumbnailQualityBadgeScale',
    'thumbnailRatingsLayout',
    'thumbnailRatingsMax',
    'thumbnailBottomRatingsRow',
    'thumbnailSideRatingsPosition',
    'thumbnailSideRatingsOffset',
    'thumbnailRatingXOffsetPillGlass',
    'thumbnailRatingYOffsetPillGlass',
    'thumbnailRatingXOffsetSquare',
    'thumbnailRatingYOffsetSquare',
  ],
  logo: [
    'logoRatingStyle',
    'logoArtworkSource',
    'logoBackground',
    'logoGenreBadgeMode',
    'logoGenreBadgeStyle',
    'logoGenreBadgePosition',
    'logoGenreBadgeAnimeGrouping',
    'logoGenreBadgeScale',
    'logoGenreBadgeBorderWidth',
    'logoRatingBadgeScale',
    'logoQualityBadgeScale',
    'logoRatingsMax',
    'logoBottomRatingsRow',
    'logoQualityBadgesStyle',
    'logoQualityBadgesMax',
    'logoQualityBadgePreferences',
    'ratingXOffsetPillGlass',
    'ratingYOffsetPillGlass',
    'ratingXOffsetSquare',
    'ratingYOffsetSquare',
  ],
};

const QUALITY_PREVIEW_KEYS: Record<ConfiguratorResetPreviewType, readonly SettingsKey[]> = {
  poster: [
    'posterStreamBadges',
    'qualityBadgesSide',
    'posterQualityBadgesPosition',
    'ageRatingBadgePosition',
    'posterQualityBadgePreferences',
    'posterQualityBadgesStyle',
    'posterQualityBadgesMax',
    'posterRemuxDisplayMode',
  ],
  backdrop: [
    'backdropStreamBadges',
    'backdropQualityBadgePreferences',
    'backdropQualityBadgesStyle',
    'backdropQualityBadgesMax',
    'backdropRemuxDisplayMode',
  ],
  thumbnail: [
    'thumbnailStreamBadges',
    'thumbnailQualityBadgePreferences',
    'thumbnailQualityBadgesStyle',
    'thumbnailQualityBadgesMax',
    'thumbnailRemuxDisplayMode',
  ],
  logo: [
    'logoQualityBadgePreferences',
    'logoQualityBadgesStyle',
    'logoQualityBadgesMax',
    'logoRemuxDisplayMode',
  ],
};

const PROVIDERS_PREVIEW_KEYS: Record<ConfiguratorResetPreviewType, readonly SettingsKey[]> = {
  poster: ['posterRatingPreferences', 'ratingProviderAppearanceOverrides'],
  backdrop: ['backdropRatingPreferences', 'ratingProviderAppearanceOverrides'],
  thumbnail: ['thumbnailRatingPreferences', 'ratingProviderAppearanceOverrides'],
  logo: ['logoRatingPreferences', 'ratingProviderAppearanceOverrides'],
};

const QUICK_TUNE_PREVIEW_KEYS: Record<ConfiguratorResetPreviewType, readonly SettingsKey[]> = {
  poster: [
    'posterRatingPresentation',
    'posterRatingStyle',
    'posterImageText',
    'posterImageSize',
    'posterArtworkSource',
    'posterGenreBadgeMode',
    'posterStreamBadges',
  ],
  backdrop: [
    'backdropRatingPresentation',
    'backdropRatingStyle',
    'backdropImageText',
    'backdropImageSize',
    'backdropArtworkSource',
    'backdropGenreBadgeMode',
    'backdropStreamBadges',
  ],
  thumbnail: [
    'thumbnailRatingPresentation',
    'thumbnailRatingStyle',
    'thumbnailImageText',
    'thumbnailArtworkSource',
    'thumbnailGenreBadgeMode',
    'thumbnailStreamBadges',
  ],
  logo: [
    'logoRatingPresentation',
    'logoRatingStyle',
    'logoBackground',
    'logoArtworkSource',
    'logoGenreBadgeMode',
  ],
};

const uniqueKeys = (keys: readonly SettingsKey[]) => [...new Set(keys)];

const resetSettingKey = <Key extends SettingsKey>(
  settings: SharedXrdbSettings,
  defaults: SharedXrdbSettings,
  key: Key,
) => {
  settings[key] = defaults[key];
};

export const getConfiguratorSectionResetKeys = (
  sectionId: ConfiguratorResetSectionId,
  previewType: ConfiguratorResetPreviewType,
): SettingsKey[] => {
  if (sectionId === 'presentation') {
    return uniqueKeys([...PRESENTATION_SHARED_KEYS, ...PRESENTATION_PREVIEW_KEYS[previewType]]);
  }
  if (sectionId === 'look') {
    return uniqueKeys([...LOOK_SHARED_KEYS, ...LOOK_PREVIEW_KEYS[previewType]]);
  }
  if (sectionId === 'quality') {
    return [...QUALITY_PREVIEW_KEYS[previewType]];
  }
  if (sectionId === 'providers') {
    return [...PROVIDERS_PREVIEW_KEYS[previewType]];
  }
  return [...QUICK_TUNE_PREVIEW_KEYS[previewType]];
};

const applyDefaultSettingKeys = (config: SavedUiConfig, keys: readonly SettingsKey[]): SavedUiConfig => {
  const defaults = createDefaultSavedUiConfig();
  const nextSettings: SharedXrdbSettings = { ...config.settings };
  for (const key of keys) {
    resetSettingKey(nextSettings, defaults.settings, key);
  }
  return {
    ...config,
    settings: nextSettings,
  };
};

export const buildConfiguratorSectionResetConfig = (
  config: SavedUiConfig,
  sectionId: ConfiguratorResetSectionId,
  previewType: ConfiguratorResetPreviewType,
): SavedUiConfig => applyDefaultSettingKeys(config, getConfiguratorSectionResetKeys(sectionId, previewType));

export const getAllConfiguratorCustomizationResetKeys = (): SettingsKey[] => {
  const keys = new Set<SettingsKey>();
  const previewTypes: ConfiguratorResetPreviewType[] = ['poster', 'backdrop', 'thumbnail', 'logo'];
  const sections: ConfiguratorResetSectionId[] = ['presentation', 'look', 'quality', 'providers'];

  for (const section of sections) {
    for (const previewType of previewTypes) {
      for (const key of getConfiguratorSectionResetKeys(section, previewType)) {
        keys.add(key);
      }
    }
  }

  return [...keys];
};

export const buildConfiguratorGlobalResetConfig = (config: SavedUiConfig): SavedUiConfig =>
  applyDefaultSettingKeys(config, getAllConfiguratorCustomizationResetKeys());