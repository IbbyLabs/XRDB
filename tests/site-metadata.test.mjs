import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSiteMetadata, siteViewport } from '../lib/siteMetadata.ts';

test('buildSiteMetadata uses the provided public app URL as metadata base', () => {
  const metadata = buildSiteMetadata('https://example.test');

  assert.equal(metadata.metadataBase?.toString(), 'https://example.test/');
  assert.equal(metadata.applicationName, 'XRDB | eXtended Ratings DataBase');
  assert.equal(metadata.openGraph?.images?.[0], '/favicon.png');
});

test('siteViewport keeps the dark brand theme color', () => {
  assert.equal(siteViewport.themeColor, '#020108');
});
