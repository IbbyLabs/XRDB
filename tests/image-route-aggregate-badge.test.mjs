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

test('image route aggregate badge excludes mdblist from critics calculation and falls back to overall', () => {
  const badge = buildAggregateRatingBadgeForSource({
    requestedSource: 'critics',
    presentation: 'minimal',
    renderablePreferences: ['mdblist'],
    ratingBadgeByProvider: new Map([
      ['mdblist', {
        key: 'mdblist',
        label: 'MDBList',
        value: '72',
        sourceValue: '72',
        iconUrl: 'mdb.svg',
        accentColor: '#f97316',
      }],
    ]),
    resolveAccentColor: () => '#f97316',
    allowFallbackToOverall: true,
  });

  assert.ok(badge);
  assert.equal(badge.key, 'aggregate-overall');
  assert.equal(badge.value, '7.2');
});

test('image route aggregate badge includes mdblist in audience calculation', () => {
  const badge = buildAggregateRatingBadgeForSource({
    requestedSource: 'audience',
    presentation: 'minimal',
    renderablePreferences: ['mdblist', 'imdb'],
    ratingBadgeByProvider: new Map([
      ['mdblist', {
        key: 'mdblist',
        label: 'MDBList',
        value: '80',
        sourceValue: '80',
        iconUrl: 'mdb.svg',
        accentColor: '#f97316',
      }],
      ['imdb', {
        key: 'imdb',
        label: 'IMDb',
        value: '7.0',
        sourceValue: '7.0',
        iconUrl: 'imdb.svg',
        accentColor: '#f5c518',
      }],
    ]),
    resolveAccentColor: () => '#22c55e',
  });

  assert.ok(badge);
  assert.equal(badge.key, 'aggregate-audience');
  assert.equal(badge.value, '7.5');
});
