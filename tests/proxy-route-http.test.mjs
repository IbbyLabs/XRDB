import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProxyReferencePublicUrl,
  buildProxyRouteCorsHeaders,
  resolveProxyPublicUrl,
} from '../lib/proxyRouteRequest.ts';
import { buildProxyNoStoreHeaders } from '../lib/proxyManifest.ts';

test('proxy route CORS headers allow matching origins when configured', () => {
  const headers = buildProxyRouteCorsHeaders({
    requestOrigin: 'https://allowed.test',
    allowedOriginsRaw: 'https://allowed.test,https://fallback.test',
  });

  assert.equal(headers['Access-Control-Allow-Origin'], 'https://allowed.test');
  assert.equal(
    headers['Access-Control-Allow-Headers'],
    'Content-Type, Authorization, X-XRDB-Key, X-API-Key',
  );
});

test('proxy route no-store headers disable browser and CDN caching', () => {
  const headers = buildProxyNoStoreHeaders();

  assert.equal(
    headers['Cache-Control'],
    'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  );
  assert.equal(headers['CDN-Cache-Control'], 'no-store');
  assert.equal(headers['Cloudflare-CDN-Cache-Control'], 'no-store');
  assert.equal(headers['Surrogate-Control'], 'no-store');
  assert.equal(headers.Pragma, 'no-cache');
  assert.equal(headers.Expires, '0');
});

test('proxy route public URL trusts forwarded host and proto when enabled', () => {
  const url = resolveProxyPublicUrl({
    requestUrl: 'http://internal.test/proxy/example/meta/movie/id.json',
    hostHeader: 'internal.test',
    forwardedHostHeader: 'public.example.com',
    forwardedProtoHeader: 'https',
    trustForwarded: true,
  });

  assert.equal(url.toString(), 'https://public.example.com/proxy/example/meta/movie/id.json');
});

test('proxy route public URL falls back to the request URL when forwarded host is invalid', () => {
  const url = resolveProxyPublicUrl({
    requestUrl: 'http://internal.test/proxy/example/meta/movie/id.json',
    hostHeader: 'internal.test',
    forwardedHostHeader: '%%%bad-host%%%',
    forwardedProtoHeader: 'https',
    trustForwarded: true,
  });

  assert.equal(url.toString(), 'http://internal.test/proxy/example/meta/movie/id.json');
});

test('proxy reference URL uses trusted forwarded host and protocol', () => {
  const url = buildProxyReferencePublicUrl({
    requestUrl: 'http://0.0.0.0:3000/api/proxy-ref',
    hostHeader: '0.0.0.0:3000',
    forwardedHostHeader: 'xrdb.ibbylabs.dev',
    forwardedProtoHeader: 'https',
    trustForwarded: true,
    referenceId: '123e4567-e89b-12d3-a456-426614174000',
  });

  assert.equal(
    url,
    'https://xrdb.ibbylabs.dev/proxy/123e4567-e89b-12d3-a456-426614174000/manifest.json',
  );
});

test('proxy reference URL falls back to request host when forwarded host is invalid', () => {
  const url = buildProxyReferencePublicUrl({
    requestUrl: 'http://internal.test/api/proxy-ref',
    hostHeader: 'internal.test',
    forwardedHostHeader: '%%%bad-host%%%',
    forwardedProtoHeader: 'https',
    trustForwarded: true,
    referenceId: '123e4567-e89b-12d3-a456-426614174000',
  });

  assert.equal(
    url,
    'http://internal.test/proxy/123e4567-e89b-12d3-a456-426614174000/manifest.json',
  );
});

test('proxy reference URL does not expose internal bind host when forwarded host is trusted', () => {
  const url = buildProxyReferencePublicUrl({
    requestUrl: 'http://0.0.0.0:3000/api/proxy-ref',
    hostHeader: '0.0.0.0:3000',
    forwardedHostHeader: 'public.example.com',
    forwardedProtoHeader: 'https',
    trustForwarded: true,
    referenceId: '123e4567-e89b-12d3-a456-426614174000',
  });

  assert.equal(url.includes('0.0.0.0'), false);
  assert.equal(
    url,
    'https://public.example.com/proxy/123e4567-e89b-12d3-a456-426614174000/manifest.json',
  );
});
