import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBlockbusterCalloutSvg,
  buildBlockbusterScoreTileSvg,
  getBlockbusterBadgeChaos,
  getBlockbusterCalloutDetail,
  getBlockbusterCalloutHeadline,
  pickBlockbusterCalloutBadges,
  pickBlockbusterScoreBadges,
} from '../lib/imageRouteBlockbusterBadge.ts';

const sampleBadges = [
  {
    key: 'imdb',
    label: 'IMDb',
    value: '7.1',
    sourceValue: '7.1/10',
    accentColor: '#f5c518',
    variant: 'standard',
  },
  {
    key: 'tomatoes',
    label: 'Tomatoes',
    value: '84',
    sourceValue: '84%',
    accentColor: '#ef4444',
    variant: 'standard',
  },
  {
    key: 'metacritic',
    label: 'Metacritic',
    value: '82',
    sourceValue: '82/100',
    accentColor: '#22c55e',
    variant: 'standard',
  },
];

test('image route blockbuster badge headlines and details normalize review labels', () => {
  const headline = getBlockbusterCalloutHeadline(sampleBadges[1]);
  const detail = getBlockbusterCalloutDetail(sampleBadges[1], headline);

  assert.equal(headline, 'FRESH');
  assert.equal(detail, 'TOMATOES 84%');
});

test('image route blockbuster badge pickers sort by configured priority', () => {
  const sorted = pickBlockbusterCalloutBadges(sampleBadges);
  const scoreSorted = pickBlockbusterScoreBadges(sampleBadges);

  assert.deepEqual(
    sorted.map((badge) => badge.key),
    ['tomatoes', 'metacritic', 'imdb'],
  );
  assert.deepEqual(
    scoreSorted.map((badge) => badge.key),
    ['tomatoes', 'metacritic', 'imdb'],
  );
});

test('image route blockbuster badge callout builds sticker svg output', () => {
  const spec = buildBlockbusterCalloutSvg({
    headline: 'Fresh',
    detail: 'Tomatoes 84%',
    accentColor: '#ef4444',
    rotation: 4,
    iconMonogram: 'RT',
  });

  assert.ok(spec.width > 0);
  assert.ok(spec.height > 0);
  assert.match(spec.svg, /blockbuster-callout-shadow/);
  assert.match(spec.svg, /TOMATOES 84%/);
});

test('image route blockbuster badge score tile builds seal tile and pill variants', () => {
  const seal = buildBlockbusterScoreTileSvg({ badge: sampleBadges[1], iconMonogram: 'RT' });
  const tile = buildBlockbusterScoreTileSvg({ badge: sampleBadges[2], iconMonogram: 'MC' });
  const pill = buildBlockbusterScoreTileSvg({
    badge: {
      key: 'letterboxd',
      label: 'Letterboxd',
      value: '4.0',
      sourceValue: '4/5',
      accentColor: '#84cc16',
      variant: 'standard',
    },
    iconMonogram: 'LB',
  });

  assert.match(seal.svg, /blockbuster-seal-shadow/);
  assert.match(tile.svg, /blockbuster-tile-shadow/);
  assert.match(pill.svg, /blockbuster-pill-shadow/);
});

test('image route blockbuster badge chaos stays deterministic', () => {
  const first = getBlockbusterBadgeChaos(sampleBadges[0], 'salt');
  const second = getBlockbusterBadgeChaos(sampleBadges[0], 'salt');

  assert.deepEqual(first, second);
  assert.equal(typeof first.rotation, 'number');
  assert.equal(typeof first.spreadX, 'number');
});
