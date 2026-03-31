type ProxyCorsContext = {
  requestOrigin: string | null;
  allowedOriginsRaw?: string | null;
};

type ProxyPublicUrlContext = {
  requestUrl: string;
  hostHeader: string | null;
  forwardedHostHeader: string | null;
  forwardedProtoHeader: string | null;
  trustForwarded: boolean;
};

const parseAllowedOrigins = (raw: string | undefined | null) => {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

const parseForwardedProto = (value: string | null) => {
  const candidate = (value || '').split(',')[0]?.trim().toLowerCase();
  if (candidate === 'http' || candidate === 'https') return candidate;
  return null;
};

const parseForwardedHost = (value: string | null) => {
  const candidate = (value || '').split(',')[0]?.trim();
  if (!candidate) return null;
  try {
    return new URL(`http://${candidate}`).host;
  } catch {
    return null;
  }
};

export const buildProxyRouteCorsHeaders = ({
  requestOrigin,
  allowedOriginsRaw,
}: ProxyCorsContext) => {
  const allowedOrigins = parseAllowedOrigins(allowedOriginsRaw);
  let allowOrigin = '*';

  if (allowedOrigins.length > 0) {
    if (allowedOrigins.includes('*')) {
      allowOrigin = '*';
    } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      allowOrigin = requestOrigin;
    } else {
      allowOrigin = allowedOrigins[0] ?? '*';
    }
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-XRDB-Key, X-API-Key',
    Vary: 'Origin',
  };
};

export const resolveProxyPublicUrl = ({
  requestUrl,
  hostHeader,
  forwardedHostHeader,
  forwardedProtoHeader,
  trustForwarded,
}: ProxyPublicUrlContext) => {
  const baseUrl = new URL(requestUrl);
  const resolvedHost = parseForwardedHost(trustForwarded ? forwardedHostHeader || hostHeader : hostHeader);
  if (!resolvedHost) {
    return baseUrl;
  }

  const resolvedProto = trustForwarded
    ? parseForwardedProto(forwardedProtoHeader) || baseUrl.protocol.replace(':', '')
    : baseUrl.protocol.replace(':', '');

  if (resolvedProto !== 'http' && resolvedProto !== 'https') {
    return baseUrl;
  }

  baseUrl.protocol = `${resolvedProto}:`;
  baseUrl.host = resolvedHost;
  if (trustForwarded && baseUrl.port) {
    baseUrl.port = '';
  }
  return baseUrl;
};
