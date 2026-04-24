import { buildProxyId } from './proxyIdUtils.ts';
import { applyProxyCatalogRules, decodeProxyCatalogRules } from './proxyCatalogRules.ts';

type ProxyCorsContext = {
  requestOrigin: string | null;
  allowedOriginsRaw?: string | null;
};

const STORED_PROXY_REFERENCE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeManifestValueForFingerprint = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeManifestValueForFingerprint(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, normalizeManifestValueForFingerprint(entryValue)]),
    );
  }

  return value;
};

const buildProxyManifestIdentitySeed = (
  manifest: Record<string, unknown>,
  options?: {
    catalogPlan?: string | null;
    configSeed?: string;
  },
) => {
  const hasStoredProxyReferenceSeed =
    typeof options?.configSeed === 'string' && STORED_PROXY_REFERENCE_ID_RE.test(options.configSeed);
  const sourceManifestFingerprint = JSON.stringify(
    normalizeManifestValueForFingerprint(manifest),
  );
  const seedParts = [
    options?.configSeed,
    options?.catalogPlan,
    hasStoredProxyReferenceSeed ? null : sourceManifestFingerprint,
  ].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  return seedParts.length > 0 ? seedParts.join('|') : undefined;
};

export const parseAllowedProxyOrigins = (raw: string | undefined | null) => {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

export const buildProxyCorsHeaders = ({
  requestOrigin,
  allowedOriginsRaw,
}: ProxyCorsContext) => {
  const allowedOrigins = parseAllowedProxyOrigins(allowedOriginsRaw);
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
};

export const buildProxyNoStoreHeaders = () => ({
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'Surrogate-Control': 'no-store',
  Pragma: 'no-cache',
  Expires: '0',
});

export const buildProxyManifestPayload = (
  manifest: Record<string, unknown>,
  sourceManifestUrl: string,
  options?: {
    catalogPlan?: string | null;
    configSeed?: string;
  },
) => {
  const catalogRules = decodeProxyCatalogRules(options?.catalogPlan);
  const rewrittenManifest = applyProxyCatalogRules(manifest, catalogRules);
  const sourceName = typeof manifest.name === 'string' ? manifest.name : 'Addon';
  const sourceDescription =
    typeof manifest.description === 'string' ? manifest.description : 'Served through the image proxy';
  const identitySeed = buildProxyManifestIdentitySeed(manifest, options);

  return {
    ...rewrittenManifest,
    id: buildProxyId(sourceManifestUrl, identitySeed),
    name: `XRDB Proxy | ${sourceName}`,
    description: `${sourceDescription} (served through XRDB Proxy)`,
  };
};
