import { buildProxyId } from './proxyIdUtils.ts';
import { applyProxyCatalogRules, decodeProxyCatalogRules } from './proxyCatalogRules.ts';

type ProxyCorsContext = {
  requestOrigin: string | null;
  allowedOriginsRaw?: string | null;
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

  return {
    ...rewrittenManifest,
    id: buildProxyId(sourceManifestUrl, options?.configSeed),
    name: `XRDB Proxy | ${sourceName}`,
    description: `${sourceDescription} (served through XRDB Proxy)`,
  };
};
