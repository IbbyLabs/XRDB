import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeAiometadataOrigin,
  repairAiometadataCustomArtPatterns,
  repairEncodedAiometadataPlaceholders,
} from '../lib/aiometadataProfileRepair.ts';

test('repairEncodedAiometadataPlaceholders restores encoded XRDB placeholder tokens', () => {
  assert.equal(
    repairEncodedAiometadataPlaceholders(
      'https://xrdb.example.com/thumbnail/%7Bimdb_id%7D/S%7Bseason%7DE%7Bepisode%7D.jpg?config=demo',
    ),
    'https://xrdb.example.com/thumbnail/{imdb_id}/S{season}E{episode}.jpg?config=demo',
  );
});

test('repairAiometadataCustomArtPatterns repairs only encoded custom art fields', () => {
  const input = {
    customPosterUrlPattern: 'https://xrdb.example.com/poster/imdb:%7Bimdb_id%7D.jpg?config=demo',
    customThumbnailUrlPattern: 'https://xrdb.example.com/thumbnail/%7Bimdb_id%7D/S%7Bseason%7DE%7Bepisode%7D.jpg?config=demo',
    customLogoUrlPattern: 'https://example.com/logo.png',
    unrelated: '%7Bimdb_id%7D',
  };

  const result = repairAiometadataCustomArtPatterns(input);

  assert.deepEqual(result.repairedKeys, [
    'customPosterUrlPattern',
    'customThumbnailUrlPattern',
  ]);
  assert.equal(
    result.config.customPosterUrlPattern,
    'https://xrdb.example.com/poster/imdb:{imdb_id}.jpg?config=demo',
  );
  assert.equal(
    result.config.customThumbnailUrlPattern,
    'https://xrdb.example.com/thumbnail/{imdb_id}/S{season}E{episode}.jpg?config=demo',
  );
  assert.equal(result.config.customLogoUrlPattern, 'https://example.com/logo.png');
  assert.equal(result.config.unrelated, '%7Bimdb_id%7D');
});

test('normalizeAiometadataOrigin validates and trims the base URL', () => {
  assert.equal(normalizeAiometadataOrigin(undefined), 'https://aiometadata.elfhosted.com');
  assert.equal(normalizeAiometadataOrigin('https://aiometadata.example.com/path?q=1'), 'https://aiometadata.example.com');
  assert.equal(normalizeAiometadataOrigin('ftp://aiometadata.example.com'), null);
  assert.equal(normalizeAiometadataOrigin('not a url'), null);
});