import { useCallback, useMemo, useState } from 'react';

import { DEFAULT_BADGE_SCALE_PERCENT, type RatingProviderAppearanceOverrides } from '@/lib/badgeCustomization';
import {
  DEFAULT_GENRE_BADGE_ANIME_GROUPING,
  DEFAULT_GENRE_BADGE_MODE,
  DEFAULT_GENRE_BADGE_POSITION,
  DEFAULT_GENRE_BADGE_STYLE,
  GENRE_BADGE_PREVIEW_SAMPLES,
  type GenreBadgeAnimeGrouping,
  type GenreBadgeMode,
  type GenreBadgePosition,
  type GenreBadgeStyle,
} from '@/lib/genreBadge';
import {
  AGGREGATE_RATING_SOURCE_ACCENTS,
  DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET,
  DEFAULT_AGGREGATE_ACCENT_COLOR,
  DEFAULT_AGGREGATE_ACCENT_MODE,
  DEFAULT_AGGREGATE_RATING_SOURCE,
  DEFAULT_RATING_PRESENTATION,
  usesAggregateAccentBar,
  usesAggregateRatingPresentation,
  type AggregateAccentMode,
  type AggregateRatingSource,
  type RatingPresentation,
} from '@/lib/ratingPresentation';
import { stringifyRatingPreferencesAllowEmpty, type RatingPreference } from '@/lib/ratingProviderCatalog';
import { DEPLOYMENT_VERSION } from '@/lib/siteBrand';
import {
  buildAiometadataUrlPatterns,
  buildConfigString,
  buildProxyUrl,
  normalizeBaseUrl,
  type ArtworkSource,
  type BackdropImageTextPreference,
  type LogoBackground,
  type PosterImageSize,
  type PosterImageTextPreference,
  type PosterQualityBadgesPosition,
  type QualityBadgesSide,
  type SavedUiConfig,
  type StreamBadgesSetting,
  type TmdbIdScopeMode,
} from '@/lib/uiConfig';
import { buildEpisodeToken, DEFAULT_EPISODE_ID_MODE, type EpisodeIdMode } from '@/lib/episodeIdentity';
import { isVerticalPosterRatingLayout, type PosterRatingLayout } from '@/lib/posterLayoutOptions';
import { type BackdropRatingLayout } from '@/lib/backdropLayoutOptions';
import { DEFAULT_POSTER_EDGE_OFFSET } from '@/lib/posterEdgeOffset';
import { DEFAULT_RATING_VALUE_MODE, type RatingValueMode } from '@/lib/ratingDisplay';
import {
  DEFAULT_POSTER_COMPACT_RING_PROGRESS_SOURCE,
  DEFAULT_POSTER_COMPACT_RING_VALUE_SOURCE,
  type PosterCompactRingSource,
} from '@/lib/posterCompactRing';
import {
  DEFAULT_QUALITY_BADGES_STYLE,
  type QualityBadgeStyle,
  type RatingStyle,
} from '@/lib/ratingAppearance';
import { type SideRatingPosition } from '@/lib/sideRatingPosition';

const GENRE_BADGE_QUERY_KEYS = {
  poster: {
    mode: 'posterGenreBadge',
    style: 'posterGenreBadgeStyle',
    position: 'posterGenreBadgePosition',
    scale: 'posterGenreBadgeScale',
    animeGrouping: 'posterGenreBadgeAnimeGrouping',
  },
  backdrop: {
    mode: 'backdropGenreBadge',
    style: 'backdropGenreBadgeStyle',
    position: 'backdropGenreBadgePosition',
    scale: 'backdropGenreBadgeScale',
    animeGrouping: 'backdropGenreBadgeAnimeGrouping',
  },
  thumbnail: {
    mode: 'thumbnailGenreBadge',
    style: 'thumbnailGenreBadgeStyle',
    position: 'thumbnailGenreBadgePosition',
    scale: 'thumbnailGenreBadgeScale',
    animeGrouping: 'thumbnailGenreBadgeAnimeGrouping',
  },
  logo: {
    mode: 'logoGenreBadge',
    style: 'logoGenreBadgeStyle',
    position: 'logoGenreBadgePosition',
    scale: 'logoGenreBadgeScale',
    animeGrouping: 'logoGenreBadgeAnimeGrouping',
  },
} as const;

const AGGREGATE_SOURCE_ACCENT_BY_ID = AGGREGATE_RATING_SOURCE_ACCENTS;

const maskSensitiveText = (value: string) => value.replace(/[^\s]/g, '*');

export type AiometadataPatternRow = {
  description: string;
  key: 'poster' | 'background' | 'logo' | 'episode';
  label: string;
  value: string;
};

const appendGenreBadgeQueryParams = ({
  query,
  type,
  mode,
  style,
  position,
  scale,
  animeGrouping,
}: {
  query: URLSearchParams;
  type: 'poster' | 'backdrop' | 'thumbnail' | 'logo';
  mode: GenreBadgeMode;
  style: GenreBadgeStyle;
  position: GenreBadgePosition;
  scale: number;
  animeGrouping: GenreBadgeAnimeGrouping;
}) => {
  const keys = GENRE_BADGE_QUERY_KEYS[type];
  if (mode !== DEFAULT_GENRE_BADGE_MODE) {
    query.set(keys.mode, mode);
  }
  if (style !== DEFAULT_GENRE_BADGE_STYLE) {
    query.set(keys.style, style);
  }
  if (position !== DEFAULT_GENRE_BADGE_POSITION) {
    query.set(keys.position, position);
  }
  if (scale !== DEFAULT_BADGE_SCALE_PERCENT) {
    query.set(keys.scale, String(scale));
  }
  if (animeGrouping !== DEFAULT_GENRE_BADGE_ANIME_GROUPING) {
    query.set(keys.animeGrouping, animeGrouping);
  }
};

const buildGenreSamplePreviewUrl = ({
  baseUrl,
  xrdbKey,
  tmdbKey,
  sample,
  mode,
  style,
  position,
  scale,
  animeGrouping,
}: {
  baseUrl: string;
  xrdbKey: string;
  tmdbKey: string;
  sample: (typeof GENRE_BADGE_PREVIEW_SAMPLES)[number];
  mode: GenreBadgeMode;
  style: GenreBadgeStyle;
  position: GenreBadgePosition;
  scale: number;
  animeGrouping: GenreBadgeAnimeGrouping;
}) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedXrdbKey = xrdbKey.trim();
  const normalizedTmdbKey = tmdbKey.trim();
  if (!normalizedBaseUrl || !normalizedTmdbKey) {
    return '';
  }

  const query = new URLSearchParams({
    tmdbKey: normalizedTmdbKey,
    lang: sample.lang,
  });
  if (normalizedXrdbKey) {
    query.set('xrdbKey', normalizedXrdbKey);
  }
  appendGenreBadgeQueryParams({
    query,
    type: sample.previewType,
    mode,
    style,
    position,
    scale,
    animeGrouping,
  });
  for (const [key, value] of Object.entries(sample.params)) {
    query.set(key, value);
  }

  return `${normalizedBaseUrl}/${sample.previewType}/${encodeURIComponent(sample.mediaId)}.jpg?${query.toString()}`;
};

const parseEpisodePreviewMediaTarget = (value: string) => {
  const match = /^(.*?):(\d+):(\d+)$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const [, id, season, episode] = match;
  const episodeToken = buildEpisodeToken(Number(season), Number(episode));
  if (!id || !episodeToken) {
    return null;
  }
  return { id, episodeToken };
};

export function useConfiguratorOutputs({
  activeGenreBadgeAnimeGrouping,
  activeGenreBadgeMode,
  activeGenreBadgePosition,
  activeGenreBadgeScale,
  activeGenreBadgeStyle,
  activeQualityBadgesMax,
  aggregateAccentBarOffset,
  aggregateAccentBarVisible,
  aggregateAccentColor,
  aggregateAccentMode,
  aggregateAudienceAccentColor,
  aggregateCriticsAccentColor,
  backdropAggregateRatingSource,
  backdropArtworkSource,
  backdropGenreBadgeAnimeGrouping,
  backdropGenreBadgePosition,
  backdropGenreBadgeScale,
  backdropGenreBadgeStyle,
  backdropImageText,
  backdropQualityBadgePreferences,
  backdropQualityBadgeScale,
  backdropQualityBadgesStyle,
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
  thumbnailEpisodeArtwork,
  thumbnailGenreBadgeAnimeGrouping,
  thumbnailGenreBadgePosition,
  thumbnailGenreBadgeScale,
  thumbnailGenreBadgeStyle,
  thumbnailImageText,
  thumbnailQualityBadgePreferences,
  thumbnailQualityBadgeScale,
  thumbnailQualityBadgesStyle,
  thumbnailRatingBadgeScale,
  thumbnailRatingPreferences,
  thumbnailRatingPresentation,
  thumbnailRatingStyle,
  thumbnailRatingsLayout,
  thumbnailRatingsMax,
  thumbnailSideRatingsOffset,
  thumbnailSideRatingsPosition,
  thumbnailStreamBadges,
  baseUrl,
  buildCurrentUiConfig,
  episodeIdMode = DEFAULT_EPISODE_ID_MODE,
  xrdbKey,
  fanartKey,
  genrePreviewMode,
  hideAiometadataCredentials,
  isLatestReleaseLoading,
  lang,
  latestReleaseTag,
  logoAggregateRatingSource,
  logoArtworkSource,
  logoBackground,
  logoGenreBadgeAnimeGrouping,
  logoGenreBadgePosition,
  logoGenreBadgeScale,
  logoGenreBadgeStyle,
  logoQualityBadgePreferences,
  logoQualityBadgeScale,
  logoQualityBadgesStyle,
  logoRatingBadgeScale,
  logoRatingPreferences,
  logoRatingPresentation,
  logoRatingStyle,
  logoRatingsMax,
  logoBottomRatingsRow,
  mdblistKey,
  mediaId,
  pendingReleaseTag,
  posterAggregateRatingSource,
  posterRingProgressSource,
  posterRingValueSource,
  posterArtworkSource,
  posterEdgeOffset,
  posterGenreBadgeAnimeGrouping,
  posterGenreBadgePosition,
  posterGenreBadgeScale,
  posterGenreBadgeStyle,
  posterIdMode,
  posterImageSize,
  posterImageText,
  posterQualityBadgePreferences,
  posterQualityBadgeScale,
  posterQualityBadgesPosition,
  posterQualityBadgesStyle,
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
  previewType,
  proxyUrlVisible,
  qualityBadgesSide,
  ratingProviderAppearanceOverrides,
  ratingValueMode,
  showConfigString,
  shouldShowQualityBadgesPosition,
  shouldShowQualityBadgesSide,
  simklClientId,
  tmdbIdScope,
  tmdbKey,
}: {
  activeGenreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  activeGenreBadgeMode: GenreBadgeMode;
  activeGenreBadgePosition: GenreBadgePosition;
  activeGenreBadgeScale: number;
  activeGenreBadgeStyle: GenreBadgeStyle;
  activeQualityBadgesMax: number | null;
  aggregateAccentBarOffset: number;
  aggregateAccentBarVisible: boolean;
  aggregateAccentColor: string;
  aggregateAccentMode: AggregateAccentMode;
  aggregateAudienceAccentColor: string;
  aggregateCriticsAccentColor: string;
  backdropAggregateRatingSource: AggregateRatingSource;
  backdropArtworkSource: ArtworkSource;
  backdropGenreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  backdropGenreBadgePosition: GenreBadgePosition;
  backdropGenreBadgeScale: number;
  backdropGenreBadgeStyle: GenreBadgeStyle;
  backdropImageText: BackdropImageTextPreference;
  backdropQualityBadgePreferences: string[];
  backdropQualityBadgeScale: number;
  backdropQualityBadgesStyle: QualityBadgeStyle;
  backdropRatingBadgeScale: number;
  backdropRatingPreferences: RatingPreference[];
  backdropRatingPresentation: RatingPresentation;
  backdropRatingStyle: RatingStyle;
  backdropRatingsLayout: BackdropRatingLayout;
  backdropRatingsMax: number | null;
  backdropBottomRatingsRow: boolean;
  backdropSideRatingsOffset: number;
  backdropSideRatingsPosition: SideRatingPosition;
  backdropStreamBadges: StreamBadgesSetting;
  thumbnailAggregateRatingSource: AggregateRatingSource;
  thumbnailArtworkSource: ArtworkSource;
  thumbnailBottomRatingsRow: boolean;
  thumbnailEpisodeArtwork: 'still' | 'series';
  thumbnailGenreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  thumbnailGenreBadgePosition: GenreBadgePosition;
  thumbnailGenreBadgeScale: number;
  thumbnailGenreBadgeStyle: GenreBadgeStyle;
  thumbnailImageText: BackdropImageTextPreference;
  thumbnailQualityBadgePreferences: string[];
  thumbnailQualityBadgeScale: number;
  thumbnailQualityBadgesStyle: QualityBadgeStyle;
  thumbnailRatingBadgeScale: number;
  thumbnailRatingPreferences: RatingPreference[];
  thumbnailRatingPresentation: RatingPresentation;
  thumbnailRatingStyle: RatingStyle;
  thumbnailRatingsLayout: BackdropRatingLayout;
  thumbnailRatingsMax: number | null;
  thumbnailSideRatingsOffset: number;
  thumbnailSideRatingsPosition: SideRatingPosition;
  thumbnailStreamBadges: StreamBadgesSetting;
  baseUrl: string;
  buildCurrentUiConfig: () => SavedUiConfig;
  episodeIdMode?: EpisodeIdMode;
  xrdbKey: string;
  fanartKey: string;
  genrePreviewMode: GenreBadgeMode;
  hideAiometadataCredentials: boolean;
  isLatestReleaseLoading: boolean;
  lang: string;
  latestReleaseTag: string;
  logoAggregateRatingSource: AggregateRatingSource;
  logoArtworkSource: ArtworkSource;
  logoBackground: LogoBackground;
  logoGenreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  logoGenreBadgePosition: GenreBadgePosition;
  logoGenreBadgeScale: number;
  logoGenreBadgeStyle: GenreBadgeStyle;
  logoQualityBadgePreferences: string[];
  logoQualityBadgeScale: number;
  logoQualityBadgesStyle: QualityBadgeStyle;
  logoRatingBadgeScale: number;
  logoRatingPreferences: RatingPreference[];
  logoRatingPresentation: RatingPresentation;
  logoRatingStyle: RatingStyle;
  logoRatingsMax: number | null;
  logoBottomRatingsRow: boolean;
  mdblistKey: string;
  mediaId: string;
  pendingReleaseTag: string;
  posterAggregateRatingSource: AggregateRatingSource;
  posterRingProgressSource: PosterCompactRingSource;
  posterRingValueSource: PosterCompactRingSource;
  posterArtworkSource: ArtworkSource;
  posterEdgeOffset: number;
  posterGenreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  posterGenreBadgePosition: GenreBadgePosition;
  posterGenreBadgeScale: number;
  posterGenreBadgeStyle: GenreBadgeStyle;
  posterIdMode: 'auto' | 'tmdb' | 'imdb';
  posterImageSize: PosterImageSize;
  posterImageText: PosterImageTextPreference;
  posterQualityBadgePreferences: string[];
  posterQualityBadgeScale: number;
  posterQualityBadgesPosition: PosterQualityBadgesPosition;
  posterQualityBadgesStyle: QualityBadgeStyle;
  posterRatingBadgeScale: number;
  posterRatingPreferences: RatingPreference[];
  posterRatingPresentation: RatingPresentation;
  posterRatingStyle: RatingStyle;
  posterRatingsLayout: PosterRatingLayout;
  posterRatingsMax: number | null;
  posterRatingsMaxPerSide: number | null;
  posterSideRatingsOffset: number;
  posterSideRatingsPosition: SideRatingPosition;
  posterStreamBadges: StreamBadgesSetting;
  previewType: 'poster' | 'backdrop' | 'thumbnail' | 'logo';
  proxyUrlVisible: boolean;
  qualityBadgesSide: QualityBadgesSide;
  ratingProviderAppearanceOverrides: RatingProviderAppearanceOverrides;
  ratingValueMode: RatingValueMode;
  showConfigString: boolean;
  shouldShowQualityBadgesPosition: boolean;
  shouldShowQualityBadgesSide: boolean;
  simklClientId: string;
  tmdbIdScope: TmdbIdScopeMode;
  tmdbKey: string;
}) {
  const [previewErroredForUrl, setPreviewErroredForUrl] = useState('');
  const [previewErrorDetails, setPreviewErrorDetails] = useState('');
  const [previewLoadedForUrl, setPreviewLoadedForUrl] = useState('');

  const previewUrl = useMemo(() => {
    const normalizedXrdbKey = xrdbKey.trim();
    const normalizedTmdbKey = tmdbKey.trim();
    const normalizedFanartKey = fanartKey.trim();
    const normalizedMediaId = mediaId.trim();
    if (!baseUrl || !normalizedTmdbKey || !normalizedMediaId) {
      return '';
    }
    const thumbnailTarget =
      previewType === 'thumbnail' ? parseEpisodePreviewMediaTarget(normalizedMediaId) : null;
    if (previewType === 'thumbnail' && !thumbnailTarget) {
      return '';
    }

    const ratingPreferencesForType =
      previewType === 'poster'
        ? posterRatingPreferences
        : previewType === 'backdrop'
          ? backdropRatingPreferences
          : previewType === 'thumbnail'
            ? thumbnailRatingPreferences
          : logoRatingPreferences;
    const ratingsQuery = stringifyRatingPreferencesAllowEmpty(ratingPreferencesForType);
    const ratingStyleForType =
      previewType === 'poster'
        ? posterRatingStyle
        : previewType === 'backdrop'
          ? backdropRatingStyle
          : previewType === 'thumbnail'
            ? thumbnailRatingStyle
          : logoRatingStyle;
    const ratingPresentationForType =
      previewType === 'poster'
        ? posterRatingPresentation
        : previewType === 'backdrop'
          ? backdropRatingPresentation
          : previewType === 'thumbnail'
            ? thumbnailRatingPresentation
          : logoRatingPresentation;
    const aggregateRatingSourceForType =
      previewType === 'poster'
        ? posterAggregateRatingSource
        : previewType === 'backdrop'
          ? backdropAggregateRatingSource
          : previewType === 'thumbnail'
            ? thumbnailAggregateRatingSource
          : logoAggregateRatingSource;
    const imageTextForType =
      previewType === 'backdrop'
        ? backdropImageText
        : previewType === 'thumbnail'
          ? thumbnailImageText
          : posterImageText;
    const streamBadgesForType =
      previewType === 'backdrop'
        ? backdropStreamBadges
        : previewType === 'thumbnail'
          ? thumbnailStreamBadges
          : posterStreamBadges;
    const qualityBadgesStyleForType =
      previewType === 'backdrop'
        ? backdropQualityBadgesStyle
        : previewType === 'thumbnail'
          ? thumbnailQualityBadgesStyle
        : previewType === 'logo'
          ? logoQualityBadgesStyle
          : posterQualityBadgesStyle;
    const qualityBadgePreferencesForType =
      previewType === 'backdrop'
        ? backdropQualityBadgePreferences
        : previewType === 'thumbnail'
          ? thumbnailQualityBadgePreferences
        : previewType === 'logo'
          ? logoQualityBadgePreferences
          : posterQualityBadgePreferences;
    const ratingBadgeScaleForType =
      previewType === 'poster'
        ? posterRatingBadgeScale
        : previewType === 'backdrop'
          ? backdropRatingBadgeScale
          : previewType === 'thumbnail'
            ? thumbnailRatingBadgeScale
          : logoRatingBadgeScale;
    const qualityBadgeScaleForType =
      previewType === 'backdrop'
        ? backdropQualityBadgeScale
        : previewType === 'thumbnail'
          ? thumbnailQualityBadgeScale
        : previewType === 'logo'
          ? logoQualityBadgeScale
          : posterQualityBadgeScale;
    const ratingsMaxForType =
      previewType === 'poster'
        ? posterRatingsMax
        : previewType === 'backdrop'
          ? backdropRatingsMax
          : previewType === 'thumbnail'
            ? thumbnailRatingsMax
          : logoRatingsMax;
    const query = new URLSearchParams({
      ratingStyle: ratingStyleForType,
      lang,
    });
    if (normalizedXrdbKey) {
      query.set('xrdbKey', normalizedXrdbKey);
    }
    if (ratingValueMode !== DEFAULT_RATING_VALUE_MODE) {
      query.set('ratingValueMode', ratingValueMode);
    }
    appendGenreBadgeQueryParams({
      query,
      type: previewType,
      mode: activeGenreBadgeMode,
      style: activeGenreBadgeStyle,
      position: activeGenreBadgePosition,
      scale: activeGenreBadgeScale,
      animeGrouping: activeGenreBadgeAnimeGrouping,
    });
    if (ratingPresentationForType !== DEFAULT_RATING_PRESENTATION) {
      query.set(
        previewType === 'poster'
          ? 'posterRatingPresentation'
          : previewType === 'backdrop'
            ? 'backdropRatingPresentation'
            : previewType === 'thumbnail'
              ? 'thumbnailRatingPresentation'
            : 'logoRatingPresentation',
        ratingPresentationForType,
      );
    }
    if (previewType === 'poster' && ratingPresentationForType === 'ring') {
      if (posterRingValueSource !== DEFAULT_POSTER_COMPACT_RING_VALUE_SOURCE) {
        query.set('posterRingValueSource', posterRingValueSource);
      }
      if (posterRingProgressSource !== DEFAULT_POSTER_COMPACT_RING_PROGRESS_SOURCE) {
        query.set('posterRingProgressSource', posterRingProgressSource);
      }
    }
    if (aggregateRatingSourceForType !== DEFAULT_AGGREGATE_RATING_SOURCE) {
      query.set(
        previewType === 'poster'
          ? 'posterAggregateRatingSource'
          : previewType === 'backdrop'
            ? 'backdropAggregateRatingSource'
            : previewType === 'thumbnail'
              ? 'thumbnailAggregateRatingSource'
            : 'logoAggregateRatingSource',
        aggregateRatingSourceForType,
      );
    }
    if (
      usesAggregateRatingPresentation(ratingPresentationForType) &&
      aggregateAccentMode !== DEFAULT_AGGREGATE_ACCENT_MODE
    ) {
      query.set('aggregateAccentMode', aggregateAccentMode);
    }
    if (
      usesAggregateRatingPresentation(ratingPresentationForType) &&
      (aggregateAccentMode === 'custom' || aggregateAccentColor !== DEFAULT_AGGREGATE_ACCENT_COLOR)
    ) {
      query.set('aggregateAccentColor', aggregateAccentColor);
    }
    if (
      usesAggregateRatingPresentation(ratingPresentationForType) &&
      (aggregateAccentMode === 'custom' ||
        aggregateCriticsAccentColor !== AGGREGATE_SOURCE_ACCENT_BY_ID.critics)
    ) {
      query.set('aggregateCriticsAccentColor', aggregateCriticsAccentColor);
    }
    if (
      usesAggregateRatingPresentation(ratingPresentationForType) &&
      (aggregateAccentMode === 'custom' ||
        aggregateAudienceAccentColor !== AGGREGATE_SOURCE_ACCENT_BY_ID.audience)
    ) {
      query.set('aggregateAudienceAccentColor', aggregateAudienceAccentColor);
    }
    if (
      usesAggregateAccentBar(ratingPresentationForType) &&
      aggregateAccentBarOffset !== DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET
    ) {
      query.set('aggregateAccentBarOffset', String(aggregateAccentBarOffset));
    }
    if (usesAggregateAccentBar(ratingPresentationForType) && !aggregateAccentBarVisible) {
      query.set('aggregateAccentBarVisible', 'false');
    }
    if (previewType === 'poster') {
      query.set('posterRatings', ratingsQuery);
    } else if (previewType === 'backdrop') {
      query.set('backdropRatings', ratingsQuery);
    } else if (previewType === 'thumbnail') {
      query.set('thumbnailRatings', ratingsQuery);
    } else {
      query.set('logoRatings', ratingsQuery);
    }
    if (previewType !== 'logo' && streamBadgesForType !== 'auto') {
      query.set(
        previewType === 'backdrop'
          ? 'backdropStreamBadges'
          : previewType === 'thumbnail'
            ? 'thumbnailStreamBadges'
            : 'posterStreamBadges',
        streamBadgesForType,
      );
    }
    if (shouldShowQualityBadgesSide && qualityBadgesSide !== 'left') {
      query.set('qualityBadgesSide', qualityBadgesSide);
    }
    if (shouldShowQualityBadgesPosition && posterQualityBadgesPosition !== 'auto') {
      query.set('posterQualityBadgesPosition', posterQualityBadgesPosition);
    }
    if (qualityBadgesStyleForType !== DEFAULT_QUALITY_BADGES_STYLE) {
      query.set(
        previewType === 'backdrop'
          ? 'backdropQualityBadgesStyle'
          : previewType === 'thumbnail'
            ? 'thumbnailQualityBadgesStyle'
          : previewType === 'logo'
            ? 'logoQualityBadgesStyle'
            : 'posterQualityBadgesStyle',
        qualityBadgesStyleForType,
      );
    }
    query.set(
      previewType === 'backdrop'
        ? 'backdropQualityBadges'
        : previewType === 'thumbnail'
          ? 'thumbnailQualityBadges'
        : previewType === 'logo'
          ? 'logoQualityBadges'
          : 'posterQualityBadges',
      qualityBadgePreferencesForType.join(','),
    );
    if (activeQualityBadgesMax !== null) {
      query.set(
        previewType === 'backdrop'
          ? 'backdropQualityBadgesMax'
          : previewType === 'thumbnail'
            ? 'thumbnailQualityBadgesMax'
          : previewType === 'logo'
            ? 'logoQualityBadgesMax'
            : 'posterQualityBadgesMax',
        String(activeQualityBadgesMax),
      );
    }

    if (mdblistKey) {
      query.set('mdblistKey', mdblistKey);
    }
    if (simklClientId.trim()) {
      query.set('simklClientId', simklClientId.trim());
    }
    query.set('tmdbKey', normalizedTmdbKey);
    if (tmdbIdScope !== 'soft') {
      query.set('tmdbIdScope', tmdbIdScope);
    }
    const shouldSendFanartKey =
      (previewType === 'poster' &&
        (posterArtworkSource === 'fanart' || posterArtworkSource === 'random')) ||
      (previewType === 'backdrop' &&
        (backdropArtworkSource === 'fanart' || backdropArtworkSource === 'random')) ||
      (previewType === 'thumbnail' &&
        (thumbnailArtworkSource === 'fanart' || thumbnailArtworkSource === 'random')) ||
      (previewType === 'logo' &&
        (logoArtworkSource === 'fanart' || logoArtworkSource === 'random'));
    if (normalizedFanartKey && shouldSendFanartKey) {
      query.set('fanartKey', normalizedFanartKey);
    }

    if (previewType === 'poster' || previewType === 'backdrop' || previewType === 'thumbnail') {
      query.set('imageText', imageTextForType);
      if (previewType === 'poster' && posterImageSize !== 'normal') {
        query.set('posterImageSize', posterImageSize);
      }
      if (previewType === 'poster' && posterArtworkSource !== 'tmdb') {
        query.set('posterArtworkSource', posterArtworkSource);
      }
      if (previewType === 'backdrop' && backdropArtworkSource !== 'tmdb') {
        query.set('backdropArtworkSource', backdropArtworkSource);
      }
      if (previewType === 'thumbnail' && thumbnailArtworkSource !== 'tmdb') {
        query.set('thumbnailArtworkSource', thumbnailArtworkSource);
      }
    }
    if (previewType === 'poster') {
      query.set('posterRatingsLayout', posterRatingsLayout);
      if (ratingsMaxForType !== null) {
        query.set('posterRatingsMax', String(ratingsMaxForType));
      }
      if (isVerticalPosterRatingLayout(posterRatingsLayout) && posterRatingsMaxPerSide !== null) {
        query.set('posterRatingsMaxPerSide', String(posterRatingsMaxPerSide));
      }
      if (posterEdgeOffset !== DEFAULT_POSTER_EDGE_OFFSET) {
        query.set('posterEdgeOffset', String(posterEdgeOffset));
      }
    } else if (previewType === 'backdrop') {
      if (!backdropBottomRatingsRow) {
        query.set('backdropRatingsLayout', backdropRatingsLayout);
      }
      if (ratingsMaxForType !== null) {
        query.set('backdropRatingsMax', String(ratingsMaxForType));
      }
      if (backdropBottomRatingsRow) {
        query.set('backdropBottomRatingsRow', 'true');
      }
    } else if (previewType === 'thumbnail') {
      if (!thumbnailBottomRatingsRow) {
        query.set('thumbnailRatingsLayout', thumbnailRatingsLayout);
      }
      if (ratingsMaxForType !== null) {
        query.set('thumbnailRatingsMax', String(ratingsMaxForType));
      }
      if (thumbnailBottomRatingsRow) {
        query.set('thumbnailBottomRatingsRow', 'true');
      }
      if (thumbnailEpisodeArtwork !== 'still') {
        query.set('thumbnailEpisodeArtwork', thumbnailEpisodeArtwork);
      }
    } else {
      if (ratingsMaxForType !== null) {
        query.set('logoRatingsMax', String(ratingsMaxForType));
      }
      if (logoBackground !== 'transparent') {
        query.set('logoBackground', logoBackground);
      }
      if (logoBottomRatingsRow) {
        query.set('logoBottomRatingsRow', 'true');
      }
      if (logoArtworkSource !== 'tmdb') {
        query.set('logoArtworkSource', logoArtworkSource);
      }
    }
    if (ratingBadgeScaleForType !== DEFAULT_BADGE_SCALE_PERCENT) {
      query.set(
        previewType === 'poster'
          ? 'posterRatingBadgeScale'
          : previewType === 'backdrop'
            ? 'backdropRatingBadgeScale'
            : previewType === 'thumbnail'
              ? 'thumbnailRatingBadgeScale'
            : 'logoRatingBadgeScale',
        String(ratingBadgeScaleForType),
      );
    }
    if (qualityBadgeScaleForType !== DEFAULT_BADGE_SCALE_PERCENT) {
      query.set(
        previewType === 'backdrop'
          ? 'backdropQualityBadgeScale'
          : previewType === 'thumbnail'
            ? 'thumbnailQualityBadgeScale'
          : previewType === 'logo'
            ? 'logoQualityBadgeScale'
            : 'posterQualityBadgeScale',
        String(qualityBadgeScaleForType),
      );
    }
    const activeProviderAppearance = Object.fromEntries(
      Object.entries(ratingProviderAppearanceOverrides).filter(([, override]) => Boolean(override)),
    );
    if (Object.keys(activeProviderAppearance).length > 0) {
      query.set('providerAppearance', JSON.stringify(activeProviderAppearance));
    }
    const usesVerticalSideRatings =
      (previewType === 'poster' &&
        (isVerticalPosterRatingLayout(posterRatingsLayout) ||
          posterRatingPresentation === 'blockbuster')) ||
      (previewType === 'backdrop' &&
        !backdropBottomRatingsRow &&
        (backdropRatingsLayout === 'right-vertical' ||
          backdropRatingPresentation === 'blockbuster')) ||
      (previewType === 'thumbnail' &&
        !thumbnailBottomRatingsRow &&
        (thumbnailRatingsLayout === 'right-vertical' ||
          thumbnailRatingPresentation === 'blockbuster'));
    if (usesVerticalSideRatings) {
      const activeSidePosition =
        previewType === 'backdrop'
          ? backdropSideRatingsPosition
          : previewType === 'thumbnail'
            ? thumbnailSideRatingsPosition
            : posterSideRatingsPosition;
      const activeSideOffset =
        previewType === 'backdrop'
          ? backdropSideRatingsOffset
          : previewType === 'thumbnail'
            ? thumbnailSideRatingsOffset
            : posterSideRatingsOffset;
      if (activeSidePosition !== 'top') {
        const positionParam =
          previewType === 'poster'
            ? 'posterSideRatingsPosition'
            : previewType === 'thumbnail'
              ? 'thumbnailSideRatingsPosition'
              : 'backdropSideRatingsPosition';
        const offsetParam =
          previewType === 'poster'
            ? 'posterSideRatingsOffset'
            : previewType === 'thumbnail'
              ? 'thumbnailSideRatingsOffset'
              : 'backdropSideRatingsOffset';
        query.set(positionParam, activeSidePosition);
        if (activeSidePosition === 'custom') {
          query.set(offsetParam, String(activeSideOffset));
        }
      }
    }

    if (previewType === 'thumbnail' && thumbnailTarget) {
      return `${baseUrl}/thumbnail/${encodeURIComponent(thumbnailTarget.id)}/${thumbnailTarget.episodeToken}.jpg?${query.toString()}`;
    }
    return `${baseUrl}/${previewType}/${normalizedMediaId}.jpg?${query.toString()}`;
  }, [
    activeGenreBadgeAnimeGrouping,
    activeGenreBadgeMode,
    activeGenreBadgePosition,
    activeGenreBadgeScale,
    activeGenreBadgeStyle,
    activeQualityBadgesMax,
    aggregateAccentBarOffset,
    aggregateAccentBarVisible,
    aggregateAccentColor,
    aggregateAccentMode,
    aggregateAudienceAccentColor,
    aggregateCriticsAccentColor,
    backdropAggregateRatingSource,
    backdropArtworkSource,
    backdropImageText,
    backdropQualityBadgePreferences,
    backdropQualityBadgeScale,
    backdropQualityBadgesStyle,
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
    thumbnailEpisodeArtwork,
    thumbnailImageText,
    thumbnailQualityBadgePreferences,
    thumbnailQualityBadgeScale,
    thumbnailQualityBadgesStyle,
    thumbnailRatingBadgeScale,
    thumbnailRatingPreferences,
    thumbnailRatingPresentation,
    thumbnailRatingStyle,
    thumbnailRatingsLayout,
    thumbnailRatingsMax,
    thumbnailSideRatingsOffset,
    thumbnailSideRatingsPosition,
    thumbnailStreamBadges,
    baseUrl,
    xrdbKey,
    fanartKey,
    lang,
    logoAggregateRatingSource,
    logoArtworkSource,
    logoBackground,
    logoQualityBadgePreferences,
    logoQualityBadgeScale,
    logoQualityBadgesStyle,
    logoRatingBadgeScale,
    logoRatingPreferences,
    logoRatingPresentation,
    logoRatingStyle,
    logoRatingsMax,
    logoBottomRatingsRow,
    mdblistKey,
    mediaId,
    posterAggregateRatingSource,
    posterArtworkSource,
    posterEdgeOffset,
    posterImageSize,
    posterImageText,
    posterQualityBadgePreferences,
    posterQualityBadgeScale,
    posterQualityBadgesPosition,
    posterQualityBadgesStyle,
    posterRatingBadgeScale,
    posterRatingPreferences,
    posterRatingPresentation,
    posterRingProgressSource,
    posterRingValueSource,
    posterRatingStyle,
    posterRatingsLayout,
    posterRatingsMax,
    posterRatingsMaxPerSide,
    posterSideRatingsOffset,
    posterSideRatingsPosition,
    posterStreamBadges,
    previewType,
    qualityBadgesSide,
    ratingProviderAppearanceOverrides,
    ratingValueMode,
    shouldShowQualityBadgesPosition,
    shouldShowQualityBadgesSide,
    simklClientId,
    tmdbIdScope,
    tmdbKey,
  ]);

  const previewErrored = Boolean(previewUrl) && previewErroredForUrl === previewUrl;
  const previewLoaded = Boolean(previewUrl) && previewLoadedForUrl === previewUrl;

  const genrePreviewCards = useMemo(
    () =>
      GENRE_BADGE_PREVIEW_SAMPLES.map((sample) => ({
        sample,
        url: buildGenreSamplePreviewUrl({
          baseUrl,
          xrdbKey,
          tmdbKey,
          sample,
          mode: genrePreviewMode,
          style:
            sample.previewType === 'poster'
              ? posterGenreBadgeStyle
              : sample.previewType === 'backdrop'
                ? backdropGenreBadgeStyle
                : logoGenreBadgeStyle,
          position:
            sample.previewType === 'poster'
              ? posterGenreBadgePosition
              : sample.previewType === 'backdrop'
                ? backdropGenreBadgePosition
                : logoGenreBadgePosition,
          scale:
            sample.previewType === 'poster'
              ? posterGenreBadgeScale
              : sample.previewType === 'backdrop'
                ? backdropGenreBadgeScale
                : logoGenreBadgeScale,
          animeGrouping:
            sample.previewType === 'poster'
              ? posterGenreBadgeAnimeGrouping
              : sample.previewType === 'backdrop'
                ? backdropGenreBadgeAnimeGrouping
                : logoGenreBadgeAnimeGrouping,
        }),
      })),
    [
      backdropGenreBadgeAnimeGrouping,
      backdropGenreBadgePosition,
      backdropGenreBadgeScale,
      backdropGenreBadgeStyle,
      baseUrl,
      xrdbKey,
      genrePreviewMode,
      logoGenreBadgeAnimeGrouping,
      logoGenreBadgePosition,
      logoGenreBadgeScale,
      logoGenreBadgeStyle,
      posterGenreBadgeAnimeGrouping,
      posterGenreBadgePosition,
      posterGenreBadgeScale,
      posterGenreBadgeStyle,
      tmdbKey,
    ],
  );

  const latestReleaseMatchesDeployment = latestReleaseTag && latestReleaseTag === DEPLOYMENT_VERSION;
  const versionStatusNote = isLatestReleaseLoading
    ? 'Checking the latest release on GitHub now.'
    : latestReleaseTag
      ? latestReleaseMatchesDeployment
        ? 'Live matches the latest release on GitHub.'
        : pendingReleaseTag
          ? `${pendingReleaseTag} is still publishing on GitHub. Latest published release is ${latestReleaseTag}.`
          : `Live is ${DEPLOYMENT_VERSION}. Latest release on GitHub is ${latestReleaseTag}.`
      : 'Live shows the running container. The latest release is unavailable right now.';

  const handlePreviewImageError = useCallback(async (url: string) => {
    setPreviewLoadedForUrl('');
    setPreviewErroredForUrl(url);

    try {
      const response = await fetch(url, { cache: 'no-store' });
      const body = (await response.text()).trim().replace(/\s+/g, ' ').slice(0, 180);

      if (response.ok) {
        setPreviewErrorDetails('Preview request succeeded but the image could not be displayed.');
        return;
      }

      if (response.status === 401 && body.toLowerCase().includes('request key')) {
        setPreviewErrorDetails('This XRDB host requires an XRDB request key. Add it in Inputs and try again.');
        return;
      }

      if (response.status === 400 && body.toLowerCase().includes('tmdb')) {
        if (body.toLowerCase().includes('strict tmdb id scope')) {
          setPreviewErrorDetails('Strict TMDB ID scope blocked an ambiguous TMDB ID. Use tmdb:movie:id or tmdb:tv:id, or switch TMDB ID scope to Soft.');
          return;
        }
        setPreviewErrorDetails('TMDB key is missing. Add your TMDB v3 key in Inputs.');
        return;
      }

      if (response.status === 401 && body.toLowerCase().includes('tmdb')) {
        setPreviewErrorDetails('TMDB key is invalid or unauthorized. Verify the key and try again.');
        return;
      }

      if (response.status === 429 && body.toLowerCase().includes('tmdb')) {
        setPreviewErrorDetails('TMDB rate limit reached. Wait a moment and try again.');
        return;
      }

      if (response.status >= 500) {
        const lowerBody = body.toLowerCase();
        if (
          lowerBody.includes('source request failed') ||
          lowerBody.includes('fetch failed') ||
          lowerBody.includes('network') ||
          lowerBody.includes('dns')
        ) {
          setPreviewErrorDetails('Server could not reach TMDB/MDBList. Check VPS outbound network and DNS.');
          return;
        }
        setPreviewErrorDetails(body ? `API ${response.status}: ${body}` : `API ${response.status}: request failed.`);
        return;
      }

      setPreviewErrorDetails(body ? `API ${response.status}: ${body}` : `API ${response.status}: request failed.`);
    } catch {
      setPreviewErrorDetails('Could not reach the preview endpoint. Check network and base URL.');
    }
  }, []);

  const handlePreviewImageLoad = useCallback((url: string) => {
    setPreviewLoadedForUrl(url);
    setPreviewErroredForUrl('');
    setPreviewErrorDetails('');
  }, []);

  const currentUiConfig = useMemo(() => buildCurrentUiConfig(), [buildCurrentUiConfig]);

  const configString = useMemo(
    () => buildConfigString(baseUrl, currentUiConfig.settings),
    [baseUrl, currentUiConfig],
  );

  const aiometadataPatterns = useMemo(
    () =>
      buildAiometadataUrlPatterns(baseUrl, currentUiConfig.settings, {
        hideCredentials: hideAiometadataCredentials,
        posterIdMode,
        episodeIdMode,
      }),
    [baseUrl, currentUiConfig, episodeIdMode, hideAiometadataCredentials, posterIdMode],
  );

  const proxyUrl = useMemo(
    () => buildProxyUrl(baseUrl, currentUiConfig.proxy, currentUiConfig.settings),
    [baseUrl, currentUiConfig],
  );
  const aiometadataPatternRows = useMemo<AiometadataPatternRow[]>(
    () =>
      aiometadataPatterns
        ? [
            {
              key: 'poster',
              label: 'Poster URL Pattern',
              value: aiometadataPatterns.posterUrlPattern,
              description: 'Auto uses typed TMDB poster IDs for broader coverage. Switch to IMDb only if your setup requires it.',
            },
            {
              key: 'background',
              label: 'Background URL Pattern',
              value: aiometadataPatterns.backgroundUrlPattern,
              description:
                'Matches the live AIOMetadata background preset and prefixes TMDB IDs with {type} to avoid movie versus series collisions.',
            },
            {
              key: 'logo',
              label: 'Logo URL Pattern',
              value: aiometadataPatterns.logoUrlPattern,
              description:
                'Matches the live AIOMetadata logo preset and prefixes TMDB IDs with {type} so TV logos do not collide with movie IDs.',
            },
            {
              key: 'episode',
              label: 'Episode Thumbnail URL Pattern',
              value: aiometadataPatterns.episodeThumbnailUrlPattern,
              description:
                'Matches the live AIOMetadata episode thumb preset and keeps the configured thumbnail scoped artwork, text, rating, and layout settings.',
            },
          ]
        : [],
    [aiometadataPatterns],
  );
  const aiometadataCopyBlock = aiometadataPatternRows
    .map((row) => `${row.label}\n${row.value}`)
    .join('\n\n');

  const visiblePreviewErrorDetails = previewErrored ? previewErrorDetails : '';
  const isConfigStringVisible = Boolean(configString) && showConfigString;
  const isProxyUrlVisible = Boolean(proxyUrl) && proxyUrlVisible;
  const displayedConfigString = configString
    ? (isConfigStringVisible ? configString : maskSensitiveText(configString))
    : '';
  const displayedProxyUrl = proxyUrl
    ? (isProxyUrlVisible ? proxyUrl : maskSensitiveText(proxyUrl))
    : '';

  return {
    aiometadataCopyBlock,
    aiometadataPatternRows,
    aiometadataPatterns,
    configString,
    currentUiConfig,
    displayedConfigString,
    displayedProxyUrl,
    genrePreviewCards,
    handlePreviewImageError,
    handlePreviewImageLoad,
    isConfigStringVisible,
    isProxyUrlVisible,
    previewErrored,
    previewLoaded,
    previewUrl,
    proxyUrl,
    versionStatusNote,
    visiblePreviewErrorDetails,
  };
}
