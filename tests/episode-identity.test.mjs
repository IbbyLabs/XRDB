import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyEpisodeIdModeToXrdbId,
  buildEpisodePatternBaseId,
  normalizeEpisodeIdMode,
} from '../lib/episodeIdentity.ts';

test('episode id mode normalization accepts local canonical and tvdb modes', () => {
  assert.equal(normalizeEpisodeIdMode('xrdbid'), 'xrdbid');
  assert.equal(normalizeEpisodeIdMode('tvdb'), 'tvdb');
  assert.equal(normalizeEpisodeIdMode('unknown'), 'imdb');
});

test('episode pattern builders expose local canonical and tvdb placeholders', () => {
  assert.equal(buildEpisodePatternBaseId('xrdbid'), 'xrdbid:{imdb_id}');
  assert.equal(buildEpisodePatternBaseId('tvdb'), 'tvdb:{tvdb_id}');
});

test('episode id mode remaps series imdb ids to the local canonical prefix for episodic flows', () => {
  assert.equal(
    applyEpisodeIdModeToXrdbId('tt0944947', 'xrdbid', 'tv'),
    'xrdbid:tt0944947',
  );
  assert.equal(
    applyEpisodeIdModeToXrdbId('tvdb:81189', 'tvdb', 'tv'),
    'tvdb:81189',
  );
});

test('episode id mode leaves movie ids and non matching ids unchanged', () => {
  assert.equal(
    applyEpisodeIdModeToXrdbId('tt0133093', 'xrdbid', 'movie'),
    'tt0133093',
  );
  assert.equal(
    applyEpisodeIdModeToXrdbId('tt0944947', 'tvdb', 'tv'),
    'tt0944947',
  );
});
