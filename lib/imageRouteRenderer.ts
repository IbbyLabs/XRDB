import type { BackdropRatingLayout } from './backdropLayoutOptions.ts';
import type { PosterRatingLayout } from './posterLayoutOptions.ts';
import type { QualityBadgeStyle, RatingStyle } from './ratingAppearance.ts';
import type { AggregateRatingSource, RatingPresentation } from './ratingPresentation.ts';
import type { SideRatingPosition } from './sideRatingPosition.ts';
import type { GenreBadgeFamilyId, GenreBadgeMode, GenreBadgePosition, GenreBadgeStyle } from './genreBadge.ts';
import type { StackedAccentMode } from './badgeCustomization.ts';
import { POSTER_EDGE_INSET_BASE } from './posterEdgeOffset.ts';
import { getMetadata, setMetadata } from './metadataStore.ts';
import { isMediaFeatureBadgeKey } from './mediaFeatures.ts';
import { resolveOverlayAutoScale } from './overlayScale.ts';
import type { EditorialRatingOverlaySpec } from './editorialRatingOverlay.ts';
import type { PosterCompactRingOverlaySpec } from './posterCompactRingOverlay.ts';
import {
  type BadgeKey,
  type BlockbusterDensity,
  type LogoBackground,
  type PosterQualityBadgesPosition,
  type QualityBadgesSide,
} from './imageRouteConfig.ts';
import { getSourceImagePayload, getSourceImagePayloadWithFallback } from './imageRouteSourceFetch.ts';
import { createRemoteImageAspectRatioReader } from './imageRouteAspectRatio.ts';
import {
  bufferToArrayBuffer,
  chunkBy,
  readProviderIconFromStorage,
  shouldUseNeutralGlassPlateForIcon,
  stripCornerBackgroundFromIcon,
  writeProviderIconToStorage,
} from './imageRouteBinary.ts';
import type { OutputFormat } from './imageRouteMedia.ts';
import { renderFinalCompositeImage } from './imageRouteFinalComposite.ts';
import {
  measurePhase,
  sha1Hex,
  type PhaseDurations,
  type RenderedImagePayload,
} from './imageRouteRuntime.ts';
import { createProviderIconDataUriResolver } from './imageRouteProviderIcon.ts';
import { createSharpFactoryLoader } from './imageRouteSharp.ts';
import {
  estimateRenderedBadgeWidth,
  getBadgeHeightFromMetrics,
  type BadgeLayoutMetrics,
} from './imageRouteBadgeMetrics.ts';
import {
  getBackdropBadgeRegion,
  measureBadgeColumnHeight,
  resolveVerticalBadgeColumnStartY,
} from './imageRouteBadgeColumns.ts';
import { measureBadgeRowWidth } from './imageRouteBadgeRows.ts';
import { planBadgeRowPlacements } from './imageRouteBadgePlacement.ts';
import {
  buildQualityBadgeColumnOverlays,
  buildQualityBadgeColumnOverlaysAt,
  buildQualityBadgeRowOverlays,
  measureQualityBadgeColumnWidth,
} from './imageRouteQualityPlacement.ts';
import { resolveGenreBadgeOverlay } from './imageRouteGenrePlacement.ts';
import {
  buildPosterCleanOverlayAsset,
  resolvePosterCleanOverlayPlacement,
} from './imageRoutePosterCleanOverlay.ts';
import { resolvePosterQualityBadgePlacement } from './imageRouteDisplayPrefs.ts';
import {
  buildBlockbusterCalloutSvg,
  buildBlockbusterScoreTileSvg,
  getBlockbusterBadgeChaos,
  getBlockbusterCalloutDetail,
  getBlockbusterCalloutHeadline,
  pickBlockbusterCalloutBadges,
  pickBlockbusterScoreBadges,
} from './imageRouteBlockbusterBadge.ts';
import { resolveBlockbusterProtectedRects } from './imageRouteBlockbusterProtection.ts';
import {
  BLOCKBUSTER_DENSITY_PRESETS,
  buildProviderMonogram,
  buildTransformedSvgOverlay,
  getBlockbusterDensityScale,
} from './imageRouteBlockbusterLayout.ts';
import { placeBlockbusterRect, type BlockbusterPlacementRect } from './imageRouteBlockbusterScatter.ts';
import {
  buildBlockbusterReviewCalloutSvg,
  getBlockbusterBlurbChaos,
  type BlockbusterBlurb,
} from './imageRouteBlockbusterReview.ts';
import { buildBadgeSvg } from './imageRouteBadgeSvg.ts';
import { resolveQualityBadgeColumnLayout, resolveQualityBadgeHeight } from './qualityBadgeLayout.ts';

export type RatingBadge = {
  key: BadgeKey;
  label: string;
  value: string;
  sourceValue?: string;
  iconUrl: string;
  accentColor: string;
  hasCustomIconOverride?: boolean;
  iconCornerRadius?: number;
  accentBarOffset?: number;
  accentBarVisible?: boolean;
  iconScalePercent?: number;
  stackedLineVisible?: boolean;
  stackedLineWidthPercent?: number;
  stackedLineHeightPercent?: number;
  stackedLineGapPercent?: number;
  stackedWidthPercent?: number;
  stackedSurfaceOpacityPercent?: number;
  stackedAccentMode?: StackedAccentMode;
  stackedLineOffsetX?: number;
  stackedLineOffsetY?: number;
  stackedIconOffsetX?: number;
  stackedIconOffsetY?: number;
  stackedValueOffsetX?: number;
  stackedValueOffsetY?: number;
  variant?: 'standard' | 'minimal' | 'summary';
};
export type GenreBadgeSpec = {
  familyId: GenreBadgeFamilyId;
  label: string;
  accentColor: string;
  mode: GenreBadgeMode;
  style: GenreBadgeStyle;
  position: GenreBadgePosition;
  scalePercent?: number;
  borderWidth?: number;
};
export type EditorialRatingOverlay = EditorialRatingOverlaySpec;
export type PosterCompactRingOverlay = PosterCompactRingOverlaySpec;

export type FastRenderInput = {
  imageType: 'poster' | 'backdrop' | 'logo';
  ratingPresentation: RatingPresentation;
  aggregateRatingSource: AggregateRatingSource;
  blockbusterDensity: BlockbusterDensity;
  outputFormat: OutputFormat;
  imgUrl: string;
  imgFallbackUrl?: string | null;
  outputWidth: number;
  outputHeight: number;
  imageWidth?: number;
  imageHeight?: number;
  finalOutputHeight: number;
  logoBadgeBandHeight: number;
  logoBadgeMaxWidth: number;
  logoBadgesPerRow: number;
  posterRowHorizontalInset: number;
  posterTitleText?: string | null;
  posterLogoUrl?: string | null;
  editorialOverlay?: EditorialRatingOverlay | null;
  compactRingOverlay?: PosterCompactRingOverlay | null;
  genreBadge?: GenreBadgeSpec | null;
  badgeIconSize: number;
  badgeFontSize: number;
  badgePaddingX: number;
  badgePaddingY: number;
  badgeGap: number;
  badgeTopOffset: number;
  badgeBottomOffset: number;
  backdropEdgeInset: number;
  badges: RatingBadge[];
  qualityBadges: RatingBadge[];
  qualityBadgesSide: QualityBadgesSide;
  posterQualityBadgesPosition: PosterQualityBadgesPosition;
  qualityBadgesStyle: QualityBadgeStyle;
  qualityBadgeScalePercent: number;
  posterRatingsLayout: PosterRatingLayout;
  posterRatingsMaxPerSide: number | null;
  posterEdgeOffset: number;
  backdropRatingsLayout: BackdropRatingLayout;
  backdropBottomRatingsRow: boolean;
  sideRatingsPosition: SideRatingPosition;
  sideRatingsOffset: number;
  ratingStyle: RatingStyle;
  ratingStackOffsetX: number;
  ratingStackOffsetY: number;
  logoBackground: LogoBackground;
  topBadges: RatingBadge[];
  bottomBadges: RatingBadge[];
  leftBadges: RatingBadge[];
  rightBadges: RatingBadge[];
  posterTopRows?: RatingBadge[][];
  posterBottomRows?: RatingBadge[][];
  backdropRows?: RatingBadge[][];
  blockbusterBlurbs?: BlockbusterBlurb[];
  cacheControl: string;
};

const getSharpFactory = createSharpFactoryLoader();

export const getRemoteImageAspectRatio = createRemoteImageAspectRatioReader({
  getSourceImagePayload,
  getSharpFactory,
});

const getProviderIconDataUri = createProviderIconDataUriResolver({
  getMetadata,
  setMetadata,
  readProviderIconFromStorage,
  writeProviderIconToStorage,
  stripCornerBackgroundFromIcon,
  getSharpFactory,
});

export const renderWithSharp = async (
  input: FastRenderInput,
  phases: PhaseDurations
): Promise<RenderedImagePayload> => {
  const sharp = await getSharpFactory();

  return await measurePhase(phases, 'render', async () => {
    const imageWidth = input.imageWidth ?? input.outputWidth;
    const imageHeight = input.imageHeight ?? input.outputHeight;
    const imageLeft = Math.max(0, Math.floor((input.outputWidth - imageWidth) / 2));
    const sourcePayload = await getSourceImagePayloadWithFallback({
      imgUrl: input.imgUrl,
      fallbackUrl: input.imgFallbackUrl,
    });
    const sourceBuffer = Buffer.from(sourcePayload.body);
    const overlays: Array<{ input: Buffer; top: number; left: number }> = [];
    type GenreCollisionRect = { left: number; top: number; width: number; height: number };
    const genreCollisionRects: GenreCollisionRect[] = [];
    const trackGenreCollisionRect = (left: number, top: number, width: number, height: number) => {
      if (!(width > 0 && height > 0)) return;
      genreCollisionRects.push({
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(width),
        height: Math.round(height),
      });
    };

    const preparedImage = input.imageType === 'logo'
      ? sharp(sourceBuffer).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      : sharp(sourceBuffer);
    const resizedImageBuffer: Buffer = await preparedImage
      .resize(imageWidth, imageHeight, {
        fit: input.imageType === 'logo' ? 'contain' : 'cover',
        position: 'center',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 1 })
      .toBuffer();
    overlays.push({ input: resizedImageBuffer, top: 0, left: imageLeft });

    const iconRenderStateByProvider = new Map<
      BadgeKey,
      { dataUri: string | null; preferNeutralGlassPlate: boolean }
    >();
    if (input.badges.length > 0) {
      const iconEntries = await Promise.all(
        input.badges.map(async (badge) => {
          const iconDataUri = await getProviderIconDataUri(
            badge.iconUrl,
            badge.iconCornerRadius || 0
          );
          const preferNeutralGlassPlate = await shouldUseNeutralGlassPlateForIcon(iconDataUri, getSharpFactory);
          return [badge.key, { dataUri: iconDataUri, preferNeutralGlassPlate }] as const;
        })
      );
      for (const [providerKey, iconRenderState] of iconEntries) {
        iconRenderStateByProvider.set(providerKey, iconRenderState);
      }
    }
    const resolvedQualityBadges = await Promise.all(
      input.qualityBadges.map(async (badge) => {
        const normalizedIconUrl = String(badge.iconUrl || '').trim();
        if (!normalizedIconUrl) {
          return badge;
        }
        const iconDataUri = await getProviderIconDataUri(normalizedIconUrl);
        return {
          ...badge,
          iconDataUri,
        };
      })
    );

    const sideColumnMetrics: BadgeLayoutMetrics = {
      iconSize: input.badgeIconSize,
      fontSize: input.badgeFontSize,
      paddingX: input.badgePaddingX,
      paddingY: input.badgePaddingY,
      gap: input.badgeGap,
    };
    const shouldApplyRatingStackOffset =
      (input.ratingStyle === 'glass' || input.ratingStyle === 'square') &&
      (input.ratingStackOffsetX !== 0 || input.ratingStackOffsetY !== 0);
    const clamp = (value: number, min: number, max: number) =>
      Math.max(min, Math.min(max, value));
    const badgeBaseHeight = input.badgeIconSize + input.badgePaddingY * 2;
    const ratingBadgeHeight = getBadgeHeightFromMetrics(sideColumnMetrics, input.ratingStyle);
    const overlayAutoScale = resolveOverlayAutoScale({
      imageType: input.imageType,
      outputWidth: input.outputWidth,
      outputHeight: input.outputHeight,
    });
    const posterQualityRowReferenceHeight =
      input.imageType === 'poster'
        ? Math.max(44, Math.round(50 * overlayAutoScale))
        : ratingBadgeHeight;
    const qualityBadgeScaleRatio = Math.max(0.7, input.qualityBadgeScalePercent / 100);
    const backdropEdgeInset =
      input.imageType === 'backdrop' ? input.backdropEdgeInset : POSTER_EDGE_INSET_BASE;
    const posterEdgeInset =
      input.imageType === 'poster'
        ? POSTER_EDGE_INSET_BASE + input.posterEdgeOffset
        : POSTER_EDGE_INSET_BASE;
    const resolveSideBadgeStartY = (
      columnBadges: RatingBadge[],
      metrics: BadgeLayoutMetrics = sideColumnMetrics,
      minTop = input.badgeTopOffset
    ) =>
      resolveVerticalBadgeColumnStartY({
        outputHeight: input.outputHeight,
        columnHeight: measureBadgeColumnHeight(columnBadges, metrics, input.ratingStyle),
        topOffset: input.badgeTopOffset,
        bottomOffset: input.badgeBottomOffset,
        position: input.sideRatingsPosition,
        customOffset: input.sideRatingsOffset,
        minTop,
      });
    const compactPosterRowText =
      input.imageType === 'poster' &&
      input.posterRatingsLayout !== 'left' &&
      input.posterRatingsLayout !== 'right' &&
      input.posterRatingsLayout !== 'left-right';
    const posterQualityBadgePlacement =
      input.imageType === 'poster'
        ? resolvePosterQualityBadgePlacement(
            input.posterRatingsLayout,
            input.qualityBadgesSide,
            input.posterQualityBadgesPosition
          )
        : null;
    const posterQualityBadgeSidePlacement =
      posterQualityBadgePlacement === 'left' || posterQualityBadgePlacement === 'right'
        ? posterQualityBadgePlacement
        : null;
    const posterRowRegionWidth = Math.max(0, input.outputWidth - input.posterRowHorizontalInset * 2);
    const posterTopRows =
      input.imageType === 'poster'
        ? input.posterTopRows && input.posterTopRows.length > 0
          ? input.posterTopRows
          : input.topBadges.length > 0
            ? [input.topBadges]
            : []
        : [];
    const posterBottomRows =
      input.imageType === 'poster'
        ? input.posterBottomRows && input.posterBottomRows.length > 0
          ? input.posterBottomRows
          : input.bottomBadges.length > 0
            ? [input.bottomBadges]
            : []
        : [];
    const posterTopBlockBottom =
      posterTopRows.length > 0
        ? input.badgeTopOffset + posterTopRows.length * (ratingBadgeHeight + input.badgeGap)
        : input.badgeTopOffset;
    const editorialOverlayBottom =
      input.imageType === 'poster' && input.editorialOverlay
        ? input.editorialOverlay.top + input.editorialOverlay.height
        : null;
    const editorialOverlaySafeBottom =
      editorialOverlayBottom === null
        ? null
        : editorialOverlayBottom + Math.max(10, Math.round(input.badgeGap * 1.1));
    const blockbusterScatterRects: BlockbusterPlacementRect[] = [];
    const blockbusterBadgeOverlays: Array<{ input: Buffer; top: number; left: number }> = [];
    const blockbusterStickerOverlays: Array<{ input: Buffer; top: number; left: number }> = [];
    const blockbusterSideMetrics: BadgeLayoutMetrics = {
      iconSize: input.badgeIconSize,
      fontSize: input.badgeFontSize,
      paddingX: input.badgePaddingX,
      paddingY: input.badgePaddingY,
      gap: input.badgeGap,
    };
    const blockbusterProtectedRects = resolveBlockbusterProtectedRects({
      imageType: input.imageType,
      ratingPresentation: input.ratingPresentation,
      qualityBadgeCount: resolvedQualityBadges.filter((badge) =>
        isMediaFeatureBadgeKey(String(badge.key))
      ).length,
      posterQualityBadgePlacement,
      badgeBaseHeight,
      qualityBadgeScaleRatio,
      badgeTopOffset: input.badgeTopOffset,
      badgeBottomOffset: input.badgeBottomOffset,
      outputWidth: input.outputWidth,
      outputHeight: input.outputHeight,
      badgeGap: input.badgeGap,
      posterRatingsLayout: input.posterRatingsLayout,
      posterTopRowCount: posterTopRows.length,
      posterTopBlockBottom,
      leftBadges: input.leftBadges,
      rightBadges: input.rightBadges,
      sideMetrics: blockbusterSideMetrics,
      ratingStyle: input.ratingStyle,
      posterEdgeInset,
      resolveSideBadgeStartY: (columnBadges, metrics, minTop) =>
        resolveSideBadgeStartY(columnBadges as RatingBadge[], metrics, minTop),
    });
    const blockbusterDensityPreset = BLOCKBUSTER_DENSITY_PRESETS[input.blockbusterDensity];
    const blockbusterSeedSalt = sha1Hex(
      `${input.imgUrl}|${input.outputWidth}|${input.outputHeight}|${input.blockbusterDensity}|${input.imageType}`
    );
    const blockbusterCalloutBadges =
      input.imageType === 'poster' && input.ratingPresentation === 'blockbuster'
        ? pickBlockbusterCalloutBadges(input.badges).slice(0, blockbusterDensityPreset.calloutLimit)
        : [];
    const blockbusterCalloutKeys = new Set(blockbusterCalloutBadges.map((badge) => badge.key));
    const alignPosterRowWithQuality =
      input.imageType === 'poster' &&
      resolvedQualityBadges.length > 0 &&
      posterQualityBadgeSidePlacement !== null;
    const posterRowAlign: 'left' | 'center' | 'right' = alignPosterRowWithQuality
      ? posterQualityBadgeSidePlacement === 'right'
        ? 'right'
        : 'left'
      : 'center';
    const posterCleanOverlayAsset = await buildPosterCleanOverlayAsset({
      imageType: input.imageType,
      posterTitleText: input.posterTitleText,
      posterLogoUrl: input.posterLogoUrl,
      posterRowRegionWidth,
      outputWidth: input.outputWidth,
      outputHeight: input.outputHeight,
      sharp,
      getSourceImagePayload,
    });
    const composeBadgeRow = (
      rowBadges: RatingBadge[],
      rowY: number,
      options?: {
        maxRowWidth?: number;
        regionLeft?: number;
        regionWidth?: number;
        align?: 'left' | 'center' | 'right';
        splitAcrossHalves?: boolean;
        spreadAcrossThirds?: boolean;
        preserveBadgeSize?: boolean;
      }
    ) => {
      if (rowBadges.length === 0) return;
      const isPosterRowLayout =
        input.imageType === 'poster' &&
        (input.posterRatingsLayout === 'top' ||
          input.posterRatingsLayout === 'bottom' ||
          input.posterRatingsLayout === 'top-bottom');
      const placements = planBadgeRowPlacements({
        rowBadges,
        fontSize: input.badgeFontSize,
        paddingX: input.badgePaddingX,
        iconSize: input.badgeIconSize,
        gap: input.badgeGap,
        compactText: compactPosterRowText,
        ratingStyle: input.ratingStyle,
        regionLeft: options?.regionLeft ?? 0,
        regionWidth: options?.regionWidth ?? input.outputWidth,
        maxRowWidth: options?.maxRowWidth,
        align: options?.align,
        splitAcrossHalves: options?.splitAcrossHalves,
        spreadAcrossThirds: options?.spreadAcrossThirds,
        preserveBadgeSize: options?.preserveBadgeSize,
        isPosterRowLayout,
      });

      for (const entry of placements) {
        pushBadgeOverlay({
          badge: entry.badge,
          badgeWidth: entry.badgeWidth,
          rowX: entry.rowX,
          rowY,
          compactText: compactPosterRowText,
        });
      }
    };
    const pushBadgeOverlay = ({
      badge,
      badgeWidth,
      rowX,
      rowY,
      compactText = compactPosterRowText,
    }: {
      badge: RatingBadge;
      badgeWidth: number;
      rowX: number;
      rowY: number;
      compactText?: boolean;
    }) => {
      const monogram = buildProviderMonogram(
        badge.label || String(badge.key).toUpperCase()
      );
      const badgeSvg = buildBadgeSvg({
        width: badgeWidth,
        height: ratingBadgeHeight,
        iconSize: input.badgeIconSize,
        fontSize: input.badgeFontSize,
        paddingX: input.badgePaddingX,
        gap: input.badgeGap,
        accentColor: badge.accentColor,
        monogram,
        iconDataUri: iconRenderStateByProvider.get(badge.key)?.dataUri || null,
        hasCustomIconOverride: badge.hasCustomIconOverride,
        iconCornerRadius: badge.iconCornerRadius,
        iconKey: badge.key,
        labelText: badge.label,
        value: badge.value,
        badgeVariant: badge.variant || 'standard',
        accentBarOffset: badge.accentBarOffset,
        accentBarVisible: badge.accentBarVisible,
        ratingStyle: input.ratingStyle,
        iconScalePercent: badge.iconScalePercent,
        stackedLineVisible: badge.stackedLineVisible,
        stackedLineWidthPercent: badge.stackedLineWidthPercent,
        stackedLineHeightPercent: badge.stackedLineHeightPercent,
        stackedLineGapPercent: badge.stackedLineGapPercent,
        stackedSurfaceOpacityPercent: badge.stackedSurfaceOpacityPercent,
        stackedAccentMode: badge.stackedAccentMode,
        stackedLineOffsetX: badge.stackedLineOffsetX,
        stackedLineOffsetY: badge.stackedLineOffsetY,
        stackedIconOffsetX: badge.stackedIconOffsetX,
        stackedIconOffsetY: badge.stackedIconOffsetY,
        stackedValueOffsetX: badge.stackedValueOffsetX,
        stackedValueOffsetY: badge.stackedValueOffsetY,
        preferReadablePlainSurface: input.imageType === 'poster' || input.imageType === 'backdrop',
        preferNeutralGlassPlate:
          iconRenderStateByProvider.get(badge.key)?.preferNeutralGlassPlate || false,
        compactText,
      });

      if (
        input.imageType === 'poster' &&
        input.ratingPresentation === 'blockbuster' &&
        (badge.variant || 'standard') === 'standard'
      ) {
        return;
      }

      const translatedLeft = shouldApplyRatingStackOffset
        ? clamp(
            rowX + input.ratingStackOffsetX,
            0,
            Math.max(0, input.outputWidth - badgeWidth),
          )
        : rowX;
      const translatedTop = shouldApplyRatingStackOffset
        ? clamp(
            rowY + input.ratingStackOffsetY,
            0,
            Math.max(0, input.finalOutputHeight - ratingBadgeHeight),
          )
        : rowY;

      overlays.push({ input: Buffer.from(badgeSvg), top: translatedTop, left: translatedLeft });
      trackGenreCollisionRect(translatedLeft, translatedTop, badgeWidth, ratingBadgeHeight);
    };
    const appendQualityBadgeOverlays = (
      qualityBadgeOverlays: ReturnType<typeof buildQualityBadgeRowOverlays>
    ) => {
      for (const overlay of qualityBadgeOverlays) {
        overlays.push({
          input: Buffer.from(overlay.svg),
          top: overlay.top,
          left: overlay.left,
        });
        trackGenreCollisionRect(
          overlay.left,
          overlay.top,
          overlay.width,
          overlay.height
        );
      }
    };
    const composeBlockbusterPosterCallouts = () => {
      if (input.imageType !== 'poster' || input.ratingPresentation !== 'blockbuster') return;
      const calloutBadges = blockbusterCalloutBadges;
      if (calloutBadges.length === 0) return;

      for (let index = 0; index < calloutBadges.length; index += 1) {
        const badge = calloutBadges[index];
        const hash = sha1Hex(`${blockbusterSeedSalt}:${badge.key}:${badge.value}:callout`);
        const rotationBias = ((Number.parseInt(hash.slice(4, 8), 16) || 0) % 600) / 100 - 3;
        const headline = getBlockbusterCalloutHeadline(badge);
        const detail = getBlockbusterCalloutDetail(badge, headline);
        const monogram = buildProviderMonogram(
          badge.label || String(badge.key).toUpperCase()
        );
        const callout = buildBlockbusterCalloutSvg({
          headline,
          detail,
          accentColor: badge.accentColor,
          rotation: rotationBias,
          iconDataUri: iconRenderStateByProvider.get(badge.key)?.dataUri || null,
          iconMonogram: monogram,
        });
        const transformedCallout = buildTransformedSvgOverlay({
          svg: callout.svg,
          width: callout.width,
          height: callout.height,
          rotation: 0,
          opacity: 1,
          scale: getBlockbusterDensityScale(blockbusterDensityPreset.calloutScales, index),
          pad: 6,
        });
        const chaos = getBlockbusterBadgeChaos(badge, blockbusterSeedSalt);
        const preferredHorizontalRatio =
          chaos.spreadX < 0.33 ? 0.02 + chaos.spreadX * 0.18
          : chaos.spreadX > 0.66 ? 0.72 + (chaos.spreadX - 0.66) * 0.32
          : 0.24 + (chaos.spreadX - 0.33) * 0.72;
        const placement = placeBlockbusterRect({
          width: transformedCallout.width,
          height: transformedCallout.height,
          seedSalt: blockbusterSeedSalt,
          seedKey: `callout:${badge.key}:${badge.value}:${blockbusterSeedSalt}`,
          preferredLeft: Math.round(
            Math.max(
              0,
              (input.outputWidth - transformedCallout.width) * preferredHorizontalRatio + chaos.xJitter * 0.35
            )
          ),
          preferredTop: Math.round(
            Math.max(
              posterTopBlockBottom + 8,
              (input.outputHeight - transformedCallout.height) * (0.04 + chaos.spreadY * 0.58)
            )
          ),
          attempts: blockbusterDensityPreset.calloutAttempts,
          protectedPadding: 20,
          occupiedPadding: blockbusterDensityPreset.calloutPadding,
          scatterMode: 'callout',
          relaxedOccupiedPadding: 0,
          outputWidth: input.outputWidth,
          outputHeight: input.outputHeight,
          badgeTopOffset: input.badgeTopOffset,
          protectedRects: blockbusterProtectedRects,
          placedRects: blockbusterScatterRects,
        });
        if (!placement) continue;
        blockbusterStickerOverlays.push({
          input: Buffer.from(transformedCallout.svg),
          top: placement.top,
          left: placement.left,
        });
        trackGenreCollisionRect(
          placement.left,
          placement.top,
          transformedCallout.width,
          transformedCallout.height
        );
      }
    };
    const composeBlockbusterReviewBlurbs = () => {
      if (input.imageType !== 'poster' || input.ratingPresentation !== 'blockbuster') return;
      const blurbs = (input.blockbusterBlurbs || []).slice(0, blockbusterDensityPreset.blurbLimit);
      if (blurbs.length === 0) return;

      for (let index = 0; index < blurbs.length; index += 1) {
        const blurb = blurbs[index];
        const hash = sha1Hex(`${blockbusterSeedSalt}:${blurb.author}:${blurb.text}`);
        const chaos = getBlockbusterBlurbChaos(hash, input.blockbusterDensity);
        const reviewCallout = buildBlockbusterReviewCalloutSvg({
          text: blurb.text,
          author: blurb.author,
          rotation: 0,
        });
        const transformedReviewCallout = buildTransformedSvgOverlay({
          svg: reviewCallout.svg,
          width: reviewCallout.width,
          height: reviewCallout.height,
          rotation: chaos.outerRotation,
          opacity: 1,
          scale: Math.max(
            0.72,
            Math.min(
              1.2,
              getBlockbusterDensityScale(blockbusterDensityPreset.blurbScales, index) * chaos.scale
            )
          ),
          skewX: chaos.skewX,
          skewY: chaos.skewY,
          pad: chaos.isNearVertical ? 38 : 22,
        });
        const preferredHorizontalRatio =
          chaos.horizontalBias < 0.33
            ? 0.03 + chaos.horizontalBias * 0.45
            : chaos.horizontalBias > 0.66
              ? 0.68 + (chaos.horizontalBias - 0.66) * 0.74
              : 0.18 + (chaos.horizontalBias - 0.33) * 1.02;
        const placement = placeBlockbusterRect({
          width: transformedReviewCallout.width,
          height: transformedReviewCallout.height,
          seedSalt: blockbusterSeedSalt,
          seedKey: `blurb:${hash}`,
          preferredLeft: Math.round(
            Math.max(
              0,
              (input.outputWidth - transformedReviewCallout.width) * preferredHorizontalRatio
            )
          ),
          preferredTop: Math.round(
            Math.max(
              posterTopBlockBottom + 18,
              (input.outputHeight - transformedReviewCallout.height) *
                (0.08 + chaos.verticalBias * 0.72)
            )
          ),
          attempts: blockbusterDensityPreset.blurbAttempts,
          protectedPadding: 24,
          occupiedPadding: blockbusterDensityPreset.blurbPadding,
          scatterMode: 'blurb',
          relaxedOccupiedPadding: 0,
          outputWidth: input.outputWidth,
          outputHeight: input.outputHeight,
          badgeTopOffset: input.badgeTopOffset,
          protectedRects: blockbusterProtectedRects,
          placedRects: blockbusterScatterRects,
        });
        if (!placement) continue;
        blockbusterStickerOverlays.push({
          input: Buffer.from(transformedReviewCallout.svg),
          top: placement.top,
          left: placement.left,
        });
        trackGenreCollisionRect(
          placement.left,
          placement.top,
          transformedReviewCallout.width,
          transformedReviewCallout.height
        );
      }
    };
    const composeBlockbusterScoreTiles = () => {
      if (input.imageType !== 'poster' || input.ratingPresentation !== 'blockbuster') return;
      const scoreBadges = pickBlockbusterScoreBadges(input.badges).slice(
        0,
        blockbusterDensityPreset.badgeScales.length
      ).filter((badge) => !blockbusterCalloutKeys.has(badge.key));
      for (let index = 0; index < scoreBadges.length; index += 1) {
        const badge = scoreBadges[index];
        const chaos = getBlockbusterBadgeChaos(badge, blockbusterSeedSalt);
        const monogram = buildProviderMonogram(
          badge.label || String(badge.key).toUpperCase()
        );
        const scoreTile = buildBlockbusterScoreTileSvg({
          badge,
          iconDataUri: iconRenderStateByProvider.get(badge.key)?.dataUri || null,
          iconMonogram: monogram,
        });
        const scaledBadge = buildTransformedSvgOverlay({
          svg: scoreTile.svg,
          width: scoreTile.width,
          height: scoreTile.height,
          rotation: chaos.rotation * 0.5,
          opacity: 1,
          scale: getBlockbusterDensityScale(blockbusterDensityPreset.badgeScales, index),
          pad: 4,
        });
        const placement = placeBlockbusterRect({
          width: scaledBadge.width,
          height: scaledBadge.height,
          seedSalt: blockbusterSeedSalt,
          seedKey: `score:${badge.key}:${badge.value}:${blockbusterSeedSalt}`,
          preferredLeft: Math.round(
            Math.max(
              0,
              (input.outputWidth - scaledBadge.width) *
                (chaos.spreadX < 0.33 ? 0.02 : chaos.spreadX > 0.66 ? 0.82 : 0.38)
            ) + chaos.xJitter * 0.18
          ),
          preferredTop: Math.round(
            Math.max(
              posterTopBlockBottom,
              (input.outputHeight - scaledBadge.height) * (0.04 + chaos.spreadY * 0.82)
            )
          ),
          attempts: blockbusterDensityPreset.badgeAttempts,
          protectedPadding: 20,
          occupiedPadding: blockbusterDensityPreset.badgePadding,
          scatterMode: 'score',
          relaxedOccupiedPadding: 0,
          outputWidth: input.outputWidth,
          outputHeight: input.outputHeight,
          badgeTopOffset: input.badgeTopOffset,
          protectedRects: blockbusterProtectedRects,
          placedRects: blockbusterScatterRects,
        });
        if (!placement) continue;
        blockbusterBadgeOverlays.push({
          input: Buffer.from(scaledBadge.svg),
          top: placement.top,
          left: placement.left,
        });
        trackGenreCollisionRect(
          placement.left,
          placement.top,
          scaledBadge.width,
          scaledBadge.height
        );
      }
    };
    const composeEdgeAlignedPosterBadge = (
      badge: RatingBadge,
      rowY: number,
      side: 'left' | 'right',
      maxBadgeWidth: number
    ) => {
      const estimatedWidth = estimateRenderedBadgeWidth(
        badge,
        input.badgeFontSize,
        input.badgePaddingX,
        input.badgeIconSize,
        input.badgeGap,
        false,
        input.ratingStyle
      );
      const badgeWidth = Math.min(estimatedWidth, maxBadgeWidth);
      const rowX =
        side === 'left'
          ? input.imageType === 'poster'
            ? posterEdgeInset
            : backdropEdgeInset
          : Math.max(
              input.imageType === 'poster' ? posterEdgeInset : backdropEdgeInset,
              input.outputWidth -
                badgeWidth -
                (input.imageType === 'poster' ? posterEdgeInset : backdropEdgeInset),
            );
      pushBadgeOverlay({ badge, badgeWidth, rowX, rowY, compactText: false });
    };
    const composeBadgeColumn = (
      columnBadges: RatingBadge[],
      side: 'left' | 'right',
      maxBadgeWidth: number,
      origin: 'top' | 'bottom' = 'top',
      startY?: number
    ) => {
      if (columnBadges.length === 0) return;
      let rowY =
        typeof startY === 'number'
          ? Math.max(input.badgeTopOffset, startY)
          : origin === 'bottom'
          ? Math.max(input.badgeTopOffset, input.outputHeight - input.badgeBottomOffset - ratingBadgeHeight)
          : input.badgeTopOffset;
      for (let index = 0; index < columnBadges.length; index += 1) {
        const badge = columnBadges[index];
        composeEdgeAlignedPosterBadge(badge, rowY, side, maxBadgeWidth);
        rowY +=
          origin === 'bottom'
            ? -(ratingBadgeHeight + input.badgeGap)
            : ratingBadgeHeight + input.badgeGap;
      }
    };
    if (input.imageType === 'poster' && input.editorialOverlay) {
      overlays.push({
        input: Buffer.from(input.editorialOverlay.svg),
        top: input.editorialOverlay.top,
        left: input.editorialOverlay.left,
      });
      trackGenreCollisionRect(
        input.editorialOverlay.left,
        input.editorialOverlay.top,
        input.editorialOverlay.width,
        input.editorialOverlay.height,
      );
    }
    if (input.imageType === 'poster' && input.compactRingOverlay) {
      overlays.push({
        input: Buffer.from(input.compactRingOverlay.svg),
        top: input.compactRingOverlay.top,
        left: input.compactRingOverlay.left,
      });
      trackGenreCollisionRect(
        input.compactRingOverlay.left,
        input.compactRingOverlay.top,
        input.compactRingOverlay.width,
        input.compactRingOverlay.height,
      );
    }

    if (input.imageType === 'logo') {
      if (input.badges.length > 0 && input.logoBadgeBandHeight > 0 && input.logoBadgesPerRow > 0) {
        const rows = chunkBy(input.badges, input.logoBadgesPerRow);
        const rowsTotalHeight =
          rows.length * ratingBadgeHeight + Math.max(0, rows.length - 1) * input.badgeGap;
        let rowY =
          input.outputHeight +
          Math.max(0, Math.floor((input.logoBadgeBandHeight - rowsTotalHeight) / 2));
        for (const row of rows) {
          composeBadgeRow(row, rowY, {
            maxRowWidth: input.logoBadgeMaxWidth,
            preserveBadgeSize: true,
          });
          rowY += ratingBadgeHeight + input.badgeGap;
        }
      }
	    } else if (
	      input.badges.length > 0 ||
	      (input.imageType === 'poster' && posterCleanOverlayAsset)
	    ) {
      if (input.imageType === 'backdrop') {
        if (!input.backdropBottomRatingsRow && input.backdropRatingsLayout === 'right-vertical') {
          const maxBadgeWidth = Math.max(180, Math.floor(input.outputWidth * 0.28));
          composeBadgeColumn(
            input.rightBadges,
            'right',
            maxBadgeWidth,
            'top',
            resolveSideBadgeStartY(input.rightBadges)
          );
        } else {
          const backdropRegion = input.backdropBottomRatingsRow
            ? { left: 0, width: input.outputWidth }
            : getBackdropBadgeRegion(input.outputWidth, input.backdropRatingsLayout);
          const backdropRows =
            input.backdropRows && input.backdropRows.length > 0
              ? input.backdropRows
              : [input.topBadges, input.bottomBadges].filter((row) => row.length > 0);
          const backdropRowsHeight =
            backdropRows.length * ratingBadgeHeight +
            Math.max(0, backdropRows.length - 1) * input.badgeGap;
          let rowY = input.backdropBottomRatingsRow
            ? Math.max(
                input.badgeTopOffset,
                input.outputHeight - input.badgeBottomOffset - backdropRowsHeight,
              )
            : input.badgeTopOffset;
          for (const row of backdropRows) {
            composeBadgeRow(row, rowY, {
              regionLeft: backdropRegion.left,
              regionWidth: backdropRegion.width,
            });
            rowY += ratingBadgeHeight + input.badgeGap;
          }
        }
      } else if (input.imageType === 'poster') {
        const bottomRowY = Math.max(
          input.badgeTopOffset,
          input.outputHeight - input.badgeBottomOffset - ratingBadgeHeight
        );
        if (input.posterRatingsLayout === 'left' || input.posterRatingsLayout === 'right') {
          const maxBadgeWidth = Math.max(180, Math.floor(input.outputWidth * 0.46));
          const sideBadges =
            input.posterRatingsLayout === 'left' ? input.leftBadges : input.rightBadges;
          composeBadgeColumn(
            sideBadges,
            input.posterRatingsLayout,
            maxBadgeWidth,
            'top',
            resolveSideBadgeStartY(sideBadges)
          );
        } else if (input.posterRatingsLayout === 'left-right') {
          const maxBadgeWidth = Math.max(160, Math.floor((input.outputWidth - 36) / 2));
          const hasThreeBadgeTopRow =
            input.topBadges.length === 1 &&
            input.leftBadges.length > 0 &&
            input.rightBadges.length > 0;
          const remainingLeftBadges = hasThreeBadgeTopRow ? input.leftBadges.slice(1) : input.leftBadges;
          const remainingRightBadges = hasThreeBadgeTopRow ? input.rightBadges.slice(1) : input.rightBadges;

          if (hasThreeBadgeTopRow) {
            composeBadgeRow(
              [input.leftBadges[0], input.topBadges[0], input.rightBadges[0]],
              input.badgeTopOffset,
              {
                regionLeft: 0,
                regionWidth: input.outputWidth,
                spreadAcrossThirds: true,
              }
            );
          } else if (input.topBadges.length > 0) {
            const hasOnlyTopSingletonBadge =
              input.topBadges.length === 1 &&
              remainingLeftBadges.length === 0 &&
              remainingRightBadges.length === 0;
            const topRowY = hasOnlyTopSingletonBadge
              ? resolveSideBadgeStartY(input.topBadges)
              : input.badgeTopOffset;
            composeBadgeRow(input.topBadges, topRowY, {
              regionLeft: input.posterRowHorizontalInset,
              regionWidth: posterRowRegionWidth,
              align: 'center',
            });
          }

          const sideStartY =
            resolveSideBadgeStartY(
              remainingLeftBadges.length >= remainingRightBadges.length
                ? remainingLeftBadges
                : remainingRightBadges,
              sideColumnMetrics,
              input.topBadges.length > 0
                ? input.badgeTopOffset + ratingBadgeHeight + input.badgeGap
                : input.badgeTopOffset
            );
          if (remainingLeftBadges.length === remainingRightBadges.length) {
            for (let index = 0; index < remainingLeftBadges.length; index += 1) {
              const rowY = sideStartY + index * (ratingBadgeHeight + input.badgeGap);
              composeEdgeAlignedPosterBadge(remainingLeftBadges[index], rowY, 'left', maxBadgeWidth);
              composeEdgeAlignedPosterBadge(remainingRightBadges[index], rowY, 'right', maxBadgeWidth);
            }
          } else {
            composeBadgeColumn(remainingLeftBadges, 'left', maxBadgeWidth, 'top', sideStartY);
            composeBadgeColumn(remainingRightBadges, 'right', maxBadgeWidth, 'top', sideStartY);
          }
        } else {
          if (posterTopRows.length > 0) {
            let topRowY = input.badgeTopOffset;
            for (const row of posterTopRows) {
              composeBadgeRow(row, topRowY, {
                regionLeft: input.posterRowHorizontalInset,
                regionWidth: posterRowRegionWidth,
                align: posterRowAlign,
              });
              topRowY += ratingBadgeHeight + input.badgeGap;
            }
          }
          if (posterBottomRows.length > 0) {
            let bottomRowYStart =
              bottomRowY - (posterBottomRows.length - 1) * (ratingBadgeHeight + input.badgeGap);
            for (const row of posterBottomRows) {
              composeBadgeRow(row, bottomRowYStart, {
                regionLeft: input.posterRowHorizontalInset,
                regionWidth: posterRowRegionWidth,
                align: posterRowAlign,
              });
              bottomRowYStart += ratingBadgeHeight + input.badgeGap;
            }
          }
        }
        composeBlockbusterReviewBlurbs();
        composeBlockbusterPosterCallouts();
        composeBlockbusterScoreTiles();
        if (blockbusterBadgeOverlays.length > 0 || blockbusterStickerOverlays.length > 0) {
          overlays.push(...blockbusterBadgeOverlays, ...blockbusterStickerOverlays);
        }
	        const bottomOverlayAnchorY =
	          posterBottomRows.length > 0
	            ? bottomRowY - (posterBottomRows.length - 1) * (ratingBadgeHeight + input.badgeGap)
	            : bottomRowY;
	        const posterCleanOverlayPlacement = resolvePosterCleanOverlayPlacement({
	          overlay: posterCleanOverlayAsset,
	          bottomBlockTopY: bottomOverlayAnchorY,
	          topRowBottom: posterTopBlockBottom,
	          badgeGap: input.badgeGap,
	          outputWidth: input.outputWidth,
	          posterRowHorizontalInset: input.posterRowHorizontalInset,
	        });
	        if (posterCleanOverlayAsset && posterCleanOverlayPlacement) {
	          overlays.push({
	            input: posterCleanOverlayAsset.buffer,
	            top: posterCleanOverlayPlacement.top,
	            left: posterCleanOverlayPlacement.left,
	          });
	        }
	      }
	    }

    if (input.imageType === 'poster' && resolvedQualityBadges.length > 0) {
      const qualityPlacement = resolvePosterQualityBadgePlacement(
        input.posterRatingsLayout,
        input.qualityBadgesSide,
        input.posterQualityBadgesPosition
      );
      const metrics: BadgeLayoutMetrics = {
        iconSize: input.badgeIconSize,
        fontSize: input.badgeFontSize,
        paddingX: input.badgePaddingX,
        paddingY: input.badgePaddingY,
        gap: input.badgeGap,
      };
      const qualityBadgeHeight = resolveQualityBadgeHeight({
        referenceBadgeHeight: ratingBadgeHeight,
        qualityBadgeScalePercent: input.qualityBadgeScalePercent,
        layout: 'column',
      });
      if (qualityPlacement === 'bottom') {
        const bottomQualityHeight = resolveQualityBadgeHeight({
          referenceBadgeHeight: posterQualityRowReferenceHeight,
          qualityBadgeScalePercent: input.qualityBadgeScalePercent,
          layout: 'row',
        });
        const bottomQualityInset =
          input.badgeBottomOffset + Math.max(4, Math.round(bottomQualityHeight * 0.14));
        const bottomY = Math.max(
          input.badgeTopOffset,
          input.outputHeight - bottomQualityInset - bottomQualityHeight
        );
        appendQualityBadgeOverlays(
          buildQualityBadgeRowOverlays({
            rowBadges: resolvedQualityBadges,
            rowY: bottomY,
            origin: 'bottom',
            imageType: input.imageType,
            outputWidth: input.outputWidth,
            referenceBadgeHeight: bottomQualityHeight,
            qualityBadgeScalePercent: input.qualityBadgeScalePercent,
            badgeGap: input.badgeGap,
            qualityBadgesStyle: input.qualityBadgesStyle,
            posterEdgeInset,
            backdropEdgeInset,
          })
        );
      } else if (qualityPlacement === 'top') {
        const topQualityHeight = resolveQualityBadgeHeight({
          referenceBadgeHeight: posterQualityRowReferenceHeight,
          qualityBadgeScalePercent: input.qualityBadgeScalePercent,
          layout: 'row',
        });
        const topY = Math.max(input.badgeTopOffset, editorialOverlaySafeBottom ?? input.badgeTopOffset);
        appendQualityBadgeOverlays(
          buildQualityBadgeRowOverlays({
            rowBadges: resolvedQualityBadges,
            rowY: topY,
            origin: 'top',
            imageType: input.imageType,
            outputWidth: input.outputWidth,
            referenceBadgeHeight: topQualityHeight,
            qualityBadgeScalePercent: input.qualityBadgeScalePercent,
            badgeGap: input.badgeGap,
            qualityBadgesStyle: input.qualityBadgesStyle,
            posterEdgeInset,
            backdropEdgeInset,
          })
        );
      } else {
        const centeredStartY = Math.max(
          input.badgeTopOffset,
          Math.round(
            (
              input.outputHeight -
              resolveQualityBadgeColumnLayout({
                referenceBadgeHeight: ratingBadgeHeight,
                qualityBadgeScalePercent: input.qualityBadgeScalePercent,
                badgeGap: input.badgeGap,
                badgeCount: resolvedQualityBadges.length,
                availableHeight: input.outputHeight - input.badgeTopOffset - input.badgeBottomOffset,
              }).totalHeight
            ) / 2
          )
        );
        let qualityStartY = centeredStartY;
        const shouldTopAlignQuality =
          (input.posterRatingsLayout === 'left' || input.posterRatingsLayout === 'right') &&
          (qualityPlacement === 'left' || qualityPlacement === 'right');
        if (shouldTopAlignQuality) {
          qualityStartY = input.badgeTopOffset;
        } else if (posterTopRows.length > 0) {
          const belowTop = posterTopBlockBottom;
          qualityStartY = Math.max(qualityStartY, belowTop);
        } else {
          const sideBadges = qualityPlacement === 'right' ? input.rightBadges : input.leftBadges;
          if (sideBadges.length > 0) {
            const sideColumnHeight = measureBadgeColumnHeight(sideBadges, metrics, input.ratingStyle);
            if (sideColumnHeight > 0) {
              const belowSide =
                resolveSideBadgeStartY(sideBadges, metrics) +
                sideColumnHeight +
                input.badgeGap;
              qualityStartY = Math.max(qualityStartY, belowSide);
            }
          }
        }
        if (qualityPlacement === 'left' && editorialOverlaySafeBottom !== null) {
          qualityStartY = Math.max(qualityStartY, editorialOverlaySafeBottom);
        }
        appendQualityBadgeOverlays(
          buildQualityBadgeColumnOverlays({
            columnBadges: resolvedQualityBadges,
            startY: qualityStartY,
            side: qualityPlacement,
            imageType: input.imageType,
            outputWidth: input.outputWidth,
            outputHeight: input.outputHeight,
            badgeTopOffset: input.badgeTopOffset,
            badgeBottomOffset: input.badgeBottomOffset,
            referenceBadgeHeight: ratingBadgeHeight,
            qualityBadgeScalePercent: input.qualityBadgeScalePercent,
            badgeGap: input.badgeGap,
            qualityBadgesStyle: input.qualityBadgesStyle,
            posterEdgeInset,
            backdropEdgeInset,
          })
        );
      }
    }

    if (input.imageType === 'backdrop' && resolvedQualityBadges.length > 0) {
      const qualityHeight = resolveQualityBadgeHeight({
        referenceBadgeHeight: ratingBadgeHeight,
        qualityBadgeScalePercent: input.qualityBadgeScalePercent,
        layout: 'column',
      });
      const uniformBadgeWidth = Math.min(
        Math.max(72, Math.round(qualityHeight * 1.75)),
        Math.max(72, input.outputWidth - backdropEdgeInset * 2)
      );
      const usableQualityBadges = resolvedQualityBadges.filter((badge) =>
        isMediaFeatureBadgeKey(String(badge.key))
      );
      if (usableQualityBadges.length > 0) {
        const leftColumn: RatingBadge[] = [];
        const rightColumn: RatingBadge[] = [];
        if (input.backdropRatingsLayout === 'center' && usableQualityBadges.length === 2) {
          leftColumn.push(usableQualityBadges[0]);
          rightColumn.push(usableQualityBadges[1]);
        } else {
          for (const badge of usableQualityBadges) {
            if (leftColumn.length < 2) {
              leftColumn.push(badge);
            } else if (rightColumn.length < 2) {
              rightColumn.push(badge);
            } else if (leftColumn.length <= rightColumn.length) {
              leftColumn.push(badge);
            } else {
              rightColumn.push(badge);
            }
          }
        }
        const ratingsOnRight =
          !input.backdropBottomRatingsRow &&
          (input.backdropRatingsLayout === 'right' || input.backdropRatingsLayout === 'right-vertical');
        const startY = input.badgeTopOffset;
        const columnGap = Math.max(8, Math.round(input.badgeGap * 0.8));

        if (rightColumn.length === 0) {
          const centerX = input.outputWidth / 2;
          const singleColumnWidth = measureQualityBadgeColumnWidth({
            columnBadges: leftColumn,
            qualityHeight,
            qualityBadgesStyle: input.qualityBadgesStyle,
            uniformBadgeWidth,
          });
          const singleX = Math.round(centerX - singleColumnWidth / 2);
          const ratingRows =
            input.backdropBottomRatingsRow
              ? 0
              : input.backdropRatingsLayout === 'right-vertical'
              ? 0
              : input.backdropRows && input.backdropRows.length > 0
                ? input.backdropRows.length
                : (input.topBadges.length > 0 ? 1 : 0) + (input.bottomBadges.length > 0 ? 1 : 0);
          const singleStartY =
            input.backdropRatingsLayout === 'center' && ratingRows > 0
              ? startY + ratingRows * (ratingBadgeHeight + input.badgeGap)
              : startY;
          appendQualityBadgeOverlays(
            buildQualityBadgeColumnOverlaysAt({
              columnBadges: leftColumn,
              startY: singleStartY,
              x: singleX,
              qualityHeight,
              uniformBadgeWidth,
              imageType: input.imageType,
              outputWidth: input.outputWidth,
              badgeTopOffset: input.badgeTopOffset,
              badgeGap: input.badgeGap,
              qualityBadgesStyle: input.qualityBadgesStyle,
              posterEdgeInset,
              backdropEdgeInset,
            })
          );
        } else {
          const leftColumnWidth = measureQualityBadgeColumnWidth({
            columnBadges: leftColumn,
            qualityHeight,
            qualityBadgesStyle: input.qualityBadgesStyle,
            uniformBadgeWidth,
          });
          const rightColumnWidth = measureQualityBadgeColumnWidth({
            columnBadges: rightColumn,
            qualityHeight,
            qualityBadgesStyle: input.qualityBadgesStyle,
            uniformBadgeWidth,
          });
          let leftX = backdropEdgeInset;
          let rightX = Math.max(
            backdropEdgeInset,
            input.outputWidth - rightColumnWidth - backdropEdgeInset,
          );
          if (ratingsOnRight) {
            const centerX = input.outputWidth / 2;
            leftX = centerX - columnGap - leftColumnWidth;
            rightX = centerX + columnGap;
          } else {
            const metrics: BadgeLayoutMetrics = {
              iconSize: input.badgeIconSize,
              fontSize: input.badgeFontSize,
              paddingX: input.badgePaddingX,
              paddingY: input.badgePaddingY,
              gap: input.badgeGap,
            };
            const backdropRegion = input.backdropBottomRatingsRow
              ? { left: 0, width: input.outputWidth }
              : getBackdropBadgeRegion(input.outputWidth, input.backdropRatingsLayout);
            const effectiveMaxWidth = Math.max(0, backdropRegion.width - backdropEdgeInset * 2);
            const backdropRows =
              input.backdropRows && input.backdropRows.length > 0
                ? input.backdropRows
                : [input.topBadges, input.bottomBadges].filter((row) => row.length > 0);
            const ratingBlockWidth = backdropRows.reduce((maxWidth, row) => {
              const rowWidth = Math.min(
                measureBadgeRowWidth(row, metrics, false, input.ratingStyle),
                effectiveMaxWidth,
              );
              return Math.max(maxWidth, rowWidth);
            }, 0);
            const ratingCenterX = backdropRegion.left + backdropRegion.width / 2;
            const ratingLeft = ratingCenterX - ratingBlockWidth / 2;
            const ratingRight = ratingCenterX + ratingBlockWidth / 2;
            leftX = ratingLeft - columnGap - leftColumnWidth;
            rightX = ratingRight + columnGap;
          }

          appendQualityBadgeOverlays(
            buildQualityBadgeColumnOverlaysAt({
              columnBadges: leftColumn,
              startY,
              x: leftX,
              qualityHeight,
              uniformBadgeWidth,
              imageType: input.imageType,
              outputWidth: input.outputWidth,
              badgeTopOffset: input.badgeTopOffset,
              badgeGap: input.badgeGap,
              qualityBadgesStyle: input.qualityBadgesStyle,
              posterEdgeInset,
              backdropEdgeInset,
            })
          );
          appendQualityBadgeOverlays(
            buildQualityBadgeColumnOverlaysAt({
              columnBadges: rightColumn,
              startY,
              x: rightX,
              qualityHeight,
              uniformBadgeWidth,
              imageType: input.imageType,
              outputWidth: input.outputWidth,
              badgeTopOffset: input.badgeTopOffset,
              badgeGap: input.badgeGap,
              qualityBadgesStyle: input.qualityBadgesStyle,
              posterEdgeInset,
              backdropEdgeInset,
            })
          );
        }
      }
    }

    const genreBadgeOverlay = resolveGenreBadgeOverlay({
      genreBadge: input.genreBadge ?? null,
      imageType: input.imageType,
      outputWidth: input.outputWidth,
      outputHeight: input.outputHeight,
      badgeTopOffset: input.badgeTopOffset,
      badgeBottomOffset: input.badgeBottomOffset,
      badgeGap: input.badgeGap,
      posterEdgeInset,
      collisionRects: genreCollisionRects,
    });
    if (genreBadgeOverlay) {
      overlays.push({
        input: Buffer.from(genreBadgeOverlay.svg),
        top: genreBadgeOverlay.top,
        left: genreBadgeOverlay.left,
      });
    }

    const finalImage = await renderFinalCompositeImage({
      sharpFactory: sharp,
      overlays,
      outputWidth: input.outputWidth,
      finalOutputHeight: input.finalOutputHeight,
      imageType: input.imageType,
      logoBackground: input.logoBackground,
      outputFormat: input.outputFormat,
    });

    return {
      body: bufferToArrayBuffer(finalImage.body),
      contentType: finalImage.contentType,
      cacheControl: input.cacheControl,
    };
  });
};
