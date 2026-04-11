import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent, request as undiciRequest } from 'undici';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'local',
  'metadata.google.internal',
]);

const LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
const lookupCache = new Map<
  string,
  { expiresAt: number; records: Array<{ address: string; family: number }> }
>();

const parseIPv4 = (value: string) => {
  const parts = value.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
};

const isPrivateIPv4 = (value: string) => {
  const parts = parseIPv4(value);
  if (!parts) return false;

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
};

const isPrivateIPv6 = (value: string) => {
  const normalized = value.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  if (normalized.startsWith('::ffff:')) {
    const ipv4Part = normalized.slice('::ffff:'.length);
    return isPrivateIPv4(ipv4Part);
  }
  return false;
};

const isPrivateAddress = (value: string) => {
  const version = isIP(value);
  if (version === 4) return isPrivateIPv4(value);
  if (version === 6) return isPrivateIPv6(value);
  return false;
};

const isBlockedHostname = (hostname: string) => {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  if (normalized.endsWith('.local')) return true;
  return false;
};

const resolveHostRecords = async (hostname: string) => {
  const now = Date.now();
  const cached = lookupCache.get(hostname);
  if (cached && cached.expiresAt > now) {
    return cached.records;
  }

  const records = await lookup(hostname, { all: true, verbatim: true });
  lookupCache.set(hostname, { expiresAt: now + LOOKUP_CACHE_TTL_MS, records });
  return records;
};

const resolveHostAddresses = async (hostname: string) =>
  (await resolveHostRecords(hostname)).map((record) => record.address);

const selectSafeLookupRecord = async (hostname: string) => {
  const records = await resolveHostRecords(hostname);
  if (!records.length) {
    throw new Error('Hostname resolution failed.');
  }
  if (records.some((record) => isPrivateAddress(record.address))) {
    throw new Error('Target resolves to a private network address.');
  }

  const safeRecord = records[0];
  if (!safeRecord) {
    throw new Error('Hostname resolution failed.');
  }
  return safeRecord;
};

const SAFE_SOURCE_DISPATCHER = new Agent({
  connect: {
    lookup(hostname, _options, callback) {
      void selectSafeLookupRecord(hostname)
        .then((record) => callback(null, record.address, record.family))
        .catch((error) => callback(error as Error, '', 4));
    },
  },
});

const allowPrivateSourcesForTests = () =>
  process.env.XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS === 'true' &&
  process.env.NODE_ENV !== 'production';

const getSafeSourceDispatcher = () =>
  allowPrivateSourcesForTests() ? undefined : SAFE_SOURCE_DISPATCHER;

export const assertSafeSourceUrl = async (input: string) => {
  const raw = String(input || '').trim();
  if (!raw) {
    throw new Error('Missing URL.');
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Invalid URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('URL credentials are not allowed.');
  }

  if (allowPrivateSourcesForTests()) {
    return parsed;
  }

  const hostname = parsed.hostname;
  if (isBlockedHostname(hostname)) {
    throw new Error('Hostname is not allowed.');
  }

  if (isPrivateAddress(hostname)) {
    throw new Error('Private network hosts are not allowed.');
  }

  const addresses = await resolveHostAddresses(hostname);
  if (!addresses.length) {
    throw new Error('Hostname resolution failed.');
  }

  if (addresses.some((address) => isPrivateAddress(address))) {
    throw new Error('Target resolves to a private network address.');
  }

  return parsed;
};

const REDIRECT_STATUS_CODES = new Set([301, 302, 307, 308]);

const buildWebResponse = async (
  statusCode: number,
  rawHeaders: Record<string, string | string[] | undefined>,
  body: { arrayBuffer(): Promise<ArrayBuffer> },
): Promise<Response> => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (typeof value === 'string') {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      headers.set(key, value.join(', '));
    }
  }
  return new Response(await body.arrayBuffer(), { status: statusCode, headers });
};

type UndiciRequestFn = (
  url: string,
  options?: { dispatcher?: Agent; maxRedirections?: number },
) => Promise<{
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: { arrayBuffer(): Promise<ArrayBuffer>; dump(): Promise<void> };
}>;

export const fetchWithOneRedirect = async (
  url: string,
  _undiciRequest: UndiciRequestFn = undiciRequest as UndiciRequestFn,
): Promise<Response> => {
  const first = await _undiciRequest(url, {
    dispatcher: getSafeSourceDispatcher(),
    maxRedirections: 0,
  });

  if (!REDIRECT_STATUS_CODES.has(first.statusCode)) {
    return buildWebResponse(first.statusCode, first.headers, first.body);
  }

  await first.body.dump();

  const locationHeader = first.headers['location'];
  const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader;
  if (!location) {
    throw new Error('Redirect response is missing a Location header.');
  }

  const resolvedLocation = new URL(location, url).toString();
  await assertSafeSourceUrl(resolvedLocation);

  const final = await _undiciRequest(resolvedLocation, {
    dispatcher: getSafeSourceDispatcher(),
    maxRedirections: 0,
  });
  if (REDIRECT_STATUS_CODES.has(final.statusCode)) {
    await final.body.dump();
    throw new Error('Redirect chain not allowed: the redirect target also redirected.');
  }

  return buildWebResponse(final.statusCode, final.headers, final.body);
};
