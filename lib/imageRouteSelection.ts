import {
  DEFAULT_RANDOM_POSTER_FALLBACK_MODE,
  DEFAULT_RANDOM_POSTER_LANGUAGE_MODE,
  DEFAULT_RANDOM_POSTER_TEXT_MODE,
  type PosterTextPreference,
  type RandomPosterFallbackMode,
  type RandomPosterLanguageMode,
  type RandomPosterTextMode,
} from './imageRouteConfig.ts';
import {
  filterByLanguageWithFallback,
  normalizeImageLanguage,
  pickByLanguageWithFallback,
} from './imageLanguage.ts';
import { sha1Hex } from './imageRouteRuntime.ts';

export type RoutedImageCandidate = {
  file_path?: string | null;
  iso_639_1?: string | null;
  width?: number | null;
  height?: number | null;
  vote_average?: number | null;
  vote_count?: number | null;
};

export type RandomPosterSelectionOptions = {
  randomPosterTextMode: RandomPosterTextMode;
  randomPosterLanguageMode: RandomPosterLanguageMode;
  randomPosterMinVoteCount: number | null;
  randomPosterMinVoteAverage: number | null;
  randomPosterMinWidth: number | null;
  randomPosterMinHeight: number | null;
  randomPosterFallbackMode: RandomPosterFallbackMode;
};

export type FanartImageAsset = {
  url?: string | null;
  lang?: string | null;
  likes?: string | number | null;
};

export const pickDeterministicIndexBySeed = (seed: string, length: number) => {
  if (!Number.isFinite(length) || length <= 0) return 0;
  const normalizedSeed = String(seed || '').trim();
  if (!normalizedSeed) return 0;
  const hashValue = Number.parseInt(sha1Hex(normalizedSeed).slice(0, 12), 16);
  if (!Number.isFinite(hashValue) || hashValue < 0) return 0;
  return hashValue % length;
};

export const pickDeterministicItemBySeed = <T,>(items: T[] = [], seed: string) => {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[pickDeterministicIndexBySeed(seed, items.length)] || null;
};

export const isTextlessPosterSelection = (
  posters: RoutedImageCandidate[] = [],
  selectedPoster?: RoutedImageCandidate | null,
) => {
  if (!Array.isArray(posters) || posters.length === 0 || !selectedPoster?.file_path) return false;

  return posters.some(
    (poster) =>
      poster?.file_path === selectedPoster.file_path && normalizeImageLanguage(poster?.iso_639_1) === null
  );
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeThreshold = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const matchesPosterTextMode = (
  poster: RoutedImageCandidate,
  mode: RandomPosterTextMode,
) => {
  if (mode === 'any') {
    return true;
  }
  const language = normalizeImageLanguage(poster?.iso_639_1);
  return mode === 'text' ? language !== null : language === null;
};

const matchesPosterLanguageMode = (
  poster: RoutedImageCandidate,
  mode: RandomPosterLanguageMode,
  preferredLang: string,
  fallbackLang: string,
) => {
  if (mode === 'any') {
    return true;
  }
  const targetLanguage =
    mode === 'requested'
      ? normalizeImageLanguage(preferredLang)
      : normalizeImageLanguage(fallbackLang);
  if (!targetLanguage) {
    return true;
  }
  return normalizeImageLanguage(poster?.iso_639_1) === targetLanguage;
};

const buildPosterRank = (poster: RoutedImageCandidate, index: number) => {
  const voteAverage = Math.max(0, toFiniteNumber(poster?.vote_average) || 0);
  const voteCount = Math.max(0, toFiniteNumber(poster?.vote_count) || 0);
  const width = Math.max(0, toFiniteNumber(poster?.width) || 0);
  const height = Math.max(0, toFiniteNumber(poster?.height) || 0);
  const area = width * height;
  const score = voteAverage * 100 + Math.log10(voteCount + 1) * 12 + Math.log10(area + 1) * 4;

  return {
    poster,
    score,
    voteAverage,
    voteCount,
    area,
    index,
  };
};

const pickBestPosterCandidate = <T extends RoutedImageCandidate>(posters: T[] = []) =>
  posters
    .map((poster, index) => buildPosterRank(poster, index))
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      if (left.voteAverage !== right.voteAverage) return right.voteAverage - left.voteAverage;
      if (left.voteCount !== right.voteCount) return right.voteCount - left.voteCount;
      if (left.area !== right.area) return right.area - left.area;
      return left.index - right.index;
    })[0]?.poster || null;

const filterRandomPosterCandidates = <T extends RoutedImageCandidate>(
  posters: T[],
  options: RandomPosterSelectionOptions,
  preferredLang: string,
  fallbackLang: string,
) => {
  const minVoteCount = normalizeThreshold(options.randomPosterMinVoteCount);
  const minVoteAverage = normalizeThreshold(options.randomPosterMinVoteAverage);
  const minWidth = normalizeThreshold(options.randomPosterMinWidth);
  const minHeight = normalizeThreshold(options.randomPosterMinHeight);

  return posters.filter((poster) => {
    if (!matchesPosterTextMode(poster, options.randomPosterTextMode)) {
      return false;
    }
    if (!matchesPosterLanguageMode(poster, options.randomPosterLanguageMode, preferredLang, fallbackLang)) {
      return false;
    }
    const voteCount = Math.max(0, toFiniteNumber(poster?.vote_count) || 0);
    if (minVoteCount !== null && voteCount < minVoteCount) {
      return false;
    }
    const voteAverage = Math.max(0, toFiniteNumber(poster?.vote_average) || 0);
    if (minVoteAverage !== null && voteAverage < minVoteAverage) {
      return false;
    }
    const width = Math.max(0, toFiniteNumber(poster?.width) || 0);
    if (minWidth !== null && width < minWidth) {
      return false;
    }
    const height = Math.max(0, toFiniteNumber(poster?.height) || 0);
    if (minHeight !== null && height < minHeight) {
      return false;
    }
    return true;
  });
};

export const pickPosterByPreference = <T extends RoutedImageCandidate>(
  posters: T[] = [],
  preference: PosterTextPreference,
  preferredLang: string,
  fallbackLang: string,
  originalPosterPath?: string | null,
  randomSeed?: string,
  randomOptions?: Partial<RandomPosterSelectionOptions>,
): T | RoutedImageCandidate | null => {
  if (!Array.isArray(posters) || posters.length === 0) return null;

  const canonicalOriginalPath =
    originalPosterPath ||
    pickByLanguageWithFallback(posters, preferredLang, fallbackLang)?.file_path ||
    posters[0]?.file_path ||
    null;
  const originalPoster = canonicalOriginalPath
    ? posters.find((poster) => poster.file_path === canonicalOriginalPath)
    : null;
  const fallbackOriginal =
    originalPoster || (canonicalOriginalPath ? { file_path: canonicalOriginalPath } : posters[0]);
  const alternativePosters = posters.filter((poster) => poster.file_path !== canonicalOriginalPath);

  if (preference === 'clean') {
    return (
      posters.find((poster) => !poster.iso_639_1) ||
      pickByLanguageWithFallback(posters, preferredLang, fallbackLang) ||
      fallbackOriginal
    );
  }

  if (preference === 'original') {
    return fallbackOriginal;
  }

  if (preference === 'random') {
    const scopedPosters = filterByLanguageWithFallback(
      posters,
      preferredLang,
      fallbackLang,
    );
    const uniquePosters = [...new Map(
      scopedPosters
        .filter((poster) => typeof poster?.file_path === 'string' && poster.file_path.trim())
        .map((poster) => [poster.file_path, poster] as const)
    ).values()];
    const resolvedRandomOptions: RandomPosterSelectionOptions = {
      randomPosterTextMode: randomOptions?.randomPosterTextMode ?? DEFAULT_RANDOM_POSTER_TEXT_MODE,
      randomPosterLanguageMode:
        randomOptions?.randomPosterLanguageMode ?? DEFAULT_RANDOM_POSTER_LANGUAGE_MODE,
      randomPosterMinVoteCount: normalizeThreshold(randomOptions?.randomPosterMinVoteCount),
      randomPosterMinVoteAverage: normalizeThreshold(randomOptions?.randomPosterMinVoteAverage),
      randomPosterMinWidth: normalizeThreshold(randomOptions?.randomPosterMinWidth),
      randomPosterMinHeight: normalizeThreshold(randomOptions?.randomPosterMinHeight),
      randomPosterFallbackMode:
        randomOptions?.randomPosterFallbackMode ?? DEFAULT_RANDOM_POSTER_FALLBACK_MODE,
    };
    const filteredPosters = filterRandomPosterCandidates(
      uniquePosters,
      resolvedRandomOptions,
      preferredLang,
      fallbackLang,
    );
    if (filteredPosters.length > 0) {
      return (
        pickDeterministicItemBySeed(
          filteredPosters,
          `poster:${randomSeed || canonicalOriginalPath || preferredLang || fallbackLang || 'seed'}`,
        ) || fallbackOriginal
      );
    }
    if (resolvedRandomOptions.randomPosterFallbackMode === 'original') {
      return fallbackOriginal;
    }
    return pickBestPosterCandidate(uniquePosters) || fallbackOriginal;
  }

  return (
    pickByLanguageWithFallback(alternativePosters, preferredLang, fallbackLang) ||
    alternativePosters[0] ||
    fallbackOriginal
  );
};

export const pickBackdropByPreference = <T extends RoutedImageCandidate>(
  backdrops: T[] = [],
  preference: PosterTextPreference,
  preferredLang: string,
  fallbackLang: string,
  originalBackdropPath?: string | null,
  randomSeed?: string,
): T | RoutedImageCandidate | null => {
  if (!Array.isArray(backdrops) || backdrops.length === 0) return null;

  const canonicalOriginalPath =
    originalBackdropPath ||
    pickByLanguageWithFallback(backdrops, preferredLang, fallbackLang)?.file_path ||
    backdrops[0]?.file_path ||
    null;
  const originalBackdrop = canonicalOriginalPath
    ? backdrops.find((backdrop) => backdrop.file_path === canonicalOriginalPath)
    : null;
  const fallbackOriginal =
    originalBackdrop || (canonicalOriginalPath ? { file_path: canonicalOriginalPath } : backdrops[0]);
  const alternativeBackdrops = backdrops.filter((backdrop) => backdrop.file_path !== canonicalOriginalPath);

  if (preference === 'clean') {
    return (
      backdrops.find((backdrop) => !backdrop.iso_639_1) ||
      pickByLanguageWithFallback(backdrops, preferredLang, fallbackLang) ||
      fallbackOriginal
    );
  }

  if (preference === 'original') {
    return fallbackOriginal;
  }

  if (preference === 'random') {
    const scopedBackdrops = filterByLanguageWithFallback(
      backdrops,
      preferredLang,
      fallbackLang,
    );
    const uniqueBackdrops = [...new Map(
      scopedBackdrops
        .filter((backdrop) => typeof backdrop?.file_path === 'string' && backdrop.file_path.trim())
        .map((backdrop) => [backdrop.file_path, backdrop] as const)
    ).values()];
    return pickDeterministicItemBySeed(
      uniqueBackdrops,
      `backdrop:${randomSeed || canonicalOriginalPath || preferredLang || fallbackLang || 'seed'}`,
    ) || fallbackOriginal;
  }

  return (
    pickByLanguageWithFallback(alternativeBackdrops, preferredLang, fallbackLang) ||
    alternativeBackdrops[0] ||
    fallbackOriginal
  );
};

export const normalizeFanartLanguage = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === '00' || normalized === 'n/a') return null;
  return normalized;
};

const rankFanartAsset = (
  asset: FanartImageAsset,
  requestedLang: string,
  fallbackLang: string,
  index: number,
) => {
  const assetLang = normalizeFanartLanguage(asset.lang);
  const requested = normalizeImageLanguage(requestedLang);
  const fallback = normalizeImageLanguage(fallbackLang);
  const likes =
    typeof asset.likes === 'number'
      ? asset.likes
      : typeof asset.likes === 'string'
        ? Number.parseInt(asset.likes, 10) || 0
        : 0;

  const languageScore =
    assetLang && requested && assetLang === requested
      ? 0
      : assetLang && fallback && assetLang === fallback
        ? 1
        : assetLang === null
          ? 2
          : 3;

  return {
    asset,
    languageScore,
    likes,
    index,
  };
};

export const selectFanartAssets = (
  items: FanartImageAsset[] = [],
  requestedLang: string,
  fallbackLang: string,
) =>
  items
    .filter((item) => typeof item?.url === 'string' && item.url.trim())
    .map((item, index) => rankFanartAsset(item, requestedLang, fallbackLang, index))
    .sort((left, right) => {
      if (left.languageScore !== right.languageScore) return left.languageScore - right.languageScore;
      if (left.likes !== right.likes) return right.likes - left.likes;
      return left.index - right.index;
    })
    .map((entry) => entry.asset);

export const fanartAssetsToUrls = (items: FanartImageAsset[] = []) =>
  [...new Set(
    items
      .map((item) => (typeof item?.url === 'string' ? item.url.trim() : ''))
      .filter(Boolean)
  )];

export const pickFanartUrlByPreference = (
  urls: string[] = [],
  preference: PosterTextPreference,
  randomSeed?: string,
) => {
  if (!Array.isArray(urls) || urls.length === 0) return null;
  if (preference === 'random') {
    return pickDeterministicItemBySeed(
      [...new Set(urls.filter((url) => typeof url === 'string' && url.trim()))],
      `fanart:${randomSeed || 'seed'}`,
    );
  }
  if (preference === 'alternative') {
    return urls[1] || urls[0] || null;
  }
  return urls[0] || null;
};
