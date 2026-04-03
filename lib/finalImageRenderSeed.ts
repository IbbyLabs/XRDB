import {
  encodeRatingProviderAppearanceOverrides,
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
  qualityBadgesStyle: string;
  qualityBadgesMax: number | null;
  qualityBadgePreferences: string[];
  posterSideRatingsPosition: string;
  posterSideRatingsOffset: number;
  backdropSideRatingsPosition: string;
  backdropSideRatingsOffset: number;
  ratingPresentation: string;
  posterRingValueSource: string;
  posterRingProgressSource: string;
  blockbusterDensity: string;
  aggregateRatingSource: string;
  aggregateAccentMode: string;
  aggregateAccentColor: string | null;
  aggregateCriticsAccentColor: string | null;
  aggregateAudienceAccentColor: string | null;
  aggregateDynamicStops: string;
  aggregateAccentBarOffset: number;
  aggregateAccentBarVisible: boolean;
  posterNoBackgroundBadgeOutlineColor: string;
  posterNoBackgroundBadgeOutlineWidth: number;
  artworkSelectionSeed: string;
  ratingStyle: string;
  ratingStackOffsetX: number;
  ratingStackOffsetY: number;
  ratingValueMode: string;
  posterRatingBadgeScale: number;
  backdropRatingBadgeScale: number;
  logoRatingBadgeScale: number;
  posterQualityBadgeScale: number;
  backdropQualityBadgeScale: number;
  genreBadgeMode: string;
  genreBadgeStyle: string;
  genreBadgePosition: string;
  genreBadgeScale: number;
  genreBadgeBorderWidth: number;
  genreBadgeAnimeGrouping: string;
  logoBackground: string;
  effectiveRatingPreferences: string[];
  providerAppearanceOverrides: RatingProviderAppearanceOverrides;
  mdblistStateKey: string;
  simklStateKey: string;
  streamBadgesCacheKeySeed: string;
  fanartKeyHash: string;
  fanartClientKeyHash: string;
  omdbKeyHash: string;
  sourceFallbackKey: string;
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
    input.imageType === 'backdrop'
      ? input.backdropQualityBadgeScale
      : input.posterQualityBadgeScale;
  const appliesStyleRatingOffset =
    input.ratingStyle === 'glass' || input.ratingStyle === 'square';
  const providerAppearanceKey =
    encodeRatingProviderAppearanceOverrides(input.providerAppearanceOverrides) || '-';
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
    isLogo ? '-' : input.qualityBadgesStyle,
    isLogo ? '-' : String(input.qualityBadgesMax ?? 'auto'),
    isLogo ? '-' : input.qualityBadgePreferences.join(',') || 'none',
    isLogo ? '-' : String(qualityBadgeScale),
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
    isPoster ? input.blockbusterDensity : '-',
    input.aggregateRatingSource,
    input.aggregateAccentMode,
    input.aggregateAccentColor || '-',
    input.aggregateCriticsAccentColor || '-',
    input.aggregateAudienceAccentColor || '-',
    input.aggregateAccentMode === 'dynamic' ? input.aggregateDynamicStops : '-',
    String(input.aggregateAccentBarOffset),
    input.aggregateAccentBarVisible ? 'on' : 'off',
    isPoster ? input.posterNoBackgroundBadgeOutlineColor : '-',
    isPoster ? String(input.posterNoBackgroundBadgeOutlineWidth) : '-',
    input.artworkSelectionSeed || '-',
    input.ratingStyle,
    appliesStyleRatingOffset ? String(input.ratingStackOffsetX) : '-',
    appliesStyleRatingOffset ? String(input.ratingStackOffsetY) : '-',
    input.ratingValueMode,
    String(ratingBadgeScale),
    input.genreBadgeMode,
    input.genreBadgeMode !== DEFAULT_GENRE_BADGE_MODE ? input.genreBadgeStyle : '-',
    input.genreBadgeMode !== DEFAULT_GENRE_BADGE_MODE ? input.genreBadgePosition : '-',
    String(input.genreBadgeScale),
    input.genreBadgeMode !== DEFAULT_GENRE_BADGE_MODE && input.genreBadgeStyle === 'glass'
      ? String(input.genreBadgeBorderWidth)
      : '-',
    input.genreBadgeMode !== DEFAULT_GENRE_BADGE_MODE ? input.genreBadgeAnimeGrouping : '-',
    isLogo ? input.logoBackground : '-',
    input.effectiveRatingPreferences.join(',') || 'none',
    providerAppearanceKey,
    input.mdblistStateKey || '-',
    input.simklStateKey || '-',
    input.streamBadgesCacheKeySeed,
    input.fanartKeyHash || '-',
    input.fanartClientKeyHash || '-',
    isPoster && (input.posterArtworkSource === 'omdb' || input.posterArtworkSource === 'random')
      ? input.omdbKeyHash || '-'
      : '-',
    input.sourceFallbackKey || '-',
    input.renderCacheBuster || '-',
    'v13',
  ].join('|');
};
