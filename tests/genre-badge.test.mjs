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

test('new genre families resolve from genre name', () => {
  assert.equal(
    resolveGenreBadgeFamily({ genres: [{ name: 'Music' }] })?.id,
    'music',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genres: [{ name: 'Reality' }] })?.id,
    'reality',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genres: [{ name: 'Family' }] })?.id,
    'family',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genres: [{ name: 'History' }] })?.id,
    'history',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genres: [{ name: 'Kids' }] })?.id,
    'kids',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genres: [{ name: 'News' }] })?.id,
    'news',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genres: [{ name: 'Soap' }] })?.id,
    'soap',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genres: [{ name: 'Talk' }] })?.id,
    'talk',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genres: [{ name: 'TV Movie' }] })?.id,
    'tvmovie',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genres: [{ name: 'War & Politics' }] })?.id,
    'warpolitics',
  );
});

test('new genre families resolve from TMDB genre ID', () => {
  assert.equal(
    resolveGenreBadgeFamily({ genreIds: [10402] })?.id,
    'music',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genreIds: [10764] })?.id,
    'reality',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genreIds: [10751] })?.id,
    'family',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genreIds: [36] })?.id,
    'history',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genreIds: [10762] })?.id,
    'kids',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genreIds: [10763] })?.id,
    'news',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genreIds: [10766] })?.id,
    'soap',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genreIds: [10767] })?.id,
    'talk',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genreIds: [10770] })?.id,
    'tvmovie',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genreIds: [10768] })?.id,
    'warpolitics',
  );
});

test('catchall returns other for unrecognized genre', () => {
  assert.equal(
    resolveGenreBadgeFamily({ genres: [{ name: 'Underwater Basket Weaving' }] })?.id,
    'other',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genreIds: [99999] })?.id,
    'other',
  );
});

test('catchall returns null for empty genres', () => {
  assert.equal(resolveGenreBadgeFamily({ genres: [] }), null);
  assert.equal(resolveGenreBadgeFamily({}), null);
  assert.equal(resolveGenreBadgeFamily({ genres: null }), null);
});

test('existing families still take priority over new families', () => {
  assert.equal(
    resolveGenreBadgeFamily({ genres: [{ name: 'Drama' }, { name: 'Music' }] })?.id,
    'drama',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genres: [{ name: 'Comedy' }, { name: 'Reality' }] })?.id,
    'comedy',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genres: [{ name: 'Action' }, { name: 'History' }] })?.id,
    'action',
  );
  assert.equal(
    resolveGenreBadgeFamily({ genres: [{ name: 'Horror' }, { name: 'Family' }] })?.id,
    'horror',
  );
});
