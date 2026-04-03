import {
  parseQualityBadgePreferencesAllowEmpty,
  parseRatingProviderAppearanceOverrides,
} from './badgeCustomization.ts';
import { PROXY_OPTIONAL_STRING_KEYS } from './proxyConfigSchema.ts';
import { normalizeSavedUiConfig, type SavedUiConfig } from './uiConfig.ts';

export type ConfiguratorPreviewType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';

export type ConfiguratorLinkImportResult = {
  config: SavedUiConfig;
  previewType: ConfiguratorPreviewType | null;
  mediaId: string | null;
};

const PREVIEW_TYPES = new Set<ConfiguratorPreviewType>([
  'poster',
  'backdrop',
  'thumbnail',
  'logo',
]);

const IMPORT_QUERY_KEYS = new Set<string>([
  'tmdbKey',
  'mdblistKey',
  ...PROXY_OPTIONAL_STRING_KEYS,
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

export const parseConfiguratorLinkImport = (
  rawValue: string,
  options?: {
    baseOrigin?: string;
    fallbackPreviewType?: ConfiguratorPreviewType;
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
  const settingsCandidate: Record<string, unknown> = {};
  let hasRecognizedParam = false;

  for (const [key, value] of targetUrl.searchParams.entries()) {
    if (!IMPORT_QUERY_KEYS.has(key)) {
      continue;
    }
    settingsCandidate[key] = value;
    hasRecognizedParam = true;
  }

  if (!hasRecognizedParam) {
    return null;
  }

  const posterQualityBadges = targetUrl.searchParams.get('posterQualityBadges');
  if (posterQualityBadges !== null) {
    settingsCandidate.posterQualityBadgePreferences =
      parseQualityBadgePreferencesAllowEmpty(posterQualityBadges);
  }
  const backdropQualityBadges = targetUrl.searchParams.get('backdropQualityBadges');
  if (backdropQualityBadges !== null) {
    settingsCandidate.backdropQualityBadgePreferences =
      parseQualityBadgePreferencesAllowEmpty(backdropQualityBadges);
  }
  const thumbnailQualityBadges = targetUrl.searchParams.get('thumbnailQualityBadges');
  if (thumbnailQualityBadges !== null) {
    settingsCandidate.thumbnailQualityBadgePreferences =
      parseQualityBadgePreferencesAllowEmpty(thumbnailQualityBadges);
  }
  const logoQualityBadges = targetUrl.searchParams.get('logoQualityBadges');
  if (logoQualityBadges !== null) {
    settingsCandidate.logoQualityBadgePreferences =
      parseQualityBadgePreferencesAllowEmpty(logoQualityBadges);
  }

  const providerAppearance = targetUrl.searchParams.get('providerAppearance');
  if (providerAppearance !== null) {
    settingsCandidate.ratingProviderAppearanceOverrides =
      parseRatingProviderAppearanceOverrides(providerAppearance);
  }

  if (scopedPreviewType) {
    const genericImageText = targetUrl.searchParams.get('imageText');
    const imageTextKey = IMAGE_TEXT_KEY_BY_PREVIEW_TYPE[scopedPreviewType];
    if (genericImageText && imageTextKey) {
      settingsCandidate[imageTextKey] = genericImageText;
    }

    const genericRatingStyle =
      targetUrl.searchParams.get('ratingStyle') || targetUrl.searchParams.get('ratingsStyle');
    if (genericRatingStyle) {
      settingsCandidate[RATING_STYLE_KEY_BY_PREVIEW_TYPE[scopedPreviewType]] = genericRatingStyle;
    }

    const genericRatingPresentation = targetUrl.searchParams.get('ratingPresentation');
    if (genericRatingPresentation) {
      settingsCandidate[RATING_PRESENTATION_KEY_BY_PREVIEW_TYPE[scopedPreviewType]] =
        genericRatingPresentation;
    }

    const genericAggregateRatingSource = targetUrl.searchParams.get('aggregateRatingSource');
    if (genericAggregateRatingSource) {
      settingsCandidate[AGGREGATE_SOURCE_KEY_BY_PREVIEW_TYPE[scopedPreviewType]] =
        genericAggregateRatingSource;
    }

    const genericQualityBadgesStyle = targetUrl.searchParams.get('qualityBadgesStyle');
    if (genericQualityBadgesStyle) {
      settingsCandidate[QUALITY_BADGES_STYLE_KEY_BY_PREVIEW_TYPE[scopedPreviewType]] =
        genericQualityBadgesStyle;
    }

    const genericQualityBadgeScale = targetUrl.searchParams.get('qualityBadgeScale');
    if (genericQualityBadgeScale) {
      settingsCandidate[QUALITY_BADGE_SCALE_KEY_BY_PREVIEW_TYPE[scopedPreviewType]] =
        genericQualityBadgeScale;
    }

    const genericQualityBadges = targetUrl.searchParams.get('qualityBadges');
    if (genericQualityBadges) {
      settingsCandidate[QUALITY_BADGES_KEY_BY_PREVIEW_TYPE[scopedPreviewType]] =
        parseQualityBadgePreferencesAllowEmpty(genericQualityBadges);
    }

    const genericStreamBadges = targetUrl.searchParams.get('streamBadges');
    const streamBadgesKey = STREAM_BADGES_KEY_BY_PREVIEW_TYPE[scopedPreviewType];
    if (genericStreamBadges && streamBadgesKey) {
      settingsCandidate[streamBadgesKey] = genericStreamBadges;
    }
  }

  return {
    config: normalizeSavedUiConfig({
      settings: settingsCandidate,
    }),
    previewType: detectedPreviewType,
    mediaId,
  };
};
