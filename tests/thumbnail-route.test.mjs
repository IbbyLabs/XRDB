import test from 'node:test';
import assert from 'node:assert/strict';

import { buildThumbnailBackdropUrl } from '../lib/thumbnailRoute.ts';

test('thumbnail route rewrite preserves episode-source hint params and config fallback', () => {
  const requestUrl = new URL(
    'https://example.com/thumbnail/tt12343534/S01E01.jpg?episodeSourceProvider=kitsu&episodeSourceId=42765&episodeSourceSeason=1&episodeSourceEpisode=1&episodeAbsolute=1',
  );

  const rewritten = buildThumbnailBackdropUrl(requestUrl, 'tt12343534', 'S01E01.jpg', 'cfg-123');

  assert.ok(rewritten);
  assert.equal(rewritten?.backdropId, 'tt12343534:01:01.jpg');
  assert.equal(rewritten?.backdropUrl.pathname, '/backdrop/tt12343534:01:01.jpg');
  assert.equal(rewritten?.backdropUrl.searchParams.get('thumbnail'), '1');
  assert.equal(rewritten?.backdropUrl.searchParams.get('episodeSourceProvider'), 'kitsu');
  assert.equal(rewritten?.backdropUrl.searchParams.get('episodeSourceId'), '42765');
  assert.equal(rewritten?.backdropUrl.searchParams.get('episodeSourceSeason'), '1');
  assert.equal(rewritten?.backdropUrl.searchParams.get('episodeSourceEpisode'), '1');
  assert.equal(rewritten?.backdropUrl.searchParams.get('episodeAbsolute'), '1');
  assert.equal(rewritten?.backdropUrl.searchParams.get('config'), 'cfg-123');
});

test('thumbnail route rewrite keeps explicit config values already on the URL', () => {
  const requestUrl = new URL(
    'https://example.com/thumbnail/tt12343534/S01E01.jpg?config=existing&ep_provider=kitsu&ep_id=42765&ep_absolute=1',
  );

  const rewritten = buildThumbnailBackdropUrl(requestUrl, 'tt12343534', 'S01E01', 'cfg-123');

  assert.ok(rewritten);
  assert.equal(rewritten?.backdropUrl.searchParams.get('config'), 'existing');
  assert.equal(rewritten?.backdropUrl.searchParams.get('ep_provider'), 'kitsu');
  assert.equal(rewritten?.backdropUrl.searchParams.get('ep_id'), '42765');
  assert.equal(rewritten?.backdropUrl.searchParams.get('ep_absolute'), '1');
});