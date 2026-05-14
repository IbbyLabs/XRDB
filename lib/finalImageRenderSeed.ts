import {
  encodeQualityBadgeAppearanceOverrides,
  encodeRatingProviderAppearanceOverrides,
  type QualityBadgeAppearanceOverrides,
  type RatingProviderAppearanceOverrides,
} from './badgeCustomization.ts';
import { DEFAULT_GENRE_BADGE_MODE } from './genreBadge.ts';

type FinalImageRenderSeedInput = {
  cacheVersion: string;
  imageType: 'poster' | 'backdrop' | 'thumbnail' | 'logo';
  outputFormat: string;
  cleanId: string;
  requestedImageLang: string;
  posterTextPreference: string;
  randomPosterTextMode: string;
  randomPosterLanguageMode: string;
  randomPosterMinVoteCount: number | null;
  randomPosterMinVoteAverage: number | null;
  randomPosterMinWidth: number | null;
  randomPosterMinHeight: number | null;
  randomPosterFallbackMode: string;
  posterImageSize: string;
  backdropImageSize: string;
  posterArtworkSource: string;
  backdropArtworkSource: string;
  logoArtworkSource: string;
  thumbnailEpisodeArtwork: string;
  backdropEpisodeArtwork: string;
  posterRatingsLayout: string;
  posterRatingsMaxPerSide: number | null;
  posterRatingsMax: number | null;
  posterEdgeOffset: number;
  backdropRatingsLayout: string;
  backdropRatingsMax: number | null;
  backdropBottomRatingsRow: boolean;
  logoRatingsMax: number | null;
  logoBottomRatingsRow: boolean;
  qualityBadgesSide: string;
  posterQualityBadgesPosition: string;
  trendingTagPosition: string;
  trendingTagStylePreset: string;
  trendingTagTextColor: string | null;
  posterQualityBadgeOffsetX: number;
  posterQualityBadgeOffsetY: number;
  ageRatingBadgePosition: string;
  qualityBadgesStyle: string;
  communityBadgeTheme: string;
  ageRatingBadgeStyle: string | null;
  releaseStatusBadgeStyle: string | null;
  qualityBadgesMax: number | null;
  qualityBadgePreferences: string[];
  remuxDisplayMode: string;
  posterSideRatingsPosition: string;
  posterSideRatingsOffset: number;
  backdropSideRatingsPosition: string;
  backdropSideRatingsOffset: number;
  ratingPresentation: string;
  posterRingValueSource: string;
  posterRingProgressSource: string;
  posterRingCenterOpacity: number;
  posterRingCriticsPriority: string;
  posterRingAudiencePriority: string;
  blockbusterDensity: string;
  aggregateRatingSource: string;
  aggregateProviderWeights: string;
  aggregateAccentMode: string;
  aggregateAccentColor: string | null;
  aggregateCriticsAccentColor: string | null;
  aggregateAudienceAccentColor: string | null;
  aggregateValueColor: string | null;
  aggregateCriticsValueColor: string | null;
  aggregateAudienceValueColor: string | null;
  aggregateDynamicStops: string;
  aggregateAccentBarOffset: number;
  aggregateAccentBarVisible: boolean;
  posterNoBackgroundBadgeOutlineColor: string;
  posterNoBackgroundBadgeOutlineWidth: number;
  ageRatingTileColor: string | null;
  releaseStatusTileColor: string | null;
  qualityBadgesTileAccentColor: string | null;
  networkTileColor: string | null;
  genreBadgeTileAccentColor: string | null;
  artworkSelectionSeed: string;
  ratingBlackStripEnabled: boolean;
  ratingStyle: string;
  iconShape: string;
  ratingStackOffsetX: number;
  ratingStackOffsetY: number;
  ratingValueMode: string;
  posterRatingBadgeScale: number;
  backdropRatingBadgeScale: number;
  logoRatingBadgeScale: number;
  posterQualityBadgeScale: number;
  backdropQualityBadgeScale: number;
  logoQualityBadgeScale?: number;
  genreBadgeMode: string;
  genreBadgeStyle: string;
  genreBadgePosition: string;
  genreBadgeScale: number;
  genreBadgeOffsetX: number;
  genreBadgeOffsetY: number;
  genreBadgeBorderWidth: number;
  genreBadgeBackgroundOpacity: number;
  genreBadgeAnimeGrouping: string;
  logoBackground: string;
  effectiveRatingPreferences: string[];
  providerAppearanceOverrides: RatingProviderAppearanceOverrides;
  qualityBadgeAppearanceOverrides: QualityBadgeAppearanceOverrides;
  mdblistStateKey: string;
  simklStateKey: string;
  streamBadgesCacheKeySeed: string;
  fanartKeyHash: string;
  fanartClientKeyHash: string;
  omdbKeyHash: string;
  sourceFallbackKey: string;
  canonicalEpisodeHintKey?: string;
  renderCacheBuster: string;
};

export const buildFinalImageRenderSeedKey = (input: FinalImageRenderSeedInput) => {
  const isPoster = input.imageType === 'poster';
  const isBackdrop = input.imageType === 'backdrop' || input.imageType === 'thumbnail';
  const isLogo = input.imageType === 'logo';
  const usesRandomPosterCriteria = isPoster && input.posterTextPreference === 'random';
  const ratingBadgeScale =
    input.imageType === 'poster'
      ? input.posterRatingBadgeScale
      : input.imageType === 'backdrop' || input.imageType === 'thumbnail'
        ? input.backdropRatingBadgeScale
        : input.logoRatingBadgeScale;
  const qualityBadgeScale =
    input.imageType === 'backdrop' || input.imageType === 'thumbnail'
      ? input.backdropQualityBadgeScale
      : input.imageType === 'logo'
        ? (input.logoQualityBadgeScale ?? 100)
      : input.posterQualityBadgeScale;
  const appliesStyleRatingOffset =
    input.ratingStyle === 'glass' || input.ratingStyle === 'square';
  const providerAppearanceKey =
    encodeRatingProviderAppearanceOverrides(input.providerAppearanceOverrides) || '-';
  const qualityBadgeAppearanceKey =
    encodeQualityBadgeAppearanceOverrides(input.qualityBadgeAppearanceOverrides) || '-';
  const toArtworkSourceCacheToken = (source: string) =>
    source === 'blackbar' ? 'blackbar-strip' : source;

  return [
    input.cacheVersion,
    input.imageType,
    input.outputFormat,
    input.cleanId,
    input.requestedImageLang,
    input.posterTextPreference,
    usesRandomPosterCriteria ? input.randomPosterTextMode : '-',
    usesRandomPosterCriteria ? input.randomPosterLanguageMode : '-',
    usesRandomPosterCriteria ? String(input.randomPosterMinVoteCount ?? 'off') : '-',
    usesRandomPosterCriteria ? String(input.randomPosterMinVoteAverage ?? 'off') : '-',
    usesRandomPosterCriteria ? String(input.randomPosterMinWidth ?? 'off') : '-',
    usesRandomPosterCriteria ? String(input.randomPosterMinHeight ?? 'off') : '-',
    usesRandomPosterCriteria ? input.randomPosterFallbackMode : '-',
    isPoster ? input.posterImageSize : '-',
    input.imageType === 'backdrop' ? input.backdropImageSize : '-',
    isPoster ? toArtworkSourceCacheToken(input.posterArtworkSource) : '-',
    isBackdrop ? toArtworkSourceCacheToken(input.backdropArtworkSource) : '-',
    input.imageType === 'thumbnail' ? input.thumbnailEpisodeArtwork : '-',
    input.imageType === 'backdrop' ? input.backdropEpisodeArtwork : '-',
    isLogo ? toArtworkSourceCacheToken(input.logoArtworkSource) : '-',
    isPoster ? input.posterRatingsLayout : '-',
    isPoster ? String(input.posterRatingsMaxPerSide ?? 'auto') : '-',
    isPoster ? String(input.posterRatingsMax ?? 'auto') : '-',
    isPoster ? String(input.posterEdgeOffset) : '-',
    isBackdrop ? String(input.backdropRatingsMax ?? 'auto') : '-',
    isBackdrop ? (input.backdropBottomRatingsRow ? 'bottom-row' : 'auto') : '-',
    isLogo ? String(input.logoRatingsMax ?? 'auto') : '-',
    isLogo ? (input.logoBottomRatingsRow ? 'bottom-row' : 'auto') : '-',
    isPoster ? input.qualityBadgesSide : '-',
    isPoster && (input.posterRatingsLayout === 'top' || input.posterRatingsLayout === 'bottom')
      ? input.posterQualityBadgesPosition
      : '-',
    isPoster ? input.trendingTagPosition : '-',
    isPoster ? input.trendingTagStylePreset : '-',
    isPoster ? input.trendingTagTextColor || '-' : '-',
    isPoster ? String(input.posterQualityBadgeOffsetX ?? 0) : '-',
    isPoster ? String(input.posterQualityBadgeOffsetY ?? 0) : '-',
    isPoster ? input.ageRatingBadgePosition : '-',
    input.qualityBadgesStyle,
    (
      input.qualityBadgesStyle === 'community-badge' ||
      input.ageRatingBadgeStyle === 'community-badge' ||
      input.releaseStatusBadgeStyle === 'community-badge' ||
      (isPoster && input.trendingTagStylePreset === 'community-badge')
    )
      ? input.communityBadgeTheme
      : '-',
    input.ageRatingBadgeStyle ?? '-',
    input.releaseStatusBadgeStyle ?? '-',
    String(input.qualityBadgesMax ?? 'auto'),
    input.qualityBadgePreferences.join(',') || 'none',
    String(qualityBadgeScale),
    isBackdrop && !input.backdropBottomRatingsRow ? input.backdropRatingsLayout : '-',
    isPoster ? input.posterSideRatingsPosition : '-',
    isPoster ? String(input.posterSideRatingsOffset) : '-',
    isBackdrop && !input.backdropBottomRatingsRow ? input.backdropSideRatingsPosition : '-',
    isBackdrop && !input.backdropBottomRatingsRow
      ? String(input.backdropSideRatingsOffset)
      : '-',
    input.ratingPresentation,
    isPoster && input.ratingPresentation === 'ring' ? input.posterRingValueSource : '-',
    isPoster && input.ratingPresentation === 'ring' ? input.posterRingProgressSource : '-',
    isPoster && input.ratingPresentation === 'ring' ? String(input.posterRingCenterOpacity) : '-',
    isPoster && input.ratingPresentation === 'ring'
      ? input.posterRingCriticsPriority || '-'
      : '-',
    isPoster && input.ratingPresentation === 'ring'
      ? input.posterRingAudiencePriority || '-'
      : '-',
    isPoster ? input.blockbusterDensity : '-',
    input.aggregateRatingSource,
    input.aggregateProviderWeights || '-',
    input.aggregateAccentMode,
    input.aggregateAccentColor || '-',
    input.aggregateCriticsAccentColor || '-',
    input.aggregateAudienceAccentColor || '-',
    input.aggregateValueColor || '-',
    input.aggregateCriticsValueColor || '-',
    input.aggregateAudienceValueColor || '-',
    input.aggregateAccentMode === 'dynamic' ? input.aggregateDynamicStops : '-',
    String(input.aggregateAccentBarOffset),
    input.aggregateAccentBarVisible ? 'on' : 'off',
    isPoster ? input.posterNoBackgroundBadgeOutlineColor : '-',
    isPoster ? String(input.posterNoBackgroundBadgeOutlineWidth) : '-',
    (input.qualityBadgesStyle === 'tile' || input.ageRatingBadgeStyle === 'tile') ? (input.ageRatingTileColor || '-') : '-',
    (input.qualityBadgesStyle === 'tile' || input.releaseStatusBadgeStyle === 'tile') ? (input.releaseStatusTileColor || '-') : '-',
    input.qualityBadgesStyle === 'tile' ? (input.qualityBadgesTileAccentColor || '-') : '-',
    input.qualityBadgesStyle === 'tile' ? (input.networkTileColor || '-') : '-',
    input.artworkSelectionSeed || '-',
    input.ratingBlackStripEnabled ? 'strip' : '-',
    input.ratingStyle,
    input.iconShape !== 'original' ? input.iconShape : '-',
    appliesStyleRatingOffset ? String(input.ratingStackOffsetX) : '-',
    appliesStyleRatingOffset ? String(input.ratingStackOffsetY) : '-',
    input.ratingValueMode,
    String(ratingBadgeScale),
    input.genreBadgeMode,
    input.genreBadgeMode !== DEFAULT_GENRE_BADGE_MODE ? input.genreBadgeStyle : '-',
    input.genreBadgeMode !== DEFAULT_GENRE_BADGE_MODE ? input.genreBadgePosition : '-',
    String(input.genreBadgeScale),
    input.genreBadgeMode !== DEFAULT_GENRE_BADGE_MODE ? String(input.genreBadgeOffsetX) : '-',
    input.genreBadgeMode !== DEFAULT_GENRE_BADGE_MODE ? String(input.genreBadgeOffsetY) : '-',
    input.genreBadgeMode !== DEFAULT_GENRE_BADGE_MODE && input.genreBadgeStyle === 'glass'
      ? String(input.genreBadgeBorderWidth)
      : '-',
    input.genreBadgeMode !== DEFAULT_GENRE_BADGE_MODE && input.genreBadgeStyle === 'clean'
      ? String(input.genreBadgeBackgroundOpacity)
      : '-',
    input.genreBadgeMode !== DEFAULT_GENRE_BADGE_MODE && input.genreBadgeStyle === 'tile'
      ? (input.genreBadgeTileAccentColor || '-')
      : '-',
    input.genreBadgeMode !== DEFAULT_GENRE_BADGE_MODE ? input.genreBadgeAnimeGrouping : '-',
    isLogo ? input.logoBackground : '-',
    input.effectiveRatingPreferences.join(',') || 'none',
    providerAppearanceKey,
    qualityBadgeAppearanceKey,
    input.mdblistStateKey || '-',
    input.simklStateKey || '-',
    input.streamBadgesCacheKeySeed,
    input.fanartKeyHash || '-',
    input.fanartClientKeyHash || '-',
    isPoster && (input.posterArtworkSource === 'omdb' || input.posterArtworkSource === 'random')
      ? input.omdbKeyHash || '-'
      : '-',
    input.sourceFallbackKey || '-',
    input.canonicalEpisodeHintKey || '-',
    input.renderCacheBuster || '-',
    'v15',
  ].join('|');
};
