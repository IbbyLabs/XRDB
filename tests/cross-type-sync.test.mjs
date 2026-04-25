import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractSyncableSettings,
  applySyncableSettings,
  computeSyncDiff,
  computeSyncDiffForTarget,
  computeSyncToAllDiff,
} from '../lib/crossTypeSync.ts';
import { createDefaultSharedXrdbSettings } from '../lib/uiConfig.ts';

const base = createDefaultSharedXrdbSettings();

test('extractSyncableSettings: extracts poster providers', () => {
  const settings = { ...base, posterRatingPreferences: ['imdb', 'tmdb'] };
  const sync = extractSyncableSettings(settings, 'poster');
  assert.deepEqual(sync.ratingPreferences, ['imdb', 'tmdb']);
});

test('extractSyncableSettings: logo extracts no streamBadges field', () => {
  const sync = extractSyncableSettings(base, 'logo');
  assert.equal('streamBadges' in sync, false);
});

test('extractSyncableSettings: non-logo types include streamBadges', () => {
  for (const type of ['poster', 'backdrop', 'thumbnail']) {
    const sync = extractSyncableSettings(base, type);
    assert.equal('streamBadges' in sync, true, `Expected streamBadges in ${type}`);
  }
});

test('extractSyncableSettings: includes global accent fields', () => {
  const settings = { ...base, aggregateAccentColor: '#ff0000' };
  const sync = extractSyncableSettings(settings, 'backdrop');
  assert.equal(sync.aggregateAccentColor, '#ff0000');
});

test('applySyncableSettings: ring presentation excluded from backdrop target', () => {
  const settings = { ...base, posterRatingPresentation: 'ring' };
  const incoming = extractSyncableSettings(settings, 'poster');
  const result = applySyncableSettings(settings, 'backdrop', incoming);
  assert.equal(result.backdropRatingPresentation, 'standard');
});

test('applySyncableSettings: ring presentation excluded from thumbnail target', () => {
  const settings = { ...base, posterRatingPresentation: 'ring' };
  const incoming = extractSyncableSettings(settings, 'poster');
  const result = applySyncableSettings(settings, 'thumbnail', incoming);
  assert.equal(result.thumbnailRatingPresentation, 'standard');
});

test('applySyncableSettings: ring presentation excluded from logo target', () => {
  const settings = { ...base, posterRatingPresentation: 'ring' };
  const incoming = extractSyncableSettings(settings, 'poster');
  const result = applySyncableSettings(settings, 'logo', incoming);
  assert.equal(result.logoRatingPresentation, 'standard');
});

test('applySyncableSettings: editorial presentation excluded from non-poster targets', () => {
  const settings = { ...base, posterRatingPresentation: 'editorial' };
  const incoming = extractSyncableSettings(settings, 'poster');
  for (const target of ['backdrop', 'thumbnail', 'logo']) {
    const result = applySyncableSettings(settings, target, incoming);
    const key = `${target}RatingPresentation`;
    assert.equal(result[key], 'standard', `Expected standard for ${target}`);
  }
});

test('applySyncableSettings: poster allows all presentations', () => {
  const settings = { ...base, backdropRatingPresentation: 'standard' };
  const incoming = extractSyncableSettings({ ...settings, posterRatingPresentation: 'blockbuster' }, 'poster');
  const result = applySyncableSettings(settings, 'poster', incoming);
  assert.equal(result.posterRatingPresentation, 'blockbuster');
});

test('applySyncableSettings: artwork source unchanged by sync', () => {
  const settings = { ...base, posterArtworkSource: 'fanart', backdropArtworkSource: 'cinemeta' };
  const incoming = extractSyncableSettings(settings, 'poster');
  const result = applySyncableSettings(settings, 'backdrop', incoming);
  assert.equal(result.backdropArtworkSource, 'cinemeta');
  assert.equal(result.posterArtworkSource, 'fanart');
});

test('applySyncableSettings: rating style and icon shape transfer to target type', () => {
  const settings = {
    ...base,
    posterRatingStyle: 'plain',
    posterIconShape: 'circle',
    backdropRatingStyle: 'glass',
    backdropIconShape: 'rounded',
  };
  const incoming = extractSyncableSettings(settings, 'poster');
  const result = applySyncableSettings(settings, 'backdrop', incoming);
  assert.equal(result.backdropRatingStyle, 'plain');
  assert.equal(result.backdropIconShape, 'circle');
});

test('applySyncableSettings: accent colors transfer', () => {
  const settings = { ...base, aggregateAccentColor: '#aabbcc', aggregateCriticsAccentColor: '#112233' };
  const incoming = extractSyncableSettings(settings, 'poster');
  const result = applySyncableSettings(base, 'backdrop', incoming);
  assert.equal(result.aggregateAccentColor, '#aabbcc');
  assert.equal(result.aggregateCriticsAccentColor, '#112233');
});

test('applySyncableSettings: genre badge settings transfer', () => {
  const settings = {
    ...base,
    posterGenreBadgeMode: 'text',
    posterGenreBadgeStyle: 'square',
    posterGenreBadgePosition: 'topLeft',
    posterGenreBadgeScale: 150,
  };
  const incoming = extractSyncableSettings(settings, 'poster');
  const result = applySyncableSettings(base, 'backdrop', incoming);
  assert.equal(result.backdropGenreBadgeMode, 'text');
  assert.equal(result.backdropGenreBadgeStyle, 'square');
  assert.equal(result.backdropGenreBadgePosition, 'topLeft');
  assert.equal(result.backdropGenreBadgeScale, 150);
});

test('applySyncableSettings: stream badges excluded from logo target', () => {
  const settings = { ...base, posterStreamBadges: 'on' };
  const incoming = extractSyncableSettings(settings, 'poster');
  const result = applySyncableSettings(base, 'logo', incoming);
  assert.equal(result.logoStreamBadges, base.logoStreamBadges);
});

test('applySyncableSettings: thumbnail providers filter to TMDB/IMDb only', () => {
  const settings = { ...base, posterRatingPreferences: ['letterboxd', 'tmdb', 'mdblist'] };
  const incoming = extractSyncableSettings(settings, 'poster');
  const result = applySyncableSettings(settings, 'thumbnail', incoming);
  assert.deepEqual(result.thumbnailRatingPreferences, ['tmdb']);
});

test('applySyncableSettings: thumbnail providers keep existing when filter yields empty', () => {
  const thumbnailPrefs = ['tmdb', 'imdb'];
  const settings = {
    ...base,
    posterRatingPreferences: ['letterboxd', 'mdblist'],
    thumbnailRatingPreferences: thumbnailPrefs,
  };
  const incoming = extractSyncableSettings(settings, 'poster');
  const result = applySyncableSettings(settings, 'thumbnail', incoming);
  assert.deepEqual(result.thumbnailRatingPreferences, thumbnailPrefs);
});

const settingsWithKeys = { ...base, tmdbKey: 'testkey', mdblistKey: 'testlist' };

test('computeSyncDiff: returns empty when settings are identical', () => {
  const diff = computeSyncDiff(settingsWithKeys, settingsWithKeys);
  assert.equal(diff.totalChanged, 0);
  assert.deepEqual(diff.entries, []);
});

test('computeSyncDiff: detects changed fields', () => {
  const after = { ...settingsWithKeys, aggregateAccentColor: '#deadbeef' };
  const diff = computeSyncDiff(settingsWithKeys, after);
  assert.ok(diff.totalChanged > 0);
  const entry = diff.entries.find((e) => e.newValue.toLowerCase().includes('deadbeef'));
  assert.ok(entry, 'Expected a diff entry for accent color change');
});

test('computeSyncDiff: detects changed fields without client provider keys', () => {
  const settings = { ...base, posterRatingPresentation: 'standard' };
  const after = { ...settings, backdropRatingPresentation: 'compact-average' };
  const diff = computeSyncDiff(settings, after);
  assert.ok(diff.totalChanged > 0);
  const entry = diff.entries.find((e) => e.key === 'backdropRatingPresentation');
  assert.ok(entry, 'Expected a diff entry for backdrop presentation change');
  assert.equal(entry?.newValue, 'compact-average');
});

test('computeSyncDiff: old/new values are correct', () => {
  const settings = { ...settingsWithKeys, posterGenreBadgeMode: 'off' };
  const after = applySyncableSettings(settings, 'poster', {
    ...extractSyncableSettings(settings, 'backdrop'),
    genreBadgeMode: 'text',
  });
  const diff = computeSyncDiff(settings, after);
  const entry = diff.entries.find((e) => e.key.toLowerCase().includes('genre') && e.newValue === 'text');
  assert.ok(entry, 'Expected a diff entry for genre badge mode change');
});

test('computeSyncDiffForTarget: detects target type syncable field changes', () => {
  const settings = {
    ...base,
    posterRatingPresentation: 'compact-average',
    backdropRatingPresentation: 'standard',
  };
  const incoming = extractSyncableSettings(settings, 'poster');
  const after = applySyncableSettings(settings, 'backdrop', incoming);
  const diff = computeSyncDiffForTarget(settings, after, 'backdrop');
  assert.ok(diff.totalChanged > 0);
  const entry = diff.entries.find((e) => e.key === 'backdropRatingPresentation');
  assert.ok(entry, 'Expected a diff entry for backdrop presentation change');
  assert.equal(entry?.oldValue, 'standard');
  assert.equal(entry?.newValue, 'compact-average');
});

test('computeSyncDiffForTarget: detects icon shape and rating style changes', () => {
  const settings = {
    ...base,
    posterRatingStyle: 'plain',
    posterIconShape: 'circle',
    backdropRatingStyle: 'glass',
    backdropIconShape: 'rounded',
  };
  const incoming = extractSyncableSettings(settings, 'poster');
  const after = applySyncableSettings(settings, 'backdrop', incoming);
  const diff = computeSyncDiffForTarget(settings, after, 'backdrop');
  const styleEntry = diff.entries.find((e) => e.key === 'backdropRatingStyle');
  const iconEntry = diff.entries.find((e) => e.key === 'backdropIconShape');
  assert.ok(styleEntry, 'Expected a diff entry for backdrop rating style change');
  assert.ok(iconEntry, 'Expected a diff entry for backdrop icon shape change');
  assert.equal(styleEntry?.oldValue, 'glass');
  assert.equal(styleEntry?.newValue, 'plain');
  assert.equal(iconEntry?.oldValue, 'rounded');
  assert.equal(iconEntry?.newValue, 'circle');
});

test('computeSyncToAllDiff: source type has empty diff', () => {
  const allDiffs = computeSyncToAllDiff(settingsWithKeys, 'poster');
  assert.equal(allDiffs.poster.totalChanged, 0);
});

test('computeSyncToAllDiff: all types covered', () => {
  const allDiffs = computeSyncToAllDiff(settingsWithKeys, 'poster');
  assert.ok('backdrop' in allDiffs);
  assert.ok('thumbnail' in allDiffs);
  assert.ok('logo' in allDiffs);
});

test('computeSyncToAllDiff: shows poster presentation changes without client provider keys', () => {
  const settings = { ...base, posterRatingPresentation: 'compact-average' };
  const allDiffs = computeSyncToAllDiff(settings, 'poster');
  assert.ok(allDiffs.backdrop.totalChanged > 0);
  assert.ok(allDiffs.thumbnail.totalChanged > 0);
  assert.ok(allDiffs.logo.totalChanged > 0);
});

test('computeSyncToAllDiff: identical per-type settings produce zero diff for each type', () => {
  const settings = {
    ...settingsWithKeys,
    posterRatingStyle: 'plain',
    backdropRatingStyle: 'plain',
    thumbnailRatingStyle: 'plain',
    logoRatingStyle: 'plain',
    posterIconShape: 'rounded',
    backdropIconShape: 'rounded',
    thumbnailIconShape: 'rounded',
    logoIconShape: 'rounded',
    posterGenreBadgeBorderWidth: 1,
    backdropGenreBadgeBorderWidth: 1,
    thumbnailGenreBadgeBorderWidth: 1,
    logoGenreBadgeBorderWidth: 1,
    backdropStreamBadges: 'off',
    thumbnailStreamBadges: 'off',
  };
  const allDiffs = computeSyncToAllDiff(settings, 'poster');
  for (const type of ['backdrop', 'thumbnail', 'logo']) {
    assert.equal(allDiffs[type].totalChanged, 0, `Expected 0 diff for ${type}`);
  }
});
