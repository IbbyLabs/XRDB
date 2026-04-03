import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyEpisodeIdModeToXrdbId,
  buildEpisodePreviewMediaTarget,
  buildEpisodePatternBaseId,
  normalizeEpisodeIdMode,
  parseEpisodePreviewMediaTarget,
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

test('episode preview media target parsing supports typed ids and normal season episode suffixes', () => {
  assert.deepEqual(parseEpisodePreviewMediaTarget('tmdb:tv:1399:2:8'), {
    mediaId: 'tmdb:tv:1399',
    seasonNumber: 2,
    episodeNumber: 8,
    episodeToken: 'S02E08',
  });
  assert.deepEqual(parseEpisodePreviewMediaTarget('tvdb:121361:3:5'), {
    mediaId: 'tvdb:121361',
    seasonNumber: 3,
    episodeNumber: 5,
    episodeToken: 'S03E05',
  });
});

test('episode preview media target parsing supports kitsu short and explicit season inputs', () => {
  assert.deepEqual(parseEpisodePreviewMediaTarget('kitsu:7442:14'), {
    mediaId: 'kitsu:7442',
    seasonNumber: 1,
    episodeNumber: 14,
    episodeToken: 'S01E14',
  });
  assert.deepEqual(parseEpisodePreviewMediaTarget('kitsu:7442:2:14'), {
    mediaId: 'kitsu:7442',
    seasonNumber: 2,
    episodeNumber: 14,
    episodeToken: 'S02E14',
  });
});

test('episode preview media target builder normalizes valid inputs and rejects invalid values', () => {
  assert.equal(
    buildEpisodePreviewMediaTarget({
      mediaId: 'tmdb:tv:1399',
      seasonNumber: '2',
      episodeNumber: '8',
    }),
    'tmdb:tv:1399:2:8',
  );
  assert.equal(
    buildEpisodePreviewMediaTarget({
      mediaId: '',
      seasonNumber: 1,
      episodeNumber: 1,
    }),
    null,
  );
  assert.equal(
    buildEpisodePreviewMediaTarget({
      mediaId: 'tvdb:121361',
      seasonNumber: 0,
      episodeNumber: 5,
    }),
    null,
  );
});
