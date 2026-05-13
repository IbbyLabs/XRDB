import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTNER_AUTH_HEADER_ID,
  PARTNER_AUTH_HEADER_NONCE,
  PARTNER_AUTH_HEADER_SIGNATURE,
  PARTNER_AUTH_HEADER_TIMESTAMP,
  __resetPartnerAccessStateForTests,
  authorizePartnerRequest,
  buildPartnerCanonicalPayload,
  parsePartnerProfiles,
  signPartnerPayload,
} from '../lib/partnerAccess.ts';

test('partner access parser normalizes entries and ignores duplicates', () => {
  const profiles = parsePartnerProfiles('alpha:secret-a:120:60,beta:secret-b', 'alpha:secret-c:999:999');

  assert.deepEqual(profiles, [
    { id: 'alpha', secret: 'secret-a', perMinute: 120, burst: 60 },
    { id: 'beta', secret: 'secret-b', perMinute: 240, burst: 240 },
  ]);
});

test('partner access authorization accepts valid signed request', () => {
  __resetPartnerAccessStateForTests();
  const now = 1_000_000;
  const timestamp = String(now);
  const nonce = 'nonce-1';
  const searchParams = new URLSearchParams('foo=1&bar=2');
  const payload = buildPartnerCanonicalPayload({
    method: 'GET',
    pathname: '/poster/tt123.jpg',
    searchParams,
    timestamp,
    nonce,
  });
  const signature = signPartnerPayload('top-secret', payload);

  const headers = new Headers({
    [PARTNER_AUTH_HEADER_ID]: 'alpha',
    [PARTNER_AUTH_HEADER_TIMESTAMP]: timestamp,
    [PARTNER_AUTH_HEADER_NONCE]: nonce,
    [PARTNER_AUTH_HEADER_SIGNATURE]: signature,
  });

  const result = authorizePartnerRequest({
    method: 'GET',
    pathname: '/poster/tt123.jpg',
    searchParams,
    headers,
    profiles: [{ id: 'alpha', secret: 'top-secret', perMinute: 60, burst: 5 }],
    now,
  });

  assert.deepEqual(result, { status: 'ok', partnerId: 'alpha' });
});

test('partner access authorization rejects replayed nonce', () => {
  __resetPartnerAccessStateForTests();
  const now = 2_000_000;
  const timestamp = String(now);
  const nonce = 'nonce-replay';
  const searchParams = new URLSearchParams('a=1');
  const payload = buildPartnerCanonicalPayload({
    method: 'GET',
    pathname: '/proxy/config/catalog/movie/top.json',
    searchParams,
    timestamp,
    nonce,
  });
  const signature = signPartnerPayload('shared-secret', payload);

  const headers = new Headers({
    [PARTNER_AUTH_HEADER_ID]: 'alpha',
    [PARTNER_AUTH_HEADER_TIMESTAMP]: timestamp,
    [PARTNER_AUTH_HEADER_NONCE]: nonce,
    [PARTNER_AUTH_HEADER_SIGNATURE]: signature,
  });

  const profiles = [{ id: 'alpha', secret: 'shared-secret', perMinute: 100, burst: 10 }];

  const first = authorizePartnerRequest({
    method: 'GET',
    pathname: '/proxy/config/catalog/movie/top.json',
    searchParams,
    headers,
    profiles,
    now,
  });
  assert.deepEqual(first, { status: 'ok', partnerId: 'alpha' });

  const replay = authorizePartnerRequest({
    method: 'GET',
    pathname: '/proxy/config/catalog/movie/top.json',
    searchParams,
    headers,
    profiles,
    now: now + 1,
  });
  assert.equal(replay.status, 'unauthorized');
});

test('partner access authorization enforces per-partner rate limit', () => {
  __resetPartnerAccessStateForTests();
  const now = 3_000_000;
  const searchParams = new URLSearchParams('x=1');
  const profiles = [{ id: 'alpha', secret: 'rate-secret', perMinute: 1, burst: 1 }];

  const makeHeaders = (nonce, timestampValue) => {
    const payload = buildPartnerCanonicalPayload({
      method: 'GET',
      pathname: '/backdrop/tt123.jpg',
      searchParams,
      timestamp: timestampValue,
      nonce,
    });
    const signature = signPartnerPayload('rate-secret', payload);
    return new Headers({
      [PARTNER_AUTH_HEADER_ID]: 'alpha',
      [PARTNER_AUTH_HEADER_TIMESTAMP]: timestampValue,
      [PARTNER_AUTH_HEADER_NONCE]: nonce,
      [PARTNER_AUTH_HEADER_SIGNATURE]: signature,
    });
  };

  const first = authorizePartnerRequest({
    method: 'GET',
    pathname: '/backdrop/tt123.jpg',
    searchParams,
    headers: makeHeaders('nonce-a', String(now)),
    profiles,
    now,
  });
  assert.deepEqual(first, { status: 'ok', partnerId: 'alpha' });

  const second = authorizePartnerRequest({
    method: 'GET',
    pathname: '/backdrop/tt123.jpg',
    searchParams,
    headers: makeHeaders('nonce-b', String(now + 1)),
    profiles,
    now: now + 1,
  });

  assert.equal(second.status, 'rate-limited');
  if (second.status === 'rate-limited') {
    assert.equal(second.message, 'Partner request rate limit reached.');
    assert.ok(second.retryAfterMs > 0);
  }
});

test('partner access rate buckets do not bleed across partner identities', () => {
  __resetPartnerAccessStateForTests();
  const now = 4_000_000;
  const searchParams = new URLSearchParams('x=1');
  const profiles = [
    { id: 'alpha', secret: 'alpha-secret', perMinute: 1, burst: 1 },
    { id: 'beta', secret: 'beta-secret', perMinute: 1, burst: 1 },
  ];

  const buildHeaders = (partnerId, secret, nonce, timestampValue) => {
    const payload = buildPartnerCanonicalPayload({
      method: 'GET',
      pathname: '/poster/tt456.jpg',
      searchParams,
      timestamp: timestampValue,
      nonce,
    });
    const signature = signPartnerPayload(secret, payload);
    return new Headers({
      [PARTNER_AUTH_HEADER_ID]: partnerId,
      [PARTNER_AUTH_HEADER_TIMESTAMP]: timestampValue,
      [PARTNER_AUTH_HEADER_NONCE]: nonce,
      [PARTNER_AUTH_HEADER_SIGNATURE]: signature,
    });
  };

  const alphaFirst = authorizePartnerRequest({
    method: 'GET',
    pathname: '/poster/tt456.jpg',
    searchParams,
    headers: buildHeaders('alpha', 'alpha-secret', 'alpha-a', String(now)),
    profiles,
    now,
  });
  assert.deepEqual(alphaFirst, { status: 'ok', partnerId: 'alpha' });

  const alphaSecond = authorizePartnerRequest({
    method: 'GET',
    pathname: '/poster/tt456.jpg',
    searchParams,
    headers: buildHeaders('alpha', 'alpha-secret', 'alpha-b', String(now + 1)),
    profiles,
    now: now + 1,
  });
  assert.equal(alphaSecond.status, 'rate-limited');

  const betaFirst = authorizePartnerRequest({
    method: 'GET',
    pathname: '/poster/tt456.jpg',
    searchParams,
    headers: buildHeaders('beta', 'beta-secret', 'beta-a', String(now + 2)),
    profiles,
    now: now + 2,
  });
  assert.deepEqual(betaFirst, { status: 'ok', partnerId: 'beta' });
});
