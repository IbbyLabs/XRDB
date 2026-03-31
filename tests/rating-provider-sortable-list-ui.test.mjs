import test from 'node:test';
import assert from 'node:assert/strict';

const importFresh = async (relativePath) => {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('t', `${Date.now()}-${Math.random()}`);
  return import(url.href);
};

test('rating provider sortable list ui resolves labels and layout helpers safely', async () => {
  const sortableUiModule = await importFresh('../lib/ratingProviderSortableListUi.ts');

  assert.equal(sortableUiModule.getProviderLabel('imdb'), 'IMDb');
  assert.equal(sortableUiModule.getProviderLabel('unknown'), 'unknown');
  assert.equal(sortableUiModule.getRowShellClassName(true, false).includes('text-white'), true);
  assert.equal(sortableUiModule.getPositionChipClassName(false).includes('text-zinc-500'), true);
  assert.deepEqual(sortableUiModule.buildRatingProviderGridStyle('row', 5), undefined);
  assert.deepEqual(sortableUiModule.buildRatingProviderGridStyle('column', 5), {
    gridAutoFlow: 'column',
    gridTemplateRows: 'repeat(3, auto)',
  });
});

test('rating provider sortable list ui resolves active rows and reorder targets', async () => {
  const sortableUiModule = await importFresh('../lib/ratingProviderSortableListUi.ts');
  const rows = [
    { id: 'imdb', enabled: true },
    { id: 'tmdb', enabled: false },
    { id: 'rt', enabled: true },
  ];

  assert.deepEqual(sortableUiModule.findActiveRatingProviderRow(rows, 'tmdb'), rows[1]);
  assert.equal(sortableUiModule.findActiveRatingProviderRow(rows, null), null);
  assert.deepEqual(sortableUiModule.resolveRatingProviderReorder(rows, 'imdb', 'rt'), {
    fromIndex: 0,
    toIndex: 2,
  });
  assert.equal(sortableUiModule.resolveRatingProviderReorder(rows, 'imdb', 'imdb'), null);
  assert.equal(sortableUiModule.resolveRatingProviderReorder(rows, 'missing', 'rt'), null);
});
