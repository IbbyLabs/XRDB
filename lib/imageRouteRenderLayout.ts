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
import { FALLBACK_IMAGE_LANGUAGE } from './imageRouteConfig.ts';
import { fetchBlockbusterBlurbsWithFallback } from './imageRouteBlockbuster.ts';
import type { PhaseDurations, CachedJsonResponse } from './imageRouteRuntime.ts';
import type { RatingBadge } from './imageRouteRenderer.ts';
import type { PosterRatingLayout } from './posterLayoutOptions.ts';
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

export type ImageRouteRenderLayout = {
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
  posterRatingBadgeScale: number;
  backdropRatingBadgeScale: number;
  logoRatingBadgeScale: number;
  posterQualityBadgeScale: number;
  backdropQualityBadgeScale: number;
  ratingStyle: RatingStyle;
  qualityBadgesMax: number | null;
  mediaType: 'movie' | 'tv' | null;
  media: any;
  tmdbKey: string;
  requestedImageLang: string;
  phases: PhaseDurations;
  fetchJsonCached: LayoutFetchJson;
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
    ratingStyle,
    qualityBadgesMax,
    mediaType,
    media,
    tmdbKey,
    requestedImageLang,
    phases,
    fetchJsonCached,
  } = input;

  const usePosterBadgeLayout = imageType === 'poster';
  const useBackdropBadgeLayout = imageType === 'backdrop';
  const useLogoBadgeLayout = imageType === 'logo';
  const useBlockbusterPresentation = ratingPresentation === 'blockbuster';
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
  const useLogoBottomRatingsRow = useLogoBadgeLayout && logoBottomRatingsRow;

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
      : posterQualityBadgeScale;
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
      fittedPosterMetrics = fitBadgeMetricsToHeight(
        posterColumns,
        outputHeight,
        fittedPosterMetrics,
        badgeTopOffset,
        badgeBottomOffset,
        posterMinMetrics,
        reservedTopRows,
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

  const logoBadgesPerRow = useLogoBadgeLayout
    ? useLogoBottomRatingsRow
      ? Math.max(1, cappedRatingBadges.length)
      : useBlockbusterPresentation
      ? Math.max(2, Math.min(4, Math.ceil(Math.sqrt(cappedRatingBadges.length || 1))))
      : Math.max(1, cappedRatingBadges.length)
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
  const qualityBadges =
    typeof qualityBadgesMax === 'number'
      ? streamBadges.slice(0, qualityBadgesMax)
      : streamBadges;
  const logoNaturalWidth = useLogoBadgeLayout ? outputWidth : 0;
  const finalOutputWidth = useLogoBadgeLayout && logoBadgeRowWidth > 0
    ? Math.max(logoNaturalWidth, logoBadgeRowWidth + 72)
    : outputWidth;
  const logoImageWidth = useLogoBadgeLayout ? logoNaturalWidth : 0;
  const logoImageHeight = useLogoBadgeLayout ? outputHeight : 0;
  const logoBadgeRows =
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
  const logoBadgeContainerMaxWidth = Math.max(0, finalOutputWidth - 24);
  const logoBadgeMaxWidth = logoBadgeContainerMaxWidth;
  const logoBadgeBandHeight = useLogoBadgeLayout && cappedRatingBadges.length > 0
    ? Math.max(
        ratingStyle === 'stacked' ? 196 : 170,
        logoBadgeRows * logoBadgeItemHeight +
          Math.max(0, logoBadgeRows - 1) * badgeGap +
          (ratingStyle === 'stacked' ? 92 : 68),
      )
    : 0;
  const finalOutputHeight = useLogoBadgeLayout ? logoImageHeight + logoBadgeBandHeight : outputHeight;

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
  };
};
