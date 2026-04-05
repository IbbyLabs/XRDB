import { type Dispatch, type SetStateAction } from 'react';
import { type GenreBadgeAnimeGrouping, type GenreBadgeMode, type GenreBadgePosition, type GenreBadgeStyle } from '@/lib/genreBadge';
import { type MediaFeatureBadgeKey, type RemuxDisplayMode } from '@/lib/mediaFeatures';
import { type PosterRatingLayout } from '@/lib/posterLayoutOptions';
import {
  getSupportedPosterAgeRatingBadgePositions,
  hasNonCertificationQualityBadgePreferences,
  resolveQualityBadgePlacementControlMode,
  supportsPosterAgeRatingBadgePlacement,
} from '@/lib/qualityBadgeControls';
import { type QualityBadgeStyle } from '@/lib/ratingAppearance';
import {
  type AgeRatingBadgePosition,
  type QualityBadgesSide,
  type PosterQualityBadgesPosition,
  type StreamBadgesSetting,
} from '@/lib/uiConfig';

type PreviewType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';
type Setter<T> = Dispatch<SetStateAction<T>>;

export function useConfiguratorActiveWorkspaceSettings({
  backdropGenreBadgeAnimeGrouping,
  backdropGenreBadgeMode,
  backdropGenreBadgePosition,
  backdropGenreBadgeScale,
  backdropGenreBadgeBorderWidth,
  backdropGenreBadgeStyle,
  backdropQualityBadgePreferences,
  backdropQualityBadgeScale,
  backdropQualityBadgesMax,
  backdropQualityBadgesStyle,
  backdropRatingBadgeScale,
  backdropRemuxDisplayMode,
  backdropStreamBadges,
  thumbnailGenreBadgeAnimeGrouping,
  thumbnailGenreBadgeMode,
  thumbnailGenreBadgePosition,
  thumbnailGenreBadgeScale,
  thumbnailGenreBadgeBorderWidth,
  thumbnailGenreBadgeStyle,
  thumbnailQualityBadgePreferences,
  thumbnailQualityBadgeScale,
  thumbnailQualityBadgesMax,
  thumbnailQualityBadgesStyle,
  thumbnailRatingBadgeScale,
  thumbnailRemuxDisplayMode,
  thumbnailStreamBadges,
  logoGenreBadgeAnimeGrouping,
  logoGenreBadgeMode,
  logoGenreBadgePosition,
  logoGenreBadgeScale,
  logoGenreBadgeBorderWidth,
  logoGenreBadgeStyle,
  logoQualityBadgePreferences,
  logoQualityBadgeScale,
  logoQualityBadgesMax,
  logoQualityBadgesStyle,
  logoRatingBadgeScale,
  logoRemuxDisplayMode,
  posterGenreBadgeAnimeGrouping,
  posterGenreBadgeMode,
  posterGenreBadgePosition,
  posterGenreBadgeScale,
  posterGenreBadgeBorderWidth,
  posterGenreBadgeStyle,
  posterQualityBadgePreferences,
  posterQualityBadgeScale,
  posterQualityBadgesMax,
  ageRatingBadgePosition,
  posterQualityBadgesStyle,
  posterRatingBadgeScale,
  posterRatingsLayout,
  posterRemuxDisplayMode,
  posterStreamBadges,
  previewType,
  setBackdropGenreBadgeAnimeGrouping,
  setBackdropGenreBadgeMode,
  setBackdropGenreBadgePosition,
  setBackdropGenreBadgeScale,
  setBackdropGenreBadgeBorderWidth,
  setBackdropGenreBadgeStyle,
  setBackdropQualityBadgePreferences,
  setBackdropQualityBadgeScale,
  setBackdropQualityBadgesMax,
  setBackdropQualityBadgesStyle,
  setBackdropRatingBadgeScale,
  setBackdropRemuxDisplayMode,
  setBackdropStreamBadges,
  setThumbnailGenreBadgeAnimeGrouping,
  setThumbnailGenreBadgeMode,
  setThumbnailGenreBadgePosition,
  setThumbnailGenreBadgeScale,
  setThumbnailGenreBadgeBorderWidth,
  setThumbnailGenreBadgeStyle,
  setThumbnailQualityBadgePreferences,
  setThumbnailQualityBadgeScale,
  setThumbnailQualityBadgesMax,
  setThumbnailQualityBadgesStyle,
  setThumbnailRatingBadgeScale,
  setThumbnailRemuxDisplayMode,
  setThumbnailStreamBadges,
  setLogoGenreBadgeAnimeGrouping,
  setLogoGenreBadgeMode,
  setLogoGenreBadgePosition,
  setLogoGenreBadgeScale,
  setLogoGenreBadgeBorderWidth,
  setLogoGenreBadgeStyle,
  setLogoQualityBadgePreferences,
  setLogoQualityBadgeScale,
  setLogoQualityBadgesMax,
  setLogoQualityBadgesStyle,
  setLogoRatingBadgeScale,
  setLogoRemuxDisplayMode,
  setPosterGenreBadgeAnimeGrouping,
  setPosterGenreBadgeMode,
  setPosterGenreBadgePosition,
  setPosterGenreBadgeScale,
  setPosterGenreBadgeBorderWidth,
  setPosterGenreBadgeStyle,
  setPosterQualityBadgePreferences,
  setPosterQualityBadgeScale,
  setPosterQualityBadgesMax,
  setAgeRatingBadgePosition,
  setPosterQualityBadgesStyle,
  setPosterRatingBadgeScale,
  setPosterRemuxDisplayMode,
  setPosterStreamBadges,
}: {
  backdropGenreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  backdropGenreBadgeMode: GenreBadgeMode;
  backdropGenreBadgePosition: GenreBadgePosition;
  backdropGenreBadgeScale: number;
  backdropGenreBadgeBorderWidth: number;
  backdropGenreBadgeStyle: GenreBadgeStyle;
  backdropQualityBadgePreferences: MediaFeatureBadgeKey[];
  backdropQualityBadgeScale: number;
  backdropQualityBadgesMax: number | null;
  backdropQualityBadgesStyle: QualityBadgeStyle;
  backdropRatingBadgeScale: number;
  backdropRemuxDisplayMode: RemuxDisplayMode;
  backdropStreamBadges: StreamBadgesSetting;
  thumbnailGenreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  thumbnailGenreBadgeMode: GenreBadgeMode;
  thumbnailGenreBadgePosition: GenreBadgePosition;
  thumbnailGenreBadgeScale: number;
  thumbnailGenreBadgeBorderWidth: number;
  thumbnailGenreBadgeStyle: GenreBadgeStyle;
  thumbnailQualityBadgePreferences: MediaFeatureBadgeKey[];
  thumbnailQualityBadgeScale: number;
  thumbnailQualityBadgesMax: number | null;
  thumbnailQualityBadgesStyle: QualityBadgeStyle;
  thumbnailRatingBadgeScale: number;
  thumbnailRemuxDisplayMode: RemuxDisplayMode;
  thumbnailStreamBadges: StreamBadgesSetting;
  logoGenreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  logoGenreBadgeMode: GenreBadgeMode;
  logoGenreBadgePosition: GenreBadgePosition;
  logoGenreBadgeScale: number;
  logoGenreBadgeBorderWidth: number;
  logoGenreBadgeStyle: GenreBadgeStyle;
  logoQualityBadgePreferences: MediaFeatureBadgeKey[];
  logoQualityBadgeScale: number;
  logoQualityBadgesMax: number | null;
  logoQualityBadgesStyle: QualityBadgeStyle;
  logoRatingBadgeScale: number;
  logoRemuxDisplayMode: RemuxDisplayMode;
  posterGenreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  posterGenreBadgeMode: GenreBadgeMode;
  posterGenreBadgePosition: GenreBadgePosition;
  posterGenreBadgeScale: number;
  posterGenreBadgeBorderWidth: number;
  posterGenreBadgeStyle: GenreBadgeStyle;
  posterQualityBadgePreferences: MediaFeatureBadgeKey[];
  posterQualityBadgeScale: number;
  posterQualityBadgesMax: number | null;
  ageRatingBadgePosition: AgeRatingBadgePosition;
  posterQualityBadgesStyle: QualityBadgeStyle;
  posterRatingBadgeScale: number;
  posterRatingsLayout: PosterRatingLayout;
  posterRemuxDisplayMode: RemuxDisplayMode;
  posterStreamBadges: StreamBadgesSetting;
  previewType: PreviewType;
  setBackdropGenreBadgeAnimeGrouping: Setter<GenreBadgeAnimeGrouping>;
  setBackdropGenreBadgeMode: Setter<GenreBadgeMode>;
  setBackdropGenreBadgePosition: Setter<GenreBadgePosition>;
  setBackdropGenreBadgeScale: Setter<number>;
  setBackdropGenreBadgeBorderWidth: Setter<number>;
  setBackdropGenreBadgeStyle: Setter<GenreBadgeStyle>;
  setBackdropQualityBadgePreferences: Setter<MediaFeatureBadgeKey[]>;
  setBackdropQualityBadgeScale: Setter<number>;
  setBackdropQualityBadgesMax: Setter<number | null>;
  setBackdropQualityBadgesStyle: Setter<QualityBadgeStyle>;
  setBackdropRatingBadgeScale: Setter<number>;
  setBackdropRemuxDisplayMode: Setter<RemuxDisplayMode>;
  setBackdropStreamBadges: Setter<StreamBadgesSetting>;
  setThumbnailGenreBadgeAnimeGrouping: Setter<GenreBadgeAnimeGrouping>;
  setThumbnailGenreBadgeMode: Setter<GenreBadgeMode>;
  setThumbnailGenreBadgePosition: Setter<GenreBadgePosition>;
  setThumbnailGenreBadgeScale: Setter<number>;
  setThumbnailGenreBadgeBorderWidth: Setter<number>;
  setThumbnailGenreBadgeStyle: Setter<GenreBadgeStyle>;
  setThumbnailQualityBadgePreferences: Setter<MediaFeatureBadgeKey[]>;
  setThumbnailQualityBadgeScale: Setter<number>;
  setThumbnailQualityBadgesMax: Setter<number | null>;
  setThumbnailQualityBadgesStyle: Setter<QualityBadgeStyle>;
  setThumbnailRatingBadgeScale: Setter<number>;
  setThumbnailRemuxDisplayMode: Setter<RemuxDisplayMode>;
  setThumbnailStreamBadges: Setter<StreamBadgesSetting>;
  setLogoGenreBadgeAnimeGrouping: Setter<GenreBadgeAnimeGrouping>;
  setLogoGenreBadgeMode: Setter<GenreBadgeMode>;
  setLogoGenreBadgePosition: Setter<GenreBadgePosition>;
  setLogoGenreBadgeScale: Setter<number>;
  setLogoGenreBadgeBorderWidth: Setter<number>;
  setLogoGenreBadgeStyle: Setter<GenreBadgeStyle>;
  setLogoQualityBadgePreferences: Setter<MediaFeatureBadgeKey[]>;
  setLogoQualityBadgeScale: Setter<number>;
  setLogoQualityBadgesMax: Setter<number | null>;
  setLogoQualityBadgesStyle: Setter<QualityBadgeStyle>;
  setLogoRatingBadgeScale: Setter<number>;
  setLogoRemuxDisplayMode: Setter<RemuxDisplayMode>;
  setPosterGenreBadgeAnimeGrouping: Setter<GenreBadgeAnimeGrouping>;
  setPosterGenreBadgeMode: Setter<GenreBadgeMode>;
  setPosterGenreBadgePosition: Setter<GenreBadgePosition>;
  setPosterGenreBadgeScale: Setter<number>;
  setPosterGenreBadgeBorderWidth: Setter<number>;
  setPosterGenreBadgeStyle: Setter<GenreBadgeStyle>;
  setPosterQualityBadgePreferences: Setter<MediaFeatureBadgeKey[]>;
  setPosterQualityBadgeScale: Setter<number>;
  setPosterQualityBadgesMax: Setter<number | null>;
  setAgeRatingBadgePosition: Setter<AgeRatingBadgePosition>;
  setPosterQualityBadgesStyle: Setter<QualityBadgeStyle>;
  setPosterRatingBadgeScale: Setter<number>;
  setPosterRemuxDisplayMode: Setter<RemuxDisplayMode>;
  setPosterStreamBadges: Setter<StreamBadgesSetting>;
}) {
  const activeQualityBadgePreferences =
    previewType === 'backdrop'
      ? backdropQualityBadgePreferences
      : previewType === 'thumbnail'
        ? thumbnailQualityBadgePreferences
        : previewType === 'logo'
          ? logoQualityBadgePreferences
          : posterQualityBadgePreferences;
  const qualityBadgePlacementControlMode = resolveQualityBadgePlacementControlMode(
    previewType,
    posterRatingsLayout,
  );
  const shouldShowPosterQualityBadgesSide = qualityBadgePlacementControlMode === 'side';
  const shouldShowPosterQualityBadgesPosition = qualityBadgePlacementControlMode === 'position';
  const shouldShowPosterAgeRatingBadgePosition =
    previewType === 'poster' && supportsPosterAgeRatingBadgePlacement(posterRatingsLayout);
  const ageRatingBadgePositionOptions =
    previewType === 'poster'
      ? getSupportedPosterAgeRatingBadgePositions(posterRatingsLayout)
      : [];
  const hasNonCertificationQualityBadges = hasNonCertificationQualityBadgePreferences(
    activeQualityBadgePreferences,
  );

  return {
    activeGenreBadgeAnimeGrouping:
      previewType === 'poster'
        ? posterGenreBadgeAnimeGrouping
        : previewType === 'backdrop'
          ? backdropGenreBadgeAnimeGrouping
          : previewType === 'thumbnail'
            ? thumbnailGenreBadgeAnimeGrouping
          : logoGenreBadgeAnimeGrouping,
    activeGenreBadgeMode:
      previewType === 'poster'
        ? posterGenreBadgeMode
        : previewType === 'backdrop'
          ? backdropGenreBadgeMode
          : previewType === 'thumbnail'
            ? thumbnailGenreBadgeMode
          : logoGenreBadgeMode,
    activeGenreBadgePosition:
      previewType === 'poster'
        ? posterGenreBadgePosition
        : previewType === 'backdrop'
          ? backdropGenreBadgePosition
          : previewType === 'thumbnail'
            ? thumbnailGenreBadgePosition
          : logoGenreBadgePosition,
    activeGenreBadgeScale:
      previewType === 'poster'
        ? posterGenreBadgeScale
        : previewType === 'backdrop'
          ? backdropGenreBadgeScale
          : previewType === 'thumbnail'
            ? thumbnailGenreBadgeScale
          : logoGenreBadgeScale,
    activeGenreBadgeBorderWidth:
      previewType === 'poster'
        ? posterGenreBadgeBorderWidth
        : previewType === 'backdrop'
          ? backdropGenreBadgeBorderWidth
          : previewType === 'thumbnail'
            ? thumbnailGenreBadgeBorderWidth
            : logoGenreBadgeBorderWidth,
    activeGenreBadgeStyle:
      previewType === 'poster'
        ? posterGenreBadgeStyle
        : previewType === 'backdrop'
          ? backdropGenreBadgeStyle
          : previewType === 'thumbnail'
            ? thumbnailGenreBadgeStyle
          : logoGenreBadgeStyle,
    activeQualityBadgePreferences,
    activeQualityBadgeScale:
      previewType === 'backdrop'
        ? backdropQualityBadgeScale
        : previewType === 'thumbnail'
          ? thumbnailQualityBadgeScale
        : previewType === 'logo'
          ? logoQualityBadgeScale
          : posterQualityBadgeScale,
    activeQualityBadgesMax:
      previewType === 'backdrop'
        ? backdropQualityBadgesMax
        : previewType === 'thumbnail'
          ? thumbnailQualityBadgesMax
        : previewType === 'logo'
          ? logoQualityBadgesMax
          : posterQualityBadgesMax,
    activeQualityBadgesStyle:
      previewType === 'backdrop'
        ? backdropQualityBadgesStyle
        : previewType === 'thumbnail'
          ? thumbnailQualityBadgesStyle
        : previewType === 'logo'
          ? logoQualityBadgesStyle
          : posterQualityBadgesStyle,
    activeAgeRatingBadgePosition: ageRatingBadgePosition,
    ageRatingBadgePositionOptions,
    hasNonCertificationQualityBadges,
    activeRemuxDisplayMode:
      previewType === 'backdrop'
        ? backdropRemuxDisplayMode
        : previewType === 'thumbnail'
          ? thumbnailRemuxDisplayMode
        : previewType === 'logo'
          ? logoRemuxDisplayMode
          : posterRemuxDisplayMode,
    activeRatingBadgeScale:
      previewType === 'poster'
        ? posterRatingBadgeScale
        : previewType === 'backdrop'
          ? backdropRatingBadgeScale
          : previewType === 'thumbnail'
            ? thumbnailRatingBadgeScale
          : logoRatingBadgeScale,
    activeStreamBadges:
      previewType === 'backdrop'
        ? backdropStreamBadges
        : previewType === 'thumbnail'
          ? thumbnailStreamBadges
          : posterStreamBadges,
    qualityBadgeTypeLabel:
      previewType === 'backdrop'
        ? 'Backdrop'
        : previewType === 'thumbnail'
          ? 'Thumbnail'
          : previewType === 'logo'
            ? 'Logo'
            : 'Poster',
    qualityBadgePlacementControlMode,
    setActiveGenreBadgeAnimeGrouping:
      previewType === 'poster'
        ? setPosterGenreBadgeAnimeGrouping
        : previewType === 'backdrop'
          ? setBackdropGenreBadgeAnimeGrouping
          : previewType === 'thumbnail'
            ? setThumbnailGenreBadgeAnimeGrouping
          : setLogoGenreBadgeAnimeGrouping,
    setActiveGenreBadgeMode:
      previewType === 'poster'
        ? setPosterGenreBadgeMode
        : previewType === 'backdrop'
          ? setBackdropGenreBadgeMode
          : previewType === 'thumbnail'
            ? setThumbnailGenreBadgeMode
          : setLogoGenreBadgeMode,
    setActiveGenreBadgePosition:
      previewType === 'poster'
        ? setPosterGenreBadgePosition
        : previewType === 'backdrop'
          ? setBackdropGenreBadgePosition
          : previewType === 'thumbnail'
            ? setThumbnailGenreBadgePosition
          : setLogoGenreBadgePosition,
    setActiveGenreBadgeScale:
      previewType === 'poster'
        ? setPosterGenreBadgeScale
        : previewType === 'backdrop'
          ? setBackdropGenreBadgeScale
          : previewType === 'thumbnail'
            ? setThumbnailGenreBadgeScale
          : setLogoGenreBadgeScale,
    setActiveGenreBadgeBorderWidth:
      previewType === 'poster'
        ? setPosterGenreBadgeBorderWidth
        : previewType === 'backdrop'
          ? setBackdropGenreBadgeBorderWidth
          : previewType === 'thumbnail'
            ? setThumbnailGenreBadgeBorderWidth
            : setLogoGenreBadgeBorderWidth,
    setActiveGenreBadgeStyle:
      previewType === 'poster'
        ? setPosterGenreBadgeStyle
        : previewType === 'backdrop'
          ? setBackdropGenreBadgeStyle
          : previewType === 'thumbnail'
            ? setThumbnailGenreBadgeStyle
          : setLogoGenreBadgeStyle,
    setActiveQualityBadgePreferences:
      previewType === 'backdrop'
        ? setBackdropQualityBadgePreferences
        : previewType === 'thumbnail'
          ? setThumbnailQualityBadgePreferences
        : previewType === 'logo'
          ? setLogoQualityBadgePreferences
          : setPosterQualityBadgePreferences,
    setActiveQualityBadgeScale:
      previewType === 'backdrop'
        ? setBackdropQualityBadgeScale
        : previewType === 'thumbnail'
          ? setThumbnailQualityBadgeScale
        : previewType === 'logo'
          ? setLogoQualityBadgeScale
          : setPosterQualityBadgeScale,
    setActiveQualityBadgesMax:
      previewType === 'backdrop'
        ? setBackdropQualityBadgesMax
        : previewType === 'thumbnail'
          ? setThumbnailQualityBadgesMax
        : previewType === 'logo'
          ? setLogoQualityBadgesMax
          : setPosterQualityBadgesMax,
    setActiveQualityBadgesStyle:
      previewType === 'backdrop'
        ? setBackdropQualityBadgesStyle
        : previewType === 'thumbnail'
          ? setThumbnailQualityBadgesStyle
        : previewType === 'logo'
          ? setLogoQualityBadgesStyle
          : setPosterQualityBadgesStyle,
    setActiveAgeRatingBadgePosition: setAgeRatingBadgePosition,
    setActiveRemuxDisplayMode:
      previewType === 'backdrop'
        ? setBackdropRemuxDisplayMode
        : previewType === 'thumbnail'
          ? setThumbnailRemuxDisplayMode
        : previewType === 'logo'
          ? setLogoRemuxDisplayMode
          : setPosterRemuxDisplayMode,
    setActiveRatingBadgeScale:
      previewType === 'poster'
        ? setPosterRatingBadgeScale
        : previewType === 'backdrop'
          ? setBackdropRatingBadgeScale
          : previewType === 'thumbnail'
            ? setThumbnailRatingBadgeScale
          : setLogoRatingBadgeScale,
    setActiveStreamBadges:
      previewType === 'backdrop'
        ? setBackdropStreamBadges
        : previewType === 'thumbnail'
          ? setThumbnailStreamBadges
          : setPosterStreamBadges,
    shouldShowQualityBadgesPosition:
      previewType === 'poster' && shouldShowPosterQualityBadgesPosition,
    shouldShowAgeRatingBadgePosition: shouldShowPosterAgeRatingBadgePosition,
    shouldShowQualityBadgesSide:
      previewType === 'poster' && shouldShowPosterQualityBadgesSide,
  };
}
