import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTorrentioStreamUrl,
  DEFAULT_TORRENTIO_BASE_URL,
  resolveTorrentioBaseUrl,
} from '../lib/torrentioUrl.ts';

test('resolveTorrentioBaseUrl falls back to default when unset', () => {
  assert.equal(resolveTorrentioBaseUrl(undefined), DEFAULT_TORRENTIO_BASE_URL);
});

test('resolveTorrentioBaseUrl strips manifest and trailing slash from instance URL', () => {
  const normalized = resolveTorrentioBaseUrl(' https://torrentio.kuu.example/realdebrid=1/manifest.json ');

  assert.equal(normalized, 'https://torrentio.kuu.example/realdebrid=1');
});

test('buildTorrentioStreamUrl supports custom instance path', () => {
  const url = buildTorrentioStreamUrl(
    'https://torrentio.kuu.example/realdebrid=1',
    'series',
    'tt0944947:1:1',
  );

  assert.equal(
    url,
    'https://torrentio.kuu.example/realdebrid=1/stream/series/tt0944947%3A1%3A1.json',
  );
});

test('buildTorrentioStreamUrl supports configure path instances', () => {
  const base = resolveTorrentioBaseUrl('https://torrentio.stremio.ru/configure');
  const url = buildTorrentioStreamUrl(base, 'series', 'tt0944947:1:1');

  assert.equal(url, 'https://torrentio.stremio.ru/configure/stream/series/tt0944947%3A1%3A1.json');
});
