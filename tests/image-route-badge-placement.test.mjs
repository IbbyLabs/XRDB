import test from 'node:test';
import assert from 'node:assert/strict';

import { planBadgeRowPlacements } from '../lib/imageRouteBadgePlacement.ts';

const createBadge = (label, value = '8.4') => ({ label, value });

test('image route badge placement centers a single poster row badge', () => {
  const placements = planBadgeRowPlacements({
    rowBadges: [createBadge('IMDb')],
    fontSize: 28,
    paddingX: 14,
    iconSize: 34,
    gap: 10,
    compactText: true,
    ratingStyle: 'glass',
    regionWidth: 600,
    isPosterRowLayout: true,
  });

  assert.equal(placements.length, 1);
  assert.equal(placements[0].rowX > 200, true);
});

test('image route badge placement splits a two badge row across halves when space allows', () => {
  const placements = planBadgeRowPlacements({
    rowBadges: [createBadge('IMDb'), createBadge('TMDB')],
    fontSize: 28,
    paddingX: 14,
    iconSize: 34,
    gap: 10,
    compactText: true,
    ratingStyle: 'glass',
    regionWidth: 700,
    splitAcrossHalves: true,
  });

  assert.equal(placements.length, 2);
  assert.equal(placements[0].rowX < placements[1].rowX, true);
  assert.equal(placements[1].rowX - placements[0].rowX > 200, true);
});

test('image route badge placement spreads three poster row badges across thirds when possible', () => {
  const placements = planBadgeRowPlacements({
    rowBadges: [createBadge('IMDb'), createBadge('TMDB'), createBadge('MC')],
    fontSize: 28,
    paddingX: 14,
    iconSize: 34,
    gap: 10,
    compactText: true,
    ratingStyle: 'glass',
    regionWidth: 900,
    isPosterRowLayout: true,
  });

  assert.equal(placements.length, 3);
  assert.equal(placements[0].rowX < placements[1].rowX, true);
  assert.equal(placements[1].rowX < placements[2].rowX, true);
});

test('image route badge placement shrinks widths to fit bounded rows', () => {
  const placements = planBadgeRowPlacements({
    rowBadges: [
      createBadge('Rotten Tomatoes', '95'),
      createBadge('Metacritic', '84'),
      createBadge('Letterboxd', '4.1'),
    ],
    fontSize: 28,
    paddingX: 14,
    iconSize: 34,
    gap: 10,
    compactText: false,
    ratingStyle: 'glass',
    regionWidth: 320,
  });

  assert.equal(placements.length, 3);
  const totalWidth =
    placements.reduce((sum, placement) => sum + placement.badgeWidth, 0) + 2 * 10;
  assert.equal(totalWidth <= 320, true);
});
