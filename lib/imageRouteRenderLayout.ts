import { chunkBy } from './imageRouteBinary.ts';
import {
  DEFAULT_BADGE_MIN_METRICS,
  getBadgeHeightFromMetrics,
  scaleBadgeMetrics,
  type BadgeLayoutMetrics,
} from './imageRouteBadgeMetrics.ts';
import {
  fitBadgeMetricsToHeight,
  getBackdropBadgeRegion,
  getMaxBadgeColumnCount,
  splitPosterBadgesByLayout,
} from './imageRouteBadgeColumns.ts';
import {
  fitBadgeMetricsToWidth,
  measureBadgeRowWidth,
  splitBadgesIntoFittingRows,
} from './imageRouteBadgeRows.ts';
import { resolveQualityBadgeHeight } from './qualityBadgeLayout.ts';
import { FALLBACK_IMAGE_LANGUAGE } from './imageRouteConfig.ts';
import { POSTER_EDGE_INSET_BASE } from './posterEdgeOffset.ts';
import { fetchBlockbusterBlurbsWithFallback } from './imageRouteBlockbuster.ts';
import { DEFAULT_PROVIDER_ICON_SCALE_PERCENT } from './badgeCustomization.ts';
import type { PhaseDurations, CachedJsonResponse } from './imageRouteRuntime.ts';
import type { RatingBadge } from './imageRouteRenderer.ts';
import type { PosterRatingLayout } from './posterLayoutOptions.ts';
import type { ScorebarConfig } from './scorebarConfig.ts';
import type { BackdropRatingLayout } from './backdropLayoutOptions.ts';
import type { RatingStyle } from './ratingAppearance.ts';
import type { BlockbusterBlurb } from './imageRouteBlockbusterReview.ts';
import type { RatingPresentation } from './ratingPresentation.ts';

type LayoutFetchJson = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
) => Promise<CachedJsonResponse>;

type ImageRouteRenderLayout = {
  cappedRatingBadges: RatingBadge[];
  topRatingBadges: RatingBadge[];
  bottomRatingBadges: RatingBadge[];
  leftRatingBadges: RatingBadge[];
  rightRatingBadges: RatingBadge[];
  posterTopRows: RatingBadge[][];
  posterBottomRows: RatingBadge[][];
  backdropRows: RatingBadge[][];
  backdropBottomRatingsRow: boolean;
  blockbusterBlurbs: BlockbusterBlurb[];
  badgeIconSize: number;
  badgeFontSize: number;
  badgePaddingX: number;
  badgePaddingY: number;
  badgeGap: number;
  badgeTopOffset: number;
  badgeBottomOffset: number;
  backdropEdgeInset: number;
  posterEdgeInset: number;
  posterRowHorizontalInset: number;
  qualityBadges: RatingBadge[];
  effectiveQualityBadgeScalePercent: number;
  finalOutputWidth: number;
  finalOutputHeight: number;
  logoImageWidth: number;
  logoImageHeight: number;
  logoBadgeBandHeight: number;
  logoBadgeMaxWidth: number;
  logoBadgesPerRow: number;
  scorebarBandHeight: number;
};

export const resolveImageRouteRenderLayout = async (input: {
  imageType: 'poster' | 'backdrop' | 'logo';
  isThumbnailRequest: boolean;
  ratingPresentation: RatingPresentation;
  outputWidth: number;
  outputHeight: number;
  overlayAutoScale: number;
  displayRatingBadges: RatingBadge[];
  streamBadges: RatingBadge[];
  effectivePosterRatingsLayout: PosterRatingLayout;
  effectivePosterRatingsMaxPerSide: number | null;
  effectiveBackdropRatingsLayout: BackdropRatingLayout;
  backdropBottomRatingsRow: boolean;
  logoBottomRatingsRow: boolean;
  logoRatingsMax?: number | null;
  posterRatingBadgeScale: number;
  backdropRatingBadgeScale: number;
  logoRatingBadgeScale: number;
  posterQualityBadgeScale: number;
  backdropQualityBadgeScale: number;
  logoQualityBadgeScale?: number;
  ratingStyle: RatingStyle;
  qualityBadgesMax: number | null;
  mediaType: 'movie' | 'tv' | null;
  media: any;
  tmdbKey: string;
  posterEdgeOffset: number;
  requestedImageLang: string;
  phases: PhaseDurations;
  fetchJsonCached: LayoutFetchJson;
  scorebarConfig?: ScorebarConfig | null;
}): Promise<ImageRouteRenderLayout> => {
  const {
    imageType,
    isThumbnailRequest,
    ratingPresentation,
    outputWidth,
    outputHeight,
    overlayAutoScale,
    displayRatingBadges,
    streamBadges,
    effectivePosterRatingsLayout,
    effectivePosterRatingsMaxPerSide,
    effectiveBackdropRatingsLayout,
    backdropBottomRatingsRow,
    logoBottomRatingsRow,
    posterRatingBadgeScale,
    backdropRatingBadgeScale,
    logoRatingBadgeScale,
    posterQualityBadgeScale,
    backdropQualityBadgeScale,
    logoQualityBadgeScale = 100,
    posterEdgeOffset,
    ratingStyle,
    qualityBadgesMax,
    mediaType,
    media,
    tmdbKey,
    requestedImageLang,
    phases,
    fetchJsonCached,
    scorebarConfig = null,
  } = input;

  const usePosterBadgeLayout = imageType === 'poster';
  const useBackdropBadgeLayout = imageType === 'backdrop';
  const useLogoBadgeLayout = imageType === 'logo';
  const useBlockbusterPresentation = ratingPresentation === 'blockbuster';
  const usePosterScorebar = imageType === 'poster' && ratingPresentation === 'scorebar';
  const usePosterRowLayout =
    usePosterBadgeLayout &&
    (effectivePosterRatingsLayout === 'top' ||
      effectivePosterRatingsLayout === 'bottom' ||
      effectivePosterRatingsLayout === 'top-bottom');
  const usePosterRowLayoutLarge = usePosterBadgeLayout && usePosterRowLayout;
  const useBackdropBottomRatingsRow = useBackdropBadgeLayout && backdropBottomRatingsRow;
  const useBackdropRightVerticalLayout =
    useBackdropBadgeLayout &&
    !useBackdropBottomRatingsRow &&
    effectiveBackdropRatingsLayout === 'right-vertical';

  let cappedRatingBadges = [...displayRatingBadges];
  const backdropRows =
    useBackdropBadgeLayout && !useBackdropRightVerticalLayout
      ? useBackdropBottomRatingsRow
        ? cappedRatingBadges.length > 0
          ? [cappedRatingBadges]
          : []
        : (() => {
          const firstRowCount = Math.ceil(cappedRatingBadges.length / 2);
          return [cappedRatingBadges.slice(0, firstRowCount), cappedRatingBadges.slice(firstRowCount)];
        })()
      : [];
  let posterBadgeGroups = splitPosterBadgesByLayout(
    cappedRatingBadges,
    effectivePosterRatingsLayout,
    effectivePosterRatingsMaxPerSide === null ? undefined : effectivePosterRatingsMaxPerSide,
  );
  let topRatingBadges = usePosterBadgeLayout
    ? posterBadgeGroups.topBadges
    : useBackdropRightVerticalLayout
      ? []
      : (backdropRows[0] || []);
  let bottomRatingBadges = usePosterBadgeLayout
    ? posterBadgeGroups.bottomBadges
    : useBackdropRightVerticalLayout
      ? []
      : (backdropRows[1] || []);
  let leftRatingBadges = usePosterBadgeLayout ? posterBadgeGroups.leftBadges : [];
  let rightRatingBadges = usePosterBadgeLayout
    ? posterBadgeGroups.rightBadges
    : useBackdropRightVerticalLayout
      ? [...cappedRatingBadges]
      : [];
  let posterTopRows: RatingBadge[][] = topRatingBadges.length > 0 ? [topRatingBadges] : [];
  let posterBottomRows: RatingBadge[][] = bottomRatingBadges.length > 0 ? [bottomRatingBadges] : [];
  let blockbusterBlurbs: BlockbusterBlurb[] = [];

  if (usePosterBadgeLayout && useBlockbusterPresentation && mediaType && media?.id) {
    blockbusterBlurbs = await fetchBlockbusterBlurbsWithFallback({
      mediaType,
      tmdbId: media.id,
      tmdbKey,
      requestedLanguage: requestedImageLang,
      fallbackLanguage: FALLBACK_IMAGE_LANGUAGE,
      phases,
      fetchJsonCached,
    });
  }

  let badgeIconSize = 34;
  let badgeFontSize = 28;
  let badgePaddingY = 8;
  let badgePaddingX = 14;
  let badgeGap = 10;
  let badgeTopOffset = 16;
  let badgeBottomOffset = 16;
  let backdropEdgeInset = 12;
  let posterMinMetrics: BadgeLayoutMetrics = DEFAULT_BADGE_MIN_METRICS;
  let posterRowHorizontalInset = 12;

  if (useBackdropBadgeLayout) {
    badgeIconSize = 32;
    badgeFontSize = 24;
    badgePaddingY = 8;
    badgePaddingX = 12;
    badgeGap = 8;
    badgeTopOffset = isThumbnailRequest ? 28 : 20;
    badgeBottomOffset = isThumbnailRequest ? 28 : 20;
    backdropEdgeInset = isThumbnailRequest ? 24 : 12;
    if (isThumbnailRequest) {
      badgeIconSize = 40;
      badgeFontSize = 30;
      badgePaddingY = 10;
      badgePaddingX = 14;
      badgeGap = 10;
    }
  } else if (usePosterBadgeLayout) {
    if (usePosterRowLayoutLarge) {
      badgeIconSize = 46;
      badgeFontSize = 35;
      badgePaddingY = 8;
      badgePaddingX = 13;
      badgeGap = 9;
    } else {
      badgeIconSize = 42;
      badgeFontSize = 32;
      badgePaddingY = 7;
      badgePaddingX = 11;
      badgeGap = 8;
    }
    posterMinMetrics = {
      iconSize: 24,
      fontSize: 18,
      paddingX: 8,
      paddingY: 6,
      gap: 6,
    };
    badgeTopOffset = 24;
    badgeBottomOffset = 24;
  } else if (useLogoBadgeLayout) {
    badgeIconSize = 92;
    badgeFontSize = 68;
    badgePaddingY = 24;
    badgePaddingX = 38;
    badgeGap = 22;
  }

  badgeTopOffset = Math.max(12, Math.round(badgeTopOffset * overlayAutoScale));
  badgeBottomOffset = Math.max(12, Math.round(badgeBottomOffset * overlayAutoScale));
  backdropEdgeInset = Math.max(12, Math.round(backdropEdgeInset * overlayAutoScale));
  posterRowHorizontalInset = Math.max(12, Math.round(posterRowHorizontalInset * overlayAutoScale));
  const posterEdgeInset = Math.max(12, Math.round((POSTER_EDGE_INSET_BASE + posterEdgeOffset) * overlayAutoScale));
  posterMinMetrics = scaleBadgeMetrics(posterMinMetrics, 100, overlayAutoScale);

  const ratingBadgeScalePercent =
    imageType === 'poster'
      ? posterRatingBadgeScale
      : imageType === 'backdrop'
        ? backdropRatingBadgeScale
        : logoRatingBadgeScale;
  const qualityBadgeScalePercent =
    imageType === 'backdrop'
      ? backdropQualityBadgeScale
      : imageType === 'logo'
        ? logoQualityBadgeScale
      : posterQualityBadgeScale;
  const qualityBadges =
    typeof qualityBadgesMax === 'number'
      ? streamBadges.slice(0, qualityBadgesMax)
      : streamBadges;
  const logoBandBadgeCount = useLogoBadgeLayout
    ? cappedRatingBadges.length + qualityBadges.length
    : 0;
  const effectiveRatingBadgeScalePercent = Math.max(
    1,
    Math.round(ratingBadgeScalePercent * overlayAutoScale),
  );
  const effectiveQualityBadgeScalePercent = Math.max(1, qualityBadgeScalePercent);
  const scaledBadgeMetrics = scaleBadgeMetrics(
    {
      iconSize: badgeIconSize,
      fontSize: badgeFontSize,
      paddingX: badgePaddingX,
      paddingY: badgePaddingY,
      gap: badgeGap,
    },
    effectiveRatingBadgeScalePercent,
  );
  badgeIconSize = scaledBadgeMetrics.iconSize;
  badgeFontSize = scaledBadgeMetrics.fontSize;
  badgePaddingX = scaledBadgeMetrics.paddingX;
  badgePaddingY = scaledBadgeMetrics.paddingY;
  badgeGap = scaledBadgeMetrics.gap;

  if (usePosterBadgeLayout && cappedRatingBadges.length > 0) {
    if (usePosterScorebar) {
      const fittedScorebarMetrics = fitBadgeMetricsToWidth(
        [cappedRatingBadges],
        Math.max(0, outputWidth - posterRowHorizontalInset * 2),
        {
          iconSize: badgeIconSize,
          fontSize: badgeFontSize,
          paddingX: badgePaddingX,
          paddingY: badgePaddingY,
          gap: badgeGap,
        },
        posterMinMetrics,
        true,
        false,
        ratingStyle,
      );
      badgeIconSize = fittedScorebarMetrics.iconSize;
      badgeFontSize = fittedScorebarMetrics.fontSize;
      badgePaddingX = fittedScorebarMetrics.paddingX;
      badgePaddingY = fittedScorebarMetrics.paddingY;
      badgeGap = fittedScorebarMetrics.gap;
      topRatingBadges = [];
      bottomRatingBadges = [];
      leftRatingBadges = [];
      rightRatingBadges = [];
      posterTopRows = [];
      posterBottomRows = [];
    } else {
    let fittedPosterMetrics: BadgeLayoutMetrics;
    if (
      effectivePosterRatingsLayout === 'left' ||
      effectivePosterRatingsLayout === 'right' ||
      effectivePosterRatingsLayout === 'left-right'
    ) {
      const useThreeBadgeTopRow =
        effectivePosterRatingsLayout === 'left-right' &&
        topRatingBadges.length === 1 &&
        leftRatingBadges.length > 0 &&
        rightRatingBadges.length > 0;
      const fittedLeftColumn = useThreeBadgeTopRow ? leftRatingBadges.slice(1) : leftRatingBadges;
      const fittedRightColumn = useThreeBadgeTopRow ? rightRatingBadges.slice(1) : rightRatingBadges;
      const posterColumns = [fittedLeftColumn, fittedRightColumn].filter((column) => column.length > 0);
      const widthRows = posterColumns.flatMap((column) => column.map((badge) => [badge]));
      const alignPosterQualityBadges =
        (effectivePosterRatingsLayout === 'left' || effectivePosterRatingsLayout === 'right') &&
        streamBadges.length > 0;
      const reservedTopRows =
        effectivePosterRatingsLayout === 'left-right' && topRatingBadges.length > 0 ? 1 : 0;
      const posterColumnMaxWidth =
        effectivePosterRatingsLayout === 'left-right'
          ? Math.max(160, Math.floor((outputWidth - 36) / 2))
          : alignPosterQualityBadges
            ? Math.max(220, Math.floor(outputWidth * 0.6))
            : Math.max(180, Math.floor(outputWidth * 0.46));
      fittedPosterMetrics = fitBadgeMetricsToWidth(
        widthRows,
        posterColumnMaxWidth + 24,
        {
          iconSize: badgeIconSize,
          fontSize: badgeFontSize,
          paddingX: badgePaddingX,
          paddingY: badgePaddingY,
          gap: badgeGap,
        },
        posterMinMetrics,
        false,
        false,
        ratingStyle,
      );
      const maxPerColumn = getMaxBadgeColumnCount(
        outputHeight,
        fittedPosterMetrics,
        badgeTopOffset,
        badgeBottomOffset,
        reservedTopRows,
        ratingStyle,
      );
      const effectiveMaxPerSide =
        effectivePosterRatingsMaxPerSide === null
          ? maxPerColumn + (useThreeBadgeTopRow ? 1 : 0)
          : Math.min(
              maxPerColumn + (useThreeBadgeTopRow ? 1 : 0),
              effectivePosterRatingsMaxPerSide,
            );
      posterBadgeGroups = splitPosterBadgesByLayout(
        cappedRatingBadges,
        effectivePosterRatingsLayout,
        effectiveMaxPerSide,
      );
      topRatingBadges = posterBadgeGroups.topBadges;
      bottomRatingBadges = posterBadgeGroups.bottomBadges;
      leftRatingBadges = posterBadgeGroups.leftBadges;
      rightRatingBadges = posterBadgeGroups.rightBadges;
      const constrainedLeftColumn = useThreeBadgeTopRow ? leftRatingBadges.slice(1) : leftRatingBadges;
      const constrainedRightColumn = useThreeBadgeTopRow ? rightRatingBadges.slice(1) : rightRatingBadges;
      const constrainedPosterColumns = [constrainedLeftColumn, constrainedRightColumn].filter(
        (column) => column.length > 0,
      );
      const constrainedReservedTopRows =
        effectivePosterRatingsLayout === 'left-right' && topRatingBadges.length > 0 ? 1 : 0;
      fittedPosterMetrics = fitBadgeMetricsToHeight(
        constrainedPosterColumns,
        outputHeight,
        fittedPosterMetrics,
        badgeTopOffset,
        badgeBottomOffset,
        posterMinMetrics,
        constrainedReservedTopRows,
        ratingStyle,
      );
      cappedRatingBadges = [...topRatingBadges, ...leftRatingBadges, ...rightRatingBadges];
    } else {
      const posterRowFitWidth = usePosterRowLayout
        ? Math.max(0, outputWidth - posterRowHorizontalInset * 2)
        : outputWidth;
      fittedPosterMetrics = fitBadgeMetricsToWidth(
        [topRatingBadges, bottomRatingBadges].filter((row) => row.length > 0),
        posterRowFitWidth,
        {
          iconSize: badgeIconSize,
          fontSize: badgeFontSize,
          paddingX: badgePaddingX,
          paddingY: badgePaddingY,
          gap: badgeGap,
        },
        posterMinMetrics,
        usePosterRowLayout,
        false,
        ratingStyle,
      );
      if (effectivePosterRatingsLayout === 'top') {
        posterTopRows = splitBadgesIntoFittingRows(
          topRatingBadges,
          posterRowFitWidth,
          fittedPosterMetrics,
          usePosterRowLayout,
          ratingStyle,
        );
      } else if (effectivePosterRatingsLayout === 'bottom') {
        posterBottomRows = splitBadgesIntoFittingRows(
          bottomRatingBadges,
          posterRowFitWidth,
          fittedPosterMetrics,
          usePosterRowLayout,
          ratingStyle,
        );
      } else if (effectivePosterRatingsLayout === 'top-bottom') {
        posterTopRows = splitBadgesIntoFittingRows(
          topRatingBadges,
          posterRowFitWidth,
          fittedPosterMetrics,
          usePosterRowLayout,
          ratingStyle,
        );
        posterBottomRows = splitBadgesIntoFittingRows(
          bottomRatingBadges,
          posterRowFitWidth,
          fittedPosterMetrics,
          usePosterRowLayout,
          ratingStyle,
        );
      }
    }
    badgeIconSize = fittedPosterMetrics.iconSize;
    badgeFontSize = fittedPosterMetrics.fontSize;
    badgePaddingX = fittedPosterMetrics.paddingX;
    badgePaddingY = fittedPosterMetrics.paddingY;
    badgeGap = fittedPosterMetrics.gap;
    }
  } else if (useBackdropBadgeLayout && cappedRatingBadges.length > 0) {
    let fittedBackdropMetrics: BadgeLayoutMetrics;
    if (useBackdropRightVerticalLayout) {
      const backdropColumnMaxWidth = Math.max(180, Math.floor(outputWidth * 0.28));
      fittedBackdropMetrics = fitBadgeMetricsToWidth(
        rightRatingBadges.map((badge) => [badge]),
        backdropColumnMaxWidth + 24,
        {
          iconSize: badgeIconSize,
          fontSize: badgeFontSize,
          paddingX: badgePaddingX,
          paddingY: badgePaddingY,
          gap: badgeGap,
        },
        DEFAULT_BADGE_MIN_METRICS,
        false,
        false,
        ratingStyle,
      );
      fittedBackdropMetrics = fitBadgeMetricsToHeight(
        [rightRatingBadges],
        outputHeight,
        fittedBackdropMetrics,
        badgeTopOffset,
        badgeBottomOffset,
        DEFAULT_BADGE_MIN_METRICS,
        0,
        ratingStyle,
      );
      const maxPerColumn = getMaxBadgeColumnCount(
        outputHeight,
        fittedBackdropMetrics,
        badgeTopOffset,
        badgeBottomOffset,
        0,
        ratingStyle,
      );
      rightRatingBadges = rightRatingBadges.slice(0, maxPerColumn);
      cappedRatingBadges = [...rightRatingBadges];
    } else {
      const backdropRegion = useBackdropBottomRatingsRow
        ? { left: 0, width: outputWidth }
        : getBackdropBadgeRegion(outputWidth, effectiveBackdropRatingsLayout);
      fittedBackdropMetrics = fitBadgeMetricsToWidth(
        backdropRows,
        backdropRegion.width,
        {
          iconSize: badgeIconSize,
          fontSize: badgeFontSize,
          paddingX: badgePaddingX,
          paddingY: badgePaddingY,
          gap: badgeGap,
        },
        DEFAULT_BADGE_MIN_METRICS,
        false,
        false,
        ratingStyle,
      );
    }
    badgeIconSize = fittedBackdropMetrics.iconSize;
    badgeFontSize = fittedBackdropMetrics.fontSize;
    badgePaddingX = fittedBackdropMetrics.paddingX;
    badgePaddingY = fittedBackdropMetrics.paddingY;
    badgeGap = fittedBackdropMetrics.gap;
  }

  if (useLogoBadgeLayout && cappedRatingBadges.length > 0) {
    const baseLogoMetrics: BadgeLayoutMetrics = {
      iconSize: badgeIconSize,
      fontSize: badgeFontSize,
      paddingX: badgePaddingX,
      paddingY: badgePaddingY,
      gap: badgeGap,
    };
    const logoSingleRowMinMetrics: BadgeLayoutMetrics = {
      iconSize: ratingStyle === 'stacked' ? 48 : 44,
      fontSize: ratingStyle === 'stacked' ? 36 : 34,
      paddingX: ratingStyle === 'stacked' ? 18 : 14,
      paddingY: ratingStyle === 'stacked' ? 12 : 8,
      gap: 8,
    };
    const fitLogoRowMetrics = (count: number) =>
      fitBadgeMetricsToWidth(
        [cappedRatingBadges.slice(0, count)],
        outputWidth,
        baseLogoMetrics,
        logoSingleRowMinMetrics,
        false,
        false,
        ratingStyle,
      );

    const logoWidthTierCap = logoBottomRatingsRow
      ? outputWidth <= 460
        ? 3
        : outputWidth <= 760
          ? 4
          : outputWidth <= 1120
            ? 5
            : Math.max(6, Math.floor(outputWidth / 220))
      : outputWidth <= 460
        ? 3
        : outputWidth <= 760
          ? 4
          : outputWidth <= 1120
            ? 5
            : Math.max(6, Math.floor(outputWidth / 220));
    let logoVisibleBadgeCount = Math.max(1, Math.min(cappedRatingBadges.length, logoWidthTierCap));
    while (logoVisibleBadgeCount > 1) {
      const trialMetrics = fitLogoRowMetrics(logoVisibleBadgeCount);
      const legibleSingleRow =
        trialMetrics.iconSize >= logoSingleRowMinMetrics.iconSize &&
        trialMetrics.fontSize >= logoSingleRowMinMetrics.fontSize &&
        trialMetrics.paddingX >= logoSingleRowMinMetrics.paddingX &&
        trialMetrics.paddingY >= logoSingleRowMinMetrics.paddingY &&
        trialMetrics.gap >= logoSingleRowMinMetrics.gap;
      if (legibleSingleRow) {
        break;
      }
      logoVisibleBadgeCount -= 1;
    }

    const shouldNormalizeAutoLogoIconScale = input.logoRatingsMax === null || input.logoRatingsMax === undefined;
    if (shouldNormalizeAutoLogoIconScale) {
      cappedRatingBadges = cappedRatingBadges.map((badge, badgeIndex) =>
        badgeIndex >= logoVisibleBadgeCount ||
        badge.iconScalePercent === undefined ||
        badge.iconScalePercent === DEFAULT_PROVIDER_ICON_SCALE_PERCENT
          ? badge
          : {
              ...badge,
              iconScalePercent: DEFAULT_PROVIDER_ICON_SCALE_PERCENT,
            },
      );
    }

    if (logoVisibleBadgeCount < cappedRatingBadges.length) {
      cappedRatingBadges = cappedRatingBadges.slice(0, logoVisibleBadgeCount);
    }

    const fittedLogoMetrics = fitLogoRowMetrics(Math.max(1, cappedRatingBadges.length));
    badgeIconSize = fittedLogoMetrics.iconSize;
    badgeFontSize = fittedLogoMetrics.fontSize;
    badgePaddingX = fittedLogoMetrics.paddingX;
    badgePaddingY = fittedLogoMetrics.paddingY;
    badgeGap = fittedLogoMetrics.gap;
  }

  const logoBadgesPerRow = useLogoBadgeLayout
    ? cappedRatingBadges.length > 0
      ? Math.max(1, cappedRatingBadges.length)
      : useBlockbusterPresentation
        ? Math.max(2, Math.min(4, Math.ceil(Math.sqrt(logoBandBadgeCount || 1))))
        : Math.min(
            Math.max(1, logoBandBadgeCount),
            Math.max(2, Math.ceil(Math.sqrt(Math.max(1, logoBandBadgeCount)))),
          )
    : 0;
  const logoBadgeRowWidth = useLogoBadgeLayout && cappedRatingBadges.length > 0
    ? chunkBy(cappedRatingBadges, Math.max(1, logoBadgesPerRow)).reduce((maxWidth, row) => {
        const rowWidth = measureBadgeRowWidth(
          row,
          {
            iconSize: badgeIconSize,
            fontSize: badgeFontSize,
            paddingX: badgePaddingX,
            paddingY: badgePaddingY,
            gap: badgeGap,
          },
          false,
          ratingStyle,
        );
        return Math.max(maxWidth, rowWidth);
      }, 0)
    : 0;
  const logoNaturalWidth = useLogoBadgeLayout ? outputWidth : 0;
  const finalOutputWidth = useLogoBadgeLayout ? outputWidth : outputWidth;
  const logoImageWidth = useLogoBadgeLayout ? logoNaturalWidth : 0;
  const logoBaseImageHeight = useLogoBadgeLayout ? outputHeight : 0;
  const logoRatingRows =
    useLogoBadgeLayout && cappedRatingBadges.length > 0
      ? Math.ceil(cappedRatingBadges.length / Math.max(1, logoBadgesPerRow))
      : 0;
  const logoBadgeItemHeight = getBadgeHeightFromMetrics(
    {
      iconSize: badgeIconSize,
      fontSize: badgeFontSize,
      paddingX: badgePaddingX,
      paddingY: badgePaddingY,
      gap: badgeGap,
    },
    ratingStyle,
  );
  const logoQualityRows = useLogoBadgeLayout && qualityBadges.length > 0 ? 1 : 0;
  const logoQualityBadgeHeight =
    useLogoBadgeLayout && qualityBadges.length > 0
      ? resolveQualityBadgeHeight({
          referenceBadgeHeight: logoBadgeItemHeight,
          qualityBadgeScalePercent: effectiveQualityBadgeScalePercent,
          layout: 'row',
        })
      : 0;
  const logoBandRowCount = logoRatingRows + logoQualityRows;
  const logoBandContentHeight =
    logoRatingRows * logoBadgeItemHeight +
    logoQualityRows * logoQualityBadgeHeight +
    Math.max(0, logoBandRowCount - 1) * badgeGap;
  const logoBadgeContainerMaxWidth = Math.max(0, finalOutputWidth - 24);
  const logoBadgeMaxWidth = logoBadgeContainerMaxWidth;
  const logoBadgeBandHeight = useLogoBadgeLayout && logoBandRowCount > 0
    ? Math.max(
        ratingStyle === 'stacked' ? 196 : 170,
        logoBandContentHeight +
          (ratingStyle === 'stacked' ? 92 : 68),
      )
    : 0;
  const LOGO_MIN_PORTION = 0.65;
  const logoImageHeight =
    useLogoBadgeLayout && logoBadgeBandHeight > 0
      ? Math.max(
          logoBaseImageHeight,
          Math.ceil((logoBadgeBandHeight * LOGO_MIN_PORTION) / (1 - LOGO_MIN_PORTION)),
        )
      : logoBaseImageHeight;
  const scorebarBandHeight = 0;
  const finalOutputHeight = useLogoBadgeLayout
    ? logoImageHeight + logoBadgeBandHeight
    : usePosterScorebar
      ? outputHeight + scorebarBandHeight
      : outputHeight;

  return {
    cappedRatingBadges,
    topRatingBadges,
    bottomRatingBadges,
    leftRatingBadges,
    rightRatingBadges,
    posterTopRows,
    posterBottomRows,
    backdropRows,
    backdropBottomRatingsRow: useBackdropBottomRatingsRow,
    blockbusterBlurbs,
    badgeIconSize,
    badgeFontSize,
    badgePaddingX,
    badgePaddingY,
    badgeGap,
    badgeTopOffset,
    badgeBottomOffset,
    backdropEdgeInset,
    posterEdgeInset,
    posterRowHorizontalInset,
    qualityBadges,
    effectiveQualityBadgeScalePercent,
    finalOutputWidth,
    finalOutputHeight,
    logoImageWidth,
    logoImageHeight,
    logoBadgeBandHeight,
    logoBadgeMaxWidth,
    logoBadgesPerRow,
    scorebarBandHeight,
  };
};
