import { type Dispatch, type SetStateAction } from 'react';
import { type GenreBadgeAnimeGrouping, type GenreBadgeMode, type GenreBadgePosition, type GenreBadgeStyle } from '@/lib/genreBadge';
import { type MediaFeatureBadgeKey } from '@/lib/mediaFeatures';
import { type PosterRatingLayout } from '@/lib/posterLayoutOptions';
import { type QualityBadgeStyle } from '@/lib/ratingAppearance';
import { type QualityBadgesSide, type PosterQualityBadgesPosition, type StreamBadgesSetting } from '@/lib/uiConfig';

type PreviewType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';
type Setter<T> = Dispatch<SetStateAction<T>>;

export function useConfiguratorActiveWorkspaceSettings({
  backdropGenreBadgeAnimeGrouping,
  backdropGenreBadgeMode,
  backdropGenreBadgePosition,
  backdropGenreBadgeScale,
  backdropGenreBadgeStyle,
  backdropQualityBadgePreferences,
  backdropQualityBadgeScale,
  backdropQualityBadgesMax,
  backdropQualityBadgesStyle,
  backdropRatingBadgeScale,
  backdropStreamBadges,
  thumbnailGenreBadgeAnimeGrouping,
  thumbnailGenreBadgeMode,
  thumbnailGenreBadgePosition,
  thumbnailGenreBadgeScale,
  thumbnailGenreBadgeStyle,
  thumbnailQualityBadgePreferences,
  thumbnailQualityBadgeScale,
  thumbnailQualityBadgesMax,
  thumbnailQualityBadgesStyle,
  thumbnailRatingBadgeScale,
  thumbnailStreamBadges,
  logoGenreBadgeAnimeGrouping,
  logoGenreBadgeMode,
  logoGenreBadgePosition,
  logoGenreBadgeScale,
  logoGenreBadgeStyle,
  logoQualityBadgePreferences,
  logoQualityBadgeScale,
  logoQualityBadgesMax,
  logoQualityBadgesStyle,
  logoRatingBadgeScale,
  posterGenreBadgeAnimeGrouping,
  posterGenreBadgeMode,
  posterGenreBadgePosition,
  posterGenreBadgeScale,
  posterGenreBadgeStyle,
  posterQualityBadgePreferences,
  posterQualityBadgeScale,
  posterQualityBadgesMax,
  posterQualityBadgesStyle,
  posterRatingBadgeScale,
  posterRatingsLayout,
  posterStreamBadges,
  previewType,
  setBackdropGenreBadgeAnimeGrouping,
  setBackdropGenreBadgeMode,
  setBackdropGenreBadgePosition,
  setBackdropGenreBadgeScale,
  setBackdropGenreBadgeStyle,
  setBackdropQualityBadgePreferences,
  setBackdropQualityBadgeScale,
  setBackdropQualityBadgesMax,
  setBackdropQualityBadgesStyle,
  setBackdropRatingBadgeScale,
  setBackdropStreamBadges,
  setThumbnailGenreBadgeAnimeGrouping,
  setThumbnailGenreBadgeMode,
  setThumbnailGenreBadgePosition,
  setThumbnailGenreBadgeScale,
  setThumbnailGenreBadgeStyle,
  setThumbnailQualityBadgePreferences,
  setThumbnailQualityBadgeScale,
  setThumbnailQualityBadgesMax,
  setThumbnailQualityBadgesStyle,
  setThumbnailRatingBadgeScale,
  setThumbnailStreamBadges,
  setLogoGenreBadgeAnimeGrouping,
  setLogoGenreBadgeMode,
  setLogoGenreBadgePosition,
  setLogoGenreBadgeScale,
  setLogoGenreBadgeStyle,
  setLogoQualityBadgePreferences,
  setLogoQualityBadgeScale,
  setLogoQualityBadgesMax,
  setLogoQualityBadgesStyle,
  setLogoRatingBadgeScale,
  setPosterGenreBadgeAnimeGrouping,
  setPosterGenreBadgeMode,
  setPosterGenreBadgePosition,
  setPosterGenreBadgeScale,
  setPosterGenreBadgeStyle,
  setPosterQualityBadgePreferences,
  setPosterQualityBadgeScale,
  setPosterQualityBadgesMax,
  setPosterQualityBadgesStyle,
  setPosterRatingBadgeScale,
  setPosterStreamBadges,
}: {
  backdropGenreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  backdropGenreBadgeMode: GenreBadgeMode;
  backdropGenreBadgePosition: GenreBadgePosition;
  backdropGenreBadgeScale: number;
  backdropGenreBadgeStyle: GenreBadgeStyle;
  backdropQualityBadgePreferences: MediaFeatureBadgeKey[];
  backdropQualityBadgeScale: number;
  backdropQualityBadgesMax: number | null;
  backdropQualityBadgesStyle: QualityBadgeStyle;
  backdropRatingBadgeScale: number;
  backdropStreamBadges: StreamBadgesSetting;
  thumbnailGenreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  thumbnailGenreBadgeMode: GenreBadgeMode;
  thumbnailGenreBadgePosition: GenreBadgePosition;
  thumbnailGenreBadgeScale: number;
  thumbnailGenreBadgeStyle: GenreBadgeStyle;
  thumbnailQualityBadgePreferences: MediaFeatureBadgeKey[];
  thumbnailQualityBadgeScale: number;
  thumbnailQualityBadgesMax: number | null;
  thumbnailQualityBadgesStyle: QualityBadgeStyle;
  thumbnailRatingBadgeScale: number;
  thumbnailStreamBadges: StreamBadgesSetting;
  logoGenreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  logoGenreBadgeMode: GenreBadgeMode;
  logoGenreBadgePosition: GenreBadgePosition;
  logoGenreBadgeScale: number;
  logoGenreBadgeStyle: GenreBadgeStyle;
  logoQualityBadgePreferences: MediaFeatureBadgeKey[];
  logoQualityBadgeScale: number;
  logoQualityBadgesMax: number | null;
  logoQualityBadgesStyle: QualityBadgeStyle;
  logoRatingBadgeScale: number;
  posterGenreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  posterGenreBadgeMode: GenreBadgeMode;
  posterGenreBadgePosition: GenreBadgePosition;
  posterGenreBadgeScale: number;
  posterGenreBadgeStyle: GenreBadgeStyle;
  posterQualityBadgePreferences: MediaFeatureBadgeKey[];
  posterQualityBadgeScale: number;
  posterQualityBadgesMax: number | null;
  posterQualityBadgesStyle: QualityBadgeStyle;
  posterRatingBadgeScale: number;
  posterRatingsLayout: PosterRatingLayout;
  posterStreamBadges: StreamBadgesSetting;
  previewType: PreviewType;
  setBackdropGenreBadgeAnimeGrouping: Setter<GenreBadgeAnimeGrouping>;
  setBackdropGenreBadgeMode: Setter<GenreBadgeMode>;
  setBackdropGenreBadgePosition: Setter<GenreBadgePosition>;
  setBackdropGenreBadgeScale: Setter<number>;
  setBackdropGenreBadgeStyle: Setter<GenreBadgeStyle>;
  setBackdropQualityBadgePreferences: Setter<MediaFeatureBadgeKey[]>;
  setBackdropQualityBadgeScale: Setter<number>;
  setBackdropQualityBadgesMax: Setter<number | null>;
  setBackdropQualityBadgesStyle: Setter<QualityBadgeStyle>;
  setBackdropRatingBadgeScale: Setter<number>;
  setBackdropStreamBadges: Setter<StreamBadgesSetting>;
  setThumbnailGenreBadgeAnimeGrouping: Setter<GenreBadgeAnimeGrouping>;
  setThumbnailGenreBadgeMode: Setter<GenreBadgeMode>;
  setThumbnailGenreBadgePosition: Setter<GenreBadgePosition>;
  setThumbnailGenreBadgeScale: Setter<number>;
  setThumbnailGenreBadgeStyle: Setter<GenreBadgeStyle>;
  setThumbnailQualityBadgePreferences: Setter<MediaFeatureBadgeKey[]>;
  setThumbnailQualityBadgeScale: Setter<number>;
  setThumbnailQualityBadgesMax: Setter<number | null>;
  setThumbnailQualityBadgesStyle: Setter<QualityBadgeStyle>;
  setThumbnailRatingBadgeScale: Setter<number>;
  setThumbnailStreamBadges: Setter<StreamBadgesSetting>;
  setLogoGenreBadgeAnimeGrouping: Setter<GenreBadgeAnimeGrouping>;
  setLogoGenreBadgeMode: Setter<GenreBadgeMode>;
  setLogoGenreBadgePosition: Setter<GenreBadgePosition>;
  setLogoGenreBadgeScale: Setter<number>;
  setLogoGenreBadgeStyle: Setter<GenreBadgeStyle>;
  setLogoQualityBadgePreferences: Setter<MediaFeatureBadgeKey[]>;
  setLogoQualityBadgeScale: Setter<number>;
  setLogoQualityBadgesMax: Setter<number | null>;
  setLogoQualityBadgesStyle: Setter<QualityBadgeStyle>;
  setLogoRatingBadgeScale: Setter<number>;
  setPosterGenreBadgeAnimeGrouping: Setter<GenreBadgeAnimeGrouping>;
  setPosterGenreBadgeMode: Setter<GenreBadgeMode>;
  setPosterGenreBadgePosition: Setter<GenreBadgePosition>;
  setPosterGenreBadgeScale: Setter<number>;
  setPosterGenreBadgeStyle: Setter<GenreBadgeStyle>;
  setPosterQualityBadgePreferences: Setter<MediaFeatureBadgeKey[]>;
  setPosterQualityBadgeScale: Setter<number>;
  setPosterQualityBadgesMax: Setter<number | null>;
  setPosterQualityBadgesStyle: Setter<QualityBadgeStyle>;
  setPosterRatingBadgeScale: Setter<number>;
  setPosterStreamBadges: Setter<StreamBadgesSetting>;
}) {
  const shouldShowPosterQualityBadgesSide = posterRatingsLayout === 'top-bottom';
  const shouldShowPosterQualityBadgesPosition =
    posterRatingsLayout === 'top' || posterRatingsLayout === 'bottom';

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
    activeGenreBadgeStyle:
      previewType === 'poster'
        ? posterGenreBadgeStyle
        : previewType === 'backdrop'
          ? backdropGenreBadgeStyle
          : previewType === 'thumbnail'
            ? thumbnailGenreBadgeStyle
          : logoGenreBadgeStyle,
    activeQualityBadgePreferences:
      previewType === 'backdrop'
        ? backdropQualityBadgePreferences
        : previewType === 'thumbnail'
          ? thumbnailQualityBadgePreferences
        : previewType === 'logo'
          ? logoQualityBadgePreferences
          : posterQualityBadgePreferences,
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
    shouldShowQualityBadgesSide:
      previewType === 'poster' && shouldShowPosterQualityBadgesSide,
  };
}
