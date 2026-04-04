export type GenreBadgeMode = 'off' | 'text' | 'icon' | 'both';
export type GenreBadgeStyle = 'glass' | 'square' | 'plain';
export type GenreBadgePosition =
  | 'topLeft'
  | 'topCenter'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomCenter'
  | 'bottomRight';
export type GenreBadgeAnimeGrouping = 'split' | 'animation';
export type GenreBadgeFamilyId =
  | 'anime'
  | 'animation'
  | 'horror'
  | 'comedy'
  | 'romance'
  | 'action'
  | 'scifi'
  | 'fantasy'
  | 'crime'
  | 'drama'
  | 'documentary'
  | 'music'
  | 'reality'
  | 'family'
  | 'history'
  | 'kids'
  | 'news'
  | 'soap'
  | 'talk'
  | 'tvmovie'
  | 'warpolitics'
  | 'other';

export type GenreBadgeFamilyMeta = {
  id: GenreBadgeFamilyId;
  label: string;
  accentColor: string;
};

export type GenreBadgePreviewSample = {
  key: string;
  title: string;
  typeLabel: string;
  previewType: 'poster' | 'backdrop' | 'logo';
  mediaId: string;
  lang: string;
  familyId: GenreBadgeFamilyId;
  decision: string;
  params: Record<string, string>;
};

export const DEFAULT_GENRE_BADGE_MODE: GenreBadgeMode = 'off';
export const DEFAULT_GENRE_BADGE_STYLE: GenreBadgeStyle = 'glass';
export const DEFAULT_GENRE_BADGE_POSITION: GenreBadgePosition = 'topLeft';
export const DEFAULT_GENRE_BADGE_ANIME_GROUPING: GenreBadgeAnimeGrouping = 'split';

export const GENRE_BADGE_MODE_OPTIONS: Array<{
  id: GenreBadgeMode;
  label: string;
  description: string;
}> = [
  {
    id: 'off',
    label: 'Off',
    description: 'Disable genre badges.',
  },
  {
    id: 'text',
    label: 'Text',
    description: 'Render a small genre label only.',
  },
  {
    id: 'icon',
    label: 'Icon',
    description: 'Render the icon only.',
  },
  {
    id: 'both',
    label: 'Both',
    description: 'Render the icon with a short text label.',
  },
];

export const GENRE_BADGE_STYLE_OPTIONS: Array<{
  id: GenreBadgeStyle;
  label: string;
  description: string;
}> = [
  {
    id: 'glass',
    label: 'Pill Glass',
    description: 'Use the current glossy pill treatment with a soft surface.',
  },
  {
    id: 'square',
    label: 'Square Dark',
    description: 'Use a tighter squared dark plate for a cleaner badge block.',
  },
  {
    id: 'plain',
    label: 'No Background',
    description: 'Render just the icon and text with no badge surface behind them.',
  },
];

export const GENRE_BADGE_POSITION_OPTIONS: Array<{
  id: GenreBadgePosition;
  label: string;
  description: string;
}> = [
  {
    id: 'topLeft',
    label: 'Top Left',
    description: 'Anchor the badge to the upper left corner.',
  },
  {
    id: 'topCenter',
    label: 'Top Center',
    description: 'Anchor the badge to the upper center edge.',
  },
  {
    id: 'topRight',
    label: 'Top Right',
    description: 'Anchor the badge to the upper right corner.',
  },
  {
    id: 'bottomLeft',
    label: 'Bottom Left',
    description: 'Anchor the badge to the lower left corner.',
  },
  {
    id: 'bottomCenter',
    label: 'Bottom Center',
    description: 'Anchor the badge to the lower center edge.',
  },
  {
    id: 'bottomRight',
    label: 'Bottom Right',
    description: 'Anchor the badge to the lower right corner.',
  },
];

const GENRE_BADGE_MODE_SET = new Set<GenreBadgeMode>(
  GENRE_BADGE_MODE_OPTIONS.map((option) => option.id),
);
const GENRE_BADGE_STYLE_SET = new Set<GenreBadgeStyle>(
  GENRE_BADGE_STYLE_OPTIONS.map((option) => option.id),
);
const GENRE_BADGE_ANIME_GROUPING_SET = new Set<GenreBadgeAnimeGrouping>([
  'split',
  'animation',
]);

export const normalizeGenreBadgeMode = (
  value: unknown,
  fallback: GenreBadgeMode = DEFAULT_GENRE_BADGE_MODE,
): GenreBadgeMode => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return GENRE_BADGE_MODE_SET.has(normalized as GenreBadgeMode)
    ? (normalized as GenreBadgeMode)
    : fallback;
};

export const normalizeGenreBadgeStyle = (
  value: unknown,
  fallback: GenreBadgeStyle = DEFAULT_GENRE_BADGE_STYLE,
): GenreBadgeStyle => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return GENRE_BADGE_STYLE_SET.has(normalized as GenreBadgeStyle)
    ? (normalized as GenreBadgeStyle)
    : fallback;
};

export const normalizeGenreBadgePosition = (
  value: unknown,
  fallback: GenreBadgePosition = DEFAULT_GENRE_BADGE_POSITION,
): GenreBadgePosition => {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z]+/g, '') : '';

  switch (normalized) {
    case 'topleft':
      return 'topLeft';
    case 'topcenter':
      return 'topCenter';
    case 'topright':
      return 'topRight';
    case 'bottomleft':
      return 'bottomLeft';
    case 'bottomcenter':
      return 'bottomCenter';
    case 'bottomright':
      return 'bottomRight';
    default:
      return fallback;
  }
};

export const normalizeGenreBadgeAnimeGrouping = (
  value: unknown,
  fallback: GenreBadgeAnimeGrouping = DEFAULT_GENRE_BADGE_ANIME_GROUPING,
): GenreBadgeAnimeGrouping => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'grouped' || normalized === 'group' || normalized === 'animationonly') {
    return 'animation';
  }
  return GENRE_BADGE_ANIME_GROUPING_SET.has(normalized as GenreBadgeAnimeGrouping)
    ? (normalized as GenreBadgeAnimeGrouping)
    : fallback;
};

export const GENRE_BADGE_FAMILY_META: Record<GenreBadgeFamilyId, GenreBadgeFamilyMeta> = {
  anime: {
    id: 'anime',
    label: 'ANIME',
    accentColor: '#f59e0b',
  },
  animation: {
    id: 'animation',
    label: 'ANIMATION',
    accentColor: '#38bdf8',
  },
  horror: {
    id: 'horror',
    label: 'HORROR',
    accentColor: '#ef4444',
  },
  comedy: {
    id: 'comedy',
    label: 'COMEDY',
    accentColor: '#facc15',
  },
  romance: {
    id: 'romance',
    label: 'ROMANCE',
    accentColor: '#fb7185',
  },
  action: {
    id: 'action',
    label: 'ACTION',
    accentColor: '#fb923c',
  },
  scifi: {
    id: 'scifi',
    label: 'SCI FI',
    accentColor: '#22d3ee',
  },
  fantasy: {
    id: 'fantasy',
    label: 'FANTASY',
    accentColor: '#34d399',
  },
  crime: {
    id: 'crime',
    label: 'CRIME',
    accentColor: '#60a5fa',
  },
  drama: {
    id: 'drama',
    label: 'DRAMA',
    accentColor: '#818cf8',
  },
  documentary: {
    id: 'documentary',
    label: 'DOC',
    accentColor: '#a3e635',
  },
  music: {
    id: 'music',
    label: 'MUSIC',
    accentColor: '#c084fc',
  },
  reality: {
    id: 'reality',
    label: 'REALITY',
    accentColor: '#fbbf24',
  },
  family: {
    id: 'family',
    label: 'FAMILY',
    accentColor: '#4ade80',
  },
  history: {
    id: 'history',
    label: 'HISTORY',
    accentColor: '#94a3b8',
  },
  kids: {
    id: 'kids',
    label: 'KIDS',
    accentColor: '#f472b6',
  },
  news: {
    id: 'news',
    label: 'NEWS',
    accentColor: '#64748b',
  },
  soap: {
    id: 'soap',
    label: 'SOAP',
    accentColor: '#2dd4bf',
  },
  talk: {
    id: 'talk',
    label: 'TALK',
    accentColor: '#a78bfa',
  },
  tvmovie: {
    id: 'tvmovie',
    label: 'TV',
    accentColor: '#f59e0b',
  },
  warpolitics: {
    id: 'warpolitics',
    label: 'WAR',
    accentColor: '#f87171',
  },
  other: {
    id: 'other',
    label: 'OTHER',
    accentColor: '#9ca3af',
  },
};

const TMDB_GENRE = {
  action: 28,
  adventure: 12,
  animation: 16,
  comedy: 35,
  crime: 80,
  drama: 18,
  documentary: 99,
  fantasy: 14,
  horror: 27,
  mystery: 9648,
  romance: 10749,
  scienceFictionMovie: 878,
  thriller: 53,
  war: 10752,
  western: 37,
  actionAdventureTv: 10759,
  kids: 10762,
  scifiFantasyTv: 10765,
  music: 10402,
  reality: 10764,
  family: 10751,
  history: 36,
  news: 10763,
  soap: 10766,
  talk: 10767,
  tvMovie: 10770,
  warPoliticsTv: 10768,
} as const;

const normalizeGenreName = (value: string) => value.trim().toLowerCase().replace(/[_-]+/g, ' ');

const collectGenreNames = (
  genres: Array<{ id?: number | null; name?: string | null } | string | null | undefined>,
) => {
  const result = new Set<string>();
  for (const genre of genres) {
    if (typeof genre === 'string') {
      const normalized = normalizeGenreName(genre);
      if (normalized) result.add(normalized);
      continue;
    }
    if (genre && typeof genre === 'object' && typeof genre.name === 'string') {
      const normalized = normalizeGenreName(genre.name);
      if (normalized) result.add(normalized);
    }
  }
  return result;
};

const collectGenreIds = (
  genres: Array<{ id?: number | null; name?: string | null } | string | null | undefined>,
  extraGenreIds: Array<number | string | null | undefined> = [],
) => {
  const result = new Set<number>();

  for (const genre of genres) {
    if (!genre || typeof genre !== 'object') continue;
    if (typeof genre.id === 'number' && Number.isFinite(genre.id)) {
      result.add(genre.id);
    }
  }

  for (const value of extraGenreIds) {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseInt(value, 10)
          : Number.NaN;
    if (Number.isFinite(parsed)) {
      result.add(parsed);
    }
  }

  return result;
};

const hasGenreName = (genreNames: Set<string>, ...candidates: string[]) =>
  candidates.some((candidate) => genreNames.has(normalizeGenreName(candidate)));

const hasGenreId = (genreIds: Set<number>, ...candidates: number[]) =>
  candidates.some((candidate) => genreIds.has(candidate));

export const resolveGenreBadgeFamily = (input: {
  genres?: Array<{ id?: number | null; name?: string | null } | string | null | undefined> | null;
  genreIds?: Array<number | string | null | undefined> | null;
  isAnimeContent?: boolean;
  animeGrouping?: GenreBadgeAnimeGrouping;
}): GenreBadgeFamilyMeta | null => {
  const genres = Array.isArray(input.genres) ? input.genres : [];
  const genreNames = collectGenreNames(genres);
  const genreIds = collectGenreIds(genres, Array.isArray(input.genreIds) ? input.genreIds : []);
  const animeGrouping = normalizeGenreBadgeAnimeGrouping(input.animeGrouping);


  if (hasGenreName(genreNames, 'anime')) {
    return GENRE_BADGE_FAMILY_META.anime;
  }
  if (input.isAnimeContent) {
    if (animeGrouping === 'animation') {
      return GENRE_BADGE_FAMILY_META.animation;
    }
    return GENRE_BADGE_FAMILY_META.anime;
  }
  if (hasGenreName(genreNames, 'animation', 'animated') || hasGenreId(genreIds, TMDB_GENRE.animation)) {
    return GENRE_BADGE_FAMILY_META.animation;
  }

  if (hasGenreName(genreNames, 'horror') || hasGenreId(genreIds, TMDB_GENRE.horror)) {
    return GENRE_BADGE_FAMILY_META.horror;
  }

  if (hasGenreName(genreNames, 'documentary') || hasGenreId(genreIds, TMDB_GENRE.documentary)) {
    return GENRE_BADGE_FAMILY_META.documentary;
  }

  if (hasGenreName(genreNames, 'comedy') || hasGenreId(genreIds, TMDB_GENRE.comedy)) {
    return GENRE_BADGE_FAMILY_META.comedy;
  }

  if (hasGenreName(genreNames, 'romance') || hasGenreId(genreIds, TMDB_GENRE.romance)) {
    return GENRE_BADGE_FAMILY_META.romance;
  }

  if (
    hasGenreName(genreNames, 'science fiction', 'sci fi & fantasy', 'sci-fi & fantasy') ||
    hasGenreId(genreIds, TMDB_GENRE.scienceFictionMovie, TMDB_GENRE.scifiFantasyTv)
  ) {
    return GENRE_BADGE_FAMILY_META.scifi;
  }

  if (hasGenreName(genreNames, 'fantasy') || hasGenreId(genreIds, TMDB_GENRE.fantasy)) {
    return GENRE_BADGE_FAMILY_META.fantasy;
  }

  if (
    hasGenreName(genreNames, 'crime', 'thriller', 'mystery') ||
    hasGenreId(genreIds, TMDB_GENRE.crime, TMDB_GENRE.thriller, TMDB_GENRE.mystery)
  ) {
    return GENRE_BADGE_FAMILY_META.crime;
  }

  if (
    hasGenreName(genreNames, 'action', 'adventure', 'war', 'western', 'action & adventure') ||
    hasGenreId(
      genreIds,
      TMDB_GENRE.action,
      TMDB_GENRE.adventure,
      TMDB_GENRE.war,
      TMDB_GENRE.western,
      TMDB_GENRE.actionAdventureTv,
    )
  ) {
    return GENRE_BADGE_FAMILY_META.action;
  }

  if (hasGenreName(genreNames, 'drama') || hasGenreId(genreIds, TMDB_GENRE.drama)) {
    return GENRE_BADGE_FAMILY_META.drama;
  }

  if (hasGenreName(genreNames, 'music') || hasGenreId(genreIds, TMDB_GENRE.music)) {
    return GENRE_BADGE_FAMILY_META.music;
  }

  if (hasGenreName(genreNames, 'reality') || hasGenreId(genreIds, TMDB_GENRE.reality)) {
    return GENRE_BADGE_FAMILY_META.reality;
  }

  if (hasGenreName(genreNames, 'family') || hasGenreId(genreIds, TMDB_GENRE.family)) {
    return GENRE_BADGE_FAMILY_META.family;
  }

  if (hasGenreName(genreNames, 'history') || hasGenreId(genreIds, TMDB_GENRE.history)) {
    return GENRE_BADGE_FAMILY_META.history;
  }

  if (hasGenreName(genreNames, 'kids') || hasGenreId(genreIds, TMDB_GENRE.kids)) {
    return GENRE_BADGE_FAMILY_META.kids;
  }

  if (hasGenreName(genreNames, 'news') || hasGenreId(genreIds, TMDB_GENRE.news)) {
    return GENRE_BADGE_FAMILY_META.news;
  }

  if (hasGenreName(genreNames, 'soap') || hasGenreId(genreIds, TMDB_GENRE.soap)) {
    return GENRE_BADGE_FAMILY_META.soap;
  }

  if (hasGenreName(genreNames, 'talk') || hasGenreId(genreIds, TMDB_GENRE.talk)) {
    return GENRE_BADGE_FAMILY_META.talk;
  }

  if (hasGenreName(genreNames, 'tv movie') || hasGenreId(genreIds, TMDB_GENRE.tvMovie)) {
    return GENRE_BADGE_FAMILY_META.tvmovie;
  }

  if (hasGenreName(genreNames, 'war & politics') || hasGenreId(genreIds, TMDB_GENRE.warPoliticsTv)) {
    return GENRE_BADGE_FAMILY_META.warpolitics;
  }

  if (genreNames.size > 0 || genreIds.size > 0) {
    return GENRE_BADGE_FAMILY_META.other;
  }

  return null;
};

export const GENRE_BADGE_PREVIEW_SAMPLES: ReadonlyArray<GenreBadgePreviewSample> = [
  {
    key: 'evil-dead-poster',
    title: 'The Evil Dead',
    typeLabel: 'Movie Poster',
    previewType: 'poster',
    mediaId: 'tt0083907',
    lang: 'en',
    familyId: 'horror',
    decision: 'Direct horror match. The badge stays literal instead of trying to infer a more abstract mood.',
    params: {
      posterRatings: 'tmdb',
      ratingStyle: 'glass',
      imageText: 'original',
      posterRatingsLayout: 'bottom',
    },
  },
  {
    key: 'lotr-poster',
    title: 'The Fellowship of the Ring',
    typeLabel: 'Movie Poster',
    previewType: 'poster',
    mediaId: 'tt0120737',
    lang: 'en',
    familyId: 'fantasy',
    decision: 'Fantasy wins over adventure and action so the badge stays distinct from the action bucket.',
    params: {
      posterRatings: 'tmdb',
      ratingStyle: 'glass',
      imageText: 'original',
      posterRatingsLayout: 'top bottom',
    },
  },
  {
    key: 'matrix-backdrop',
    title: 'The Matrix',
    typeLabel: 'Movie Backdrop',
    previewType: 'backdrop',
    mediaId: 'tt0133093',
    lang: 'en',
    familyId: 'scifi',
    decision: 'Science fiction outranks action so the icon stays orbit focused instead of collapsing into a generic action marker.',
    params: {
      backdropRatings: 'tmdb',
      ratingStyle: 'square',
      imageText: 'clean',
      backdropRatingsLayout: 'right',
    },
  },
  {
    key: 'spider-verse-poster',
    title: 'Spider Man Into the Spider Verse',
    typeLabel: 'Movie Poster',
    previewType: 'poster',
    mediaId: 'tt4633694',
    lang: 'en',
    familyId: 'animation',
    decision: 'Animated films now resolve to the animation family so the badge stays separate from anime native inputs.',
    params: {
      posterRatings: 'tmdb',
      ratingStyle: 'glass',
      imageText: 'original',
      posterRatingsLayout: 'top bottom',
    },
  },
  {
    key: 'office-backdrop',
    title: 'The Office',
    typeLabel: 'Show Backdrop',
    previewType: 'backdrop',
    mediaId: 'tt0386676',
    lang: 'en',
    familyId: 'comedy',
    decision: 'Comedy is a strong bucket. Secondary workplace and drama signals are ignored for badge clarity.',
    params: {
      backdropRatings: 'tmdb',
      ratingStyle: 'glass',
      imageText: 'clean',
      backdropRatingsLayout: 'center',
    },
  },
  {
    key: 'breaking-bad-logo',
    title: 'Breaking Bad',
    typeLabel: 'Show Logo',
    previewType: 'logo',
    mediaId: 'tt0903747',
    lang: 'en',
    familyId: 'crime',
    decision: 'Crime is the cleanest bucket here. Thriller and mystery now fold into this same bucket so the badge stays consistent.',
    params: {
      logoRatings: 'tmdb',
      ratingStyle: 'plain',
      logoBackground: 'dark',
    },
  },
  {
    key: 'attack-on-titan-poster',
    title: 'Attack on Titan',
    typeLabel: 'Anime Poster',
    previewType: 'poster',
    mediaId: 'mal:16498',
    lang: 'ja',
    familyId: 'anime',
    decision: 'Anime native inputs force the anime bucket so the badge does not flatten into generic animation.',
    params: {
      posterRatings: 'tmdb',
      ratingStyle: 'glass',
      imageText: 'original',
      posterRatingsLayout: 'top bottom',
    },
  },
  {
    key: 'whiplash-poster',
    title: 'Whiplash',
    typeLabel: 'Movie Poster',
    previewType: 'poster',
    mediaId: 'tt2582802',
    lang: 'en',
    familyId: 'music',
    decision: 'Music is the primary genre. Drama is secondary and loses to the more specific music bucket.',
    params: {
      posterRatings: 'tmdb',
      ratingStyle: 'glass',
      imageText: 'original',
      posterRatingsLayout: 'bottom',
    },
  },
  {
    key: 'survivor-backdrop',
    title: 'Survivor',
    typeLabel: 'Show Backdrop',
    previewType: 'backdrop',
    mediaId: 'tt0239195',
    lang: 'en',
    familyId: 'reality',
    decision: 'Reality TV resolves to the reality family. No stronger bucket applies.',
    params: {
      backdropRatings: 'tmdb',
      ratingStyle: 'glass',
      imageText: 'clean',
      backdropRatingsLayout: 'center',
    },
  },
  {
    key: 'incredibles-poster',
    title: 'The Incredibles',
    typeLabel: 'Movie Poster',
    previewType: 'poster',
    mediaId: 'tt0317705',
    lang: 'en',
    familyId: 'family',
    decision: 'Animation wins over family in the cascade. This sample uses a title where family is the dominant genre after animation is resolved separately.',
    params: {
      posterRatings: 'tmdb',
      ratingStyle: 'glass',
      imageText: 'original',
      posterRatingsLayout: 'top bottom',
    },
  },
  {
    key: 'schindlers-list-backdrop',
    title: 'Schindlers List',
    typeLabel: 'Movie Backdrop',
    previewType: 'backdrop',
    mediaId: 'tt0108052',
    lang: 'en',
    familyId: 'history',
    decision: 'History is the distinguishing genre. Drama is secondary.',
    params: {
      backdropRatings: 'tmdb',
      ratingStyle: 'square',
      imageText: 'clean',
      backdropRatingsLayout: 'right',
    },
  },
  {
    key: 'spongebob-poster',
    title: 'SpongeBob SquarePants',
    typeLabel: 'Show Poster',
    previewType: 'poster',
    mediaId: 'tt0206512',
    lang: 'en',
    familyId: 'kids',
    decision: 'Kids genre activates when animation is already resolved separately or absent from the genre list.',
    params: {
      posterRatings: 'tmdb',
      ratingStyle: 'glass',
      imageText: 'original',
      posterRatingsLayout: 'bottom',
    },
  },
] as const;
