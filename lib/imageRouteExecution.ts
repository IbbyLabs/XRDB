import {
  buildObjectStorageImageKey,
  getCachedImageFromObjectStorage,
  isObjectStorageConfigured,
  putCachedImageToObjectStorage,
} from './imageObjectStorage.ts';
import { resolveOverlayAutoScale } from './overlayScale.ts';
import {
  getSourceImagePayload,
  getSourceImagePayloadWithFallback,
} from './imageRouteSourceFetch.ts';
import {
  outputFormatToExtension,
  type OutputFormat,
} from './imageRouteMedia.ts';
import { resolveImageRouteMediaTarget } from './imageRouteMediaTarget.ts';
import { prepareImageRouteMediaState } from './imageRoutePreparedMedia.ts';
import { resolveImageRouteDisplayState } from './imageRouteDisplayState.ts';
import { resolveImageRouteRenderLayout } from './imageRouteRenderLayout.ts';
import { renderWithSharp } from './imageRouteRenderer.ts';
import {
  TMDB_CACHE_TTL_MS,
  TORRENTIO_CACHE_TTL_MS,
} from './imageRouteConfig.ts';
import {
  sha1Hex,
  withDedupe,
  type CachedJsonResponse,
  type CachedTextResponse,
  type PhaseDurations,
  type RenderedImagePayload,
} from './imageRouteRuntime.ts';
import type { RatingPreference } from './ratingProviderCatalog.ts';
import type { ImageRouteRequestState } from './imageRouteRequestState.ts';

type RouteFetchJson = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
) => Promise<CachedJsonResponse>;

type RouteFetchText = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
) => Promise<CachedTextResponse>;

export type ExecutedImageRouteRender = {
  renderedImage: RenderedImagePayload;
  objectStorageHit: boolean;
  debugProviderRatingsEnabled: boolean;
  debugNeedsSimklRating: boolean;
  debugResolvedRatingProviders: RatingPreference[];
};

export const executeImageRouteRender = async ({
  requestState,
  phases,
  fetchJsonCached,
  fetchTextCached,
  finalImageInFlight,
}: {
  requestState: ImageRouteRequestState;
  phases: PhaseDurations;
  fetchJsonCached: RouteFetchJson;
  fetchTextCached: RouteFetchText;
  finalImageInFlight: Map<string, Promise<RenderedImagePayload>>;
}): Promise<ExecutedImageRouteRender> => {
  const objectStorageEnabled = isObjectStorageConfigured();
  let objectStorageHit = false;
  let debugProviderRatingsEnabled = false;
  let debugNeedsSimklRating = false;
  let debugResolvedRatingProviders: RatingPreference[] = [];

  const renderedImage = await withDedupe(
    finalImageInFlight,
    requestState.renderSeedKey,
    async () => {
      let mediaId = requestState.mediaId;
      let season = requestState.season;
      let episode = requestState.episode;
      let allowAnimeOnlyRatings = requestState.allowAnimeOnlyRatings;
      let hasConfirmedAnimeMapping = requestState.hasConfirmedAnimeMapping;

      const resolvedMediaTarget = await resolveImageRouteMediaTarget({
        imageType: requestState.imageType,
        isThumbnailRequest: requestState.isThumbnailRequest,
        tmdbKey: requestState.tmdbKey,
        phases,
        fetchJsonCached,
        fetchTextCached,
        mediaId,
        season,
        episode,
        isTmdb: requestState.isTmdb,
        isTvdb: requestState.isTvdb,
        isCanonId: requestState.isCanonId,
        isKitsu: requestState.isKitsu,
        inputAnimeMappingProvider: requestState.inputAnimeMappingProvider,
        inputAnimeMappingExternalId: requestState.inputAnimeMappingExternalId,
        explicitTmdbMediaType: requestState.explicitTmdbMediaType,
        tvdbSeriesId: requestState.tvdbSeriesId,
        hasNativeAnimeInput: requestState.hasNativeAnimeInput,
        allowAnimeOnlyRatings,
        hasConfirmedAnimeMapping,
      });
      let media = resolvedMediaTarget.media;
      let mediaType = resolvedMediaTarget.mediaType;
      const useRawKitsuFallback = resolvedMediaTarget.useRawKitsuFallback;
      const rawFallbackImageUrl = resolvedMediaTarget.rawFallbackImageUrl;
      const rawFallbackKitsuRating = resolvedMediaTarget.rawFallbackKitsuRating;
      const rawFallbackTitle = resolvedMediaTarget.rawFallbackTitle;
      const rawFallbackLogoAspectRatio = resolvedMediaTarget.rawFallbackLogoAspectRatio;
      const mappedImdbId = resolvedMediaTarget.mappedImdbId;
      mediaId = resolvedMediaTarget.mediaId;
      season = resolvedMediaTarget.season;
      episode = resolvedMediaTarget.episode;
      allowAnimeOnlyRatings = resolvedMediaTarget.allowAnimeOnlyRatings;
      hasConfirmedAnimeMapping = resolvedMediaTarget.hasConfirmedAnimeMapping;
      const shouldRenderRawKitsuFallbackRating =
        useRawKitsuFallback &&
        requestState.selectedRatings.has('kitsu') &&
        typeof rawFallbackKitsuRating === 'string' &&
        rawFallbackKitsuRating.length > 0;
      const finalObjectStorageKey = buildObjectStorageImageKey(
        sha1Hex(requestState.renderSeedKey),
        outputFormatToExtension(requestState.outputFormat as OutputFormat),
      );

      if (requestState.shouldCacheFinalImage && objectStorageEnabled) {
        const cachedFinalImage = await getCachedImageFromObjectStorage(finalObjectStorageKey);
        if (cachedFinalImage) {
          objectStorageHit = true;
          return cachedFinalImage;
        }
      }

      const preparedMedia = await prepareImageRouteMediaState({
        imageType: requestState.imageType,
        isThumbnailRequest: requestState.isThumbnailRequest,
        tmdbKey: requestState.tmdbKey,
        phases,
        fetchJsonCached,
        media,
        mediaType,
        mediaId,
        season,
        episode,
        mappedImdbId,
        isTmdb: requestState.isTmdb,
        isKitsu: requestState.isKitsu,
        isAniListInput: requestState.isAniListInput,
        idPrefix: requestState.idPrefix,
        inputAnimeMappingProvider: requestState.inputAnimeMappingProvider,
        inputAnimeMappingExternalId: requestState.inputAnimeMappingExternalId,
        selectedRatings: requestState.selectedRatings,
        hasNativeAnimeInput: requestState.hasNativeAnimeInput,
        allowAnimeOnlyRatings,
        hasConfirmedAnimeMapping,
        shouldApplyRatings: requestState.shouldApplyRatings,
        shouldApplyStreamBadges: requestState.shouldApplyStreamBadges,
        shouldRenderLogoBackground: requestState.shouldRenderLogoBackground,
        genreBadgeMode: requestState.genreBadgeMode,
        genreBadgeStyle: requestState.genreBadgeStyle,
        genreBadgePosition: requestState.genreBadgePosition,
        genreBadgeScale: requestState.genreBadgeScale,
        effectiveGenreBadgeScale: requestState.effectiveGenreBadgeScale,
        genreBadgeBorderWidth: requestState.genreBadgeBorderWidth,
        noBackgroundBadgeOutlineColor: requestState.posterNoBackgroundBadgeOutlineColor,
        noBackgroundBadgeOutlineWidth: requestState.posterNoBackgroundBadgeOutlineWidth,
        genreBadgeAnimeGrouping: requestState.genreBadgeAnimeGrouping,
        requestedImageLang: requestState.requestedImageLang,
        includeImageLanguage: requestState.includeImageLanguage,
        posterTextPreference: requestState.posterTextPreference,
        randomPosterTextMode: requestState.randomPosterTextMode,
        randomPosterLanguageMode: requestState.randomPosterLanguageMode,
        randomPosterMinVoteCount: requestState.randomPosterMinVoteCount,
        randomPosterMinVoteAverage: requestState.randomPosterMinVoteAverage,
        randomPosterMinWidth: requestState.randomPosterMinWidth,
        randomPosterMinHeight: requestState.randomPosterMinHeight,
        randomPosterFallbackMode: requestState.randomPosterFallbackMode,
        posterArtworkSource: requestState.posterArtworkSource,
        backdropArtworkSource: requestState.backdropArtworkSource,
        logoArtworkSource: requestState.logoArtworkSource,
        thumbnailEpisodeArtwork: requestState.thumbnailEpisodeArtwork,
        backdropEpisodeArtwork: requestState.backdropEpisodeArtwork,
        artworkSelectionSeed: requestState.artworkSelectionSeed,
        cleanId: requestState.cleanId,
        fanartKey: requestState.fanartKey,
        fanartClientKey: requestState.fanartClientKey,
        sourceFallbackUrl: requestState.sourceFallbackUrl,
        qualityBadgePreferences: requestState.qualityBadgePreferences,
        posterImageSize: requestState.posterImageSize,
        backdropImageSize: requestState.backdropImageSize,
        mdblistKey: requestState.mdblistKey,
        simklClientId: requestState.simklClientId,
        useRawKitsuFallback,
        rawFallbackImageUrl,
        rawFallbackKitsuRating,
        rawFallbackTitle,
        rawFallbackLogoAspectRatio,
      });
      allowAnimeOnlyRatings = preparedMedia.allowAnimeOnlyRatings;
      hasConfirmedAnimeMapping = preparedMedia.hasConfirmedAnimeMapping;
      const {
        primaryGenreFamily,
        imgUrl,
        tmdbRating,
        providerRatings,
        renderedRatingTtlByProvider,
        outputWidth,
        outputHeight,
        certificationBadgeLabel,
        streamBadges: preparedStreamBadges,
        streamBadgesCacheTtlMs,
        posterTitleText,
        posterLogoUrl,
        shouldRenderBadges,
      } = preparedMedia;
      let streamBadges = preparedStreamBadges;
      let { genreBadge } = preparedMedia;
      const overlayAutoScale = resolveOverlayAutoScale({
        imageType: requestState.imageType,
        outputWidth,
        outputHeight,
      });

      if (requestState.debugRatings) {
        debugProviderRatingsEnabled = preparedMedia.providerRatingsEnabled;
        debugNeedsSimklRating = requestState.selectedRatings.has('simkl');
      }

      if (!shouldRenderBadges && !posterTitleText && !posterLogoUrl) {
        return getSourceImagePayloadWithFallback({
          imgUrl,
          fallbackUrl: requestState.sourceFallbackUrl,
        });
      }

      const displayState = resolveImageRouteDisplayState({
        imageType: requestState.imageType,
        ratingPresentation: requestState.ratingPresentation,
        aggregateRatingSource: requestState.aggregateRatingSource,
        aggregateAccentMode: requestState.aggregateAccentMode,
        aggregateAccentColor: requestState.aggregateAccentColor,
        aggregateCriticsAccentColor: requestState.aggregateCriticsAccentColor,
        aggregateAudienceAccentColor: requestState.aggregateAudienceAccentColor,
        aggregateDynamicStops: requestState.aggregateDynamicStops,
        aggregateAccentBarOffset: requestState.aggregateAccentBarOffset,
        aggregateAccentBarVisible: requestState.aggregateAccentBarVisible,
        posterRingValueSource: requestState.posterRingValueSource,
        posterRingProgressSource: requestState.posterRingProgressSource,
        posterRatingsLayout: requestState.posterRatingsLayout,
        posterRatingsMaxPerSide: requestState.posterRatingsMaxPerSide,
        backdropRatingsLayout: requestState.backdropRatingsLayout,
        logoRatingsMax: requestState.logoRatingsMax,
        posterRatingsMax: requestState.posterRatingsMax,
        backdropRatingsMax: requestState.backdropRatingsMax,
        effectiveRatingPreferences: requestState.effectiveRatingPreferences,
        hasExplicitRatingOrder: requestState.hasExplicitRatingOrder,
        allowAnimeOnlyRatings,
        shouldRenderRawKitsuFallbackRating,
        tmdbRating,
        providerRatings,
        ratingValueMode: requestState.ratingValueMode,
        providerAppearanceOverrides: requestState.providerAppearanceOverrides,
        primaryGenreFamily,
        streamBadges,
        genreBadge,
        outputWidth,
        outputHeight,
      });
      const {
        useLogoBadgeLayout,
        usesAggregatePresentation,
        effectivePosterRatingsLayout,
        effectivePosterRatingsMaxPerSide,
        effectiveBackdropRatingsLayout,
        displayRatingBadges,
        editorialOverlay,
        compactRingOverlay,
        ratingBadgeByProvider,
      } = displayState;
      streamBadges = displayState.streamBadges;
      genreBadge = displayState.genreBadge;
      if (
        requestState.imageType === 'poster' &&
        requestState.qualityBadgesStyle === 'plain' &&
        requestState.posterNoBackgroundBadgeOutlineWidth > 0
      ) {
        streamBadges = streamBadges.map((badge) => ({
          ...badge,
          noBackgroundOutlineColor: requestState.posterNoBackgroundBadgeOutlineColor,
          noBackgroundOutlineWidth: requestState.posterNoBackgroundBadgeOutlineWidth,
        }));
      }

      if (requestState.debugRatings) {
        debugResolvedRatingProviders = displayState.debugResolvedRatingProviders;
      }

      if (
        displayRatingBadges.length === 0 &&
        streamBadges.length === 0 &&
        !requestState.shouldRenderLogoBackground &&
        !genreBadge &&
        !posterTitleText &&
        !posterLogoUrl &&
        !editorialOverlay
      ) {
        return getSourceImagePayload(imgUrl);
      }

      const renderLayout = await resolveImageRouteRenderLayout({
        imageType: requestState.imageType,
        isThumbnailRequest: requestState.isThumbnailRequest,
        ratingPresentation: requestState.ratingPresentation,
        outputWidth,
        outputHeight,
        overlayAutoScale,
        displayRatingBadges,
        streamBadges,
        effectivePosterRatingsLayout,
        effectivePosterRatingsMaxPerSide,
        effectiveBackdropRatingsLayout,
        backdropBottomRatingsRow: requestState.backdropBottomRatingsRow,
        logoBottomRatingsRow: requestState.logoBottomRatingsRow,
        posterRatingBadgeScale: requestState.posterRatingBadgeScale,
        backdropRatingBadgeScale: requestState.backdropRatingBadgeScale,
        logoRatingBadgeScale: requestState.logoRatingBadgeScale,
        posterQualityBadgeScale: requestState.posterQualityBadgeScale,
        backdropQualityBadgeScale: requestState.backdropQualityBadgeScale,
        ratingStyle: requestState.ratingStyle,
        qualityBadgesMax: requestState.qualityBadgesMax,
        mediaType,
        media,
        tmdbKey: requestState.tmdbKey,
        requestedImageLang: requestState.requestedImageLang,
        phases,
        fetchJsonCached,
      });
      const renderedRatingCacheKeys = usesAggregatePresentation
        ? [...ratingBadgeByProvider.keys()]
        : displayRatingBadges.map((badge) => badge.key);
      const renderedRatingCacheTtlCandidates = [
        ...renderedRatingCacheKeys.map((badgeKey) => {
          if (badgeKey === 'tmdb') {
            return TMDB_CACHE_TTL_MS;
          }
          return renderedRatingTtlByProvider.get(badgeKey) || null;
        }),
        ...(certificationBadgeLabel ? [TMDB_CACHE_TTL_MS] : []),
        ...(streamBadges.length > 0 ? [streamBadgesCacheTtlMs ?? TORRENTIO_CACHE_TTL_MS] : []),
      ].filter(
        (ttlMs): ttlMs is number =>
          typeof ttlMs === 'number' && Number.isFinite(ttlMs) && ttlMs > 0,
      );
      const finalImageCacheTtlMs =
        renderedRatingCacheTtlCandidates.length > 0
          ? Math.min(...renderedRatingCacheTtlCandidates)
          : TMDB_CACHE_TTL_MS;
      const responseCacheControl = `public, s-maxage=${Math.max(60, Math.floor(finalImageCacheTtlMs / 1000))}, stale-while-revalidate=60`;
      const renderedPayload = await renderWithSharp(
        {
          imageType: requestState.imageType,
          ratingPresentation: requestState.ratingPresentation,
          aggregateRatingSource: requestState.aggregateRatingSource,
          blockbusterDensity: requestState.blockbusterDensity,
          outputFormat: requestState.outputFormat,
          imgUrl,
          imgFallbackUrl: requestState.sourceFallbackUrl,
          outputWidth: renderLayout.finalOutputWidth,
          outputHeight: useLogoBadgeLayout ? renderLayout.logoImageHeight : outputHeight,
          imageWidth: useLogoBadgeLayout ? renderLayout.logoImageWidth : undefined,
          imageHeight: useLogoBadgeLayout ? renderLayout.logoImageHeight : undefined,
          finalOutputHeight: renderLayout.finalOutputHeight,
          logoBadgeBandHeight: renderLayout.logoBadgeBandHeight,
          logoBadgeMaxWidth: renderLayout.logoBadgeMaxWidth,
          logoBadgesPerRow: renderLayout.logoBadgesPerRow,
          posterRowHorizontalInset: renderLayout.posterRowHorizontalInset,
          posterTitleText,
          posterLogoUrl,
          editorialOverlay,
          compactRingOverlay,
          genreBadge,
          badgeIconSize: renderLayout.badgeIconSize,
          badgeFontSize: renderLayout.badgeFontSize,
          badgePaddingX: renderLayout.badgePaddingX,
          badgePaddingY: renderLayout.badgePaddingY,
          badgeGap: renderLayout.badgeGap,
          badgeTopOffset: renderLayout.badgeTopOffset,
          badgeBottomOffset: renderLayout.badgeBottomOffset,
          backdropEdgeInset: renderLayout.backdropEdgeInset,
          badges: renderLayout.cappedRatingBadges,
          qualityBadges: renderLayout.qualityBadges,
          qualityBadgesSide: requestState.qualityBadgesSide,
          posterQualityBadgesPosition: requestState.posterQualityBadgesPosition,
          qualityBadgesStyle: requestState.qualityBadgesStyle,
          qualityBadgeScalePercent: renderLayout.effectiveQualityBadgeScalePercent,
          posterRatingsLayout: effectivePosterRatingsLayout,
          posterRatingsMaxPerSide: effectivePosterRatingsMaxPerSide,
          posterEdgeOffset: requestState.posterEdgeOffset,
          backdropRatingsLayout: effectiveBackdropRatingsLayout,
          backdropBottomRatingsRow: requestState.backdropBottomRatingsRow,
          sideRatingsPosition: requestState.sideRatingsPosition,
          sideRatingsOffset: requestState.sideRatingsOffset,
          ratingStyle: requestState.ratingStyle,
          ratingBlackStripEnabled: requestState.ratingBlackStripEnabled,
          ratingStackOffsetX: requestState.ratingStackOffsetX,
          ratingStackOffsetY: requestState.ratingStackOffsetY,
          logoBackground: requestState.logoBackground,
          topBadges: renderLayout.topRatingBadges,
          bottomBadges: renderLayout.bottomRatingBadges,
          leftBadges: renderLayout.leftRatingBadges,
          rightBadges: renderLayout.rightRatingBadges,
          posterTopRows: renderLayout.posterTopRows,
          posterBottomRows: renderLayout.posterBottomRows,
          backdropRows: renderLayout.backdropRows,
          blockbusterBlurbs: renderLayout.blockbusterBlurbs,
          cacheControl: responseCacheControl,
        },
        phases,
      );

      if (requestState.shouldCacheFinalImage) {
        try {
          await putCachedImageToObjectStorage(finalObjectStorageKey, renderedPayload);
        } catch {
        }
      }

      return renderedPayload;
    },
  );

  return {
    renderedImage,
    objectStorageHit,
    debugProviderRatingsEnabled,
    debugNeedsSimklRating,
    debugResolvedRatingProviders,
  };
};
