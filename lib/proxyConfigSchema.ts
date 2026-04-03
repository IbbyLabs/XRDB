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
  'ratingXOffsetPillGlass',
  'ratingYOffsetPillGlass',
  'ratingXOffsetSquare',
  'ratingYOffsetSquare',
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
    'backdropEpisodeArtwork',
    'backdropBottomRatingsRow',
  ],
  thumbnail: [
    'thumbnailGenreBadge',
    'thumbnailGenreBadgeStyle',
    'thumbnailGenreBadgePosition',
    'thumbnailGenreBadgeScale',
    'thumbnailGenreBadgeAnimeGrouping',
    'thumbnailStreamBadges',
    'thumbnailQualityBadges',
    'thumbnailQualityBadgesStyle',
    'thumbnailQualityBadgeScale',
    'thumbnailQualityBadgesMax',
    'thumbnailRatings',
    'thumbnailRatingBadgeScale',
    'thumbnailRatingPresentation',
    'thumbnailAggregateRatingSource',
    'thumbnailArtworkSource',
    'thumbnailEpisodeArtwork',
    'thumbnailRatingsLayout',
    'thumbnailRatingsMax',
    'thumbnailBottomRatingsRow',
    'thumbnailSideRatingsPosition',
    'thumbnailSideRatingsOffset',
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
    'logoBottomRatingsRow',
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
    ratingStyle: ['thumbnailRatingStyle', 'thumbnailRatingsStyle', 'ratingStyle', 'ratingsStyle'],
    imageText: ['thumbnailImageText', 'imageText'],
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
  proxyTypes?: string;
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
  thumbnailGenreBadge?: string;
  logoGenreBadge?: string;
  posterGenreBadgeStyle?: string;
  backdropGenreBadgeStyle?: string;
  thumbnailGenreBadgeStyle?: string;
  logoGenreBadgeStyle?: string;
  posterGenreBadgePosition?: string;
  backdropGenreBadgePosition?: string;
  thumbnailGenreBadgePosition?: string;
  logoGenreBadgePosition?: string;
  posterGenreBadgeScale?: string;
  backdropGenreBadgeScale?: string;
  thumbnailGenreBadgeScale?: string;
  logoGenreBadgeScale?: string;
  posterGenreBadgeAnimeGrouping?: string;
  backdropGenreBadgeAnimeGrouping?: string;
  thumbnailGenreBadgeAnimeGrouping?: string;
  logoGenreBadgeAnimeGrouping?: string;
  streamBadges?: string;
  posterStreamBadges?: string;
  backdropStreamBadges?: string;
  thumbnailStreamBadges?: string;
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
  ratingXOffsetPillGlass?: string;
  ratingYOffsetPillGlass?: string;
  ratingXOffsetSquare?: string;
  ratingYOffsetSquare?: string;
  posterQualityBadges?: string;
  posterQualityBadgesStyle?: string;
  posterQualityBadgeScale?: string;
  backdropQualityBadges?: string;
  backdropQualityBadgesStyle?: string;
  backdropQualityBadgeScale?: string;
  thumbnailQualityBadges?: string;
  thumbnailQualityBadgesStyle?: string;
  thumbnailQualityBadgeScale?: string;
  posterQualityBadgesMax?: string;
  backdropQualityBadgesMax?: string;
  thumbnailQualityBadgesMax?: string;
  ratingStyle?: string;
  ratingsStyle?: string;
  imageText?: string;
  posterRatingBadgeScale?: string;
  backdropRatingBadgeScale?: string;
  thumbnailRatingBadgeScale?: string;
  logoRatingBadgeScale?: string;
  posterRatingStyle?: string;
  posterRatingsStyle?: string;
  backdropRatingStyle?: string;
  backdropRatingsStyle?: string;
  thumbnailRatingStyle?: string;
  thumbnailRatingsStyle?: string;
  logoRatingStyle?: string;
  logoRatingsStyle?: string;
  posterRatingPresentation?: string;
  backdropRatingPresentation?: string;
  thumbnailRatingPresentation?: string;
  logoRatingPresentation?: string;
  posterAggregateRatingSource?: string;
  backdropAggregateRatingSource?: string;
  thumbnailAggregateRatingSource?: string;
  logoAggregateRatingSource?: string;
  posterImageText?: string;
  posterImageSize?: string;
  backdropImageText?: string;
  thumbnailImageText?: string;
  posterArtworkSource?: string;
  backdropArtworkSource?: string;
  thumbnailArtworkSource?: string;
  thumbnailEpisodeArtwork?: string;
  backdropEpisodeArtwork?: string;
  logoArtworkSource?: string;
  posterCleanSource?: string;
  backdropCleanSource?: string;
  posterRatingsLayout?: string;
  posterRatingsMax?: string;
  posterRatingsMaxPerSide?: string;
  posterEdgeOffset?: string;
  backdropRatingsLayout?: string;
  backdropRatingsMax?: string;
  backdropBottomRatingsRow?: string;
  thumbnailRatingsLayout?: string;
  thumbnailRatingsMax?: string;
  thumbnailBottomRatingsRow?: string;
  posterSideRatingsPosition?: string;
  posterSideRatingsOffset?: string;
  backdropSideRatingsPosition?: string;
  backdropSideRatingsOffset?: string;
  thumbnailSideRatingsPosition?: string;
  thumbnailSideRatingsOffset?: string;
  sideRatingsPosition?: string;
  sideRatingsOffset?: string;
  logoRatingsMax?: string;
  logoBackground?: string;
  logoBottomRatingsRow?: string;
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
  'proxyTypes',
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
  'thumbnailGenreBadge',
  'logoGenreBadge',
  'posterGenreBadgeStyle',
  'backdropGenreBadgeStyle',
  'thumbnailGenreBadgeStyle',
  'logoGenreBadgeStyle',
  'posterGenreBadgePosition',
  'backdropGenreBadgePosition',
  'thumbnailGenreBadgePosition',
  'logoGenreBadgePosition',
  'posterGenreBadgeScale',
  'backdropGenreBadgeScale',
  'thumbnailGenreBadgeScale',
  'logoGenreBadgeScale',
  'posterGenreBadgeAnimeGrouping',
  'backdropGenreBadgeAnimeGrouping',
  'thumbnailGenreBadgeAnimeGrouping',
  'logoGenreBadgeAnimeGrouping',
  'streamBadges',
  'posterStreamBadges',
  'backdropStreamBadges',
  'thumbnailStreamBadges',
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
  'ratingXOffsetPillGlass',
  'ratingYOffsetPillGlass',
  'ratingXOffsetSquare',
  'ratingYOffsetSquare',
  'posterQualityBadges',
  'posterQualityBadgesStyle',
  'posterQualityBadgeScale',
  'backdropQualityBadges',
  'backdropQualityBadgesStyle',
  'backdropQualityBadgeScale',
  'thumbnailQualityBadges',
  'thumbnailQualityBadgesStyle',
  'thumbnailQualityBadgeScale',
  'posterQualityBadgesMax',
  'backdropQualityBadgesMax',
  'thumbnailQualityBadgesMax',
  'ratingStyle',
  'ratingsStyle',
  'imageText',
  'posterRatingBadgeScale',
  'backdropRatingBadgeScale',
  'thumbnailRatingBadgeScale',
  'logoRatingBadgeScale',
  'posterRatingStyle',
  'posterRatingsStyle',
  'backdropRatingStyle',
  'backdropRatingsStyle',
  'thumbnailRatingStyle',
  'thumbnailRatingsStyle',
  'logoRatingStyle',
  'logoRatingsStyle',
  'posterRatingPresentation',
  'backdropRatingPresentation',
  'thumbnailRatingPresentation',
  'logoRatingPresentation',
  'posterAggregateRatingSource',
  'backdropAggregateRatingSource',
  'thumbnailAggregateRatingSource',
  'logoAggregateRatingSource',
  'posterImageText',
  'posterImageSize',
  'backdropImageText',
  'thumbnailImageText',
  'posterArtworkSource',
  'backdropArtworkSource',
  'thumbnailArtworkSource',
  'thumbnailEpisodeArtwork',
  'backdropEpisodeArtwork',
  'logoArtworkSource',
  'posterCleanSource',
  'backdropCleanSource',
  'posterRatingsLayout',
  'posterRatingsMax',
  'posterRatingsMaxPerSide',
  'posterEdgeOffset',
  'backdropRatingsLayout',
  'backdropRatingsMax',
  'backdropBottomRatingsRow',
  'thumbnailRatingsLayout',
  'thumbnailRatingsMax',
  'thumbnailBottomRatingsRow',
  'posterSideRatingsPosition',
  'posterSideRatingsOffset',
  'backdropSideRatingsPosition',
  'backdropSideRatingsOffset',
  'thumbnailSideRatingsPosition',
  'thumbnailSideRatingsOffset',
  'sideRatingsPosition',
  'sideRatingsOffset',
  'logoRatingsMax',
  'logoBackground',
  'logoBottomRatingsRow',
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
  'proxyTypes',
  'episodeIdMode',
  'thumbnailEpisodeArtwork',
  'backdropEpisodeArtwork',
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
  'thumbnailAggregateRatingSource',
  'logoAggregateRatingSource',
  'posterImageText',
  'posterImageSize',
  'backdropImageText',
  'thumbnailImageText',
  'posterArtworkSource',
  'backdropArtworkSource',
  'thumbnailArtworkSource',
  'logoArtworkSource',
  'posterCleanSource',
  'backdropCleanSource',
  'logoSource',
  ...ALL_OPTIONAL_IMAGE_QUERY_KEYS,
]);
