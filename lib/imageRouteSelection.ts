import type { PosterTextPreference } from './imageRouteConfig.ts';
import {
  filterByLanguageWithFallback,
  normalizeImageLanguage,
  pickByLanguageWithFallback,
} from './imageLanguage.ts';
import { sha1Hex } from './imageRouteRuntime.ts';

export type RoutedImageCandidate = {
  file_path?: string | null;
  iso_639_1?: string | null;
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

export const pickPosterByPreference = <T extends RoutedImageCandidate>(
  posters: T[] = [],
  preference: PosterTextPreference,
  preferredLang: string,
  fallbackLang: string,
  originalPosterPath?: string | null,
  randomSeed?: string,
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
    return pickDeterministicItemBySeed(
      uniquePosters,
      `poster:${randomSeed || canonicalOriginalPath || preferredLang || fallbackLang || 'seed'}`,
    ) || fallbackOriginal;
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
