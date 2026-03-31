import type { EpisodeIdMode } from './episodeIdentity.ts';
import type { MetadataTranslationMode } from './metadataTranslation.ts';

export type ProxyImageType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';

const SHARED_IMAGE_QUERY_KEYS = [
  'fanartKey',
  'ratings',
  'order',
  'ratingOrder',
  'lang',
  'secLang',
  'ratingBarPos',
  'fontScale',
  'textless',
  'imageSize',
  'posterType',
  'ratingValueMode',
  'tmdbIdScope',
  'genreBadge',
  'genreBadgeStyle',
  'genreBadgePosition',
  'genreBadgeScale',
  'genreBadgeAnimeGrouping',
  'streamBadges',
  'qualityBadgesSide',
  'posterQualityBadgesPosition',
  'qualityBadgesStyle',
  'providerAppearance',
  'ratingPresentation',
  'aggregateRatingSource',
  'aggregateAccentMode',
  'aggregateAccentColor',
  'aggregateCriticsAccentColor',
  'aggregateAudienceAccentColor',
  'aggregateAccentBarOffset',
  'aggregateAccentBarVisible',
  'posterRatingsLayout',
  'posterRatingsMax',
  'posterRatingsMaxPerSide',
  'posterEdgeOffset',
  'backdropRatingsLayout',
  'backdropRatingsMax',
  'posterSideRatingsPosition',
  'posterSideRatingsOffset',
  'backdropSideRatingsPosition',
  'backdropSideRatingsOffset',
  'sideRatingsPosition',
  'sideRatingsOffset',
] as const;

const IMAGE_QUERY_KEYS_BY_TYPE = {
  poster: [
    'posterImageSize',
    'posterGenreBadge',
    'posterGenreBadgeStyle',
    'posterGenreBadgePosition',
    'posterGenreBadgeScale',
    'posterGenreBadgeAnimeGrouping',
    'posterStreamBadges',
    'posterQualityBadges',
    'posterQualityBadgesStyle',
    'posterQualityBadgeScale',
    'posterQualityBadgesMax',
    'posterRatings',
    'posterRatingBadgeScale',
    'posterRatingPresentation',
    'posterAggregateRatingSource',
    'posterArtworkSource',
  ],
  backdrop: [
    'backdropGenreBadge',
    'backdropGenreBadgeStyle',
    'backdropGenreBadgePosition',
    'backdropGenreBadgeScale',
    'backdropGenreBadgeAnimeGrouping',
    'backdropStreamBadges',
    'backdropQualityBadges',
    'backdropQualityBadgesStyle',
    'backdropQualityBadgeScale',
    'backdropQualityBadgesMax',
    'backdropRatings',
    'backdropRatingBadgeScale',
    'backdropRatingPresentation',
    'backdropAggregateRatingSource',
    'backdropArtworkSource',
  ],
  thumbnail: [
    'backdropGenreBadge',
    'backdropGenreBadgeStyle',
    'backdropGenreBadgePosition',
    'backdropGenreBadgeScale',
    'backdropGenreBadgeAnimeGrouping',
    'backdropStreamBadges',
    'backdropQualityBadges',
    'backdropQualityBadgesStyle',
    'backdropQualityBadgeScale',
    'backdropQualityBadgesMax',
    'thumbnailRatings',
    'backdropRatingBadgeScale',
    'backdropRatingPresentation',
    'backdropAggregateRatingSource',
    'backdropArtworkSource',
    'backdropRatingsLayout',
    'backdropRatingsMax',
    'backdropSideRatingsPosition',
    'backdropSideRatingsOffset',
  ],
  logo: [
    'logoGenreBadge',
    'logoGenreBadgeStyle',
    'logoGenreBadgePosition',
    'logoGenreBadgeScale',
    'logoGenreBadgeAnimeGrouping',
    'logoRatings',
    'logoRatingsMax',
    'logoBackground',
    'logoRatingPresentation',
    'logoAggregateRatingSource',
    'logoArtworkSource',
    'logoRatingBadgeScale',
  ],
} as const;

const STYLE_QUERY_KEYS_BY_TYPE = {
  poster: {
    ratingStyle: ['posterRatingStyle', 'posterRatingsStyle', 'ratingStyle', 'ratingsStyle'],
    imageText: ['posterImageText', 'imageText'],
  },
  backdrop: {
    ratingStyle: ['backdropRatingStyle', 'backdropRatingsStyle', 'ratingStyle', 'ratingsStyle'],
    imageText: ['backdropImageText', 'imageText'],
  },
  thumbnail: {
    ratingStyle: ['backdropRatingStyle', 'backdropRatingsStyle', 'ratingStyle', 'ratingsStyle'],
    imageText: ['backdropImageText', 'imageText'],
  },
  logo: {
    ratingStyle: ['logoRatingStyle', 'logoRatingsStyle', 'ratingStyle', 'ratingsStyle'],
    imageText: [],
  },
} as const;

export type ProxyConfig = {
  url: string;
  xrdbKey?: string;
  tmdbKey: string;
  mdblistKey: string;
  catalogPlan?: string;
  simklClientId?: string;
  fanartKey?: string;
  translateMeta?: boolean;
  translateMetaMode?: MetadataTranslationMode;
  episodeIdMode?: EpisodeIdMode;
  debugMetaTranslation?: boolean;
  ratings?: string;
  order?: string;
  ratingOrder?: string;
  posterRatings?: string;
  backdropRatings?: string;
  thumbnailRatings?: string;
  logoRatings?: string;
  lang?: string;
  secLang?: string;
  ratingBarPos?: string;
  fontScale?: string;
  textless?: string;
  imageSize?: string;
  posterType?: string;
  ratingValueMode?: string;
  tmdbIdScope?: string;
  genreBadge?: string;
  genreBadgeStyle?: string;
  genreBadgePosition?: string;
  genreBadgeScale?: string;
  genreBadgeAnimeGrouping?: string;
  posterGenreBadge?: string;
  backdropGenreBadge?: string;
  logoGenreBadge?: string;
  posterGenreBadgeStyle?: string;
  backdropGenreBadgeStyle?: string;
  logoGenreBadgeStyle?: string;
  posterGenreBadgePosition?: string;
  backdropGenreBadgePosition?: string;
  logoGenreBadgePosition?: string;
  posterGenreBadgeScale?: string;
  backdropGenreBadgeScale?: string;
  logoGenreBadgeScale?: string;
  posterGenreBadgeAnimeGrouping?: string;
  backdropGenreBadgeAnimeGrouping?: string;
  logoGenreBadgeAnimeGrouping?: string;
  streamBadges?: string;
  posterStreamBadges?: string;
  backdropStreamBadges?: string;
  qualityBadgesSide?: string;
  posterQualityBadgesPosition?: string;
  qualityBadgesStyle?: string;
  providerAppearance?: string;
  ratingPresentation?: string;
  aggregateRatingSource?: string;
  aggregateAccentMode?: string;
  aggregateAccentColor?: string;
  aggregateCriticsAccentColor?: string;
  aggregateAudienceAccentColor?: string;
  aggregateAccentBarOffset?: string;
  aggregateAccentBarVisible?: string;
  posterQualityBadges?: string;
  posterQualityBadgesStyle?: string;
  posterQualityBadgeScale?: string;
  backdropQualityBadges?: string;
  backdropQualityBadgesStyle?: string;
  backdropQualityBadgeScale?: string;
  posterQualityBadgesMax?: string;
  backdropQualityBadgesMax?: string;
  ratingStyle?: string;
  ratingsStyle?: string;
  imageText?: string;
  posterRatingBadgeScale?: string;
  backdropRatingBadgeScale?: string;
  logoRatingBadgeScale?: string;
  posterRatingStyle?: string;
  posterRatingsStyle?: string;
  backdropRatingStyle?: string;
  backdropRatingsStyle?: string;
  logoRatingStyle?: string;
  logoRatingsStyle?: string;
  posterRatingPresentation?: string;
  backdropRatingPresentation?: string;
  logoRatingPresentation?: string;
  posterAggregateRatingSource?: string;
  backdropAggregateRatingSource?: string;
  logoAggregateRatingSource?: string;
  posterImageText?: string;
  posterImageSize?: string;
  backdropImageText?: string;
  posterArtworkSource?: string;
  backdropArtworkSource?: string;
  logoArtworkSource?: string;
  posterCleanSource?: string;
  backdropCleanSource?: string;
  posterRatingsLayout?: string;
  posterRatingsMax?: string;
  posterRatingsMaxPerSide?: string;
  posterEdgeOffset?: string;
  backdropRatingsLayout?: string;
  backdropRatingsMax?: string;
  posterSideRatingsPosition?: string;
  posterSideRatingsOffset?: string;
  backdropSideRatingsPosition?: string;
  backdropSideRatingsOffset?: string;
  sideRatingsPosition?: string;
  sideRatingsOffset?: string;
  logoRatingsMax?: string;
  logoBackground?: string;
  logoSource?: string;
  xrdbBase?: string;
  posterEnabled?: boolean;
  backdropEnabled?: boolean;
  thumbnailEnabled?: boolean;
  logoEnabled?: boolean;
};

const ALL_OPTIONAL_IMAGE_QUERY_KEYS = [
  ...SHARED_IMAGE_QUERY_KEYS,
  ...IMAGE_QUERY_KEYS_BY_TYPE.poster,
  ...IMAGE_QUERY_KEYS_BY_TYPE.backdrop,
  ...IMAGE_QUERY_KEYS_BY_TYPE.thumbnail,
  ...IMAGE_QUERY_KEYS_BY_TYPE.logo,
] as const;

const CONFIG_STRING_KEYS = [
  'translateMetaMode',
  'episodeIdMode',
  'xrdbKey',
  'simklClientId',
  'fanartKey',
  'ratings',
  'order',
  'ratingOrder',
  'posterRatings',
  'backdropRatings',
  'thumbnailRatings',
  'logoRatings',
  'lang',
  'secLang',
  'ratingBarPos',
  'fontScale',
  'textless',
  'imageSize',
  'posterType',
  'ratingValueMode',
  'tmdbIdScope',
  'genreBadge',
  'genreBadgeStyle',
  'genreBadgePosition',
  'genreBadgeScale',
  'posterGenreBadge',
  'backdropGenreBadge',
  'logoGenreBadge',
  'posterGenreBadgeStyle',
  'backdropGenreBadgeStyle',
  'logoGenreBadgeStyle',
  'posterGenreBadgePosition',
  'backdropGenreBadgePosition',
  'logoGenreBadgePosition',
  'posterGenreBadgeScale',
  'backdropGenreBadgeScale',
  'logoGenreBadgeScale',
  'posterGenreBadgeAnimeGrouping',
  'backdropGenreBadgeAnimeGrouping',
  'logoGenreBadgeAnimeGrouping',
  'streamBadges',
  'posterStreamBadges',
  'backdropStreamBadges',
  'qualityBadgesSide',
  'posterQualityBadgesPosition',
  'qualityBadgesStyle',
  'providerAppearance',
  'ratingPresentation',
  'aggregateRatingSource',
  'aggregateAccentMode',
  'aggregateAccentColor',
  'aggregateCriticsAccentColor',
  'aggregateAudienceAccentColor',
  'aggregateAccentBarOffset',
  'aggregateAccentBarVisible',
  'posterQualityBadges',
  'posterQualityBadgesStyle',
  'posterQualityBadgeScale',
  'backdropQualityBadges',
  'backdropQualityBadgesStyle',
  'backdropQualityBadgeScale',
  'posterQualityBadgesMax',
  'backdropQualityBadgesMax',
  'ratingStyle',
  'ratingsStyle',
  'imageText',
  'posterRatingBadgeScale',
  'backdropRatingBadgeScale',
  'logoRatingBadgeScale',
  'posterRatingStyle',
  'posterRatingsStyle',
  'backdropRatingStyle',
  'backdropRatingsStyle',
  'logoRatingStyle',
  'logoRatingsStyle',
  'posterRatingPresentation',
  'backdropRatingPresentation',
  'logoRatingPresentation',
  'posterAggregateRatingSource',
  'backdropAggregateRatingSource',
  'logoAggregateRatingSource',
  'posterImageText',
  'posterImageSize',
  'backdropImageText',
  'posterArtworkSource',
  'backdropArtworkSource',
  'logoArtworkSource',
  'posterCleanSource',
  'backdropCleanSource',
  'posterRatingsLayout',
  'posterRatingsMax',
  'posterRatingsMaxPerSide',
  'posterEdgeOffset',
  'backdropRatingsLayout',
  'backdropRatingsMax',
  'posterSideRatingsPosition',
  'posterSideRatingsOffset',
  'backdropSideRatingsPosition',
  'backdropSideRatingsOffset',
  'sideRatingsPosition',
  'sideRatingsOffset',
  'logoRatingsMax',
  'logoBackground',
  'logoSource',
  'xrdbBase',
  'catalogPlan',
] as const satisfies readonly (keyof ProxyConfig)[];

const CONFIG_BOOLEAN_KEYS = [
  'translateMeta',
  'debugMetaTranslation',
  'posterEnabled',
  'backdropEnabled',
  'thumbnailEnabled',
  'logoEnabled',
] as const satisfies readonly (keyof ProxyConfig)[];

export type ProxyOptionalStringKey = (typeof CONFIG_STRING_KEYS)[number];
export type ProxyOptionalBooleanKey = (typeof CONFIG_BOOLEAN_KEYS)[number];

export const XRDB_OPTIONAL_PARAMS = SHARED_IMAGE_QUERY_KEYS;
export const XRDB_TYPE_OPTIONAL_PARAMS = IMAGE_QUERY_KEYS_BY_TYPE;
export const XRDB_TYPE_STYLE_PARAMS = STYLE_QUERY_KEYS_BY_TYPE;
export const PROXY_OPTIONAL_STRING_KEYS = CONFIG_STRING_KEYS;
export const PROXY_OPTIONAL_BOOLEAN_KEYS = CONFIG_BOOLEAN_KEYS;

export const XRDB_RESERVED_PARAMS = new Set<string>([
  'url',
  'xrdbKey',
  'tmdbKey',
  'mdblistKey',
  'catalogPlan',
  'simklClientId',
  'fanartKey',
  'fallbackUrl',
  'xrdbBase',
  'translateMeta',
  'translateMetaMode',
  'episodeIdMode',
  'debugMetaTranslation',
  'posterEnabled',
  'backdropEnabled',
  'thumbnailEnabled',
  'logoEnabled',
  'ratingStyle',
  'ratingsStyle',
  'ratingPresentation',
  'aggregateRatingSource',
  'imageText',
  'posterRatingStyle',
  'posterRatingsStyle',
  'backdropRatingStyle',
  'backdropRatingsStyle',
  'logoRatingStyle',
  'logoRatingsStyle',
  'posterRatingPresentation',
  'backdropRatingPresentation',
  'logoRatingPresentation',
  'posterAggregateRatingSource',
  'backdropAggregateRatingSource',
  'logoAggregateRatingSource',
  'posterImageText',
  'posterImageSize',
  'backdropImageText',
  'posterArtworkSource',
  'backdropArtworkSource',
  'logoArtworkSource',
  'posterCleanSource',
  'backdropCleanSource',
  'logoSource',
  ...ALL_OPTIONAL_IMAGE_QUERY_KEYS,
]);
