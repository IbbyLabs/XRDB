import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRuntimeSiteMetadata, buildSiteMetadata, siteViewport } from '../lib/siteMetadata.ts';

test('buildSiteMetadata uses the provided public app URL as metadata base', () => {
  const metadata = buildSiteMetadata('https://example.test');

  assert.equal(metadata.metadataBase?.toString(), 'https://example.test/');
  assert.equal(metadata.applicationName, 'XRDB | eXtended Ratings DataBase');
  assert.equal(metadata.openGraph?.images?.[0]?.url, '/discord-banner.png');
  assert.equal(metadata.openGraph?.images?.[0]?.width, 1376);
  assert.equal(metadata.openGraph?.siteName, 'XRDB | eXtended Ratings DataBase');
});

test('siteViewport keeps the dark brand theme color', () => {
  assert.equal(siteViewport.themeColor, '#020108');
});

test('buildRuntimeSiteMetadata uses trusted forwarded host and proto first', () => {
  const metadata = buildRuntimeSiteMetadata({
    requestUrl: 'http://localhost:3000/',
    hostHeader: 'localhost:3000',
    forwardedHostHeader: 'dev.extendedratings.com',
    forwardedProtoHeader: 'https',
    trustForwarded: true,
  });

  assert.equal(metadata.metadataBase?.toString(), 'https://dev.extendedratings.com/');
});

test('buildRuntimeSiteMetadata ignores forwarded host when trust is disabled', () => {
  const metadata = buildRuntimeSiteMetadata({
    requestUrl: 'https://dev.extendedratings.com/',
    hostHeader: 'dev.extendedratings.com',
    forwardedHostHeader: 'extendedratings.com',
    forwardedProtoHeader: 'https',
    trustForwarded: false,
  });

  assert.equal(metadata.metadataBase?.toString(), 'https://dev.extendedratings.com/');
});

test('buildRuntimeSiteMetadata falls back to env URL when headers are unusable', () => {
  const metadata = buildRuntimeSiteMetadata({
    requestUrl: 'http://localhost:3000/',
    hostHeader: null,
    forwardedHostHeader: '%%%invalid%%%',
    forwardedProtoHeader: 'https',
    trustForwarded: true,
    appUrl: 'https://example.test',
  });

  assert.equal(metadata.metadataBase?.toString(), 'https://example.test/');
});

test('buildRuntimeSiteMetadata uses localhost default when no header or env URL exists', () => {
  const metadata = buildRuntimeSiteMetadata({
    requestUrl: 'http://localhost:3000/',
    hostHeader: null,
    forwardedHostHeader: null,
    forwardedProtoHeader: null,
    trustForwarded: false,
  });

  assert.equal(metadata.metadataBase?.toString(), 'http://localhost:3000/');
});
