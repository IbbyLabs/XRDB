import { QUALITY_BADGE_OPTIONS } from './badgeCustomization.ts';
import { type PosterRatingLayout } from './posterLayoutOptions.ts';
import { type AgeRatingBadgePosition } from './uiConfig.ts';

type PreviewType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';

export type QualityBadgePreferenceId = (typeof QUALITY_BADGE_OPTIONS)[number]['id'];
export type QualityBadgePlacementControlMode = 'side' | 'position';

const ALL_QUALITY_BADGE_PREFERENCE_IDS = QUALITY_BADGE_OPTIONS.map(({ id }) => id);
const NON_CERTIFICATION_QUALITY_BADGE_PREFERENCE_IDS = ALL_QUALITY_BADGE_PREFERENCE_IDS.filter(
  (id) => id !== 'certification'
);
const AGE_RATING_BADGE_POSITIONS_BY_LAYOUT = {
  top: [
    'top-left',
    'top-center',
    'top-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
  ],
  bottom: [
    'top-left',
    'top-center',
    'top-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
  ],
  'top-bottom': [
    'top-left',
    'top-center',
    'top-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
  ],
  left: [
    'left-top',
    'left-center',
    'left-bottom',
    'right-top',
    'right-center',
    'right-bottom',
  ],
  right: [
    'left-top',
    'left-center',
    'left-bottom',
    'right-top',
    'right-center',
    'right-bottom',
  ],
  'left-right': [
    'top-left',
    'top-center',
    'top-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
    'left-top',
    'left-center',
    'left-bottom',
    'right-top',
    'right-center',
    'right-bottom',
  ],
} satisfies Record<PosterRatingLayout, AgeRatingBadgePosition[]>;

export const resolveQualityBadgePlacementControlMode = (
  previewType: PreviewType,
  posterRatingsLayout: PosterRatingLayout,
): QualityBadgePlacementControlMode | null => {
  if (previewType !== 'poster') {
    return null;
  }
  if (posterRatingsLayout === 'top-bottom') {
    return 'side';
  }
  if (posterRatingsLayout === 'top' || posterRatingsLayout === 'bottom') {
    return 'position';
  }
  return null;
};

export const supportsPosterAgeRatingBadgePlacement = (
  posterRatingsLayout: PosterRatingLayout,
) => AGE_RATING_BADGE_POSITIONS_BY_LAYOUT[posterRatingsLayout].length > 0;

export const getSupportedPosterAgeRatingBadgePositions = (
  posterRatingsLayout: PosterRatingLayout,
): AgeRatingBadgePosition[] => [...AGE_RATING_BADGE_POSITIONS_BY_LAYOUT[posterRatingsLayout]];

export const isSupportedPosterAgeRatingBadgePosition = (
  posterRatingsLayout: PosterRatingLayout,
  position: AgeRatingBadgePosition,
) =>
  position === 'inherit' ||
  AGE_RATING_BADGE_POSITIONS_BY_LAYOUT[posterRatingsLayout].some((candidate) => candidate === position);

export const hasNonCertificationQualityBadgePreferences = (
  preferences: QualityBadgePreferenceId[],
) =>
  preferences.some((preference) =>
    NON_CERTIFICATION_QUALITY_BADGE_PREFERENCE_IDS.some((candidate) => candidate === preference),
  );

export const getAllQualityBadgePreferenceIds = (): QualityBadgePreferenceId[] => [
  ...ALL_QUALITY_BADGE_PREFERENCE_IDS,
];