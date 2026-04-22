export type CommunityBadgeTheme = 'gold' | 'white' | 'rainbow' | 'black';

export const DEFAULT_COMMUNITY_BADGE_THEME: CommunityBadgeTheme = 'gold';

const communityBadgeThemeCatalog: Array<[CommunityBadgeTheme, string]> = [
  ['gold', 'Gold'],
  ['white', 'White'],
  ['rainbow', 'Rainbow'],
  ['black', 'Black'],
];

export const COMMUNITY_BADGE_THEME_OPTIONS: Array<{ id: CommunityBadgeTheme; label: string }> =
  communityBadgeThemeCatalog.map(([id, label]) => ({ id, label }));

const communityBadgeThemeIds = new Set<CommunityBadgeTheme>(
  communityBadgeThemeCatalog.map(([id]) => id),
);

export const normalizeCommunityBadgeTheme = (value?: string | null): CommunityBadgeTheme => {
  const token = String(value ?? '').trim().toLowerCase();
  return communityBadgeThemeIds.has(token as CommunityBadgeTheme)
    ? (token as CommunityBadgeTheme)
    : DEFAULT_COMMUNITY_BADGE_THEME;
};
