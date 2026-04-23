import test from 'node:test';
import assert from 'node:assert/strict';

import { createQualityBadgeIconDataUriResolver } from '../lib/imageRouteQualityBadgeIcon.ts';

test('quality badge icon returns inline data uris unchanged', async () => {
  const getQualityBadgeIconDataUri = createQualityBadgeIconDataUriResolver({
    getMetadata: () => null,
    setMetadata: () => {},
  });

  assert.equal(
    await getQualityBadgeIconDataUri('data:image/svg+xml;base64,PHN2Zy8+'),
    'data:image/svg+xml;base64,PHN2Zy8+',
  );
});

test('quality badge icon rejects unsafe hosts before fetching', async () => {
  const getQualityBadgeIconDataUri = createQualityBadgeIconDataUriResolver({
    getMetadata: () => null,
    setMetadata: () => {},
    fetchSafeIconImpl: async () => {
      throw new Error('should not be called');
    },
  });

  assert.equal(await getQualityBadgeIconDataUri('http://localhost/icon.png'), null);
});