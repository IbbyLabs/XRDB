import { QUALITY_BADGE_OPTIONS } from './badgeCustomization.ts';
import { type PosterRatingLayout } from './posterLayoutOptions.ts';

type PreviewType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';

export type QualityBadgePreferenceId = (typeof QUALITY_BADGE_OPTIONS)[number]['id'];
export type QualityBadgePlacementControlMode = 'side' | 'position';

const ALL_QUALITY_BADGE_PREFERENCE_IDS = QUALITY_BADGE_OPTIONS.map(({ id }) => id);

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

export const getAllQualityBadgePreferenceIds = (): QualityBadgePreferenceId[] => [
  ...ALL_QUALITY_BADGE_PREFERENCE_IDS,
];