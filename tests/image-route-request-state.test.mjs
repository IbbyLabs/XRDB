import test from 'node:test';
import assert from 'node:assert/strict';

import { NextRequest } from 'next/server.js';

import { resolveImageRouteRequestState } from '../lib/imageRouteRequestState.ts';
import { HttpError } from '../lib/imageRouteRuntime.ts';

const createRequest = (url, headers = {}) =>
  new NextRequest(url, {
    headers: {
      accept: 'image/jpeg',
      ...headers,
    },
  });

test('image route request state rejects ambiguous strict TMDB ids for backdrop renders', async () => {
  await assert.rejects(
    () =>
      resolveImageRouteRequestState({
        request: createRequest('https://example.com/backdrop/tmdb:123.jpg?tmdbIdScope=strict&tmdbKey=tmdb-key'),
        imageType: 'backdrop',
        id: 'tmdb:123.jpg',
      }),
    (error) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 400);
      assert.equal(
        error.message,
        'Strict TMDB ID scope requires tmdb:movie:{tmdb_id} or tmdb:tv:{tmdb_id} for backdrop and logo requests.',
      );
      return true;
    },
  );
});

test('image route request state prefers thumbnail ratings for thumbnail backdrop requests', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/backdrop/xrdbid:tt1234567:1:2.jpg?thumbnail=1&tmdbKey=tmdb-key&ratings=imdb,tomatoes&backdropRatings=tomatoes&thumbnailRatings=kitsu',
    ),
    imageType: 'backdrop',
    id: 'xrdbid:tt1234567:1:2.jpg',
  });

  assert.equal(state.isThumbnailRequest, true);
  assert.equal(state.isCanonId, true);
  assert.equal(state.mediaId, 'tt1234567');
  assert.equal(state.season, '1');
  assert.equal(state.episode, '2');
  assert.deepEqual(state.effectiveRatingPreferences, ['kitsu']);
  assert.deepEqual([...state.selectedRatings], ['kitsu']);
});

test('image route request state defaults thumbnail backdrop requests to TMDB and IMDb ratings', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/backdrop/xrdbid:tt1234567:1:2.jpg?thumbnail=1&tmdbKey=tmdb-key&ratings=tomatoes&backdropRatings=tomatoes',
    ),
    imageType: 'backdrop',
    id: 'xrdbid:tt1234567:1:2.jpg',
  });

  assert.equal(state.isThumbnailRequest, true);
  assert.deepEqual(state.effectiveRatingPreferences, ['tmdb', 'imdb']);
  assert.deepEqual([...state.selectedRatings], ['tmdb', 'imdb']);
  assert.equal(state.thumbnailEpisodeArtwork, 'still');
  assert.equal(state.backdropEpisodeArtwork, 'series');
});

test('image route request state keeps OMDb poster artwork poster only', async () => {
  const posterState = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&posterArtworkSource=omdb',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });
  const backdropState = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/backdrop/tt0133093.jpg?tmdbKey=tmdb-key&backdropArtworkSource=omdb',
    ),
    imageType: 'backdrop',
    id: 'tt0133093.jpg',
  });

  assert.equal(posterState.posterArtworkSource, 'omdb');
  assert.equal(backdropState.backdropArtworkSource, 'tmdb');
});

test('image route request state enables black strip mode when blackbar source is active', async () => {
  const posterState = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&posterArtworkSource=blackbar',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });
  const backdropState = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/backdrop/tt0133093.jpg?tmdbKey=tmdb-key&backdropArtworkSource=blackbar',
    ),
    imageType: 'backdrop',
    id: 'tt0133093.jpg',
  });
  const logoState = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/logo/tt0133093.jpg?tmdbKey=tmdb-key&logoArtworkSource=blackbar',
    ),
    imageType: 'logo',
    id: 'tt0133093.jpg',
  });

  assert.equal(posterState.ratingBlackStripEnabled, true);
  assert.equal(backdropState.ratingBlackStripEnabled, true);
  assert.equal(logoState.ratingBlackStripEnabled, true);
});

test('image route request state normalizes type scoped episode artwork overrides', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/backdrop/xrdbid:tt1234567:1:2.jpg?thumbnail=1&tmdbKey=tmdb-key&thumbnailEpisodeArtwork=series&backdropEpisodeArtwork=still',
    ),
    imageType: 'backdrop',
    id: 'xrdbid:tt1234567:1:2.jpg',
  });

  assert.equal(state.thumbnailEpisodeArtwork, 'series');
  assert.equal(state.backdropEpisodeArtwork, 'still');
});

test('image route request state requires a TMDB key', async () => {
  await assert.rejects(
    () =>
      resolveImageRouteRequestState({
        request: createRequest('https://example.com/poster/tt0133093.jpg'),
        imageType: 'poster',
        id: 'tt0133093.jpg',
      }),
    (error) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 400);
      assert.equal(error.message, 'TMDB API Key (tmdbKey) is required');
      return true;
    },
  );
});

test('image route request state resolves type scoped stack offsets before legacy shared values', async () => {
  const posterState = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&ratingStyle=glass&posterRatingXOffsetPillGlass=18&posterRatingYOffsetPillGlass=-7&ratingXOffsetPillGlass=99&ratingYOffsetPillGlass=99',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });
  const backdropState = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/backdrop/tt0133093.jpg?tmdbKey=tmdb-key&ratingStyle=square&backdropRatingXOffsetSquare=-12&backdropRatingYOffsetSquare=14&ratingXOffsetSquare=99&ratingYOffsetSquare=99',
    ),
    imageType: 'backdrop',
    id: 'tt0133093.jpg',
  });
  const thumbnailState = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/backdrop/xrdbid:tt1234567:1:2.jpg?thumbnail=1&tmdbKey=tmdb-key&ratingStyle=glass&thumbnailRatingXOffsetPillGlass=11&thumbnailRatingYOffsetPillGlass=-5&backdropRatingXOffsetPillGlass=66&backdropRatingYOffsetPillGlass=66&ratingXOffsetPillGlass=99&ratingYOffsetPillGlass=99',
    ),
    imageType: 'backdrop',
    id: 'xrdbid:tt1234567:1:2.jpg',
  });
  const logoState = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/logo/tt0133093.jpg?tmdbKey=tmdb-key&logoRatingStyle=square&ratingXOffsetSquare=-9&ratingYOffsetSquare=6',
    ),
    imageType: 'logo',
    id: 'tt0133093.jpg',
  });

  assert.equal(posterState.ratingStackOffsetX, 18);
  assert.equal(posterState.ratingStackOffsetY, -7);
  assert.equal(backdropState.ratingStackOffsetX, -12);
  assert.equal(backdropState.ratingStackOffsetY, 14);
  assert.equal(thumbnailState.ratingStackOffsetX, 11);
  assert.equal(thumbnailState.ratingStackOffsetY, -5);
  assert.equal(logoState.ratingStackOffsetX, -9);
  assert.equal(logoState.ratingStackOffsetY, 6);
});

test('image route request state falls back to legacy shared stack offsets when type scoped values are missing', async () => {
  const glassState = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&ratingStyle=glass&ratingXOffsetPillGlass=18&ratingYOffsetPillGlass=-7',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });
  const squareState = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/backdrop/tt0133093.jpg?tmdbKey=tmdb-key&ratingStyle=square&ratingXOffsetSquare=-12&ratingYOffsetSquare=14',
    ),
    imageType: 'backdrop',
    id: 'tt0133093.jpg',
  });
  const plainState = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&ratingStyle=plain&ratingXOffsetPillGlass=18&ratingYOffsetPillGlass=-7',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });

  assert.equal(glassState.ratingStackOffsetX, 18);
  assert.equal(glassState.ratingStackOffsetY, -7);
  assert.equal(squareState.ratingStackOffsetX, -12);
  assert.equal(squareState.ratingStackOffsetY, 14);
  assert.equal(plainState.ratingStackOffsetX, 0);
  assert.equal(plainState.ratingStackOffsetY, 0);
});

test('image route request state parses random poster filter controls', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&imageText=random&randomPosterText=textless&randomPosterLanguage=requested&randomPosterMinVoteCount=12&randomPosterMinVoteAverage=6.5&randomPosterMinWidth=1000&randomPosterMinHeight=1500&randomPosterFallback=original',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });

  assert.equal(state.posterTextPreference, 'random');
  assert.equal(state.randomPosterTextMode, 'textless');
  assert.equal(state.randomPosterLanguageMode, 'requested');
  assert.equal(state.randomPosterMinVoteCount, 12);
  assert.equal(state.randomPosterMinVoteAverage, 6.5);
  assert.equal(state.randomPosterMinWidth, 1000);
  assert.equal(state.randomPosterMinHeight, 1500);
  assert.equal(state.randomPosterFallbackMode, 'original');
});

test('image route request state accepts legacy posterImageText parameter on poster routes', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&posterImageText=textless',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });

  assert.equal(state.posterTextPreference, 'textless');
});

test('image route request state accepts legacy backdropImageText parameter on backdrop routes', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/backdrop/tt0133093.jpg?tmdbKey=tmdb-key&backdropImageText=original',
    ),
    imageType: 'backdrop',
    id: 'tt0133093.jpg',
  });

  assert.equal(state.posterTextPreference, 'original');
});

test('image route request state parses poster no background outline controls', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&posterNoBackgroundBadgeOutlineColor=%23112233&posterNoBackgroundBadgeOutlineWidth=2',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });

  assert.equal(state.posterNoBackgroundBadgeOutlineColor, '#112233');
  assert.equal(state.posterNoBackgroundBadgeOutlineWidth, 2);
});

test('image route request state allows larger thumbnail rating badge scale for thumbnail requests', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/backdrop/xrdbid:tt1234567:1:2.jpg?thumbnail=1&tmdbKey=tmdb-key&thumbnailRatingBadgeScale=190&backdropRatingBadgeScale=120',
    ),
    imageType: 'backdrop',
    id: 'xrdbid:tt1234567:1:2.jpg',
  });

  assert.equal(state.isThumbnailRequest, true);
  assert.equal(state.backdropRatingBadgeScale, 190);
});

test('image route request state keeps poster, backdrop, and logo rating badge scales type scoped', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&posterRatingBadgeScale=190&backdropRatingBadgeScale=185&logoRatingBadgeScale=180',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });

  assert.equal(state.posterRatingBadgeScale, 190);
  assert.equal(state.backdropRatingBadgeScale, 185);
  assert.equal(state.logoRatingBadgeScale, 180);
});

test('image route request state normalizes dynamic aggregate accent stops', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&aggregateAccentMode=dynamic&aggregateDynamicStops=85:%2316A34A,0:%237f1d1d,60:%23f59e0b',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });

  assert.equal(state.aggregateAccentMode, 'dynamic');
  assert.equal(state.aggregateDynamicStops, '0:#7f1d1d,60:#f59e0b,85:#16a34a');
});
