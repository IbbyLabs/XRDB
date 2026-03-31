import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isTypeEnabled,
  normalizeProxyXrdbId,
  rewriteMetaImages,
} from '../lib/proxyRouteRuntime.ts';

test('proxy route normalization upgrades episodic ids for aiometadata style manifests', () => {
  const normalized = normalizeProxyXrdbId('tt0944947', 'series', {
    url: 'https://aiometadata.example.com/manifest.json',
    tmdbKey: 'tmdb',
    mdblistKey: 'mdblist',
    episodeIdMode: 'xrdbid',
  });

  assert.equal(normalized, 'xrdbid:tt0944947');
});

test('proxy route type toggles default on and respect explicit disables', () => {
  const config = {
    url: 'https://addon.example.com/manifest.json',
    tmdbKey: 'tmdb',
    mdblistKey: 'mdblist',
    posterEnabled: false,
  };

  assert.equal(isTypeEnabled(config, 'poster'), false);
  assert.equal(isTypeEnabled(config, 'backdrop'), true);
  assert.equal(isTypeEnabled(config, 'thumbnail'), true);
});

test('proxy route image rewriting updates artwork and video thumbnails from local config', () => {
  const requestUrl = new URL('https://proxy.example.com/proxy/config/meta/series/id.json');
  const meta = {
    id: 'tt0944947',
    type: 'series',
    poster: 'https://images.example.com/poster.jpg',
    background: 'https://images.example.com/background.jpg',
    logo: 'https://images.example.com/logo.png',
    videos: [
      {
        season: 2,
        episode: 1,
        thumbnail: 'https://images.example.com/episode.jpg',
      },
    ],
  };
  const config = {
    url: 'https://aiometadata.example.com/manifest.json',
    tmdbKey: 'tmdb-key',
    mdblistKey: 'mdblist-key',
    episodeIdMode: 'xrdbid',
    simklClientId: 'simkl-id',
  };

  const rewritten = rewriteMetaImages(meta, requestUrl, config);

  const posterUrl = new URL(rewritten.poster);
  const backdropUrl = new URL(rewritten.background);
  const logoUrl = new URL(rewritten.logo);
  const thumbnailUrl = new URL(rewritten.videos[0].thumbnail);

  assert.equal(posterUrl.pathname, '/poster/xrdbid%3Att0944947.jpg');
  assert.equal(
    posterUrl.searchParams.get('fallbackUrl'),
    'https://images.example.com/poster.jpg',
  );
  assert.equal(backdropUrl.pathname, '/backdrop/xrdbid%3Att0944947.jpg');
  assert.equal(
    backdropUrl.searchParams.get('fallbackUrl'),
    'https://images.example.com/background.jpg',
  );
  assert.equal(logoUrl.pathname, '/logo/xrdbid%3Att0944947.jpg');
  assert.equal(
    logoUrl.searchParams.get('fallbackUrl'),
    'https://images.example.com/logo.png',
  );
  assert.equal(thumbnailUrl.pathname, '/thumbnail/xrdbid%3Att0944947/S02E01.jpg');
  assert.equal(
    thumbnailUrl.searchParams.get('fallbackUrl'),
    'https://images.example.com/episode.jpg',
  );
});
