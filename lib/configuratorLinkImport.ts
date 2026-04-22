import { PROXY_OPTIONAL_STRING_KEYS } from './proxyConfigSchema.ts';

export type ConfiguratorPreviewType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';

export type ConfiguratorLinkImportPatch = Record<string, string>;

export type ConfiguratorLinkImportResult = {
  sharedSettings: ConfiguratorLinkImportPatch;
  typeSettings: Partial<Record<ConfiguratorPreviewType, ConfiguratorLinkImportPatch>>;
  previewType: ConfiguratorPreviewType | null;
  mediaId: string | null;
  configProfileId: string | null;
  defaultSourceType: ConfiguratorPreviewType | null;
};

const CONFIG_PROFILE_ID_RE =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|xrc_[0-9a-f]{16}|xr_[0-9a-f]{8})$/i;

const PREVIEW_TYPE_ORDER: ConfiguratorPreviewType[] = [
  'poster',
  'backdrop',
  'thumbnail',
  'logo',
];

const PREVIEW_TYPES = new Set<ConfiguratorPreviewType>(PREVIEW_TYPE_ORDER);

const TYPE_PREFIX_BY_PREVIEW_TYPE: Record<ConfiguratorPreviewType, string> = {
  poster: 'poster',
  backdrop: 'backdrop',
  thumbnail: 'thumbnail',
  logo: 'logo',
};

const NON_VISUAL_QUERY_KEYS = new Set<string>([
  'xrdbKey',
  'tmdbKey',
  'mdblistKey',
  'fanartKey',
  'simklClientId',
  'lang',
  'secLang',
  'tmdbIdScope',
  'xrdbBase',
  'catalogPlan',
]);

const SHARED_VISUAL_QUERY_KEYS = new Set<string>([
  'providerAppearance',
  'ratingValueMode',
  'qualityBadgesSide',
  'aggregateAccentMode',
  'aggregateAccentColor',
  'aggregateCriticsAccentColor',
  'aggregateAudienceAccentColor',
  'aggregateValueColor',
  'aggregateCriticsValueColor',
  'aggregateAudienceValueColor',
  'aggregateDynamicStops',
  'aggregateAccentBarOffset',
  'aggregateAccentBarVisible',
  'aggregateProviderWeights',
]);

const TYPE_SCOPED_VISUAL_QUERY_KEYS = new Set<string>(
  PROXY_OPTIONAL_STRING_KEYS.filter((key) => {
    if (NON_VISUAL_QUERY_KEYS.has(key) || SHARED_VISUAL_QUERY_KEYS.has(key)) {
      return false;
    }

    return PREVIEW_TYPE_ORDER.some((type) => key.startsWith(TYPE_PREFIX_BY_PREVIEW_TYPE[type]));
  }),
);

const GENERIC_QUERY_TO_TYPE_KEY: Record<string, Partial<Record<ConfiguratorPreviewType, string>>> = {
  ratings: {
    poster: 'posterRatings',
    backdrop: 'backdropRatings',
    thumbnail: 'thumbnailRatings',
    logo: 'logoRatings',
  },
  order: {
    poster: 'posterRatings',
    backdrop: 'backdropRatings',
    thumbnail: 'thumbnailRatings',
    logo: 'logoRatings',
  },
  ratingStyle: {
    poster: 'posterRatingStyle',
    backdrop: 'backdropRatingStyle',
    thumbnail: 'thumbnailRatingStyle',
    logo: 'logoRatingStyle',
  },
  ratingsStyle: {
    poster: 'posterRatingStyle',
    backdrop: 'backdropRatingStyle',
    thumbnail: 'thumbnailRatingStyle',
    logo: 'logoRatingStyle',
  },
  ratingPresentation: {
    poster: 'posterRatingPresentation',
    backdrop: 'backdropRatingPresentation',
    thumbnail: 'thumbnailRatingPresentation',
    logo: 'logoRatingPresentation',
  },
  aggregateRatingSource: {
    poster: 'posterAggregateRatingSource',
    backdrop: 'backdropAggregateRatingSource',
    thumbnail: 'thumbnailAggregateRatingSource',
    logo: 'logoAggregateRatingSource',
  },
  aggregateProviderWeights: {
    poster: 'posterAggregateProviderWeights',
    backdrop: 'backdropAggregateProviderWeights',
    thumbnail: 'thumbnailAggregateProviderWeights',
    logo: 'logoAggregateProviderWeights',
  },
  qualityBadgesStyle: {
    poster: 'posterQualityBadgesStyle',
    backdrop: 'backdropQualityBadgesStyle',
    thumbnail: 'thumbnailQualityBadgesStyle',
    logo: 'logoQualityBadgesStyle',
  },
  qualityBadgeScale: {
    poster: 'posterQualityBadgeScale',
    backdrop: 'backdropQualityBadgeScale',
    thumbnail: 'thumbnailQualityBadgeScale',
    logo: 'logoQualityBadgeScale',
  },
  qualityBadges: {
    poster: 'posterQualityBadges',
    backdrop: 'backdropQualityBadges',
    thumbnail: 'thumbnailQualityBadges',
    logo: 'logoQualityBadges',
  },
  remuxDisplayMode: {
    poster: 'posterRemuxDisplayMode',
    backdrop: 'backdropRemuxDisplayMode',
    thumbnail: 'thumbnailRemuxDisplayMode',
    logo: 'logoRemuxDisplayMode',
  },
  streamBadges: {
    poster: 'posterStreamBadges',
    backdrop: 'backdropStreamBadges',
    thumbnail: 'thumbnailStreamBadges',
  },
  imageText: {
    poster: 'posterImageText',
    backdrop: 'backdropImageText',
    thumbnail: 'thumbnailImageText',
  },
  imageSize: {
    poster: 'posterImageSize',
    backdrop: 'backdropImageSize',
  },
  genreBadge: {
    poster: 'posterGenreBadge',
    backdrop: 'backdropGenreBadge',
    thumbnail: 'thumbnailGenreBadge',
    logo: 'logoGenreBadge',
  },
  genreBadgeStyle: {
    poster: 'posterGenreBadgeStyle',
    backdrop: 'backdropGenreBadgeStyle',
    thumbnail: 'thumbnailGenreBadgeStyle',
    logo: 'logoGenreBadgeStyle',
  },
  genreBadgePosition: {
    poster: 'posterGenreBadgePosition',
    backdrop: 'backdropGenreBadgePosition',
    thumbnail: 'thumbnailGenreBadgePosition',
    logo: 'logoGenreBadgePosition',
  },
  genreBadgeScale: {
    poster: 'posterGenreBadgeScale',
    backdrop: 'backdropGenreBadgeScale',
    thumbnail: 'thumbnailGenreBadgeScale',
    logo: 'logoGenreBadgeScale',
  },
  genreBadgeBorderWidth: {
    poster: 'posterGenreBadgeBorderWidth',
    backdrop: 'backdropGenreBadgeBorderWidth',
    thumbnail: 'thumbnailGenreBadgeBorderWidth',
    logo: 'logoGenreBadgeBorderWidth',
  },
  genreBadgeAnimeGrouping: {
    poster: 'posterGenreBadgeAnimeGrouping',
    backdrop: 'backdropGenreBadgeAnimeGrouping',
    thumbnail: 'thumbnailGenreBadgeAnimeGrouping',
    logo: 'logoGenreBadgeAnimeGrouping',
  },
};

const CROSS_TYPE_COMPATIBLE_SUFFIXES = new Set<string>([
  'Ratings',
  'RatingStyle',
  'RatingPresentation',
  'AggregateRatingSource',
  'AggregateProviderWeights',
  'RatingBadgeScale',
  'QualityBadges',
  'QualityBadgesStyle',
  'QualityBadgeScale',
  'QualityBadgesMax',
  'GenreBadge',
  'GenreBadgeStyle',
  'GenreBadgePosition',
  'GenreBadgeScale',
  'GenreBadgeBorderWidth',
  'GenreBadgeAnimeGrouping',
  'StreamBadges',
  'RemuxDisplayMode',
  'ArtworkSource',
  'ImageText',
]);

const RATING_STYLE_KEY_BY_PREVIEW_TYPE: Record<ConfiguratorPreviewType, string> = {
  poster: 'posterRatingStyle',
  backdrop: 'backdropRatingStyle',
  thumbnail: 'thumbnailRatingStyle',
  logo: 'logoRatingStyle',
};

const RATING_PRESENTATION_KEY_BY_PREVIEW_TYPE: Record<ConfiguratorPreviewType, string> = {
  poster: 'posterRatingPresentation',
  backdrop: 'backdropRatingPresentation',
  thumbnail: 'thumbnailRatingPresentation',
  logo: 'logoRatingPresentation',
};

const AGGREGATE_SOURCE_KEY_BY_PREVIEW_TYPE: Record<ConfiguratorPreviewType, string> = {
  poster: 'posterAggregateRatingSource',
  backdrop: 'backdropAggregateRatingSource',
  thumbnail: 'thumbnailAggregateRatingSource',
  logo: 'logoAggregateRatingSource',
};

const QUALITY_BADGES_STYLE_KEY_BY_PREVIEW_TYPE: Record<ConfiguratorPreviewType, string> = {
  poster: 'posterQualityBadgesStyle',
  backdrop: 'backdropQualityBadgesStyle',
  thumbnail: 'thumbnailQualityBadgesStyle',
  logo: 'logoQualityBadgesStyle',
};

const QUALITY_BADGE_SCALE_KEY_BY_PREVIEW_TYPE: Record<ConfiguratorPreviewType, string> = {
  poster: 'posterQualityBadgeScale',
  backdrop: 'backdropQualityBadgeScale',
  thumbnail: 'thumbnailQualityBadgeScale',
  logo: 'logoQualityBadgeScale',
};

const QUALITY_BADGES_KEY_BY_PREVIEW_TYPE: Record<ConfiguratorPreviewType, string> = {
  poster: 'posterQualityBadgePreferences',
  backdrop: 'backdropQualityBadgePreferences',
  thumbnail: 'thumbnailQualityBadgePreferences',
  logo: 'logoQualityBadgePreferences',
};

const REMUX_DISPLAY_MODE_KEY_BY_PREVIEW_TYPE: Record<ConfiguratorPreviewType, string> = {
  poster: 'posterRemuxDisplayMode',
  backdrop: 'backdropRemuxDisplayMode',
  thumbnail: 'thumbnailRemuxDisplayMode',
  logo: 'logoRemuxDisplayMode',
};

const STREAM_BADGES_KEY_BY_PREVIEW_TYPE: Partial<Record<ConfiguratorPreviewType, string>> = {
  poster: 'posterStreamBadges',
  backdrop: 'backdropStreamBadges',
  thumbnail: 'thumbnailStreamBadges',
};

const IMAGE_TEXT_KEY_BY_PREVIEW_TYPE: Partial<Record<ConfiguratorPreviewType, string>> = {
  poster: 'posterImageText',
  backdrop: 'backdropImageText',
  thumbnail: 'thumbnailImageText',
};

const decodePathSegment = (value: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }

  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
};

const normalizeMediaIdSegment = (value: string) =>
  decodePathSegment(value).replace(/\.(?:jpe?g|png|webp)$/i, '').trim();

const hasTemplateToken = (value: string) => /{[^}]+}/.test(value);

const parsePreviewTargetFromPath = (url: URL) => {
  const segments = url.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  const previewIndex = segments.findIndex((segment) =>
    PREVIEW_TYPES.has(segment as ConfiguratorPreviewType),
  );
  if (previewIndex < 0) {
    return {
      previewType: null,
      mediaId: null,
    };
  }

  const previewType = segments[previewIndex] as ConfiguratorPreviewType;
  const primarySegment = segments[previewIndex + 1] || '';
  if (!primarySegment) {
    return {
      previewType,
      mediaId: null,
    };
  }

  if (previewType === 'thumbnail') {
    const episodeSegment = segments[previewIndex + 2] || '';
    const normalizedSeriesId = normalizeMediaIdSegment(primarySegment);
    const normalizedEpisodeToken = normalizeMediaIdSegment(episodeSegment);
    if (
      !normalizedSeriesId ||
      !normalizedEpisodeToken ||
      hasTemplateToken(normalizedSeriesId) ||
      hasTemplateToken(normalizedEpisodeToken)
    ) {
      return {
        previewType,
        mediaId: null,
      };
    }

    const episodeMatch = /^s(\d+)e(\d+)$/i.exec(normalizedEpisodeToken);
    if (!episodeMatch) {
      return {
        previewType,
        mediaId: normalizedSeriesId,
      };
    }

    const seasonNumber = Number.parseInt(episodeMatch[1] || '', 10);
    const episodeNumber = Number.parseInt(episodeMatch[2] || '', 10);
    if (!Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) {
      return {
        previewType,
        mediaId: normalizedSeriesId,
      };
    }

    return {
      previewType,
      mediaId: `${normalizedSeriesId}:${seasonNumber}:${episodeNumber}`,
    };
  }

  const normalizedMediaId = normalizeMediaIdSegment(primarySegment);
  if (!normalizedMediaId || hasTemplateToken(normalizedMediaId)) {
    return {
      previewType,
      mediaId: null,
    };
  }

  return {
    previewType,
    mediaId: normalizedMediaId,
  };
};

const tryParseImportUrl = (rawValue: string, baseOrigin: string) => {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) {
    return null;
  }

  const normalizedBaseOrigin = String(baseOrigin || '').trim() || 'https://xrdb.local';
  if (trimmed.startsWith('?')) {
    return new URL(`/configurator${trimmed}`, normalizedBaseOrigin);
  }
  if (trimmed.startsWith('/')) {
    return new URL(trimmed, normalizedBaseOrigin);
  }
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) {
    return new URL(trimmed);
  }
  if (trimmed.startsWith('//')) {
    return new URL(`https:${trimmed}`);
  }

  try {
    return new URL(trimmed, normalizedBaseOrigin);
  } catch {
    return new URL(`/configurator?${trimmed.replace(/^\?/, '')}`, normalizedBaseOrigin);
  }
};

const getPreviewTypeFromScopedKey = (key: string): ConfiguratorPreviewType | null => {
  for (const type of PREVIEW_TYPE_ORDER) {
    if (key.startsWith(TYPE_PREFIX_BY_PREVIEW_TYPE[type])) {
      return type;
    }
  }

  return null;
};

const addTypeSetting = (
  target: Partial<Record<ConfiguratorPreviewType, ConfiguratorLinkImportPatch>>,
  previewType: ConfiguratorPreviewType,
  key: string,
  value: string,
) => {
  target[previewType] = {
    ...(target[previewType] ?? {}),
    [key]: value,
  };
};

const getDefaultSourceType = (
  typeSettings: Partial<Record<ConfiguratorPreviewType, ConfiguratorLinkImportPatch>>,
  preferredType: ConfiguratorPreviewType | null,
): ConfiguratorPreviewType | null => {
  if (preferredType && typeSettings[preferredType]) {
    return preferredType;
  }

  for (const type of PREVIEW_TYPE_ORDER) {
    if (typeSettings[type]) {
      return type;
    }
  }

  return preferredType;
};

const getTypeSuffix = (previewType: ConfiguratorPreviewType, key: string) => {
  const prefix = TYPE_PREFIX_BY_PREVIEW_TYPE[previewType];
  return key.startsWith(prefix) ? key.slice(prefix.length) : null;
};

export const getConfiguratorLinkImportTypes = (
  result: Pick<ConfiguratorLinkImportResult, 'typeSettings'>,
) => PREVIEW_TYPE_ORDER.filter((type) => {
  const patch = result.typeSettings[type];
  return Boolean(patch && Object.keys(patch).length > 0);
});

export const mapConfiguratorImportPatchToType = (
  sourceType: ConfiguratorPreviewType,
  targetType: ConfiguratorPreviewType,
  patch: ConfiguratorLinkImportPatch,
): ConfiguratorLinkImportPatch => {
  if (sourceType === targetType) {
    return { ...patch };
  }

  const mapped: ConfiguratorLinkImportPatch = {};

  for (const [key, value] of Object.entries(patch)) {
    const suffix = getTypeSuffix(sourceType, key);
    if (!suffix || !CROSS_TYPE_COMPATIBLE_SUFFIXES.has(suffix)) {
      continue;
    }

    if (suffix === 'StreamBadges' && targetType === 'logo') {
      continue;
    }

    if (suffix === 'ImageText' && targetType === 'logo') {
      continue;
    }

    if (
      suffix === 'RatingPresentation' &&
      targetType !== 'poster' &&
      (value === 'ring' || value === 'editorial' || value === 'blockbuster')
    ) {
      continue;
    }

    mapped[`${TYPE_PREFIX_BY_PREVIEW_TYPE[targetType]}${suffix}`] = value;
  }

  return mapped;
};

export const mergeConfiguratorLinkImportIntoProfileParams = (
  currentParams: Record<string, string>,
  parsedImport: ConfiguratorLinkImportResult,
  selection: {
    targetTypes: ConfiguratorPreviewType[];
    includeShared: boolean;
    sourceType?: ConfiguratorPreviewType | null;
  },
) => {
  const nextParams: Record<string, string> = { ...currentParams };

  if (selection.includeShared) {
    Object.assign(nextParams, parsedImport.sharedSettings);
  }

  const sourceType = selection.sourceType ?? parsedImport.defaultSourceType;

  for (const targetType of selection.targetTypes) {
    const explicitPatch = parsedImport.typeSettings[targetType];
    if (explicitPatch) {
      Object.assign(nextParams, explicitPatch);
      continue;
    }

    if (!sourceType) {
      continue;
    }

    const sourcePatch = parsedImport.typeSettings[sourceType];
    if (!sourcePatch) {
      continue;
    }

    Object.assign(nextParams, mapConfiguratorImportPatchToType(sourceType, targetType, sourcePatch));
  }

  return nextParams;
};

export const parseConfiguratorLinkImport = (
  rawValue: string,
  options?: {
    baseOrigin?: string;
    fallbackPreviewType?: ConfiguratorPreviewType;
    skipCrossTypeFallbacks?: boolean;
  },
): ConfiguratorLinkImportResult | null => {
  let targetUrl: URL;
  try {
    const parsedUrl = tryParseImportUrl(rawValue, options?.baseOrigin || '');
    if (!parsedUrl) {
      return null;
    }
    targetUrl = parsedUrl;
  } catch {
    return null;
  }

  const {
    previewType: detectedPreviewType,
    mediaId,
  } = parsePreviewTargetFromPath(targetUrl);
  const scopedPreviewType = detectedPreviewType || options?.fallbackPreviewType || null;
  const configProfileId = (() => {
    const candidate = String(targetUrl.searchParams.get('config') || '').trim();
    return CONFIG_PROFILE_ID_RE.test(candidate) ? candidate : null;
  })();
  const sharedSettings: ConfiguratorLinkImportPatch = {};
  const typeSettings: Partial<Record<ConfiguratorPreviewType, ConfiguratorLinkImportPatch>> = {};
  let hasRecognizedParam = false;

  for (const [key, value] of targetUrl.searchParams.entries()) {
    if (NON_VISUAL_QUERY_KEYS.has(key)) {
      continue;
    }
    if (SHARED_VISUAL_QUERY_KEYS.has(key)) {
      sharedSettings[key] = value;
      hasRecognizedParam = true;
      continue;
    }

    if (TYPE_SCOPED_VISUAL_QUERY_KEYS.has(key)) {
      const previewType = getPreviewTypeFromScopedKey(key);
      if (previewType) {
        addTypeSetting(typeSettings, previewType, key, value);
        hasRecognizedParam = true;
      }
      continue;
    }

    if (!scopedPreviewType) {
      continue;
    }

    const mappedKey = GENERIC_QUERY_TO_TYPE_KEY[key]?.[scopedPreviewType];
    if (!mappedKey) {
      continue;
    }

    addTypeSetting(typeSettings, scopedPreviewType, mappedKey, value);
    hasRecognizedParam = true;
  }

  if (!hasRecognizedParam && !configProfileId) {
    return null;
  }

  return {
    sharedSettings,
    typeSettings,
    previewType: detectedPreviewType,
    mediaId,
    configProfileId,
    defaultSourceType: getDefaultSourceType(typeSettings, scopedPreviewType),
  };
};
