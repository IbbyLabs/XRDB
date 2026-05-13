import { createHmac, timingSafeEqual } from 'node:crypto';

export const PARTNER_AUTH_HEADER_ID = 'x-xrdb-partner-id';
export const PARTNER_AUTH_HEADER_TIMESTAMP = 'x-xrdb-timestamp';
export const PARTNER_AUTH_HEADER_NONCE = 'x-xrdb-nonce';
export const PARTNER_AUTH_HEADER_SIGNATURE = 'x-xrdb-signature';

const PARTNER_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;
const PARTNER_NONCE_TTL_MS = 10 * 60 * 1000;

type PartnerProfile = {
  id: string;
  secret: string;
  perMinute: number;
  burst: number;
};

type TokenBucketState = {
  tokens: number;
  lastRefillAt: number;
};

const partnerNonceExpiries = new Map<string, number>();
const partnerRateBuckets = new Map<string, TokenBucketState>();

const parsePositiveInt = (value: string, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const parsePartnerEntry = (value: string): PartnerProfile | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':').map((part) => part.trim());
  if (parts.length < 2) return null;

  const id = parts[0] || '';
  const secret = parts[1] || '';
  if (!id || !secret) return null;

  const perMinute = parsePositiveInt(parts[2] || '', 240, 1, 100_000);
  const burst = parsePositiveInt(parts[3] || '', perMinute, 1, 100_000);
  return {
    id,
    secret,
    perMinute,
    burst,
  };
};

export const parsePartnerProfiles = (...values: Array<string | undefined>): PartnerProfile[] => {
  const result: PartnerProfile[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    for (const candidate of String(value || '').split(/[\n,;]+/)) {
      const parsed = parsePartnerEntry(candidate);
      if (!parsed || seen.has(parsed.id)) continue;
      seen.add(parsed.id);
      result.push(parsed);
    }
  }

  return result;
};

const safeCompare = (left: string, right: string) => {
  if (!left || !right || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
};

const canonicalizeSearchParams = (searchParams: URLSearchParams) => {
  const entries = [...searchParams.entries()]
    .filter(([key]) => key !== 'xrdbSig' && key !== 'signature')
    .sort(([aKey, aValue], [bKey, bValue]) => {
      if (aKey === bKey) return aValue.localeCompare(bValue);
      return aKey.localeCompare(bKey);
    });

  return entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
};

export const buildPartnerCanonicalPayload = ({
  method,
  pathname,
  searchParams,
  timestamp,
  nonce,
}: {
  method: string;
  pathname: string;
  searchParams: URLSearchParams;
  timestamp: string;
  nonce: string;
}) => {
  const normalizedMethod = method.trim().toUpperCase() || 'GET';
  const query = canonicalizeSearchParams(searchParams);
  return [normalizedMethod, pathname || '/', query, timestamp.trim(), nonce.trim()].join('\n');
};

export const signPartnerPayload = (secret: string, payload: string) =>
  createHmac('sha256', secret).update(payload).digest('hex');

const consumePartnerRateLimit = ({
  partnerId,
  perMinute,
  burst,
  now,
}: {
  partnerId: string;
  perMinute: number;
  burst: number;
  now: number;
}) => {
  const refillPerMs = perMinute / 60_000;
  const state = partnerRateBuckets.get(partnerId) || { tokens: burst, lastRefillAt: now };
  const elapsed = Math.max(0, now - state.lastRefillAt);
  const refilledTokens = Math.min(burst, state.tokens + elapsed * refillPerMs);

  if (refilledTokens < 1) {
    partnerRateBuckets.set(partnerId, {
      tokens: refilledTokens,
      lastRefillAt: now,
    });
    const missing = 1 - refilledTokens;
    const retryAfterMs = Math.ceil(missing / refillPerMs);
    return {
      allowed: false,
      retryAfterMs: Math.max(1_000, retryAfterMs),
    } as const;
  }

  partnerRateBuckets.set(partnerId, {
    tokens: refilledTokens - 1,
    lastRefillAt: now,
  });
  return { allowed: true, retryAfterMs: 0 } as const;
};

const purgeExpiredNonces = (now: number) => {
  for (const [nonceKey, expiresAt] of partnerNonceExpiries) {
    if (expiresAt <= now) {
      partnerNonceExpiries.delete(nonceKey);
    }
  }
};

const consumePartnerNonce = ({
  partnerId,
  nonce,
  now,
}: {
  partnerId: string;
  nonce: string;
  now: number;
}) => {
  purgeExpiredNonces(now);
  const nonceKey = `${partnerId}:${nonce}`;
  const existing = partnerNonceExpiries.get(nonceKey);
  if (existing && existing > now) {
    return false;
  }
  partnerNonceExpiries.set(nonceKey, now + PARTNER_NONCE_TTL_MS);
  return true;
};

const resolvePartnerProfile = (profiles: PartnerProfile[], partnerId: string) =>
  profiles.find((profile) => profile.id === partnerId) || null;

export type PartnerAuthResult =
  | { status: 'missing' }
  | { status: 'ok'; partnerId: string }
  | { status: 'unauthorized'; message: string }
  | { status: 'rate-limited'; message: string; retryAfterMs: number };

export const getConfiguredPartnerProfiles = () =>
  parsePartnerProfiles(process.env.XRDB_PARTNER_ACCESS_KEYS);

export const authorizePartnerRequest = ({
  method,
  pathname,
  searchParams,
  headers,
  profiles,
  now = Date.now(),
}: {
  method: string;
  pathname: string;
  searchParams: URLSearchParams;
  headers: Headers;
  profiles: PartnerProfile[];
  now?: number;
}): PartnerAuthResult => {
  if (profiles.length === 0) {
    return { status: 'missing' };
  }

  const partnerId = (headers.get(PARTNER_AUTH_HEADER_ID) || '').trim();
  const timestamp = (headers.get(PARTNER_AUTH_HEADER_TIMESTAMP) || '').trim();
  const nonce = (headers.get(PARTNER_AUTH_HEADER_NONCE) || '').trim();
  const signature = (headers.get(PARTNER_AUTH_HEADER_SIGNATURE) || '').trim().toLowerCase();
  const hasAnyPartnerHeaders = Boolean(partnerId || timestamp || nonce || signature);

  if (!hasAnyPartnerHeaders) {
    return { status: 'missing' };
  }

  if (!partnerId || !timestamp || !nonce || !signature) {
    return { status: 'unauthorized', message: 'Invalid partner signature headers.' };
  }

  const profile = resolvePartnerProfile(profiles, partnerId);
  if (!profile) {
    return { status: 'unauthorized', message: 'Unknown partner identity.' };
  }

  const timestampMs = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampMs)) {
    return { status: 'unauthorized', message: 'Invalid partner request timestamp.' };
  }

  if (Math.abs(now - timestampMs) > PARTNER_TIMESTAMP_SKEW_MS) {
    return { status: 'unauthorized', message: 'Partner request timestamp is outside the allowed window.' };
  }

  if (!consumePartnerNonce({ partnerId, nonce, now })) {
    return { status: 'unauthorized', message: 'Partner request nonce was already used.' };
  }

  const payload = buildPartnerCanonicalPayload({
    method,
    pathname,
    searchParams,
    timestamp,
    nonce,
  });
  const expectedSignature = signPartnerPayload(profile.secret, payload);
  if (!safeCompare(signature, expectedSignature)) {
    return { status: 'unauthorized', message: 'Invalid partner request signature.' };
  }

  const limitResult = consumePartnerRateLimit({
    partnerId,
    perMinute: profile.perMinute,
    burst: profile.burst,
    now,
  });
  if (!limitResult.allowed) {
    return {
      status: 'rate-limited',
      message: 'Partner request rate limit reached.',
      retryAfterMs: limitResult.retryAfterMs,
    };
  }

  return {
    status: 'ok',
    partnerId,
  };
};

export const __resetPartnerAccessStateForTests = () => {
  partnerNonceExpiries.clear();
  partnerRateBuckets.clear();
};
