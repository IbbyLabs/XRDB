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
import { renderWithSharp, getQualityBadgeIconDataUri } from './imageRouteRenderer.ts';
import { createSharpFactoryLoader } from './imageRouteSharp.ts';
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
import { buildMigrationWarningOverlaySvg } from './migrationWarningOverlay.ts';
import { logger } from './serverLogger.ts';

const getSharpFactory = createSharpFactoryLoader();

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

export const resolveFinalImageCacheTtlMs = ({
  renderedRatingCacheKeys,
  renderedRatingTtlByProvider,
  hasCertificationBadge,
  streamBadgeCount,
  streamBadgesCacheTtlMs,
  transientProviderFailureTtlMs,
}: {
  renderedRatingCacheKeys: string[];
  renderedRatingTtlByProvider: Map<string, number>;
  hasCertificationBadge: boolean;
  streamBadgeCount: number;
  streamBadgesCacheTtlMs: number | null;
  transientProviderFailureTtlMs: number | null;
}) => {
  const renderedRatingCacheTtlCandidates = [
    ...renderedRatingCacheKeys.map((badgeKey) => {
      if (badgeKey === 'tmdb') {
        return TMDB_CACHE_TTL_MS;
      }
      return renderedRatingTtlByProvider.get(badgeKey) || null;
    }),
    ...(hasCertificationBadge ? [TMDB_CACHE_TTL_MS] : []),
    ...(streamBadgeCount > 0 ? [streamBadgesCacheTtlMs ?? TORRENTIO_CACHE_TTL_MS] : []),
    transientProviderFailureTtlMs,
  ].filter(
    (ttlMs): ttlMs is number =>
      typeof ttlMs === 'number' && Number.isFinite(ttlMs) && ttlMs > 0,
  );

  return renderedRatingCacheTtlCandidates.length > 0
    ? Math.min(...renderedRatingCacheTtlCandidates)
    : TMDB_CACHE_TTL_MS;
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
        idPrefix: requestState.idPrefix,
        cleanId: requestState.cleanId,
        episodeSourceProvider: requestState.episodeSourceProvider,
        episodeSourceId: requestState.episodeSourceId,
        episodeSourceSeason: requestState.episodeSourceSeason,
        episodeSourceEpisode: requestState.episodeSourceEpisode,
        episodeAbsolute: requestState.episodeAbsolute,
        explicitTmdbMediaType: requestState.explicitTmdbMediaType,
        tvdbSeriesId: requestState.tvdbSeriesId,
        hasNativeAnimeInput: requestState.hasNativeAnimeInput,
        allowAnimeOnlyRatings,
        hasConfirmedAnimeMapping,
        tmdbEpOrder: requestState.tmdbEpOrder,
      });
      let media = resolvedMediaTarget.media;
      let mediaType = resolvedMediaTarget.mediaType;
      const useRawKitsuFallback = resolvedMediaTarget.useRawKitsuFallback;
      const rawFallbackImageUrl = resolvedMediaTarget.rawFallbackImageUrl;
      const rawFallbackKitsuRating = resolvedMediaTarget.rawFallbackKitsuRating;
      const rawFallbackTitle = resolvedMediaTarget.rawFallbackTitle;
      const rawFallbackLogoAspectRatio = resolvedMediaTarget.rawFallbackLogoAspectRatio;
      const mappedImdbId = resolvedMediaTarget.mappedImdbId;
      const canonicalSeriesIdentity = resolvedMediaTarget.canonicalSeriesIdentity;
      const canonicalEpisodeIdentity = resolvedMediaTarget.canonicalEpisodeIdentity;
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

      if (requestState.shouldCacheFinalImage && objectStorageEnabled && !requestState.configMigrationDeadline) {
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
        shouldBlockOnStreamBadges: requestState.shouldBlockOnStreamBadges,
        shouldRenderLogoBackground: requestState.shouldRenderLogoBackground,
        genreBadgeMode: requestState.genreBadgeMode,
        genreBadgeStyle: requestState.genreBadgeStyle,
        genreBadgePosition: requestState.genreBadgePosition,
        genreBadgeScale: requestState.genreBadgeScale,
        effectiveGenreBadgeScale: requestState.effectiveGenreBadgeScale,
        genreBadgeBorderWidth: requestState.genreBadgeBorderWidth,
        genreBadgeBackgroundOpacity: requestState.genreBadgeBackgroundOpacity,
        noBackgroundBadgeOutlineColor: requestState.posterNoBackgroundBadgeOutlineColor,
        noBackgroundBadgeOutlineWidth: requestState.posterNoBackgroundBadgeOutlineWidth,
        genreBadgeAnimeGrouping: requestState.genreBadgeAnimeGrouping,
        useOriginalImageLanguage: requestState.useOriginalImageLanguage,
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
        remuxDisplayMode: requestState.remuxDisplayMode,
        posterImageSize: requestState.posterImageSize,
        backdropImageSize: requestState.backdropImageSize,
        mdblistKey: requestState.mdblistKey,
        simklClientId: requestState.simklClientId,
        useRawKitsuFallback,
        rawFallbackImageUrl,
        rawFallbackKitsuRating,
        rawFallbackTitle,
        rawFallbackLogoAspectRatio,
        canonicalSeriesIdentity,
        canonicalEpisodeIdentity,
        ageRatingTileColor: requestState.ageRatingTileColor,
        releaseStatusTileColor: requestState.releaseStatusTileColor,
        qualityBadgesTileAccentColor: requestState.qualityBadgesTileAccentColor,
        networkTileColor: requestState.networkTileColor,
        genreBadgeTileAccentColor: requestState.genreBadgeTileAccentColor,
        communityBadgeTheme: requestState.communityBadgeTheme,
        ageRatingBadgeStyle: requestState.ageRatingBadgeStyle,
        releaseStatusBadgeStyle: requestState.releaseStatusBadgeStyle,
        qualityBadgeAppearanceOverrides: requestState.qualityBadgeAppearanceOverrides,
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
        streamBadgesDeferred,
        posterTitleText,
        posterLogoUrl,
        transientProviderFailureTtlMs,
        shouldRenderBadges,
      } = preparedMedia;
      let streamBadges = preparedStreamBadges;
      let { genreBadge } = preparedMedia;

      // Resolve external quality badge icon URLs to data URIs
      streamBadges = await Promise.all(
        streamBadges.map(async (badge) => {
          if (!badge.iconUrl) return badge;
          // Only resolve if it's an external URL (not a data URI)
          if (badge.iconUrl.startsWith('data:')) return badge;
          try {
             const dataUri = await getQualityBadgeIconDataUri(badge.iconUrl);
             return dataUri ? { ...badge, iconUrl: dataUri } : badge;
          } catch {
            // If resolution fails, keep the original URL
            return badge;
          }
        })
      );

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
        aggregateProviderWeights: requestState.aggregateProviderWeights,
        aggregateAccentMode: requestState.aggregateAccentMode,
        aggregateAccentColor: requestState.aggregateAccentColor,
        aggregateCriticsAccentColor: requestState.aggregateCriticsAccentColor,
        aggregateAudienceAccentColor: requestState.aggregateAudienceAccentColor,
        aggregateValueColor: requestState.aggregateValueColor,
        aggregateCriticsValueColor: requestState.aggregateCriticsValueColor,
        aggregateAudienceValueColor: requestState.aggregateAudienceValueColor,
        aggregateDynamicStops: requestState.aggregateDynamicStops,
        aggregateAccentBarOffset: requestState.aggregateAccentBarOffset,
        aggregateAccentBarVisible: requestState.aggregateAccentBarVisible,
        posterRingValueSource: requestState.posterRingValueSource,
        posterRingProgressSource: requestState.posterRingProgressSource,
        posterRingCenterOpacity: requestState.posterRingCenterOpacity,
        posterRingCriticsPriority: requestState.posterRingCriticsPriority,
        posterRingAudiencePriority: requestState.posterRingAudiencePriority,
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
        posterRatingBadgeScale: requestState.posterRatingBadgeScale,
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
        !editorialOverlay &&
        !compactRingOverlay &&
        !requestState.configMigrationDeadline
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
        logoQualityBadgeScale: requestState.logoQualityBadgeScale,
        posterEdgeOffset: requestState.posterEdgeOffset,
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
      const finalImageCacheTtlMs = resolveFinalImageCacheTtlMs({
        renderedRatingCacheKeys,
        renderedRatingTtlByProvider,
        hasCertificationBadge: Boolean(certificationBadgeLabel),
        streamBadgeCount: streamBadges.length,
        streamBadgesCacheTtlMs,
        transientProviderFailureTtlMs,
      });
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
          ageRatingBadgePosition: requestState.ageRatingBadgePosition,
          qualityBadgesStyle: requestState.qualityBadgesStyle,
          qualityBadgeScalePercent: renderLayout.effectiveQualityBadgeScalePercent,
          posterRatingsLayout: effectivePosterRatingsLayout,
          posterRatingsMaxPerSide: effectivePosterRatingsMaxPerSide,
          posterEdgeInset: renderLayout.posterEdgeInset,
          backdropRatingsLayout: effectiveBackdropRatingsLayout,
          backdropBottomRatingsRow: requestState.backdropBottomRatingsRow,
          sideRatingsPosition: requestState.sideRatingsPosition,
          sideRatingsOffset: requestState.sideRatingsOffset,
          ratingStyle: requestState.ratingStyle,
          iconShape: requestState.iconShape,
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

      let finalPayload = renderedPayload;
      if (requestState.configMigrationDeadline) {
        try {
          const sharpFactory = await getSharpFactory();
          const overlay = buildMigrationWarningOverlaySvg({
            deadline: requestState.configMigrationDeadline,
            outputWidth: renderLayout.finalOutputWidth,
            outputHeight: renderLayout.finalOutputHeight,
          });
          const composited = await sharpFactory(Buffer.from(renderedPayload.body))
            .composite([{ input: Buffer.from(overlay.svg), top: overlay.top, left: overlay.left }])
            .toBuffer({ resolveWithObject: true });
          finalPayload = {
            body: composited.data,
            contentType: renderedPayload.contentType,
            cacheControl: renderedPayload.cacheControl,
          };
        } catch (err) {
          logger.error('[xrdb] migration overlay composite failed:', err);
        }
      }

      if (requestState.shouldCacheFinalImage && !requestState.configMigrationDeadline && !streamBadgesDeferred) {
        try {
          await putCachedImageToObjectStorage(finalObjectStorageKey, finalPayload);
        } catch {
        }
      }

      return finalPayload;
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
