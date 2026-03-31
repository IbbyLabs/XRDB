import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProxyRouteCorsHeaders,
  resolveProxyPublicUrl,
} from '../lib/proxyRouteRequest.ts';

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
