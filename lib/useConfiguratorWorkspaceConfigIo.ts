import { useCallback } from 'react';

import { enabledOrderedToRows, type RatingProviderRow } from '@/lib/ratingProviderRows';
import {
  normalizeManifestUrl,
  normalizeSavedUiConfig,
  type SavedUiConfig,
} from '@/lib/uiConfig';
import { type EpisodeIdMode } from '@/lib/episodeIdentity';
import { type MetadataTranslationMode } from '@/lib/metadataTranslation';
import { type ProxyCatalogRule } from '@/lib/proxyCatalogRules';

type WorkspaceSettings = SavedUiConfig['settings'];
type WorkspaceProxy = SavedUiConfig['proxy'];
type Setter<T> = (value: T) => void;

type UseConfiguratorWorkspaceConfigIoArgs = {
  aggregateAccentBarOffset: WorkspaceSettings['aggregateAccentBarOffset'];
  aggregateAccentBarVisible: WorkspaceSettings['aggregateAccentBarVisible'];
  aggregateAccentColor: WorkspaceSettings['aggregateAccentColor'];
  aggregateAccentMode: WorkspaceSettings['aggregateAccentMode'];
  aggregateAudienceAccentColor: WorkspaceSettings['aggregateAudienceAccentColor'];
  aggregateCriticsAccentColor: WorkspaceSettings['aggregateCriticsAccentColor'];
  aggregateDynamicStops: WorkspaceSettings['aggregateDynamicStops'];
  backdropAggregateRatingSource: WorkspaceSettings['backdropAggregateRatingSource'];
  backdropArtworkSource: WorkspaceSettings['backdropArtworkSource'];
  backdropEpisodeArtwork: WorkspaceSettings['backdropEpisodeArtwork'];
  backdropGenreBadgeAnimeGrouping: WorkspaceSettings['backdropGenreBadgeAnimeGrouping'];
  backdropGenreBadgeMode: WorkspaceSettings['backdropGenreBadgeMode'];
  backdropGenreBadgePosition: WorkspaceSettings['backdropGenreBadgePosition'];
  backdropGenreBadgeScale: WorkspaceSettings['backdropGenreBadgeScale'];
  backdropGenreBadgeBorderWidth: WorkspaceSettings['backdropGenreBadgeBorderWidth'];
  backdropGenreBadgeStyle: WorkspaceSettings['backdropGenreBadgeStyle'];
  backdropImageSize: WorkspaceSettings['backdropImageSize'];
  backdropImageText: WorkspaceSettings['backdropImageText'];
  backdropQualityBadgePreferences: WorkspaceSettings['backdropQualityBadgePreferences'];
  backdropQualityBadgeScale: WorkspaceSettings['backdropQualityBadgeScale'];
  backdropQualityBadgesStyle: WorkspaceSettings['backdropQualityBadgesStyle'];
  backdropQualityBadgesMax: WorkspaceSettings['backdropQualityBadgesMax'];
  backdropRatingBadgeScale: WorkspaceSettings['backdropRatingBadgeScale'];
  backdropRatingPreferences: WorkspaceSettings['backdropRatingPreferences'];
  backdropRatingPresentation: WorkspaceSettings['backdropRatingPresentation'];
  backdropRatingRows: RatingProviderRow[];
  backdropRatingStyle: WorkspaceSettings['backdropRatingStyle'];
  backdropRatingsLayout: WorkspaceSettings['backdropRatingsLayout'];
  backdropRatingsMax: WorkspaceSettings['backdropRatingsMax'];
  backdropBottomRatingsRow: WorkspaceSettings['backdropBottomRatingsRow'];
  backdropSideRatingsOffset: WorkspaceSettings['backdropSideRatingsOffset'];
  backdropSideRatingsPosition: WorkspaceSettings['backdropSideRatingsPosition'];
  backdropStreamBadges: WorkspaceSettings['backdropStreamBadges'];
  thumbnailAggregateRatingSource: WorkspaceSettings['thumbnailAggregateRatingSource'];
  thumbnailArtworkSource: WorkspaceSettings['thumbnailArtworkSource'];
  thumbnailBottomRatingsRow: WorkspaceSettings['thumbnailBottomRatingsRow'];
  thumbnailGenreBadgeAnimeGrouping: WorkspaceSettings['thumbnailGenreBadgeAnimeGrouping'];
  thumbnailGenreBadgeMode: WorkspaceSettings['thumbnailGenreBadgeMode'];
  thumbnailGenreBadgePosition: WorkspaceSettings['thumbnailGenreBadgePosition'];
  thumbnailGenreBadgeScale: WorkspaceSettings['thumbnailGenreBadgeScale'];
  thumbnailGenreBadgeBorderWidth: WorkspaceSettings['thumbnailGenreBadgeBorderWidth'];
  thumbnailGenreBadgeStyle: WorkspaceSettings['thumbnailGenreBadgeStyle'];
  thumbnailImageText: WorkspaceSettings['thumbnailImageText'];
  thumbnailQualityBadgePreferences: WorkspaceSettings['thumbnailQualityBadgePreferences'];
  thumbnailQualityBadgeScale: WorkspaceSettings['thumbnailQualityBadgeScale'];
  thumbnailQualityBadgesStyle: WorkspaceSettings['thumbnailQualityBadgesStyle'];
  thumbnailQualityBadgesMax: WorkspaceSettings['thumbnailQualityBadgesMax'];
  thumbnailRatingBadgeScale: WorkspaceSettings['thumbnailRatingBadgeScale'];
  thumbnailRatingPresentation: WorkspaceSettings['thumbnailRatingPresentation'];
  thumbnailRatingStyle: WorkspaceSettings['thumbnailRatingStyle'];
  thumbnailRatingsLayout: WorkspaceSettings['thumbnailRatingsLayout'];
  thumbnailRatingsMax: WorkspaceSettings['thumbnailRatingsMax'];
  thumbnailSideRatingsOffset: WorkspaceSettings['thumbnailSideRatingsOffset'];
  thumbnailSideRatingsPosition: WorkspaceSettings['thumbnailSideRatingsPosition'];
  thumbnailStreamBadges: WorkspaceSettings['thumbnailStreamBadges'];
  episodeIdMode: EpisodeIdMode;
  xrdbKey: WorkspaceSettings['xrdbKey'];
  fanartKey: WorkspaceSettings['fanartKey'];
  lang: WorkspaceSettings['lang'];
  logoAggregateRatingSource: WorkspaceSettings['logoAggregateRatingSource'];
  logoArtworkSource: WorkspaceSettings['logoArtworkSource'];
  logoBackground: WorkspaceSettings['logoBackground'];
  logoGenreBadgeAnimeGrouping: WorkspaceSettings['logoGenreBadgeAnimeGrouping'];
  logoGenreBadgeMode: WorkspaceSettings['logoGenreBadgeMode'];
  logoGenreBadgePosition: WorkspaceSettings['logoGenreBadgePosition'];
  logoGenreBadgeScale: WorkspaceSettings['logoGenreBadgeScale'];
  logoGenreBadgeBorderWidth: WorkspaceSettings['logoGenreBadgeBorderWidth'];
  logoGenreBadgeStyle: WorkspaceSettings['logoGenreBadgeStyle'];
  logoQualityBadgePreferences: WorkspaceSettings['logoQualityBadgePreferences'];
  logoQualityBadgeScale: WorkspaceSettings['logoQualityBadgeScale'];
  logoQualityBadgesStyle: WorkspaceSettings['logoQualityBadgesStyle'];
  logoQualityBadgesMax: WorkspaceSettings['logoQualityBadgesMax'];
  logoRatingBadgeScale: WorkspaceSettings['logoRatingBadgeScale'];
  logoRatingPreferences: WorkspaceSettings['logoRatingPreferences'];
  logoRatingPresentation: WorkspaceSettings['logoRatingPresentation'];
  logoRatingRows: RatingProviderRow[];
  logoRatingStyle: WorkspaceSettings['logoRatingStyle'];
  logoRatingsMax: WorkspaceSettings['logoRatingsMax'];
  logoBottomRatingsRow: WorkspaceSettings['logoBottomRatingsRow'];
  mdblistKey: WorkspaceSettings['mdblistKey'];
  posterAggregateRatingSource: WorkspaceSettings['posterAggregateRatingSource'];
  posterRingProgressSource: WorkspaceSettings['posterRingProgressSource'];
  posterRingValueSource: WorkspaceSettings['posterRingValueSource'];
  posterArtworkSource: WorkspaceSettings['posterArtworkSource'];
  posterEdgeOffset: WorkspaceSettings['posterEdgeOffset'];
  posterGenreBadgeAnimeGrouping: WorkspaceSettings['posterGenreBadgeAnimeGrouping'];
  posterGenreBadgeMode: WorkspaceSettings['posterGenreBadgeMode'];
  posterGenreBadgePosition: WorkspaceSettings['posterGenreBadgePosition'];
  posterGenreBadgeScale: WorkspaceSettings['posterGenreBadgeScale'];
  posterGenreBadgeBorderWidth: WorkspaceSettings['posterGenreBadgeBorderWidth'];
  posterGenreBadgeStyle: WorkspaceSettings['posterGenreBadgeStyle'];
  posterImageSize: WorkspaceSettings['posterImageSize'];
  randomPosterText: WorkspaceSettings['randomPosterText'];
  randomPosterLanguage: WorkspaceSettings['randomPosterLanguage'];
  randomPosterMinVoteCount: WorkspaceSettings['randomPosterMinVoteCount'];
  randomPosterMinVoteAverage: WorkspaceSettings['randomPosterMinVoteAverage'];
  randomPosterMinWidth: WorkspaceSettings['randomPosterMinWidth'];
  randomPosterMinHeight: WorkspaceSettings['randomPosterMinHeight'];
  randomPosterFallback: WorkspaceSettings['randomPosterFallback'];
  posterImageText: WorkspaceSettings['posterImageText'];
  posterQualityBadgePreferences: WorkspaceSettings['posterQualityBadgePreferences'];
  posterQualityBadgeScale: WorkspaceSettings['posterQualityBadgeScale'];
  posterQualityBadgesPosition: WorkspaceSettings['posterQualityBadgesPosition'];
  posterQualityBadgesStyle: WorkspaceSettings['posterQualityBadgesStyle'];
  posterQualityBadgesMax: WorkspaceSettings['posterQualityBadgesMax'];
  posterRatingBadgeScale: WorkspaceSettings['posterRatingBadgeScale'];
  posterRatingPreferences: WorkspaceSettings['posterRatingPreferences'];
  posterRatingPresentation: WorkspaceSettings['posterRatingPresentation'];
  posterRatingRows: RatingProviderRow[];
  posterRatingStyle: WorkspaceSettings['posterRatingStyle'];
  posterRatingsLayout: WorkspaceSettings['posterRatingsLayout'];
  posterRatingsMax: WorkspaceSettings['posterRatingsMax'];
  posterRatingsMaxPerSide: WorkspaceSettings['posterRatingsMaxPerSide'];
  posterSideRatingsOffset: WorkspaceSettings['posterSideRatingsOffset'];
  posterSideRatingsPosition: WorkspaceSettings['posterSideRatingsPosition'];
  posterStreamBadges: WorkspaceSettings['posterStreamBadges'];
  proxyDebugMetaTranslation: WorkspaceProxy['debugMetaTranslation'];
  proxyTypes: WorkspaceProxy['proxyTypes'];
  proxyCatalogRules: ProxyCatalogRule[];
  proxyManifestUrl: WorkspaceProxy['manifestUrl'];
  proxyTranslateMeta: WorkspaceProxy['translateMeta'];
  proxyTranslateMetaMode: MetadataTranslationMode;
  qualityBadgesSide: WorkspaceSettings['qualityBadgesSide'];
  ratingXOffsetPillGlass: WorkspaceSettings['ratingXOffsetPillGlass'];
  ratingYOffsetPillGlass: WorkspaceSettings['ratingYOffsetPillGlass'];
  ratingXOffsetSquare: WorkspaceSettings['ratingXOffsetSquare'];
  ratingYOffsetSquare: WorkspaceSettings['ratingYOffsetSquare'];
  ratingProviderAppearanceOverrides: WorkspaceSettings['ratingProviderAppearanceOverrides'];
  ratingValueMode: WorkspaceSettings['ratingValueMode'];
  setAggregateAccentBarOffset: Setter<WorkspaceSettings['aggregateAccentBarOffset']>;
  setAggregateAccentBarVisible: Setter<WorkspaceSettings['aggregateAccentBarVisible']>;
  setAggregateAccentColor: Setter<WorkspaceSettings['aggregateAccentColor']>;
  setAggregateAccentMode: Setter<WorkspaceSettings['aggregateAccentMode']>;
  setAggregateAudienceAccentColor: Setter<WorkspaceSettings['aggregateAudienceAccentColor']>;
  setAggregateCriticsAccentColor: Setter<WorkspaceSettings['aggregateCriticsAccentColor']>;
  setAggregateDynamicStops: Setter<WorkspaceSettings['aggregateDynamicStops']>;
  setBackdropAggregateRatingSource: Setter<WorkspaceSettings['backdropAggregateRatingSource']>;
  setBackdropArtworkSource: Setter<WorkspaceSettings['backdropArtworkSource']>;
  setBackdropEpisodeArtwork: Setter<WorkspaceSettings['backdropEpisodeArtwork']>;
  setBackdropGenreBadgeAnimeGrouping: Setter<WorkspaceSettings['backdropGenreBadgeAnimeGrouping']>;
  setBackdropGenreBadgeMode: Setter<WorkspaceSettings['backdropGenreBadgeMode']>;
  setBackdropGenreBadgePosition: Setter<WorkspaceSettings['backdropGenreBadgePosition']>;
  setBackdropGenreBadgeScale: Setter<WorkspaceSettings['backdropGenreBadgeScale']>;
  setBackdropGenreBadgeBorderWidth: Setter<WorkspaceSettings['backdropGenreBadgeBorderWidth']>;
  setBackdropGenreBadgeStyle: Setter<WorkspaceSettings['backdropGenreBadgeStyle']>;
  setBackdropImageSize: Setter<WorkspaceSettings['backdropImageSize']>;
  setBackdropImageText: Setter<WorkspaceSettings['backdropImageText']>;
  setBackdropQualityBadgePreferences: Setter<WorkspaceSettings['backdropQualityBadgePreferences']>;
  setBackdropQualityBadgeScale: Setter<WorkspaceSettings['backdropQualityBadgeScale']>;
  setBackdropQualityBadgesStyle: Setter<WorkspaceSettings['backdropQualityBadgesStyle']>;
  setBackdropQualityBadgesMax: Setter<WorkspaceSettings['backdropQualityBadgesMax']>;
  setBackdropRatingBadgeScale: Setter<WorkspaceSettings['backdropRatingBadgeScale']>;
  setBackdropRatingPresentation: Setter<WorkspaceSettings['backdropRatingPresentation']>;
  setBackdropRatingRows: Setter<RatingProviderRow[]>;
  setBackdropRatingStyle: Setter<WorkspaceSettings['backdropRatingStyle']>;
  setBackdropRatingsLayout: Setter<WorkspaceSettings['backdropRatingsLayout']>;
  setBackdropRatingsMax: Setter<WorkspaceSettings['backdropRatingsMax']>;
  setBackdropBottomRatingsRow: Setter<WorkspaceSettings['backdropBottomRatingsRow']>;
  setBackdropSideRatingsOffset: Setter<WorkspaceSettings['backdropSideRatingsOffset']>;
  setBackdropSideRatingsPosition: Setter<WorkspaceSettings['backdropSideRatingsPosition']>;
  setBackdropStreamBadges: Setter<WorkspaceSettings['backdropStreamBadges']>;
  setThumbnailAggregateRatingSource: Setter<WorkspaceSettings['thumbnailAggregateRatingSource']>;
  setThumbnailArtworkSource: Setter<WorkspaceSettings['thumbnailArtworkSource']>;
  setThumbnailBottomRatingsRow: Setter<WorkspaceSettings['thumbnailBottomRatingsRow']>;
  setThumbnailGenreBadgeAnimeGrouping: Setter<WorkspaceSettings['thumbnailGenreBadgeAnimeGrouping']>;
  setThumbnailGenreBadgeMode: Setter<WorkspaceSettings['thumbnailGenreBadgeMode']>;
  setThumbnailGenreBadgePosition: Setter<WorkspaceSettings['thumbnailGenreBadgePosition']>;
  setThumbnailGenreBadgeScale: Setter<WorkspaceSettings['thumbnailGenreBadgeScale']>;
  setThumbnailGenreBadgeBorderWidth: Setter<WorkspaceSettings['thumbnailGenreBadgeBorderWidth']>;
  setThumbnailGenreBadgeStyle: Setter<WorkspaceSettings['thumbnailGenreBadgeStyle']>;
  setThumbnailImageText: Setter<WorkspaceSettings['thumbnailImageText']>;
  setThumbnailQualityBadgePreferences: Setter<WorkspaceSettings['thumbnailQualityBadgePreferences']>;
  setThumbnailQualityBadgeScale: Setter<WorkspaceSettings['thumbnailQualityBadgeScale']>;
  setThumbnailQualityBadgesStyle: Setter<WorkspaceSettings['thumbnailQualityBadgesStyle']>;
  setThumbnailQualityBadgesMax: Setter<WorkspaceSettings['thumbnailQualityBadgesMax']>;
  setThumbnailRatingBadgeScale: Setter<WorkspaceSettings['thumbnailRatingBadgeScale']>;
  setThumbnailRatingPresentation: Setter<WorkspaceSettings['thumbnailRatingPresentation']>;
  setThumbnailRatingStyle: Setter<WorkspaceSettings['thumbnailRatingStyle']>;
  setThumbnailRatingsLayout: Setter<WorkspaceSettings['thumbnailRatingsLayout']>;
  setThumbnailRatingsMax: Setter<WorkspaceSettings['thumbnailRatingsMax']>;
  setThumbnailSideRatingsOffset: Setter<WorkspaceSettings['thumbnailSideRatingsOffset']>;
  setThumbnailSideRatingsPosition: Setter<WorkspaceSettings['thumbnailSideRatingsPosition']>;
  setThumbnailStreamBadges: Setter<WorkspaceSettings['thumbnailStreamBadges']>;
  setEpisodeIdMode: Setter<EpisodeIdMode>;
  setXrdbKey: Setter<WorkspaceSettings['xrdbKey']>;
  setFanartKey: Setter<WorkspaceSettings['fanartKey']>;
  setLang: Setter<WorkspaceSettings['lang']>;
  setLogoAggregateRatingSource: Setter<WorkspaceSettings['logoAggregateRatingSource']>;
  setLogoArtworkSource: Setter<WorkspaceSettings['logoArtworkSource']>;
  setLogoBackground: Setter<WorkspaceSettings['logoBackground']>;
  setLogoGenreBadgeAnimeGrouping: Setter<WorkspaceSettings['logoGenreBadgeAnimeGrouping']>;
  setLogoGenreBadgeMode: Setter<WorkspaceSettings['logoGenreBadgeMode']>;
  setLogoGenreBadgePosition: Setter<WorkspaceSettings['logoGenreBadgePosition']>;
  setLogoGenreBadgeScale: Setter<WorkspaceSettings['logoGenreBadgeScale']>;
  setLogoGenreBadgeBorderWidth: Setter<WorkspaceSettings['logoGenreBadgeBorderWidth']>;
  setLogoGenreBadgeStyle: Setter<WorkspaceSettings['logoGenreBadgeStyle']>;
  setLogoQualityBadgePreferences: Setter<WorkspaceSettings['logoQualityBadgePreferences']>;
  setLogoQualityBadgeScale: Setter<WorkspaceSettings['logoQualityBadgeScale']>;
  setLogoQualityBadgesStyle: Setter<WorkspaceSettings['logoQualityBadgesStyle']>;
  setLogoQualityBadgesMax: Setter<WorkspaceSettings['logoQualityBadgesMax']>;
  setLogoRatingBadgeScale: Setter<WorkspaceSettings['logoRatingBadgeScale']>;
  setLogoRatingPresentation: Setter<WorkspaceSettings['logoRatingPresentation']>;
  setLogoRatingRows: Setter<RatingProviderRow[]>;
  setLogoRatingStyle: Setter<WorkspaceSettings['logoRatingStyle']>;
  setLogoRatingsMax: Setter<WorkspaceSettings['logoRatingsMax']>;
  setLogoBottomRatingsRow: Setter<WorkspaceSettings['logoBottomRatingsRow']>;
  setMdblistKey: Setter<WorkspaceSettings['mdblistKey']>;
  setPosterAggregateRatingSource: Setter<WorkspaceSettings['posterAggregateRatingSource']>;
  setPosterRingProgressSource: Setter<WorkspaceSettings['posterRingProgressSource']>;
  setPosterRingValueSource: Setter<WorkspaceSettings['posterRingValueSource']>;
  setPosterArtworkSource: Setter<WorkspaceSettings['posterArtworkSource']>;
  setPosterEdgeOffset: Setter<WorkspaceSettings['posterEdgeOffset']>;
  setPosterGenreBadgeAnimeGrouping: Setter<WorkspaceSettings['posterGenreBadgeAnimeGrouping']>;
  setPosterGenreBadgeMode: Setter<WorkspaceSettings['posterGenreBadgeMode']>;
  setPosterGenreBadgePosition: Setter<WorkspaceSettings['posterGenreBadgePosition']>;
  setPosterGenreBadgeScale: Setter<WorkspaceSettings['posterGenreBadgeScale']>;
  setPosterGenreBadgeBorderWidth: Setter<WorkspaceSettings['posterGenreBadgeBorderWidth']>;
  setPosterGenreBadgeStyle: Setter<WorkspaceSettings['posterGenreBadgeStyle']>;
  setPosterImageSize: Setter<WorkspaceSettings['posterImageSize']>;
  setRandomPosterText: Setter<WorkspaceSettings['randomPosterText']>;
  setRandomPosterLanguage: Setter<WorkspaceSettings['randomPosterLanguage']>;
  setRandomPosterMinVoteCount: Setter<WorkspaceSettings['randomPosterMinVoteCount']>;
  setRandomPosterMinVoteAverage: Setter<WorkspaceSettings['randomPosterMinVoteAverage']>;
  setRandomPosterMinWidth: Setter<WorkspaceSettings['randomPosterMinWidth']>;
  setRandomPosterMinHeight: Setter<WorkspaceSettings['randomPosterMinHeight']>;
  setRandomPosterFallback: Setter<WorkspaceSettings['randomPosterFallback']>;
  setPosterImageText: Setter<WorkspaceSettings['posterImageText']>;
  setPosterQualityBadgePreferences: Setter<WorkspaceSettings['posterQualityBadgePreferences']>;
  setPosterQualityBadgeScale: Setter<WorkspaceSettings['posterQualityBadgeScale']>;
  setPosterQualityBadgesPosition: Setter<WorkspaceSettings['posterQualityBadgesPosition']>;
  setPosterQualityBadgesStyle: Setter<WorkspaceSettings['posterQualityBadgesStyle']>;
  setPosterQualityBadgesMax: Setter<WorkspaceSettings['posterQualityBadgesMax']>;
  setPosterRatingBadgeScale: Setter<WorkspaceSettings['posterRatingBadgeScale']>;
  setPosterRatingPresentation: Setter<WorkspaceSettings['posterRatingPresentation']>;
  setPosterRatingRows: Setter<RatingProviderRow[]>;
  setPosterRatingStyle: Setter<WorkspaceSettings['posterRatingStyle']>;
  setPosterRatingsLayout: Setter<WorkspaceSettings['posterRatingsLayout']>;
  setPosterRatingsMax: Setter<WorkspaceSettings['posterRatingsMax']>;
  setPosterRatingsMaxPerSide: Setter<WorkspaceSettings['posterRatingsMaxPerSide']>;
  setPosterSideRatingsOffset: Setter<WorkspaceSettings['posterSideRatingsOffset']>;
  setPosterSideRatingsPosition: Setter<WorkspaceSettings['posterSideRatingsPosition']>;
  setPosterStreamBadges: Setter<WorkspaceSettings['posterStreamBadges']>;
  setProxyDebugMetaTranslation: Setter<WorkspaceProxy['debugMetaTranslation']>;
  setProxyTypes: Setter<WorkspaceProxy['proxyTypes']>;
  setProxyCatalogRules: Setter<ProxyCatalogRule[]>;
  setProxyManifestUrl: Setter<WorkspaceProxy['manifestUrl']>;
  setProxyTranslateMeta: Setter<WorkspaceProxy['translateMeta']>;
  setProxyTranslateMetaMode: Setter<MetadataTranslationMode>;
  setQualityBadgesSide: Setter<WorkspaceSettings['qualityBadgesSide']>;
  setRatingXOffsetPillGlass: Setter<WorkspaceSettings['ratingXOffsetPillGlass']>;
  setRatingYOffsetPillGlass: Setter<WorkspaceSettings['ratingYOffsetPillGlass']>;
  setRatingXOffsetSquare: Setter<WorkspaceSettings['ratingXOffsetSquare']>;
  setRatingYOffsetSquare: Setter<WorkspaceSettings['ratingYOffsetSquare']>;
  setRatingProviderAppearanceOverrides: Setter<WorkspaceSettings['ratingProviderAppearanceOverrides']>;
  setRatingValueMode: Setter<WorkspaceSettings['ratingValueMode']>;
  setSimklClientId: Setter<WorkspaceSettings['simklClientId']>;
  setThumbnailRatingRows: Setter<RatingProviderRow[]>;
  setThumbnailEpisodeArtwork: Setter<WorkspaceSettings['thumbnailEpisodeArtwork']>;
  setTmdbIdScope: Setter<WorkspaceSettings['tmdbIdScope']>;
  setTmdbKey: Setter<WorkspaceSettings['tmdbKey']>;
  simklClientId: WorkspaceSettings['simklClientId'];
  thumbnailEpisodeArtwork: WorkspaceSettings['thumbnailEpisodeArtwork'];
  thumbnailRatingPreferences: WorkspaceSettings['thumbnailRatingPreferences'];
  tmdbIdScope: WorkspaceSettings['tmdbIdScope'];
  tmdbKey: WorkspaceSettings['tmdbKey'];
};

export function useConfiguratorWorkspaceConfigIo({
  aggregateAccentBarOffset,
  aggregateAccentBarVisible,
  aggregateAccentColor,
  aggregateAccentMode,
  aggregateAudienceAccentColor,
  aggregateCriticsAccentColor,
  aggregateDynamicStops,
  backdropAggregateRatingSource,
  backdropArtworkSource,
  backdropEpisodeArtwork,
  backdropGenreBadgeAnimeGrouping,
  backdropGenreBadgeMode,
  backdropGenreBadgePosition,
  backdropGenreBadgeScale,
  backdropGenreBadgeBorderWidth,
  backdropGenreBadgeStyle,
  backdropImageSize,
  backdropImageText,
  backdropQualityBadgePreferences,
  backdropQualityBadgeScale,
  backdropQualityBadgesStyle,
  backdropQualityBadgesMax,
  backdropRatingBadgeScale,
  backdropRatingPreferences,
  backdropRatingPresentation,
  backdropRatingRows,
  backdropRatingStyle,
  backdropRatingsLayout,
  backdropRatingsMax,
  backdropBottomRatingsRow,
  backdropSideRatingsOffset,
  backdropSideRatingsPosition,
  backdropStreamBadges,
  thumbnailAggregateRatingSource,
  thumbnailArtworkSource,
  thumbnailBottomRatingsRow,
  thumbnailGenreBadgeAnimeGrouping,
  thumbnailGenreBadgeMode,
  thumbnailGenreBadgePosition,
  thumbnailGenreBadgeScale,
  thumbnailGenreBadgeBorderWidth,
  thumbnailGenreBadgeStyle,
  thumbnailImageText,
  thumbnailQualityBadgePreferences,
  thumbnailQualityBadgeScale,
  thumbnailQualityBadgesStyle,
  thumbnailQualityBadgesMax,
  thumbnailRatingBadgeScale,
  thumbnailRatingPresentation,
  thumbnailRatingStyle,
  thumbnailRatingsLayout,
  thumbnailRatingsMax,
  thumbnailSideRatingsOffset,
  thumbnailSideRatingsPosition,
  thumbnailStreamBadges,
  episodeIdMode,
  xrdbKey,
  fanartKey,
  lang,
  logoAggregateRatingSource,
  logoArtworkSource,
  logoBackground,
  logoGenreBadgeAnimeGrouping,
  logoGenreBadgeMode,
  logoGenreBadgePosition,
  logoGenreBadgeScale,
  logoGenreBadgeBorderWidth,
  logoGenreBadgeStyle,
  logoQualityBadgePreferences,
  logoQualityBadgeScale,
  logoQualityBadgesStyle,
  logoQualityBadgesMax,
  logoRatingBadgeScale,
  logoRatingPreferences,
  logoRatingPresentation,
  logoRatingRows,
  logoRatingStyle,
  logoRatingsMax,
  logoBottomRatingsRow,
  mdblistKey,
  posterAggregateRatingSource,
  posterRingProgressSource,
  posterRingValueSource,
  posterArtworkSource,
  posterEdgeOffset,
  posterGenreBadgeAnimeGrouping,
  posterGenreBadgeMode,
  posterGenreBadgePosition,
  posterGenreBadgeScale,
  posterGenreBadgeBorderWidth,
  posterGenreBadgeStyle,
  posterImageSize,
  randomPosterText,
  randomPosterLanguage,
  randomPosterMinVoteCount,
  randomPosterMinVoteAverage,
  randomPosterMinWidth,
  randomPosterMinHeight,
  randomPosterFallback,
  posterImageText,
  posterQualityBadgePreferences,
  posterQualityBadgeScale,
  posterQualityBadgesPosition,
  posterQualityBadgesStyle,
  posterQualityBadgesMax,
  posterRatingBadgeScale,
  posterRatingPreferences,
  posterRatingPresentation,
  posterRatingRows,
  posterRatingStyle,
  posterRatingsLayout,
  posterRatingsMax,
  posterRatingsMaxPerSide,
  posterSideRatingsOffset,
  posterSideRatingsPosition,
  posterStreamBadges,
  proxyDebugMetaTranslation,
  proxyTypes,
  proxyCatalogRules,
  proxyManifestUrl,
  proxyTranslateMeta,
  proxyTranslateMetaMode,
  qualityBadgesSide,
  ratingXOffsetPillGlass,
  ratingYOffsetPillGlass,
  ratingXOffsetSquare,
  ratingYOffsetSquare,
  ratingProviderAppearanceOverrides,
  ratingValueMode,
  setAggregateAccentBarOffset,
  setAggregateAccentBarVisible,
  setAggregateAccentColor,
  setAggregateAccentMode,
  setAggregateAudienceAccentColor,
  setAggregateCriticsAccentColor,
  setAggregateDynamicStops,
  setBackdropAggregateRatingSource,
  setBackdropArtworkSource,
  setBackdropEpisodeArtwork,
  setBackdropGenreBadgeAnimeGrouping,
  setBackdropGenreBadgeMode,
  setBackdropGenreBadgePosition,
  setBackdropGenreBadgeScale,
  setBackdropGenreBadgeBorderWidth,
  setBackdropGenreBadgeStyle,
  setBackdropImageSize,
  setBackdropImageText,
  setBackdropQualityBadgePreferences,
  setBackdropQualityBadgeScale,
  setBackdropQualityBadgesStyle,
  setBackdropQualityBadgesMax,
  setBackdropRatingBadgeScale,
  setBackdropRatingPresentation,
  setBackdropRatingRows,
  setBackdropRatingStyle,
  setBackdropRatingsLayout,
  setBackdropRatingsMax,
  setBackdropBottomRatingsRow,
  setBackdropSideRatingsOffset,
  setBackdropSideRatingsPosition,
  setBackdropStreamBadges,
  setThumbnailAggregateRatingSource,
  setThumbnailArtworkSource,
  setThumbnailBottomRatingsRow,
  setThumbnailGenreBadgeAnimeGrouping,
  setThumbnailGenreBadgeMode,
  setThumbnailGenreBadgePosition,
  setThumbnailGenreBadgeScale,
  setThumbnailGenreBadgeBorderWidth,
  setThumbnailGenreBadgeStyle,
  setThumbnailImageText,
  setThumbnailQualityBadgePreferences,
  setThumbnailQualityBadgeScale,
  setThumbnailQualityBadgesStyle,
  setThumbnailQualityBadgesMax,
  setThumbnailRatingBadgeScale,
  setThumbnailRatingPresentation,
  setThumbnailRatingStyle,
  setThumbnailRatingsLayout,
  setThumbnailRatingsMax,
  setThumbnailSideRatingsOffset,
  setThumbnailSideRatingsPosition,
  setThumbnailStreamBadges,
  setEpisodeIdMode,
  setXrdbKey,
  setFanartKey,
  setLang,
  setLogoAggregateRatingSource,
  setLogoArtworkSource,
  setLogoBackground,
  setLogoGenreBadgeAnimeGrouping,
  setLogoGenreBadgeMode,
  setLogoGenreBadgePosition,
  setLogoGenreBadgeScale,
  setLogoGenreBadgeBorderWidth,
  setLogoGenreBadgeStyle,
  setLogoQualityBadgePreferences,
  setLogoQualityBadgeScale,
  setLogoQualityBadgesStyle,
  setLogoQualityBadgesMax,
  setLogoRatingBadgeScale,
  setLogoRatingPresentation,
  setLogoRatingRows,
  setLogoRatingStyle,
  setLogoRatingsMax,
  setLogoBottomRatingsRow,
  setMdblistKey,
  setPosterAggregateRatingSource,
  setPosterRingProgressSource,
  setPosterRingValueSource,
  setPosterArtworkSource,
  setPosterEdgeOffset,
  setPosterGenreBadgeAnimeGrouping,
  setPosterGenreBadgeMode,
  setPosterGenreBadgePosition,
  setPosterGenreBadgeScale,
  setPosterGenreBadgeBorderWidth,
  setPosterGenreBadgeStyle,
  setPosterImageSize,
  setRandomPosterText,
  setRandomPosterLanguage,
  setRandomPosterMinVoteCount,
  setRandomPosterMinVoteAverage,
  setRandomPosterMinWidth,
  setRandomPosterMinHeight,
  setRandomPosterFallback,
  setPosterImageText,
  setPosterQualityBadgePreferences,
  setPosterQualityBadgeScale,
  setPosterQualityBadgesPosition,
  setPosterQualityBadgesStyle,
  setPosterQualityBadgesMax,
  setPosterRatingBadgeScale,
  setPosterRatingPresentation,
  setPosterRatingRows,
  setPosterRatingStyle,
  setPosterRatingsLayout,
  setPosterRatingsMax,
  setPosterRatingsMaxPerSide,
  setPosterSideRatingsOffset,
  setPosterSideRatingsPosition,
  setPosterStreamBadges,
  setProxyDebugMetaTranslation,
  setProxyTypes,
  setProxyCatalogRules,
  setProxyManifestUrl,
  setProxyTranslateMeta,
  setProxyTranslateMetaMode,
  setQualityBadgesSide,
  setRatingXOffsetPillGlass,
  setRatingYOffsetPillGlass,
  setRatingXOffsetSquare,
  setRatingYOffsetSquare,
  setRatingProviderAppearanceOverrides,
  setRatingValueMode,
  setSimklClientId,
  setThumbnailRatingRows,
  setThumbnailEpisodeArtwork,
  setTmdbIdScope,
  setTmdbKey,
  simklClientId,
  thumbnailEpisodeArtwork,
  thumbnailRatingPreferences,
  tmdbIdScope,
  tmdbKey,
}: UseConfiguratorWorkspaceConfigIoArgs) {
  const applySavedUiConfig = useCallback(
    (config: SavedUiConfig) => {
      const normalized = normalizeSavedUiConfig(config);

      setXrdbKey(normalized.settings.xrdbKey);
      setTmdbKey(normalized.settings.tmdbKey);
      setTmdbIdScope(normalized.settings.tmdbIdScope);
      setMdblistKey(normalized.settings.mdblistKey);
      setFanartKey(normalized.settings.fanartKey);
      setSimklClientId(normalized.settings.simklClientId);
      setLang(normalized.settings.lang);
      setPosterImageSize(normalized.settings.posterImageSize);
      setBackdropImageSize(normalized.settings.backdropImageSize);
      setRandomPosterText(normalized.settings.randomPosterText);
      setRandomPosterLanguage(normalized.settings.randomPosterLanguage);
      setRandomPosterMinVoteCount(normalized.settings.randomPosterMinVoteCount);
      setRandomPosterMinVoteAverage(normalized.settings.randomPosterMinVoteAverage);
      setRandomPosterMinWidth(normalized.settings.randomPosterMinWidth);
      setRandomPosterMinHeight(normalized.settings.randomPosterMinHeight);
      setRandomPosterFallback(normalized.settings.randomPosterFallback);
      setPosterImageText(normalized.settings.posterImageText);
      setBackdropImageText(normalized.settings.backdropImageText);
      setThumbnailImageText(normalized.settings.thumbnailImageText);
      setPosterArtworkSource(normalized.settings.posterArtworkSource);
      setBackdropArtworkSource(normalized.settings.backdropArtworkSource);
      setThumbnailArtworkSource(normalized.settings.thumbnailArtworkSource);
      setBackdropEpisodeArtwork(normalized.settings.backdropEpisodeArtwork);
      setRatingValueMode(normalized.settings.ratingValueMode);
      setPosterGenreBadgeMode(normalized.settings.posterGenreBadgeMode);
      setBackdropGenreBadgeMode(normalized.settings.backdropGenreBadgeMode);
      setThumbnailGenreBadgeMode(normalized.settings.thumbnailGenreBadgeMode);
      setLogoGenreBadgeMode(normalized.settings.logoGenreBadgeMode);
      setPosterGenreBadgeStyle(normalized.settings.posterGenreBadgeStyle);
      setBackdropGenreBadgeStyle(normalized.settings.backdropGenreBadgeStyle);
      setThumbnailGenreBadgeStyle(normalized.settings.thumbnailGenreBadgeStyle);
      setLogoGenreBadgeStyle(normalized.settings.logoGenreBadgeStyle);
      setPosterGenreBadgePosition(normalized.settings.posterGenreBadgePosition);
      setBackdropGenreBadgePosition(normalized.settings.backdropGenreBadgePosition);
      setThumbnailGenreBadgePosition(normalized.settings.thumbnailGenreBadgePosition);
      setLogoGenreBadgePosition(normalized.settings.logoGenreBadgePosition);
      setPosterGenreBadgeScale(normalized.settings.posterGenreBadgeScale);
      setBackdropGenreBadgeScale(normalized.settings.backdropGenreBadgeScale);
      setThumbnailGenreBadgeScale(normalized.settings.thumbnailGenreBadgeScale);
      setLogoGenreBadgeScale(normalized.settings.logoGenreBadgeScale);
      setPosterGenreBadgeBorderWidth(normalized.settings.posterGenreBadgeBorderWidth);
      setBackdropGenreBadgeBorderWidth(normalized.settings.backdropGenreBadgeBorderWidth);
      setThumbnailGenreBadgeBorderWidth(normalized.settings.thumbnailGenreBadgeBorderWidth);
      setLogoGenreBadgeBorderWidth(normalized.settings.logoGenreBadgeBorderWidth);
      setPosterGenreBadgeAnimeGrouping(normalized.settings.posterGenreBadgeAnimeGrouping);
      setBackdropGenreBadgeAnimeGrouping(normalized.settings.backdropGenreBadgeAnimeGrouping);
      setThumbnailGenreBadgeAnimeGrouping(normalized.settings.thumbnailGenreBadgeAnimeGrouping);
      setLogoGenreBadgeAnimeGrouping(normalized.settings.logoGenreBadgeAnimeGrouping);
      setPosterRatingRows(enabledOrderedToRows(normalized.settings.posterRatingPreferences));
      setBackdropRatingRows(enabledOrderedToRows(normalized.settings.backdropRatingPreferences));
      setThumbnailRatingRows(enabledOrderedToRows(normalized.settings.thumbnailRatingPreferences));
      setLogoRatingRows(enabledOrderedToRows(normalized.settings.logoRatingPreferences));
      setPosterStreamBadges(normalized.settings.posterStreamBadges);
      setBackdropStreamBadges(normalized.settings.backdropStreamBadges);
      setThumbnailStreamBadges(normalized.settings.thumbnailStreamBadges);
      setQualityBadgesSide(normalized.settings.qualityBadgesSide);
      setPosterQualityBadgesPosition(normalized.settings.posterQualityBadgesPosition);
      setPosterQualityBadgePreferences(normalized.settings.posterQualityBadgePreferences);
      setBackdropQualityBadgePreferences(normalized.settings.backdropQualityBadgePreferences);
      setThumbnailQualityBadgePreferences(normalized.settings.thumbnailQualityBadgePreferences);
      setLogoQualityBadgePreferences(normalized.settings.logoQualityBadgePreferences);
      setPosterQualityBadgesStyle(normalized.settings.posterQualityBadgesStyle);
      setBackdropQualityBadgesStyle(normalized.settings.backdropQualityBadgesStyle);
      setThumbnailQualityBadgesStyle(normalized.settings.thumbnailQualityBadgesStyle);
      setLogoQualityBadgesStyle(normalized.settings.logoQualityBadgesStyle);
      setPosterQualityBadgesMax(normalized.settings.posterQualityBadgesMax);
      setBackdropQualityBadgesMax(normalized.settings.backdropQualityBadgesMax);
      setThumbnailQualityBadgesMax(normalized.settings.thumbnailQualityBadgesMax);
      setLogoQualityBadgesMax(normalized.settings.logoQualityBadgesMax);
      setPosterRatingsLayout(normalized.settings.posterRatingsLayout);
      setBackdropRatingsLayout(normalized.settings.backdropRatingsLayout);
      setThumbnailRatingsLayout(normalized.settings.thumbnailRatingsLayout);
      setPosterRatingsMax(normalized.settings.posterRatingsMax);
      setBackdropRatingsMax(normalized.settings.backdropRatingsMax);
      setThumbnailRatingsMax(normalized.settings.thumbnailRatingsMax);
      setBackdropBottomRatingsRow(normalized.settings.backdropBottomRatingsRow);
      setThumbnailBottomRatingsRow(normalized.settings.thumbnailBottomRatingsRow);
      setPosterEdgeOffset(normalized.settings.posterEdgeOffset);
      setPosterSideRatingsPosition(normalized.settings.posterSideRatingsPosition);
      setPosterSideRatingsOffset(normalized.settings.posterSideRatingsOffset);
      setBackdropSideRatingsPosition(normalized.settings.backdropSideRatingsPosition);
      setBackdropSideRatingsOffset(normalized.settings.backdropSideRatingsOffset);
      setThumbnailSideRatingsPosition(normalized.settings.thumbnailSideRatingsPosition);
      setThumbnailSideRatingsOffset(normalized.settings.thumbnailSideRatingsOffset);
      setPosterRatingStyle(normalized.settings.posterRatingStyle);
      setBackdropRatingStyle(normalized.settings.backdropRatingStyle);
      setThumbnailRatingStyle(normalized.settings.thumbnailRatingStyle);
      setLogoRatingStyle(normalized.settings.logoRatingStyle);
      setPosterRatingBadgeScale(normalized.settings.posterRatingBadgeScale);
      setBackdropRatingBadgeScale(normalized.settings.backdropRatingBadgeScale);
      setThumbnailRatingBadgeScale(normalized.settings.thumbnailRatingBadgeScale);
      setLogoRatingBadgeScale(normalized.settings.logoRatingBadgeScale);
      setPosterQualityBadgeScale(normalized.settings.posterQualityBadgeScale);
      setBackdropQualityBadgeScale(normalized.settings.backdropQualityBadgeScale);
      setThumbnailQualityBadgeScale(normalized.settings.thumbnailQualityBadgeScale);
      setLogoQualityBadgeScale(normalized.settings.logoQualityBadgeScale);
      setPosterRatingPresentation(normalized.settings.posterRatingPresentation);
      setBackdropRatingPresentation(normalized.settings.backdropRatingPresentation);
      setThumbnailRatingPresentation(normalized.settings.thumbnailRatingPresentation);
      setLogoRatingPresentation(normalized.settings.logoRatingPresentation);
      setPosterRingValueSource(normalized.settings.posterRingValueSource);
      setPosterRingProgressSource(normalized.settings.posterRingProgressSource);
      setPosterAggregateRatingSource(normalized.settings.posterAggregateRatingSource);
      setBackdropAggregateRatingSource(normalized.settings.backdropAggregateRatingSource);
      setThumbnailAggregateRatingSource(normalized.settings.thumbnailAggregateRatingSource);
      setLogoAggregateRatingSource(normalized.settings.logoAggregateRatingSource);
      setAggregateAccentMode(normalized.settings.aggregateAccentMode);
      setAggregateAccentColor(normalized.settings.aggregateAccentColor);
      setAggregateCriticsAccentColor(normalized.settings.aggregateCriticsAccentColor);
      setAggregateAudienceAccentColor(normalized.settings.aggregateAudienceAccentColor);
      setAggregateDynamicStops(normalized.settings.aggregateDynamicStops);
      setAggregateAccentBarOffset(normalized.settings.aggregateAccentBarOffset);
      setAggregateAccentBarVisible(normalized.settings.aggregateAccentBarVisible);
      setRatingXOffsetPillGlass(normalized.settings.ratingXOffsetPillGlass);
      setRatingYOffsetPillGlass(normalized.settings.ratingYOffsetPillGlass);
      setRatingXOffsetSquare(normalized.settings.ratingXOffsetSquare);
      setRatingYOffsetSquare(normalized.settings.ratingYOffsetSquare);
      setPosterRatingsMaxPerSide(normalized.settings.posterRatingsMaxPerSide);
      setLogoRatingsMax(normalized.settings.logoRatingsMax);
      setLogoBackground(normalized.settings.logoBackground);
      setLogoBottomRatingsRow(normalized.settings.logoBottomRatingsRow);
      setLogoArtworkSource(normalized.settings.logoArtworkSource);
      setThumbnailEpisodeArtwork(normalized.settings.thumbnailEpisodeArtwork);
      setRatingProviderAppearanceOverrides(normalized.settings.ratingProviderAppearanceOverrides);
      setProxyManifestUrl(normalized.proxy.manifestUrl);
      setProxyTranslateMeta(normalized.proxy.translateMeta);
      setProxyTranslateMetaMode(normalized.proxy.translateMetaMode);
      setProxyDebugMetaTranslation(normalized.proxy.debugMetaTranslation);
      setProxyTypes(normalized.proxy.proxyTypes);
      setProxyCatalogRules(normalized.proxy.catalogRules);
      setEpisodeIdMode(normalized.proxy.episodeIdMode);
    },
    [
      setAggregateAccentBarOffset,
      setAggregateAccentBarVisible,
      setAggregateAccentColor,
      setAggregateAccentMode,
      setAggregateAudienceAccentColor,
      setAggregateCriticsAccentColor,
      setAggregateDynamicStops,
      setBackdropAggregateRatingSource,
      setBackdropArtworkSource,
      setBackdropEpisodeArtwork,
      setBackdropGenreBadgeAnimeGrouping,
      setBackdropGenreBadgeMode,
      setBackdropGenreBadgePosition,
      setBackdropGenreBadgeScale,
      setBackdropGenreBadgeBorderWidth,
      setBackdropGenreBadgeStyle,
      setBackdropImageSize,
      setBackdropImageText,
      setBackdropQualityBadgePreferences,
      setBackdropQualityBadgeScale,
      setBackdropQualityBadgesStyle,
      setBackdropQualityBadgesMax,
      setBackdropRatingBadgeScale,
      setBackdropRatingPresentation,
      setBackdropRatingRows,
      setBackdropRatingStyle,
      setBackdropRatingsLayout,
      setBackdropRatingsMax,
      setBackdropBottomRatingsRow,
      setBackdropSideRatingsOffset,
      setBackdropSideRatingsPosition,
      setBackdropStreamBadges,
      setThumbnailAggregateRatingSource,
      setThumbnailArtworkSource,
      setThumbnailBottomRatingsRow,
      setThumbnailGenreBadgeAnimeGrouping,
      setThumbnailGenreBadgeMode,
      setThumbnailGenreBadgePosition,
      setThumbnailGenreBadgeScale,
      setThumbnailGenreBadgeBorderWidth,
      setThumbnailGenreBadgeStyle,
      setThumbnailImageText,
      setThumbnailQualityBadgePreferences,
      setThumbnailQualityBadgeScale,
      setThumbnailQualityBadgesStyle,
      setThumbnailQualityBadgesMax,
      setThumbnailRatingBadgeScale,
      setThumbnailRatingPresentation,
      setThumbnailRatingStyle,
      setThumbnailRatingsLayout,
      setThumbnailRatingsMax,
      setThumbnailSideRatingsOffset,
      setThumbnailSideRatingsPosition,
      setThumbnailStreamBadges,
      setEpisodeIdMode,
      setXrdbKey,
      setFanartKey,
      setLang,
      setLogoAggregateRatingSource,
      setLogoArtworkSource,
      setLogoBackground,
      setLogoGenreBadgeAnimeGrouping,
      setLogoGenreBadgeMode,
      setLogoGenreBadgePosition,
      setLogoGenreBadgeScale,
      setLogoGenreBadgeBorderWidth,
      setLogoGenreBadgeStyle,
      setLogoQualityBadgePreferences,
      setLogoQualityBadgeScale,
      setLogoQualityBadgesStyle,
      setLogoQualityBadgesMax,
      setLogoRatingBadgeScale,
      setLogoRatingPresentation,
      setLogoRatingRows,
      setLogoRatingStyle,
      setLogoRatingsMax,
      setLogoBottomRatingsRow,
      setMdblistKey,
      setPosterAggregateRatingSource,
      setPosterRingProgressSource,
      setPosterRingValueSource,
      setPosterArtworkSource,
      setPosterEdgeOffset,
      setPosterGenreBadgeAnimeGrouping,
      setPosterGenreBadgeMode,
      setPosterGenreBadgePosition,
      setPosterGenreBadgeScale,
      setPosterGenreBadgeBorderWidth,
      setPosterGenreBadgeStyle,
      setPosterImageSize,
      setRandomPosterText,
      setRandomPosterLanguage,
      setRandomPosterMinVoteCount,
      setRandomPosterMinVoteAverage,
      setRandomPosterMinWidth,
      setRandomPosterMinHeight,
      setRandomPosterFallback,
      setPosterImageText,
      setPosterQualityBadgePreferences,
      setPosterQualityBadgeScale,
      setPosterQualityBadgesPosition,
      setPosterQualityBadgesStyle,
      setPosterQualityBadgesMax,
      setPosterRatingBadgeScale,
      setPosterRatingPresentation,
      setPosterRatingRows,
      setPosterRatingStyle,
      setPosterRatingsLayout,
      setPosterRatingsMax,
      setPosterRatingsMaxPerSide,
      setPosterSideRatingsOffset,
      setPosterSideRatingsPosition,
      setPosterStreamBadges,
      setProxyDebugMetaTranslation,
      setProxyCatalogRules,
      setProxyManifestUrl,
      setProxyTypes,
      setProxyTranslateMeta,
      setProxyTranslateMetaMode,
      setQualityBadgesSide,
      setRatingXOffsetPillGlass,
      setRatingYOffsetPillGlass,
      setRatingXOffsetSquare,
      setRatingYOffsetSquare,
      setRatingProviderAppearanceOverrides,
      setRatingValueMode,
      setSimklClientId,
      setThumbnailRatingRows,
      setThumbnailEpisodeArtwork,
      setTmdbIdScope,
      setTmdbKey,
    ],
  );

  const buildCurrentUiConfig = useCallback(
    (): SavedUiConfig => ({
      version: 1,
      settings: {
        xrdbKey: xrdbKey.trim(),
        tmdbKey: tmdbKey.trim(),
        tmdbIdScope,
        mdblistKey: mdblistKey.trim(),
        fanartKey: fanartKey.trim(),
        simklClientId: simklClientId.trim(),
        lang,
        posterImageSize,
        backdropImageSize,
        randomPosterText,
        randomPosterLanguage,
        randomPosterMinVoteCount,
        randomPosterMinVoteAverage,
        randomPosterMinWidth,
        randomPosterMinHeight,
        randomPosterFallback,
        posterImageText,
        backdropImageText,
        thumbnailImageText,
        posterArtworkSource,
        backdropArtworkSource,
        thumbnailArtworkSource,
        thumbnailEpisodeArtwork,
        backdropEpisodeArtwork,
        ratingValueMode,
        posterGenreBadgeMode,
        backdropGenreBadgeMode,
        thumbnailGenreBadgeMode,
        logoGenreBadgeMode,
        posterGenreBadgeStyle,
        backdropGenreBadgeStyle,
        thumbnailGenreBadgeStyle,
        logoGenreBadgeStyle,
        posterGenreBadgePosition,
        backdropGenreBadgePosition,
        thumbnailGenreBadgePosition,
        logoGenreBadgePosition,
        posterGenreBadgeScale,
        backdropGenreBadgeScale,
        thumbnailGenreBadgeScale,
        logoGenreBadgeScale,
        posterGenreBadgeBorderWidth,
        backdropGenreBadgeBorderWidth,
        thumbnailGenreBadgeBorderWidth,
        logoGenreBadgeBorderWidth,
        posterGenreBadgeAnimeGrouping,
        backdropGenreBadgeAnimeGrouping,
        thumbnailGenreBadgeAnimeGrouping,
        logoGenreBadgeAnimeGrouping,
        posterRatingPreferences,
        backdropRatingPreferences,
        thumbnailRatingPreferences,
        logoRatingPreferences,
        posterStreamBadges,
        backdropStreamBadges,
        thumbnailStreamBadges,
        qualityBadgesSide,
        posterQualityBadgesPosition,
        posterQualityBadgePreferences,
        backdropQualityBadgePreferences,
        thumbnailQualityBadgePreferences,
        logoQualityBadgePreferences,
        posterQualityBadgesStyle,
        backdropQualityBadgesStyle,
        thumbnailQualityBadgesStyle,
        logoQualityBadgesStyle,
        posterQualityBadgesMax,
        backdropQualityBadgesMax,
        thumbnailQualityBadgesMax,
        logoQualityBadgesMax,
        posterRatingsLayout,
        backdropRatingsLayout,
        thumbnailRatingsLayout,
        posterRatingsMax,
        backdropRatingsMax,
        thumbnailRatingsMax,
        backdropBottomRatingsRow,
        thumbnailBottomRatingsRow,
        posterEdgeOffset,
        posterSideRatingsPosition,
        posterSideRatingsOffset,
        backdropSideRatingsPosition,
        backdropSideRatingsOffset,
        thumbnailSideRatingsPosition,
        thumbnailSideRatingsOffset,
        sideRatingsPosition: posterSideRatingsPosition,
        sideRatingsOffset: posterSideRatingsOffset,
        posterRatingStyle,
        backdropRatingStyle,
        thumbnailRatingStyle,
        logoRatingStyle,
        posterRatingBadgeScale,
        backdropRatingBadgeScale,
        thumbnailRatingBadgeScale,
        logoRatingBadgeScale,
        posterQualityBadgeScale,
        backdropQualityBadgeScale,
        thumbnailQualityBadgeScale,
        logoQualityBadgeScale,
        posterRatingPresentation,
        backdropRatingPresentation,
        thumbnailRatingPresentation,
        logoRatingPresentation,
        posterRingValueSource,
        posterRingProgressSource,
        posterAggregateRatingSource,
        backdropAggregateRatingSource,
        thumbnailAggregateRatingSource,
        logoAggregateRatingSource,
        aggregateAccentMode,
        aggregateAccentColor,
        aggregateCriticsAccentColor,
        aggregateAudienceAccentColor,
        aggregateDynamicStops,
        aggregateAccentBarOffset,
        aggregateAccentBarVisible,
        ratingXOffsetPillGlass,
        ratingYOffsetPillGlass,
        ratingXOffsetSquare,
        ratingYOffsetSquare,
        posterRatingsMaxPerSide,
        logoRatingsMax,
        logoBackground,
        logoBottomRatingsRow,
        logoArtworkSource,
        ratingProviderAppearanceOverrides,
      },
      proxy: {
        manifestUrl: normalizeManifestUrl(proxyManifestUrl, true),
        translateMeta: proxyTranslateMeta,
        translateMetaMode: proxyTranslateMetaMode,
        debugMetaTranslation: proxyDebugMetaTranslation,
        proxyTypes,
        episodeIdMode,
        catalogRules: proxyCatalogRules,
      },
    }),
    [
      aggregateAccentBarOffset,
      aggregateAccentBarVisible,
      aggregateAccentColor,
      aggregateAccentMode,
      aggregateAudienceAccentColor,
      aggregateCriticsAccentColor,
      aggregateDynamicStops,
      backdropAggregateRatingSource,
      backdropArtworkSource,
      backdropEpisodeArtwork,
      backdropGenreBadgeAnimeGrouping,
      backdropGenreBadgeMode,
      backdropGenreBadgePosition,
      backdropGenreBadgeScale,
      backdropGenreBadgeBorderWidth,
      backdropGenreBadgeStyle,
      backdropImageSize,
      backdropImageText,
      backdropQualityBadgePreferences,
      backdropQualityBadgeScale,
      backdropQualityBadgesStyle,
      backdropQualityBadgesMax,
      backdropRatingBadgeScale,
      backdropRatingPreferences,
      backdropRatingPresentation,
      backdropRatingStyle,
      backdropRatingsLayout,
      backdropRatingsMax,
      backdropBottomRatingsRow,
      backdropSideRatingsOffset,
      backdropSideRatingsPosition,
      backdropStreamBadges,
      thumbnailAggregateRatingSource,
      thumbnailArtworkSource,
      thumbnailBottomRatingsRow,
      thumbnailGenreBadgeAnimeGrouping,
      thumbnailGenreBadgeMode,
      thumbnailGenreBadgePosition,
      thumbnailGenreBadgeScale,
      thumbnailGenreBadgeBorderWidth,
      thumbnailGenreBadgeStyle,
      thumbnailImageText,
      thumbnailQualityBadgePreferences,
      thumbnailQualityBadgeScale,
      thumbnailQualityBadgesStyle,
      thumbnailQualityBadgesMax,
      thumbnailRatingBadgeScale,
      thumbnailRatingPreferences,
      thumbnailRatingPresentation,
      thumbnailRatingStyle,
      thumbnailRatingsLayout,
      thumbnailRatingsMax,
      thumbnailSideRatingsOffset,
      thumbnailSideRatingsPosition,
      thumbnailStreamBadges,
      episodeIdMode,
      xrdbKey,
      fanartKey,
      lang,
      logoAggregateRatingSource,
      logoArtworkSource,
      logoBackground,
      logoGenreBadgeAnimeGrouping,
      logoGenreBadgeMode,
      logoGenreBadgePosition,
      logoGenreBadgeScale,
      logoGenreBadgeBorderWidth,
      logoGenreBadgeStyle,
      logoQualityBadgePreferences,
      logoQualityBadgeScale,
      logoQualityBadgesStyle,
      logoQualityBadgesMax,
      logoRatingBadgeScale,
      logoRatingPreferences,
      logoRatingPresentation,
      logoRatingStyle,
      logoRatingsMax,
      logoBottomRatingsRow,
      mdblistKey,
      posterAggregateRatingSource,
      posterRingProgressSource,
      posterRingValueSource,
      posterArtworkSource,
      posterEdgeOffset,
      posterGenreBadgeAnimeGrouping,
      posterGenreBadgeMode,
      posterGenreBadgePosition,
      posterGenreBadgeScale,
      posterGenreBadgeBorderWidth,
      posterGenreBadgeStyle,
      posterImageSize,
      randomPosterText,
      randomPosterLanguage,
      randomPosterMinVoteCount,
      randomPosterMinVoteAverage,
      randomPosterMinWidth,
      randomPosterMinHeight,
      randomPosterFallback,
      posterImageText,
      posterQualityBadgePreferences,
      posterQualityBadgeScale,
      posterQualityBadgesPosition,
      posterQualityBadgesStyle,
      posterQualityBadgesMax,
      posterRatingBadgeScale,
      posterRatingPreferences,
      posterRatingPresentation,
      posterRatingStyle,
      posterRatingsLayout,
      posterRatingsMax,
      posterRatingsMaxPerSide,
      posterSideRatingsOffset,
      posterSideRatingsPosition,
      posterStreamBadges,
      proxyDebugMetaTranslation,
      proxyTypes,
      proxyCatalogRules,
      proxyManifestUrl,
      proxyTranslateMeta,
      proxyTranslateMetaMode,
      qualityBadgesSide,
      ratingXOffsetPillGlass,
      ratingYOffsetPillGlass,
      ratingXOffsetSquare,
      ratingYOffsetSquare,
      ratingProviderAppearanceOverrides,
      ratingValueMode,
      simklClientId,
      thumbnailEpisodeArtwork,
      tmdbIdScope,
      tmdbKey,
    ],
  );

  return { applySavedUiConfig, buildCurrentUiConfig };
}
