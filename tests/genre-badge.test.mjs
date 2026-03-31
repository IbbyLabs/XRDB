import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_GENRE_BADGE_ANIME_GROUPING,
  DEFAULT_GENRE_BADGE_MODE,
  DEFAULT_GENRE_BADGE_POSITION,
  DEFAULT_GENRE_BADGE_STYLE,
  GENRE_BADGE_FAMILY_META,
  GENRE_BADGE_PREVIEW_SAMPLES,
  normalizeGenreBadgeAnimeGrouping,
  normalizeGenreBadgeMode,
  normalizeGenreBadgePosition,
  normalizeGenreBadgeStyle,
  resolveGenreBadgeFamily,
} from '../lib/genreBadge.ts';

test('genre badge mode normalization falls back safely', () => {
  assert.equal(normalizeGenreBadgeMode('both'), 'both');
  assert.equal(normalizeGenreBadgeMode('ICON'), 'icon');
  assert.equal(normalizeGenreBadgeMode('unknown'), DEFAULT_GENRE_BADGE_MODE);
  assert.equal(normalizeGenreBadgeMode(null), DEFAULT_GENRE_BADGE_MODE);
});

test('genre badge style and position normalization accept friendly variants', () => {
  assert.equal(normalizeGenreBadgeStyle('square'), 'square');
  assert.equal(normalizeGenreBadgeStyle('unknown'), DEFAULT_GENRE_BADGE_STYLE);
  assert.equal(normalizeGenreBadgePosition('top center'), 'topCenter');
  assert.equal(normalizeGenreBadgePosition('bottom-right'), 'bottomRight');
  assert.equal(normalizeGenreBadgePosition('unknown'), DEFAULT_GENRE_BADGE_POSITION);
  assert.equal(normalizeGenreBadgeAnimeGrouping('animation'), 'animation');
  assert.equal(normalizeGenreBadgeAnimeGrouping('grouped'), 'animation');
  assert.equal(
    normalizeGenreBadgeAnimeGrouping('unknown'),
    DEFAULT_GENRE_BADGE_ANIME_GROUPING,
  );
});

test('genre badge family resolution keeps anime and animation separate', () => {
  assert.equal(
    resolveGenreBadgeFamily({
      genres: [{ name: 'Animation' }, { name: 'Action' }],
    })?.id,
    'animation',
  );

  assert.equal(
    resolveGenreBadgeFamily({
      genres: [{ name: 'Action' }, { name: 'Science Fiction' }],
    })?.id,
    'scifi',
  );

  assert.equal(
    resolveGenreBadgeFamily({
      genres: [{ name: 'Fantasy' }, { name: 'Adventure' }],
    })?.id,
    'fantasy',
  );

  assert.equal(
    resolveGenreBadgeFamily({
      genres: [{ name: 'Drama' }, { name: 'Mystery' }],
    })?.id,
    'crime',
  );

  assert.equal(
    resolveGenreBadgeFamily({
      genres: [{ name: 'Drama' }, { name: 'Crime' }],
    })?.id,
    'crime',
  );

  assert.equal(
    resolveGenreBadgeFamily({
      genres: [{ name: 'Animation' }, { name: 'Action' }],
      isAnimeContent: true,
    })?.id,
    'anime',
  );

  assert.equal(
    resolveGenreBadgeFamily({
      genres: [{ name: 'Animation' }, { name: 'Action' }],
      isAnimeContent: true,
      animeGrouping: 'animation',
    })?.id,
    'animation',
  );
});

test('default anime grouping remains split when users do not opt in', () => {
  const animeCases = [
    {
      genres: [{ name: 'Animation' }, { name: 'Action' }],
      genreIds: [16, 28],
      isAnimeContent: true,
    },
    {
      genres: [{ name: 'Animation' }, { name: 'Fantasy' }],
      genreIds: [16, 14],
      isAnimeContent: true,
    },
  ];

  for (const input of animeCases) {
    assert.equal(resolveGenreBadgeFamily(input)?.id, 'anime');
  }

  const animationCases = [
    {
      genres: [{ name: 'Animation' }, { name: 'Adventure' }],
      genreIds: [16, 12],
      isAnimeContent: false,
    },
    {
      genres: [{ name: 'Animated' }, { name: 'Comedy' }],
      genreIds: [35],
      isAnimeContent: false,
    },
  ];

  for (const input of animationCases) {
    assert.equal(resolveGenreBadgeFamily(input)?.id, 'animation');
  }
});

test('genre preview samples cover movie, show, anime and all output types', () => {
  const typeLabels = new Set(GENRE_BADGE_PREVIEW_SAMPLES.map((sample) => sample.typeLabel));
  const previewTypes = new Set(GENRE_BADGE_PREVIEW_SAMPLES.map((sample) => sample.previewType));
  const families = new Set(GENRE_BADGE_PREVIEW_SAMPLES.map((sample) => sample.familyId));

  assert.ok(typeLabels.has('Movie Poster'));
  assert.ok(typeLabels.has('Show Backdrop'));
  assert.ok(typeLabels.has('Anime Poster'));
  assert.deepEqual([...previewTypes].sort(), ['backdrop', 'logo', 'poster']);

  for (const familyId of families) {
    assert.ok(GENRE_BADGE_FAMILY_META[familyId]);
  }
});
