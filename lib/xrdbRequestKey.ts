import { timingSafeEqual } from 'node:crypto';

export const XRDB_REQUEST_KEY_ERROR_MESSAGE = 'Missing or invalid XRDB request key.';
export const XRDB_REQUEST_KEY_QUERY_PARAM = 'xrdbKey';
export const XRDB_REQUEST_KEY_QUERY_PARAM_LEGACY = 'xrdb_key';
export const XRDB_REQUEST_KEY_PLACEHOLDER = '{xrdb_key}';

const REQUEST_KEY_HEADER_NAMES = ['x-xrdb-key', 'x-api-key'] as const;

export const parseXrdbRequestKeyList = (...values: Array<string | undefined>) => {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    for (const candidate of (value || '').split(/[\s,;]+/)) {
      const normalized = candidate.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
};

const safeCompareText = (left: string, right: string) => {
  if (!left || !right || left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
};

export const getConfiguredXrdbRequestKeys = () =>
  parseXrdbRequestKeyList(process.env.XRDB_REQUEST_API_KEYS, process.env.XRDB_REQUEST_API_KEY);

export const getXrdbRequestKeyFromSearchParams = (searchParams: URLSearchParams) => {
  const queryKey =
    searchParams.get(XRDB_REQUEST_KEY_QUERY_PARAM) ||
    searchParams.get(XRDB_REQUEST_KEY_QUERY_PARAM_LEGACY) ||
    '';
  const normalized = queryKey.trim();
  return normalized || null;
};

export const getXrdbRequestKeyFromHeaders = (headers: Headers) => {
  for (const headerName of REQUEST_KEY_HEADER_NAMES) {
    const headerValue = headers.get(headerName);
    if (headerValue?.trim()) {
      return headerValue.trim();
    }
  }

  const authorization = headers.get('authorization') || '';
  const bearerMatch = /^\s*Bearer\s+(.+)\s*$/i.exec(authorization);
  const normalized = bearerMatch?.[1]?.trim() || '';
  return normalized || null;
};

export const resolveProvidedXrdbRequestKey = ({
  searchParams,
  headers,
  fallbackKey,
}: {
  searchParams: URLSearchParams;
  headers: Headers;
  fallbackKey?: string | null;
}) => {
  return (
    getXrdbRequestKeyFromSearchParams(searchParams) ||
    getXrdbRequestKeyFromHeaders(headers) ||
    fallbackKey?.trim() ||
    null
  );
};

export const isXrdbRequestAuthorized = ({
  configuredKeys,
  searchParams,
  headers,
  fallbackKey,
}: {
  configuredKeys: string[];
  searchParams: URLSearchParams;
  headers: Headers;
  fallbackKey?: string | null;
}) => {
  if (configuredKeys.length === 0) {
    return true;
  }

  const providedKey = resolveProvidedXrdbRequestKey({ searchParams, headers, fallbackKey });
  if (!providedKey) {
    return false;
  }

  return configuredKeys.some((configuredKey) => safeCompareText(providedKey, configuredKey));
};
