import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NextRequest } from 'next/server.js';

import { createProtectedConfigProfile } from '../lib/dbCore.ts';
import { resolveImageRouteRequestState } from '../lib/imageRouteRequestState.ts';
import { HttpError } from '../lib/imageRouteRuntime.ts';
import {
  buildAiometadataUrlPatterns,
  buildProfileParams,
  createDefaultSavedUiConfig,
} from '../lib/uiConfig.ts';

const createRequest = (url, headers = {}) =>
  new NextRequest(url, {
    headers: {
      accept: 'image/jpeg',
      ...headers,
    },
  });

const withTempDataDir = async (t, callback) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'xrdb-image-config-'));
  const previousDataDir = process.env.XRDB_DATA_DIR;
  const previousDbPath = process.env.XRDB_DB_PATH;

  process.env.XRDB_DATA_DIR = tempDir;
  delete process.env.XRDB_DB_PATH;

  t.after(() => {
    if (previousDataDir === undefined) delete process.env.XRDB_DATA_DIR;
    else process.env.XRDB_DATA_DIR = previousDataDir;

    if (previousDbPath === undefined) delete process.env.XRDB_DB_PATH;
    else process.env.XRDB_DB_PATH = previousDbPath;

    rmSync(tempDir, { recursive: true, force: true });
  });

  return callback();
};

test('image route request state resolves UUID-backed config profiles at runtime', async (t) => {
  await withTempDataDir(t, async () => {
    const configId = createProtectedConfigProfile(
      {
        tmdbKey: 'tmdb-key',
        posterRatings: 'imdb,tmdb',
      },
      'password-hash',
    );

    const state = await resolveImageRouteRequestState({
      request: createRequest(`https://example.com/poster/tt0133093.jpg?config=${configId}`),
      imageType: 'poster',
      id: 'tt0133093.jpg',
    });

    assert.deepEqual(state.effectiveRatingPreferences, ['imdb', 'tmdb']);
    assert.equal(state.configMigrationDeadline, null);
  });
});

test('image route request state keeps explicit URL params over saved profile params', async (t) => {
  await withTempDataDir(t, async () => {
    const configId = createProtectedConfigProfile(
      {
        tmdbKey: 'tmdb-key',
        posterRatingStyle: 'plain',
      },
      'password-hash',
    );

    const state = await resolveImageRouteRequestState({
      request: createRequest(
        `https://example.com/poster/tt0133093.jpg?config=${configId}&ratingStyle=square`,
      ),
      imageType: 'poster',
      id: 'tt0133093.jpg',
    });

    assert.equal(state.ratingStyle, 'square');
  });
});

test('image route request state resolves generated inline and config URLs with parity', async (t) => {
  await withTempDataDir(t, async () => {
    const config = createDefaultSavedUiConfig();
    config.settings.tmdbKey = 'tmdb-key';
    config.settings.mdblistKey = 'mdblist-key';
    config.settings.posterRatings = ['imdb', 'tmdb'];
    config.settings.backdropRatings = ['tmdb'];
    config.settings.logoRatings = ['tmdb'];
    config.settings.thumbnailRatings = ['tmdb', 'imdb'];
    config.settings.posterRatingStyle = 'glass';
    config.settings.backdropRatingStyle = 'square';
    config.settings.logoRatingStyle = 'plain';
    config.settings.thumbnailRatingStyle = 'glass';

    const inlinePatterns = buildAiometadataUrlPatterns('https://example.com/', config.settings, {
      hideCredentials: false,
    });
    assert.ok(inlinePatterns);

    const profileParams = buildProfileParams(config.settings);
    assert.ok(profileParams);
    const configId = createProtectedConfigProfile(profileParams, 'password-hash');

    const posterInline = inlinePatterns.posterUrlPattern
      .replace('{type}', 'movie')
      .replace('{tmdb_id}', '603');
    const backdropInline = inlinePatterns.backgroundUrlPattern
      .replace('{type}', 'tv')
      .replace('{tmdb_id}', '1399');
    const logoInline = inlinePatterns.logoUrlPattern
      .replace('{type}', 'movie')
      .replace('{tmdb_id}', '603');
    const thumbnailInline = inlinePatterns.episodeThumbnailUrlPattern
      .replace('{imdb_id}', 'tt0944947')
      .replace('{season}', '1')
      .replace('{episode}', '1');

    const posterConfig = posterInline.replace(/\?.*$/, `?config=${configId}`);
    const backdropConfig = backdropInline.replace(/\?.*$/, `?config=${configId}`);
    const logoConfig = logoInline.replace(/\?.*$/, `?config=${configId}`);
    const thumbnailConfig = thumbnailInline.replace(/\?.*$/, `?config=${configId}`);

    const posterInlineState = await resolveImageRouteRequestState({
      request: createRequest(posterInline),
      imageType: 'poster',
      id: 'tmdb:movie:603.jpg',
    });
    const posterConfigState = await resolveImageRouteRequestState({
      request: createRequest(posterConfig),
      imageType: 'poster',
      id: 'tmdb:movie:603.jpg',
    });
    assert.deepEqual(posterConfigState.effectiveRatingPreferences, posterInlineState.effectiveRatingPreferences);

    const backdropInlineState = await resolveImageRouteRequestState({
      request: createRequest(backdropInline),
      imageType: 'backdrop',
      id: 'tmdb:tv:1399.jpg',
    });
    const backdropConfigState = await resolveImageRouteRequestState({
      request: createRequest(backdropConfig),
      imageType: 'backdrop',
      id: 'tmdb:tv:1399.jpg',
    });
    assert.deepEqual(
      backdropConfigState.effectiveRatingPreferences,
      backdropInlineState.effectiveRatingPreferences,
    );

    const logoInlineState = await resolveImageRouteRequestState({
      request: createRequest(logoInline),
      imageType: 'logo',
      id: 'tmdb:movie:603.png',
    });
    const logoConfigState = await resolveImageRouteRequestState({
      request: createRequest(logoConfig),
      imageType: 'logo',
      id: 'tmdb:movie:603.png',
    });
    assert.deepEqual(logoConfigState.effectiveRatingPreferences, logoInlineState.effectiveRatingPreferences);

    const thumbnailInlineState = await resolveImageRouteRequestState({
      request: createRequest(`${thumbnailInline}&thumbnail=1`),
      imageType: 'backdrop',
      id: 'tt0944947.jpg',
    });
    const thumbnailConfigState = await resolveImageRouteRequestState({
      request: createRequest(`${thumbnailConfig}&thumbnail=1`),
      imageType: 'backdrop',
      id: 'tt0944947.jpg',
    });
    assert.deepEqual(
      thumbnailConfigState.effectiveRatingPreferences,
      thumbnailInlineState.effectiveRatingPreferences,
    );
  });
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
      assert.equal(error.message, 'TMDB credentials are required.');
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

test('image route request state keeps original language requests distinct from fixed locales', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&lang=original',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });

  assert.equal(state.useOriginalImageLanguage, true);
  assert.equal(state.requestedImageLang, 'en');
  assert.match(state.renderSeedKey, /original/);
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

test('image route request state parses genre badge clean background opacity controls', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&genreBadgeBackgroundOpacity=24&posterGenreBadgeBackgroundOpacity=46',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });

  assert.equal(state.genreBadgeBackgroundOpacity, 46);
});

test('image route request state coerces clean genre badge to text mode at bottom center', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&posterGenreBadge=both&posterGenreBadgeStyle=clean&posterGenreBadgePosition=topRight',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });

  assert.equal(state.genreBadgeStyle, 'clean');
  assert.equal(state.genreBadgeMode, 'text');
  assert.equal(state.genreBadgePosition, 'bottomCenter');
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

test('image route request state keeps logo quality badge controls type scoped', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/logo/tt0133093.png?tmdbKey=tmdb-key&logoQualityBadges=hdr,4k&logoQualityBadgesStyle=glass&logoQualityBadgesMax=2&logoQualityBadgeScale=133&posterQualityBadges=remux&posterQualityBadgeScale=91',
    ),
    imageType: 'logo',
    id: 'tt0133093.png',
  });

  assert.deepEqual(state.qualityBadgePreferences, ['hdr', '4k']);
  assert.equal(state.qualityBadgesStyle, 'glass');
  assert.equal(state.qualityBadgesMax, 2);
  assert.equal(state.logoQualityBadgeScale, 133);
  assert.equal(state.posterQualityBadgeScale, 91);
  assert.equal(state.shouldApplyStreamBadges, true);
  assert.equal(state.shouldBlockOnStreamBadges, true);
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

test('image route request state parses compact ring aggregate and priority params', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&posterRatingPresentation=ring&posterRingValueSource=critics&posterRingProgressSource=priority-audience&posterRingCriticsPriority=metacritic,tomatoes,imdb,tmdb&posterRingAudiencePriority=letterboxd,tomatoesaudience,imdb',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });

  assert.equal(state.ratingPresentation, 'ring');
  assert.equal(state.posterRingValueSource, 'critics');
  assert.equal(state.posterRingProgressSource, 'priority-audience');
  assert.deepEqual(state.posterRingCriticsPriority, ['metacritic', 'tomatoes', 'imdb']);
  assert.deepEqual(state.posterRingAudiencePriority, ['letterboxd', 'tomatoesaudience', 'imdb']);
});

test('image route request state disables rating and stream work for poster none presentation', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&posterRatingPresentation=none&posterRatings=imdb,tmdb&posterStreamBadges=on',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });

  assert.equal(state.ratingPresentation, 'none');
  assert.equal(state.shouldApplyRatings, false);
  assert.equal(state.shouldApplyStreamBadges, false);
  assert.deepEqual(state.effectiveRatingPreferences, []);
  assert.deepEqual([...state.selectedRatings], []);
});

test('image route request state keeps poster auto stream badges enabled but non-blocking', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest('https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&posterStreamBadges=auto'),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });

  assert.equal(state.shouldApplyStreamBadges, true);
  assert.equal(state.shouldBlockOnStreamBadges, false);
});

test('image route request state defaults poster stream badges to off when omitted', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest('https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key'),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });

  assert.equal(state.shouldApplyStreamBadges, false);
  assert.equal(state.shouldBlockOnStreamBadges, false);
});

test('image route request state keeps poster on stream badges blocking', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest('https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&posterStreamBadges=on'),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });

  assert.equal(state.shouldApplyStreamBadges, true);
  assert.equal(state.shouldBlockOnStreamBadges, true);
});

test('image route request state disables rating and stream work for thumbnail none presentation', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/backdrop/xrdbid:tt1234567:1:2.jpg?thumbnail=1&tmdbKey=tmdb-key&thumbnailRatingPresentation=none&thumbnailRatings=tmdb,imdb&thumbnailStreamBadges=on',
    ),
    imageType: 'backdrop',
    id: 'xrdbid:tt1234567:1:2.jpg',
  });

  assert.equal(state.isThumbnailRequest, true);
  assert.equal(state.ratingPresentation, 'none');
  assert.equal(state.shouldApplyRatings, false);
  assert.equal(state.shouldApplyStreamBadges, false);
  assert.deepEqual(state.effectiveRatingPreferences, []);
  assert.deepEqual([...state.selectedRatings], []);
});

test('thumbnail with stored episode profile resolves profile settings for thumbnail requests', async (t) => {
  await withTempDataDir(t, async () => {
    const configId = createProtectedConfigProfile(
      {
        tmdbKey: 'tmdb-key',
        thumbnailRatings: 'kitsu',
        thumbnailRatingStyle: 'plain',
      },
      'password-hash',
    );

    const state = await resolveImageRouteRequestState({
      request: createRequest(
        `https://example.com/backdrop/xrdbid:tt1234567:1:2.jpg?thumbnail=1&config=${configId}`,
      ),
      imageType: 'backdrop',
      id: 'xrdbid:tt1234567:1:2.jpg',
    });

    assert.equal(state.isThumbnailRequest, true);
    assert.deepEqual(state.effectiveRatingPreferences, ['kitsu']);
    assert.equal(state.ratingStyle, 'plain');
  });
});

test('thumbnail without config resolves default settings without error', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/backdrop/xrdbid:tt1234567:1:2.jpg?thumbnail=1&tmdbKey=tmdb-key',
    ),
    imageType: 'backdrop',
    id: 'xrdbid:tt1234567:1:2.jpg',
  });

  assert.equal(state.isThumbnailRequest, true);
  assert.deepEqual(state.effectiveRatingPreferences, ['tmdb', 'imdb']);
});

test('explicit thumbnail badge params override stored episode profile', async (t) => {
  await withTempDataDir(t, async () => {
    const configId = createProtectedConfigProfile(
      {
        tmdbKey: 'tmdb-key',
        thumbnailRatings: 'kitsu',
      },
      'password-hash',
    );

    const state = await resolveImageRouteRequestState({
      request: createRequest(
        `https://example.com/backdrop/xrdbid:tt1234567:1:2.jpg?thumbnail=1&config=${configId}&thumbnailRatings=imdb,tmdb`,
      ),
      imageType: 'backdrop',
      id: 'xrdbid:tt1234567:1:2.jpg',
    });

    assert.equal(state.isThumbnailRequest, true);
    assert.deepEqual(state.effectiveRatingPreferences, ['imdb', 'tmdb']);
  });
});
