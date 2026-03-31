import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_GENRE_BADGE_ANIME_GROUPING,
  DEFAULT_GENRE_BADGE_MODE,
  DEFAULT_GENRE_BADGE_POSITION,
  DEFAULT_GENRE_BADGE_STYLE,
} from '../lib/genreBadge.ts';
import { KITSU_CACHE_TTL_MS } from '../lib/imageRouteConfig.ts';
import { prepareImageRouteMediaState } from '../lib/imageRoutePreparedMedia.ts';
import {
  LOGO_BASE_HEIGHT,
  LOGO_MAX_WIDTH,
  LOGO_MIN_WIDTH,
} from '../lib/imageRouteText.ts';

const phases = {
  auth: 0,
  tmdb: 0,
  mdb: 0,
  fanart: 0,
  stream: 0,
  render: 0,
};

const createBaseInput = () => ({
  isThumbnailRequest: false,
  tmdbKey: 'tmdb-key',
  phases: { ...phases },
  fetchJsonCached: async () => {
    throw new Error('unexpected fetch');
  },
  media: { title: 'Example', name: 'Example' },
  mediaType: 'movie',
  mediaId: 'kitsu:100',
  season: null,
  episode: null,
  mappedImdbId: null,
  isTmdb: false,
  isKitsu: true,
  isAniListInput: false,
  idPrefix: 'kitsu',
  inputAnimeMappingProvider: null,
  inputAnimeMappingExternalId: null,
  selectedRatings: new Set(['kitsu']),
  hasNativeAnimeInput: true,
  allowAnimeOnlyRatings: true,
  hasConfirmedAnimeMapping: true,
  shouldApplyRatings: false,
  shouldApplyStreamBadges: false,
  shouldRenderLogoBackground: false,
  genreBadgeMode: DEFAULT_GENRE_BADGE_MODE,
  genreBadgeStyle: DEFAULT_GENRE_BADGE_STYLE,
  genreBadgePosition: DEFAULT_GENRE_BADGE_POSITION,
  genreBadgeScale: 100,
  effectiveGenreBadgeScale: 100,
  genreBadgeAnimeGrouping: DEFAULT_GENRE_BADGE_ANIME_GROUPING,
  requestedImageLang: 'en',
  includeImageLanguage: 'en,null',
  posterTextPreference: 'original',
  posterArtworkSource: 'tmdb',
  backdropArtworkSource: 'tmdb',
  logoArtworkSource: 'tmdb',
  artworkSelectionSeed: 'seed-1',
  cleanId: 'kitsu:100',
  fanartKey: '',
  fanartClientKey: '',
  sourceFallbackUrl: null,
  qualityBadgePreferences: [],
  posterImageSize: 'normal',
  mdblistKey: null,
  simklClientId: '',
  useRawKitsuFallback: true,
  rawFallbackImageUrl: 'https://kitsu.example/fallback.jpg',
  rawFallbackKitsuRating: '88',
  rawFallbackTitle: 'Fallback Example',
  rawFallbackLogoAspectRatio: null,
});

test('prepared media state preserves raw kitsu fallback image and rating', async () => {
  const state = await prepareImageRouteMediaState({
    ...createBaseInput(),
    imageType: 'backdrop',
  });

  assert.equal(state.imgUrl, 'https://kitsu.example/fallback.jpg');
  assert.equal(state.outputWidth, 1280);
  assert.equal(state.outputHeight, 720);
  assert.equal(state.providerRatings.get('kitsu'), '88');
  assert.equal(state.renderedRatingTtlByProvider.get('kitsu'), KITSU_CACHE_TTL_MS);
  assert.equal(state.providerRatingsEnabled, false);
  assert.equal(state.shouldRenderBadges, false);
  assert.equal(state.posterTitleText, null);
  assert.equal(state.posterLogoUrl, null);
});

test('prepared media state derives logo width from fallback aspect ratio', async () => {
  const state = await prepareImageRouteMediaState({
    ...createBaseInput(),
    imageType: 'logo',
    rawFallbackLogoAspectRatio: 3.5,
  });

  assert.equal(state.outputHeight, LOGO_BASE_HEIGHT);
  assert.equal(
    state.outputWidth,
    Math.max(
      LOGO_MIN_WIDTH,
      Math.min(LOGO_MAX_WIDTH, Math.round(LOGO_BASE_HEIGHT * 3.5)),
    ),
  );
  assert.equal(state.imgUrl, 'https://kitsu.example/fallback.jpg');
});
