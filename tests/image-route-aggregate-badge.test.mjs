import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAggregateRatingBadgeForSource,
  buildAggregateRatingBadges,
} from '../lib/imageRouteAggregateBadge.ts';

test('image route aggregate badge builds a compact critics badge from available providers', () => {
  const badge = buildAggregateRatingBadgeForSource({
    requestedSource: 'critics',
    presentation: 'minimal',
    renderablePreferences: ['tomatoes'],
    ratingBadgeByProvider: new Map([
      ['tomatoes', {
        key: 'tomatoes',
        label: 'Tomatoes',
        value: '84',
        sourceValue: '84%',
        iconUrl: 'rt.svg',
        accentColor: '#ef4444',
      }],
    ]),
    resolveAccentColor: () => '#ef4444',
  });

  assert.ok(badge);
  assert.equal(badge.key, 'aggregate-critics');
  assert.equal(badge.variant, 'minimal');
  assert.equal(badge.iconUrl, 'rt.svg');
  assert.equal(badge.value, '8.4');
});

test('image route aggregate badge builds dual badges for critics and audience sources', () => {
  const badges = buildAggregateRatingBadges({
    requestedSource: 'overall',
    presentation: 'dual-minimal',
    renderablePreferences: ['tomatoes', 'tomatoesaudience', 'imdb'],
    ratingBadgeByProvider: new Map([
      ['tomatoes', {
        key: 'tomatoes',
        label: 'Tomatoes',
        value: '84',
        sourceValue: '84%',
        iconUrl: 'rt.svg',
        accentColor: '#ef4444',
      }],
      ['tomatoesaudience', {
        key: 'tomatoesaudience',
        label: 'Audience',
        value: '91',
        sourceValue: '91%',
        iconUrl: 'aud.svg',
        accentColor: '#22c55e',
      }],
      ['imdb', {
        key: 'imdb',
        label: 'IMDb',
        value: '7.4',
        sourceValue: '7.4/10',
        iconUrl: 'imdb.svg',
        accentColor: '#f5c518',
      }],
    ]),
    resolveAccentColor: (source) => source === 'critics' ? '#ef4444' : '#22c55e',
  });

  assert.equal(badges.length, 2);
  assert.deepEqual(badges.map((badge) => badge.key), ['aggregate-critics', 'aggregate-audience']);
  assert.ok(badges.every((badge) => badge.variant === 'minimal'));
});
