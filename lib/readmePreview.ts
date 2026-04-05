import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type ReadmePreviewImageType = 'poster' | 'backdrop' | 'logo';

export type ReadmePreviewDefinition = {
  slug: string;
  imageType: ReadmePreviewImageType;
  id: string;
  extension: 'jpg';
  title: string;
  description: string;
  titleGroup: string;
  uniquenessFingerprint: string;
  coverageTags: readonly string[];
  params: Record<string, string>;
};

type ReadmePreviewDescriptionKey =
  | 'language'
  | 'style'
  | 'providers'
  | 'stream-badges'
  | 'text'
  | 'poster-layout'
  | 'backdrop-layout'
  | 'logo-background'
  | 'age-rating';

type ReadmePreviewDefinitionInput = Omit<ReadmePreviewDefinition, 'description'> & {
  descriptionKeys: readonly ReadmePreviewDescriptionKey[];
};

export type ReadmePreviewSlugBuckets = Record<ReadmePreviewImageType, string[]>;

export type ReadmePreviewState = {
  schemaVersion: 1;
  version: string;
  seed: string;
  selectedAt: string;
  activeSlugs: ReadmePreviewSlugBuckets;
  historySlugs: ReadmePreviewSlugBuckets;
};

type ReadmePreviewGalleryTypeConfig = {
  heading: string;
  cardWidth: number;
  slots: number;
  requiredCoverageTags: readonly string[];
};

type ReadmePreviewSelectionResult = {
  definitions: Record<ReadmePreviewImageType, ReadonlyArray<ReadmePreviewDefinition>>;
  state: ReadmePreviewState;
};

type ReadmePreviewSelectionCandidate = {
  definitions: ReadonlyArray<ReadmePreviewDefinition>;
  seedOrderScore: number;
  diversityScore: number;
  historyPenalty: number;
};

const getSelectionCandidateDefinitions = (
  candidate: ReadmePreviewSelectionCandidate | null,
): ReadonlyArray<ReadmePreviewDefinition> | null => (candidate ? candidate.definitions : null);

const README_PREVIEW_STATE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../config/readme-preview-gallery.json',
);
const README_PREVIEW_GALLERY_ORIGIN = 'https://xrdb.ibbylabs.dev';

const createEmptySlugBuckets = (): ReadmePreviewSlugBuckets => ({
  poster: [],
  backdrop: [],
  logo: [],
});

const README_PREVIEW_GALLERY_CONFIG: Record<ReadmePreviewImageType, ReadmePreviewGalleryTypeConfig> = {
  poster: {
    heading: 'Posters',
    cardWidth: 220,
    slots: 4,
    requiredCoverageTags: ['stream-badges', 'square-style', 'anime', 'age-rating-detached', 'alt-providers'],
  },
  backdrop: {
    heading: 'Backdrops',
    cardWidth: 320,
    slots: 3,
    requiredCoverageTags: ['stream-badges', 'non-english', 'center-layout', 'alt-providers'],
  },
  logo: {
    heading: 'Logos',
    cardWidth: 320,
    slots: 3,
    requiredCoverageTags: ['dark-background', 'non-english', 'square-style', 'alt-providers'],
  },
};

const formatProviderList = (providers: readonly string[]) => {
  const labels = providers.map((provider) => {
    if (provider === 'tmdb') return 'TMDB';
    if (provider === 'mdblist') return 'MDBList';
    if (provider === 'imdb') return 'IMDb';
    if (provider === 'allocine') return 'AlloCine';
    if (provider === 'allocinepress') return 'AlloCine Press';
    if (provider === 'tomatoes') return 'Rotten Tomatoes';
    if (provider === 'tomatoesaudience') return 'RT Audience';
    if (provider === 'letterboxd') return 'Letterboxd';
    if (provider === 'metacritic') return 'Metacritic';
    if (provider === 'metacriticuser') return 'Metacritic User';
    if (provider === 'trakt') return 'Trakt';
    if (provider === 'simkl') return 'SIMKL';
    if (provider === 'rogerebert') return 'Roger Ebert';
    if (provider === 'myanimelist') return 'MyAnimeList';
    if (provider === 'anilist') return 'AniList';
    if (provider === 'kitsu') return 'Kitsu';
    return provider.toUpperCase();
  });

  if (labels.length === 0) return 'ratings';
  if (labels.length === 1) return `${labels[0]} only`;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  if (labels.length <= 4) return labels.join(' / ');
  return `${labels.slice(0, 4).join(' / ')} +${labels.length - 4}`;
};

const resolveReadmePreviewDescriptionPart = (
  definition: Omit<ReadmePreviewDefinitionInput, 'descriptionKeys'>,
  key: ReadmePreviewDescriptionKey,
) => {
  const language = (definition.params.lang || '').toLowerCase();
  const ratingStyle = (definition.params.ratingStyle || '').toLowerCase();
  const posterRatings = String(definition.params.posterRatings || '').split(',').map((value) => value.trim()).filter(Boolean);
  const backdropRatings = String(definition.params.backdropRatings || '').split(',').map((value) => value.trim()).filter(Boolean);
  const logoRatings = String(definition.params.logoRatings || '').split(',').map((value) => value.trim()).filter(Boolean);
  const ratingProviders = posterRatings.length > 0 ? posterRatings : backdropRatings.length > 0 ? backdropRatings : logoRatings;

  if (key === 'language') {
    if (language === 'fr') return 'french text';
    if (language === 'ja') return 'japanese text';
    return 'english text';
  }

  if (key === 'style') {
    if (ratingStyle === 'glass') return 'glass ratings';
    if (ratingStyle === 'square') return 'square ratings';
    if (ratingStyle === 'plain') return 'plain ratings';
    return 'ratings';
  }

  if (key === 'providers') {
    return formatProviderList(ratingProviders);
  }

  if (key === 'stream-badges') {
    return 'stream badges';
  }

  if (key === 'text') {
    const imageText = (definition.params.imageText || '').toLowerCase();
    if (imageText === 'clean') return 'clean text';
    if (imageText === 'original') return 'original text';
    if (imageText === 'textless') return 'textless artwork';
    return 'custom text mode';
  }

  if (key === 'poster-layout') {
    const layout = (definition.params.posterRatingsLayout || '').toLowerCase();
    if (layout === 'left right') return 'split side layout';
    if (layout === 'top bottom') return 'top and bottom rows';
    if (layout === 'bottom') return 'bottom row layout';
    if (layout === 'top') return 'top row layout';
    return 'custom poster layout';
  }

  if (key === 'backdrop-layout') {
    const layout = (definition.params.backdropRatingsLayout || '').toLowerCase();
    if (layout === 'right vertical') return 'right side stack';
    if (layout === 'right') return 'right side layout';
    if (layout === 'center') return 'centered stack';
    return 'custom backdrop layout';
  }

  if (key === 'logo-background') {
    return definition.params.logoBackground === 'dark' ? 'dark canvas' : 'transparent canvas';
  }

  return 'detached age rating';
};

const buildReadmePreviewDefinition = (input: ReadmePreviewDefinitionInput): ReadmePreviewDefinition => {
  const { descriptionKeys, ...definition } = input;
  const description = descriptionKeys
    .map((key) => resolveReadmePreviewDescriptionPart(definition, key))
    .join(', ');

  return {
    ...definition,
    description: description.length > 0
      ? `${description.charAt(0).toUpperCase()}${description.slice(1)}`
      : '',
  };
};

const README_PREVIEW_POOL: ReadonlyArray<ReadmePreviewDefinition> = [
  buildReadmePreviewDefinition({
    slug: 'the-boys-poster',
    imageType: 'poster',
    id: 'tt1190634',
    extension: 'jpg',
    title: 'The Boys',
    titleGroup: 'the-boys',
    uniquenessFingerprint: 'poster-glass-stream-original',
    coverageTags: ['glass-style', 'stream-badges', 'english', 'top-bottom-layout', 'alt-providers'],
    descriptionKeys: ['style', 'providers', 'stream-badges', 'text'],
    params: {
      lang: 'en',
      posterStreamBadges: 'on',
      posterRatings: 'tmdb,imdb,trakt,rogerebert',
      ratingStyle: 'glass',
      imageText: 'original',
    },
  }),
  buildReadmePreviewDefinition({
    slug: 'dune-part-two-poster',
    imageType: 'poster',
    id: 'tt15239678',
    extension: 'jpg',
    title: 'Dune Part Two',
    titleGroup: 'dune-part-two',
    uniquenessFingerprint: 'poster-square-side-clean',
    coverageTags: ['square-style', 'english', 'side-layout', 'clean-text', 'alt-providers'],
    descriptionKeys: ['style', 'providers', 'text', 'poster-layout'],
    params: {
      lang: 'en',
      posterRatings: 'tmdb,tomatoes,metacritic,letterboxd',
      posterRatingsLayout: 'left right',
      posterQualityBadgesStyle: 'square',
      posterStreamBadges: 'off',
      ratingStyle: 'square',
      imageText: 'clean',
    },
  }),
  buildReadmePreviewDefinition({
    slug: 'attack-on-titan-poster',
    imageType: 'poster',
    id: 'mal:16498',
    extension: 'jpg',
    title: 'Attack on Titan',
    titleGroup: 'attack-on-titan',
    uniquenessFingerprint: 'poster-anime-stack-original',
    coverageTags: ['glass-style', 'non-english', 'anime', 'top-bottom-layout'],
    descriptionKeys: ['language', 'providers', 'poster-layout'],
    params: {
      lang: 'ja',
      posterRatings: 'tmdb,myanimelist,anilist,kitsu',
      posterRatingsLayout: 'top bottom',
      posterStreamBadges: 'off',
      ratingStyle: 'glass',
      imageText: 'original',
    },
  }),
  buildReadmePreviewDefinition({
    slug: 'game-of-thrones-poster',
    imageType: 'poster',
    id: 'tt0944947',
    extension: 'jpg',
    title: 'Game of Thrones',
    titleGroup: 'game-of-thrones',
    uniquenessFingerprint: 'poster-plain-split-age-right',
    coverageTags: ['plain-style', 'english', 'age-rating-detached', 'side-layout', 'alt-providers'],
    descriptionKeys: ['style', 'providers', 'poster-layout', 'age-rating'],
    params: {
      lang: 'en',
      posterRatings: 'tmdb,imdb,trakt,metacritic',
      posterRatingsLayout: 'left right',
      posterStreamBadges: 'off',
      ratingStyle: 'plain',
      ageRatingBadgePosition: 'right-center',
      imageText: 'clean',
    },
  }),
  buildReadmePreviewDefinition({
    slug: 'stranger-things-poster',
    imageType: 'poster',
    id: 'tt4574334',
    extension: 'jpg',
    title: 'Stranger Things',
    titleGroup: 'stranger-things',
    uniquenessFingerprint: 'poster-glass-bottom-stream-french',
    coverageTags: ['glass-style', 'stream-badges', 'non-english', 'bottom-layout', 'alt-providers'],
    descriptionKeys: ['language', 'style', 'providers', 'stream-badges', 'poster-layout'],
    params: {
      lang: 'fr',
      posterRatings: 'tmdb,imdb,tomatoes,metacriticuser',
      posterRatingsLayout: 'bottom',
      posterStreamBadges: 'on',
      ratingStyle: 'glass',
      imageText: 'clean',
    },
  }),
  buildReadmePreviewDefinition({
    slug: 'dune-part-two-poster-bottom-age',
    imageType: 'poster',
    id: 'tt15239678',
    extension: 'jpg',
    title: 'Dune Part Two',
    titleGroup: 'dune-part-two',
    uniquenessFingerprint: 'poster-square-top-bottom-age-bottom',
    coverageTags: ['square-style', 'english', 'age-rating-detached', 'top-bottom-layout', 'alt-providers'],
    descriptionKeys: ['style', 'providers', 'poster-layout', 'age-rating'],
    params: {
      lang: 'en',
      posterRatings: 'tmdb,tomatoes,metacritic,letterboxd',
      posterRatingsLayout: 'top bottom',
      posterQualityBadgesStyle: 'square',
      posterStreamBadges: 'off',
      ratingStyle: 'square',
      ageRatingBadgePosition: 'bottom-center',
      imageText: 'clean',
    },
  }),
  buildReadmePreviewDefinition({
    slug: 'game-of-thrones-backdrop',
    imageType: 'backdrop',
    id: 'tt0944947',
    extension: 'jpg',
    title: 'Game of Thrones',
    titleGroup: 'game-of-thrones',
    uniquenessFingerprint: 'backdrop-glass-right-vertical-french',
    coverageTags: ['glass-style', 'non-english', 'right-vertical-layout', 'alt-providers'],
    descriptionKeys: ['language', 'style', 'providers', 'backdrop-layout'],
    params: {
      lang: 'fr',
      backdropRatings: 'tmdb,imdb,trakt,metacritic',
      backdropRatingsLayout: 'right vertical',
      ratingStyle: 'glass',
      imageText: 'clean',
    },
  }),
  buildReadmePreviewDefinition({
    slug: 'stranger-things-backdrop',
    imageType: 'backdrop',
    id: 'tt4574334',
    extension: 'jpg',
    title: 'Stranger Things',
    titleGroup: 'stranger-things',
    uniquenessFingerprint: 'backdrop-square-stream-right-vertical',
    coverageTags: ['square-style', 'stream-badges', 'right-vertical-layout', 'english', 'alt-providers'],
    descriptionKeys: ['style', 'providers', 'stream-badges', 'backdrop-layout'],
    params: {
      lang: 'en',
      backdropRatings: 'tmdb,tomatoes,metacritic,letterboxd',
      backdropRatingsLayout: 'right vertical',
      backdropStreamBadges: 'on',
      ratingStyle: 'square',
      imageText: 'clean',
    },
  }),
  buildReadmePreviewDefinition({
    slug: 'the-boys-backdrop',
    imageType: 'backdrop',
    id: 'tt1190634',
    extension: 'jpg',
    title: 'The Boys',
    titleGroup: 'the-boys',
    uniquenessFingerprint: 'backdrop-plain-center-original',
    coverageTags: ['plain-style', 'center-layout', 'english', 'original-text', 'alt-providers'],
    descriptionKeys: ['style', 'providers', 'backdrop-layout', 'text'],
    params: {
      lang: 'en',
      backdropRatings: 'tmdb,imdb,trakt,rogerebert',
      backdropRatingsLayout: 'center',
      ratingStyle: 'plain',
      imageText: 'original',
    },
  }),
  buildReadmePreviewDefinition({
    slug: 'attack-on-titan-backdrop',
    imageType: 'backdrop',
    id: 'mal:16498',
    extension: 'jpg',
    title: 'Attack on Titan',
    titleGroup: 'attack-on-titan',
    uniquenessFingerprint: 'backdrop-anime-center-japanese',
    coverageTags: ['glass-style', 'non-english', 'anime', 'center-layout'],
    descriptionKeys: ['language', 'providers', 'backdrop-layout'],
    params: {
      lang: 'ja',
      backdropRatings: 'tmdb,myanimelist,anilist,kitsu',
      backdropRatingsLayout: 'center',
      ratingStyle: 'glass',
      imageText: 'original',
    },
  }),
  buildReadmePreviewDefinition({
    slug: 'dune-part-two-backdrop',
    imageType: 'backdrop',
    id: 'tt15239678',
    extension: 'jpg',
    title: 'Dune Part Two',
    titleGroup: 'dune-part-two',
    uniquenessFingerprint: 'backdrop-glass-right-clean',
    coverageTags: ['glass-style', 'right-layout', 'english', 'clean-text', 'alt-providers'],
    descriptionKeys: ['style', 'providers', 'backdrop-layout'],
    params: {
      lang: 'en',
      backdropRatings: 'tmdb,tomatoes,metacritic,letterboxd',
      backdropRatingsLayout: 'right',
      ratingStyle: 'glass',
      imageText: 'clean',
    },
  }),
  buildReadmePreviewDefinition({
    slug: 'the-boys-logo',
    imageType: 'logo',
    id: 'tt1190634',
    extension: 'jpg',
    title: 'The Boys',
    titleGroup: 'the-boys',
    uniquenessFingerprint: 'logo-dark-glass-quality',
    coverageTags: ['dark-background', 'glass-style', 'english', 'alt-providers'],
    descriptionKeys: ['logo-background', 'style', 'providers'],
    params: {
      lang: 'en',
      logoRatings: 'tmdb,imdb,trakt,rogerebert',
      ratingStyle: 'glass',
      logoBackground: 'dark',
    },
  }),
  buildReadmePreviewDefinition({
    slug: 'attack-on-titan-logo',
    imageType: 'logo',
    id: 'mal:16498',
    extension: 'jpg',
    title: 'Attack on Titan',
    titleGroup: 'attack-on-titan',
    uniquenessFingerprint: 'logo-transparent-anime-glass',
    coverageTags: ['glass-style', 'non-english', 'anime', 'transparent-background'],
    descriptionKeys: ['language', 'providers', 'logo-background'],
    params: {
      lang: 'ja',
      logoRatings: 'tmdb,myanimelist,anilist,kitsu',
      ratingStyle: 'glass',
    },
  }),
  buildReadmePreviewDefinition({
    slug: 'dune-part-two-logo',
    imageType: 'logo',
    id: 'tt15239678',
    extension: 'jpg',
    title: 'Dune Part Two',
    titleGroup: 'dune-part-two',
    uniquenessFingerprint: 'logo-dark-square-compact',
    coverageTags: ['dark-background', 'square-style', 'english', 'alt-providers'],
    descriptionKeys: ['logo-background', 'style', 'providers'],
    params: {
      lang: 'en',
      logoRatings: 'tmdb,tomatoes,metacritic,letterboxd',
      ratingStyle: 'square',
      logoBackground: 'dark',
    },
  }),
  buildReadmePreviewDefinition({
    slug: 'game-of-thrones-logo',
    imageType: 'logo',
    id: 'tt0944947',
    extension: 'jpg',
    title: 'Game of Thrones',
    titleGroup: 'game-of-thrones',
    uniquenessFingerprint: 'logo-transparent-plain-french',
    coverageTags: ['plain-style', 'non-english', 'transparent-background', 'alt-providers'],
    descriptionKeys: ['language', 'style', 'providers', 'logo-background'],
    params: {
      lang: 'fr',
      logoRatings: 'tmdb,imdb,trakt,metacritic',
      ratingStyle: 'plain',
    },
  }),
  buildReadmePreviewDefinition({
    slug: 'stranger-things-logo',
    imageType: 'logo',
    id: 'tt4574334',
    extension: 'jpg',
    title: 'Stranger Things',
    titleGroup: 'stranger-things',
    uniquenessFingerprint: 'logo-dark-square-stack',
    coverageTags: ['dark-background', 'square-style', 'english', 'alt-providers'],
    descriptionKeys: ['logo-background', 'style', 'providers'],
    params: {
      lang: 'en',
      logoRatings: 'tmdb,tomatoes,metacriticuser,letterboxd',
      ratingStyle: 'square',
      logoBackground: 'dark',
    },
  }),
] as const;

const README_PREVIEW_POOL_MAP = new Map<string, ReadmePreviewDefinition>(
  README_PREVIEW_POOL.map((definition) => [definition.slug, definition]),
);

const DEFAULT_README_PREVIEW_STATE: ReadmePreviewState = {
  schemaVersion: 1,
  version: '1.9.0',
  seed: 'bootstrap',
  selectedAt: '2026-04-05T00:00:00.000Z',
  activeSlugs: {
    poster: ['the-boys-poster', 'dune-part-two-poster', 'attack-on-titan-poster', 'game-of-thrones-poster'],
    backdrop: ['game-of-thrones-backdrop', 'stranger-things-backdrop', 'the-boys-backdrop'],
    logo: ['the-boys-logo', 'attack-on-titan-logo', 'dune-part-two-logo'],
  },
  historySlugs: createEmptySlugBuckets(),
};

const normalizeSeed = (value: string | null | undefined) => String(value || '').trim() || 'default';

const normalizeSlugBuckets = (
  buckets: Partial<Record<ReadmePreviewImageType, readonly string[]>> | undefined,
  fallback: ReadmePreviewSlugBuckets,
) => {
  const output = createEmptySlugBuckets();

  for (const imageType of Object.keys(README_PREVIEW_GALLERY_CONFIG) as ReadmePreviewImageType[]) {
    const validSlugs = new Set(
      README_PREVIEW_POOL.filter((definition) => definition.imageType === imageType).map(
        (definition) => definition.slug,
      ),
    );
    const bucket = Array.isArray(buckets?.[imageType]) ? buckets?.[imageType] : fallback[imageType];
    output[imageType] = Array.from(new Set((bucket || []).filter((slug) => validSlugs.has(slug))));
  }

  return output;
};

const normalizeReadmePreviewState = (value: unknown): ReadmePreviewState => {
  const candidate = value && typeof value === 'object' ? (value as Partial<ReadmePreviewState>) : {};

  return {
    schemaVersion: 1,
    version: String(candidate.version || DEFAULT_README_PREVIEW_STATE.version),
    seed: normalizeSeed(candidate.seed || DEFAULT_README_PREVIEW_STATE.seed),
    selectedAt: String(candidate.selectedAt || DEFAULT_README_PREVIEW_STATE.selectedAt),
    activeSlugs: normalizeSlugBuckets(candidate.activeSlugs, DEFAULT_README_PREVIEW_STATE.activeSlugs),
    historySlugs: normalizeSlugBuckets(candidate.historySlugs, createEmptySlugBuckets()),
  };
};

const readReadmePreviewState = (): ReadmePreviewState => {
  try {
    return normalizeReadmePreviewState(JSON.parse(readFileSync(README_PREVIEW_STATE_PATH, 'utf8')));
  } catch {
    return DEFAULT_README_PREVIEW_STATE;
  }
};

const getDefinitionsForImageType = (imageType: ReadmePreviewImageType) =>
  README_PREVIEW_POOL.filter((definition) => definition.imageType === imageType);

const getActiveDefinitionsForImageType = (
  imageType: ReadmePreviewImageType,
  state: ReadmePreviewState,
) => {
  const activeDefinitions = state.activeSlugs[imageType]
    .map((slug) => README_PREVIEW_POOL_MAP.get(slug) || null)
    .filter((definition): definition is ReadmePreviewDefinition => Boolean(definition));

  if (activeDefinitions.length === README_PREVIEW_GALLERY_CONFIG[imageType].slots) {
    return activeDefinitions;
  }

  return DEFAULT_README_PREVIEW_STATE.activeSlugs[imageType]
    .map((slug) => README_PREVIEW_POOL_MAP.get(slug) || null)
    .filter((definition): definition is ReadmePreviewDefinition => Boolean(definition));
};

const collectCoverageTags = (definitions: readonly ReadmePreviewDefinition[]) =>
  new Set(definitions.flatMap((definition) => definition.coverageTags));

const selectionMeetsCoverage = (
  imageType: ReadmePreviewImageType,
  definitions: readonly ReadmePreviewDefinition[],
) => {
  const coverageTags = collectCoverageTags(definitions);
  return README_PREVIEW_GALLERY_CONFIG[imageType].requiredCoverageTags.every((tag) => coverageTags.has(tag));
};

const countDistinctBy = (
  definitions: readonly ReadmePreviewDefinition[],
  pick: (definition: ReadmePreviewDefinition) => string,
) => new Set(definitions.map(pick)).size;

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const sortDefinitionsForSeed = (
  definitions: readonly ReadmePreviewDefinition[],
  seed: string,
  historyOrder: Map<string, number>,
) => {
  return [...definitions].sort((left, right) => {
    const leftHistoryOrder = historyOrder.get(left.slug);
    const rightHistoryOrder = historyOrder.get(right.slug);
    const leftRecent = leftHistoryOrder !== undefined;
    const rightRecent = rightHistoryOrder !== undefined;

    if (leftRecent !== rightRecent) {
      return leftRecent ? 1 : -1;
    }

    if (leftRecent && rightRecent && leftHistoryOrder !== rightHistoryOrder) {
      return (leftHistoryOrder ?? 0) - (rightHistoryOrder ?? 0);
    }

    const leftScore = hashString(`${seed}:${left.slug}`);
    const rightScore = hashString(`${seed}:${right.slug}`);
    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    return left.slug.localeCompare(right.slug);
  });
};

const findSelectionCombination = ({
  imageType,
  definitions,
  slots,
}: {
  imageType: ReadmePreviewImageType;
  definitions: readonly ReadmePreviewDefinition[];
  slots: number;
}) => {
  const search = (
    startIndex: number,
    picked: ReadonlyArray<ReadmePreviewDefinition>,
  ): ReadonlyArray<ReadmePreviewDefinition> | null => {
    if (picked.length === slots) {
      return selectionMeetsCoverage(imageType, picked) ? picked : null;
    }

    const remainingSlots = slots - picked.length;
    if (definitions.length - startIndex < remainingSlots) {
      return null;
    }

    for (let index = startIndex; index < definitions.length; index += 1) {
      const candidate = definitions[index];
      if (
        picked.some(
          (definition) =>
            definition.uniquenessFingerprint === candidate.uniquenessFingerprint
            || definition.titleGroup === candidate.titleGroup,
        )
      ) {
        continue;
      }

      const resolved = search(index + 1, [...picked, candidate]);
      if (resolved) {
        return resolved;
      }
    }

    return null;
  };

  return search(0, []);
};

const getPreviewProviders = (definition: ReadmePreviewDefinition) => {
  if (definition.imageType === 'poster') {
    return String(definition.params.posterRatings || '').split(',').map((value) => value.trim()).filter(Boolean);
  }
  if (definition.imageType === 'backdrop') {
    return String(definition.params.backdropRatings || '').split(',').map((value) => value.trim()).filter(Boolean);
  }
  return String(definition.params.logoRatings || '').split(',').map((value) => value.trim()).filter(Boolean);
};

const getLayoutSignature = (definition: ReadmePreviewDefinition) => {
  if (definition.imageType === 'poster') {
    return String(definition.params.posterRatingsLayout || 'default').trim().toLowerCase();
  }
  if (definition.imageType === 'backdrop') {
    return String(definition.params.backdropRatingsLayout || 'default').trim().toLowerCase();
  }
  return String(definition.params.logoBackground || 'transparent').trim().toLowerCase();
};

const getStyleSignature = (definition: ReadmePreviewDefinition) =>
  String(definition.params.ratingStyle || 'default').trim().toLowerCase();

const getLanguageSignature = (definition: ReadmePreviewDefinition) =>
  String(definition.params.lang || 'en').trim().toLowerCase();

const ALT_PROVIDER_SET = new Set([
  'allocine',
  'allocinepress',
  'tomatoes',
  'tomatoesaudience',
  'letterboxd',
  'metacritic',
  'metacriticuser',
  'trakt',
  'simkl',
  'rogerebert',
]);

const countAltProviders = (definition: ReadmePreviewDefinition) =>
  getPreviewProviders(definition).filter((provider) => ALT_PROVIDER_SET.has(provider)).length;

const scoreSelectionCandidate = ({
  definitions,
  historyOrder,
}: {
  definitions: readonly ReadmePreviewDefinition[];
  historyOrder: Map<string, number>;
}): Omit<ReadmePreviewSelectionCandidate, 'seedOrderScore' | 'definitions'> => {
  const coverageCount = new Set(definitions.flatMap((definition) => definition.coverageTags)).size;
  const styleCount = new Set(definitions.map((definition) => getStyleSignature(definition))).size;
  const languageCount = new Set(definitions.map((definition) => getLanguageSignature(definition))).size;
  const layoutCount = new Set(definitions.map((definition) => getLayoutSignature(definition))).size;
  const providerCount = new Set(
    definitions.map((definition) => getPreviewProviders(definition).join(',')),
  ).size;
  const altProviderDefinitionCount = definitions.filter(
    (definition) => countAltProviders(definition) > 0,
  ).length;
  const altProviderCount = definitions.reduce(
    (sum, definition) => sum + countAltProviders(definition),
    0,
  );
  const nonEnglishCount = definitions.filter((definition) => getLanguageSignature(definition) !== 'en').length;
  const singleProviderCount = definitions.filter((definition) => getPreviewProviders(definition).length <= 1).length;
  const historyPenalty = definitions.reduce(
    (sum, definition) => sum + (historyOrder.get(definition.slug) ?? -2),
    0,
  );

  return {
    diversityScore:
      coverageCount * 100
      + styleCount * 35
      + languageCount * 30
      + layoutCount * 24
      + providerCount * 16
      + altProviderDefinitionCount * 20
      + altProviderCount * 6
      + nonEnglishCount * 12
      - singleProviderCount * 8,
    historyPenalty,
  };
};

const findBestSelectionCombination = ({
  imageType,
  definitions,
  slots,
  historyOrder,
}: {
  imageType: ReadmePreviewImageType;
  definitions: readonly ReadmePreviewDefinition[];
  slots: number;
  historyOrder: Map<string, number>;
}): ReadonlyArray<ReadmePreviewDefinition> | null => {
  let bestCandidate: ReadmePreviewSelectionCandidate | null = null;

  const search = (startIndex: number, picked: ReadonlyArray<ReadmePreviewDefinition>) => {
    if (picked.length === slots) {
      if (!selectionMeetsCoverage(imageType, picked)) {
        return;
      }

      const scored = scoreSelectionCandidate({ definitions: picked, historyOrder });
      const seedOrderScore = picked.reduce((sum, definition) => sum + definitions.indexOf(definition), 0);
      const candidate: ReadmePreviewSelectionCandidate = {
        definitions: picked,
        seedOrderScore,
        diversityScore: scored.diversityScore,
        historyPenalty: scored.historyPenalty,
      };

      if (!bestCandidate) {
        bestCandidate = candidate;
        return;
      }

      if (candidate.diversityScore > bestCandidate.diversityScore) {
        bestCandidate = candidate;
        return;
      }

      if (
        candidate.diversityScore === bestCandidate.diversityScore
        && candidate.historyPenalty < bestCandidate.historyPenalty
      ) {
        bestCandidate = candidate;
        return;
      }

      if (
        candidate.diversityScore === bestCandidate.diversityScore
        && candidate.historyPenalty === bestCandidate.historyPenalty
        && candidate.seedOrderScore < bestCandidate.seedOrderScore
      ) {
        bestCandidate = candidate;
      }
      return;
    }

    const remainingSlots = slots - picked.length;
    if (definitions.length - startIndex < remainingSlots) {
      return;
    }

    for (let index = startIndex; index < definitions.length; index += 1) {
      const candidate = definitions[index];
      if (
        picked.some(
          (definition) =>
            definition.uniquenessFingerprint === candidate.uniquenessFingerprint
            || definition.titleGroup === candidate.titleGroup,
        )
      ) {
        continue;
      }

      search(index + 1, [...picked, candidate]);
    }
  };

  search(0, []);
  return getSelectionCandidateDefinitions(bestCandidate);
};

const assertPoolSupportsImageType = (imageType: ReadmePreviewImageType) => {
  const definitions = getDefinitionsForImageType(imageType);
  const config = README_PREVIEW_GALLERY_CONFIG[imageType];

  if (definitions.length < config.slots) {
    throw new Error(`README preview ${imageType} pool only has ${definitions.length} entries for ${config.slots} slots.`);
  }

  if (countDistinctBy(definitions, (definition) => definition.uniquenessFingerprint) < config.slots) {
    throw new Error(`README preview ${imageType} pool does not have enough unique fingerprints.`);
  }

  if (countDistinctBy(definitions, (definition) => definition.titleGroup) < config.slots) {
    throw new Error(`README preview ${imageType} pool does not have enough distinct title groups.`);
  }

  for (const tag of config.requiredCoverageTags) {
    if (!definitions.some((definition) => definition.coverageTags.includes(tag))) {
      throw new Error(`README preview ${imageType} pool is missing required coverage tag "${tag}".`);
    }
  }

  const orderedDefinitions = [...definitions].sort((left, right) => left.slug.localeCompare(right.slug));
  if (!findBestSelectionCombination({ imageType, definitions: orderedDefinitions, slots: config.slots, historyOrder: new Map() })) {
    throw new Error(
      `README preview ${imageType} pool cannot satisfy slot count, coverage tags, and uniqueness constraints together.`,
    );
  }
};

export const validateReadmePreviewPool = () => {
  for (const imageType of Object.keys(README_PREVIEW_GALLERY_CONFIG) as ReadmePreviewImageType[]) {
    assertPoolSupportsImageType(imageType);
  }
};

export const normalizeReadmePreviewVersion = (version: string) =>
  String(version || '').trim().replace(/[^0-9A-Za-z]+/g, '-');

export const buildReadmePreviewCacheBuster = ({
  slug,
  version,
}: {
  slug: string;
  version: string;
}) => `readme-preview-${slug}-v${normalizeReadmePreviewVersion(version)}`;

export const selectReadmePreviewGallery = ({
  seed,
  version,
  previousState = null,
  selectedAt = null,
}: {
  seed: string;
  version: string;
  previousState?: ReadmePreviewState | null;
  selectedAt?: string | null;
}): ReadmePreviewSelectionResult => {
  validateReadmePreviewPool();

  const normalizedState = normalizeReadmePreviewState(previousState);
  const normalizedSeed = normalizeSeed(seed);
  const definitions = {
    poster: [] as ReadmePreviewDefinition[],
    backdrop: [] as ReadmePreviewDefinition[],
    logo: [] as ReadmePreviewDefinition[],
  };
  const activeSlugs = createEmptySlugBuckets();
  const historySlugs = createEmptySlugBuckets();

  for (const imageType of Object.keys(README_PREVIEW_GALLERY_CONFIG) as ReadmePreviewImageType[]) {
    const config = README_PREVIEW_GALLERY_CONFIG[imageType];
    const historyOrder = new Map(
      normalizedState.historySlugs[imageType].map((slug, index) => [slug, index]),
    );
    const poolDefinitions = getDefinitionsForImageType(imageType);
    const preferredDefinitions = poolDefinitions.filter(
      (definition) => !historyOrder.has(definition.slug),
    );
    const preferredSelection = preferredDefinitions.length >= config.slots
      ? findBestSelectionCombination({
        imageType,
        definitions: sortDefinitionsForSeed(preferredDefinitions, normalizedSeed, historyOrder),
        slots: config.slots,
        historyOrder,
      })
      : null;
    const resolvedSelection = preferredSelection
      || findBestSelectionCombination({
        imageType,
        definitions: sortDefinitionsForSeed(poolDefinitions, normalizedSeed, historyOrder),
        slots: config.slots,
        historyOrder,
      });

    if (!resolvedSelection) {
      throw new Error(`Unable to resolve a README preview selection for ${imageType}.`);
    }

    definitions[imageType] = [...resolvedSelection];
    activeSlugs[imageType] = resolvedSelection.map((definition) => definition.slug);

    const nextHistory = normalizedState.historySlugs[imageType]
      .filter((slug) => !activeSlugs[imageType].includes(slug) && README_PREVIEW_POOL_MAP.has(slug));
    nextHistory.push(...activeSlugs[imageType]);
    while (nextHistory.length > poolDefinitions.length) {
      nextHistory.shift();
    }
    historySlugs[imageType] = nextHistory;
  }

  return {
    definitions,
    state: {
      schemaVersion: 1,
      version: String(version || '').trim(),
      seed: normalizedSeed,
      selectedAt: String(selectedAt || new Date().toISOString()),
      activeSlugs,
      historySlugs,
    },
  };
};

export const getReadmePreviewPoolDefinitions = () => README_PREVIEW_POOL;

export const getReadmePreviewDefinitions = () => {
  const state = readReadmePreviewState();
  return [
    ...getActiveDefinitionsForImageType('poster', state),
    ...getActiveDefinitionsForImageType('backdrop', state),
    ...getActiveDefinitionsForImageType('logo', state),
  ];
};

export const resolveReadmePreviewDefinition = (slug: string) => {
  const normalized = String(slug || '').trim().toLowerCase();
  const state = readReadmePreviewState();

  for (const imageType of Object.keys(README_PREVIEW_GALLERY_CONFIG) as ReadmePreviewImageType[]) {
    const activeDefinition = getActiveDefinitionsForImageType(imageType, state).find(
      (definition) => definition.slug === normalized,
    );
    if (activeDefinition) {
      return activeDefinition;
    }
  }

  return README_PREVIEW_POOL_MAP.get(normalized) || null;
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

const buildGalleryTable = ({
  imageType,
  definitions,
  version,
}: {
  imageType: ReadmePreviewImageType;
  definitions: readonly ReadmePreviewDefinition[];
  version: string;
}) => {
  const config = README_PREVIEW_GALLERY_CONFIG[imageType];
  const headingCells = definitions
    .map(
      (definition) =>
        `    <td><strong>${definition.title}</strong><br>${definition.description}</td>`,
    )
    .join('\n');
  const imageCells = definitions
    .map((definition) => {
      const cacheBuster = buildReadmePreviewCacheBuster({ slug: definition.slug, version });
      const previewUrl = `${README_PREVIEW_GALLERY_ORIGIN}/preview/${definition.slug}?cb=${cacheBuster}`;
      return `    <td><a href="${previewUrl}"><img src="${previewUrl}" alt="${definition.title} ${imageType} live preview" width="${config.cardWidth}"></a></td>`;
    })
    .join('\n');

  return `### ${config.heading}\n\n<table>\n  <tr>\n${headingCells}\n  </tr>\n  <tr>\n${imageCells}\n  </tr>\n</table>`;
};

export const renderReadmePreviewGallerySection = ({
  definitions,
  version,
}: {
  definitions: Record<ReadmePreviewImageType, readonly ReadmePreviewDefinition[]>;
  version: string;
}) => {
  const sections = (Object.keys(README_PREVIEW_GALLERY_CONFIG) as ReadmePreviewImageType[])
    .map((imageType) => buildGalleryTable({ imageType, definitions: definitions[imageType], version }))
    .join('\n\n');

  return [
    '## Live Preview Gallery',
    '',
    'These are live requests against production so readers can see current poster, backdrop, and logo output directly inside GitHub.',
    '',
    'The gallery uses the optional server side preview env vars `XRDB_README_PREVIEW_TMDB_KEY` and `XRDB_README_PREVIEW_MDBLIST_KEY` so the README does not need to expose a raw API key.',
    '',
    'The doc refresh and release workflows rotate through a curated, varied set of preview cards. Each preview URL includes a `cb` cache buster token so GitHub fetches the current release selection.',
    '',
    sections,
    '',
  ].join('\n');
};

export const replaceReadmePreviewGallerySection = ({
  readme,
  section,
}: {
  readme: string;
  section: string;
}) => {
  const sectionPattern = /## Live Preview Gallery[\s\S]*?(?=\n## Rendering Option Comparisons\n)/;
  if (!sectionPattern.test(readme)) {
    throw new Error('Could not find the README live preview gallery section.');
  }

  return readme.replace(sectionPattern, section.trimEnd());
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
    !normalizedBindHost
    || normalizedBindHost === '0.0.0.0'
    || normalizedBindHost === '::'
    || normalizedBindHost === '[::]'
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