export type ReadmePreviewImageType = 'poster' | 'backdrop' | 'logo';

export type ReadmePreviewDefinition = {
  slug: string;
  imageType: ReadmePreviewImageType;
  id: string;
  extension: 'jpg';
  params: Record<string, string>;
};

const README_PREVIEW_DEFINITIONS: ReadonlyArray<ReadmePreviewDefinition> = [
  {
    slug: 'the-boys-poster',
    imageType: 'poster',
    id: 'tt1190634',
    extension: 'jpg',
    params: {
      lang: 'en',
      posterStreamBadges: 'on',
      posterRatings: 'tmdb,imdb',
      ratingStyle: 'glass',
      imageText: 'original',
    },
  },
  {
    slug: 'dune-part-two-poster',
    imageType: 'poster',
    id: 'tt15239678',
    extension: 'jpg',
    params: {
      lang: 'en',
      posterRatings: 'tmdb',
      posterRatingsLayout: 'left right',
      posterQualityBadgesStyle: 'square',
      posterStreamBadges: 'off',
      ratingStyle: 'square',
      imageText: 'clean',
    },
  },
  {
    slug: 'attack-on-titan-poster',
    imageType: 'poster',
    id: 'mal:16498',
    extension: 'jpg',
    params: {
      lang: 'ja',
      posterRatings: 'tmdb,anilist,kitsu',
      posterRatingsLayout: 'top bottom',
      posterStreamBadges: 'off',
      ratingStyle: 'glass',
      imageText: 'original',
    },
  },
  {
    slug: 'game-of-thrones-backdrop',
    imageType: 'backdrop',
    id: 'tt0944947',
    extension: 'jpg',
    params: {
      lang: 'fr',
      backdropRatings: 'tmdb',
      backdropRatingsLayout: 'right vertical',
      ratingStyle: 'glass',
      imageText: 'clean',
    },
  },
  {
    slug: 'stranger-things-backdrop',
    imageType: 'backdrop',
    id: 'tt4574334',
    extension: 'jpg',
    params: {
      lang: 'en',
      backdropRatings: 'tmdb,imdb',
      backdropRatingsLayout: 'right vertical',
      backdropStreamBadges: 'on',
      ratingStyle: 'square',
      imageText: 'clean',
    },
  },
  {
    slug: 'the-boys-logo',
    imageType: 'logo',
    id: 'tt1190634',
    extension: 'jpg',
    params: {
      lang: 'en',
      logoRatings: 'tmdb,imdb',
      ratingStyle: 'glass',
      logoBackground: 'dark',
    },
  },
  {
    slug: 'attack-on-titan-logo',
    imageType: 'logo',
    id: 'mal:16498',
    extension: 'jpg',
    params: {
      lang: 'ja',
      logoRatings: 'tmdb,anilist,kitsu',
      ratingStyle: 'glass',
    },
  },
] as const;

const README_PREVIEW_MAP = new Map<string, ReadmePreviewDefinition>(
  README_PREVIEW_DEFINITIONS.map((definition) => [definition.slug, definition]),
);

export const getReadmePreviewDefinitions = () => README_PREVIEW_DEFINITIONS;

export const resolveReadmePreviewDefinition = (slug: string) => {
  const normalized = String(slug || '').trim().toLowerCase();
  return README_PREVIEW_MAP.get(normalized) || null;
};

export const buildReadmePreviewTargetUrl = ({
  origin,
  definition,
  tmdbKey,
  mdblistKey = null,
  cacheBuster = null,
}: {
  origin: string;
  definition: ReadmePreviewDefinition;
  tmdbKey: string;
  mdblistKey?: string | null;
  cacheBuster?: string | null;
}) => {
  const base = new URL(
    `/${definition.imageType}/${encodeURIComponent(definition.id)}.${definition.extension}`,
    origin,
  );

  base.searchParams.set('tmdbKey', tmdbKey);
  if (mdblistKey) {
    base.searchParams.set('mdblistKey', mdblistKey);
  }

  for (const [key, value] of Object.entries(definition.params)) {
    base.searchParams.set(key, value);
  }

  if (cacheBuster) {
    base.searchParams.set('cb', cacheBuster);
  }

  return base;
};

const normalizeReadmePreviewOrigin = (value: string | null | undefined) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return null;
  }

  try {
    const normalized = new URL(trimmed);
    normalized.pathname =
      normalized.pathname === '/' ? '' : normalized.pathname.replace(/\/+$/, '');
    normalized.search = '';
    normalized.hash = '';
    return normalized.toString();
  } catch {
    return null;
  }
};

const buildReadmePreviewBindOrigin = ({
  bindHost,
  port,
}: {
  bindHost?: string | null;
  port?: string | number | null;
}) => {
  const normalizedBindHost = String(bindHost || '').trim();
  if (
    !normalizedBindHost ||
    normalizedBindHost === '0.0.0.0' ||
    normalizedBindHost === '::' ||
    normalizedBindHost === '[::]'
  ) {
    return null;
  }

  const normalizedPort = Number.parseInt(String(port || ''), 10);
  const portSegment =
    Number.isFinite(normalizedPort) && normalizedPort > 0 ? `:${normalizedPort}` : ':3000';
  return normalizeReadmePreviewOrigin(`http://${normalizedBindHost}${portSegment}`);
};

export const resolveReadmePreviewOrigins = ({
  requestOrigin,
  previewOrigin = null,
  bindHost = null,
  port = null,
}: {
  requestOrigin: string;
  previewOrigin?: string | null;
  bindHost?: string | null;
  port?: string | number | null;
}) => {
  const candidates = [
    normalizeReadmePreviewOrigin(previewOrigin),
    buildReadmePreviewBindOrigin({ bindHost, port }),
    normalizeReadmePreviewOrigin(requestOrigin),
  ].filter((value): value is string => Boolean(value));

  return [...new Set(candidates)];
};

export const resolveReadmePreviewOrigin = ({
  requestOrigin,
  previewOrigin = null,
}: {
  requestOrigin: string;
  previewOrigin?: string | null;
}) => {
  return resolveReadmePreviewOrigins({ requestOrigin, previewOrigin })[0] || requestOrigin;
};
