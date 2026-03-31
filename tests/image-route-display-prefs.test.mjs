import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getEditorialEyebrowText,
  normalizeLogoBackground,
  normalizePosterQualityBadgesPosition,
  normalizeQualityBadgesSide,
  normalizeQualityBadgesStyle,
  normalizeStreamBadgesSetting,
  resolvePosterQualityBadgePlacement,
} from '../lib/imageRouteDisplayPrefs.ts';

test('image route display prefs normalize stream and quality placement settings', () => {
  assert.equal(normalizeStreamBadgesSetting('torrentio'), 'on');
  assert.equal(normalizeStreamBadgesSetting('none'), 'off');
  assert.equal(normalizeQualityBadgesSide('end'), 'right');
  assert.equal(normalizePosterQualityBadgesPosition('start'), 'left');
  assert.equal(normalizePosterQualityBadgesPosition('default'), 'auto');
});

test('image route display prefs resolve poster placement and logo background safely', () => {
  assert.equal(resolvePosterQualityBadgePlacement('left', 'left', 'auto'), 'bottom');
  assert.equal(resolvePosterQualityBadgePlacement('top-bottom', 'right', 'auto'), 'right');
  assert.equal(resolvePosterQualityBadgePlacement('top', 'left', 'auto'), 'bottom');
  assert.equal(resolvePosterQualityBadgePlacement('bottom', 'left', 'auto'), 'top');
  assert.equal(normalizeLogoBackground('canvas'), 'dark');
  assert.equal(normalizeLogoBackground('anything'), 'transparent');
});

test('image route display prefs keep user facing badge style and editorial eyebrow logic stable', () => {
  assert.equal(normalizeQualityBadgesStyle('plain'), 'plain');
  assert.equal(getEditorialEyebrowText('anime', 'imdb'), 'Anime');
  assert.equal(getEditorialEyebrowText(null, 'metacritic'), 'Overall');
});
