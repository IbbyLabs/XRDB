export { XRDB_RESERVED_PARAMS, type ProxyConfig } from './proxyConfigSchema.ts';
export {
  buildProxyId,
  parseAddonBaseUrl,
  normalizeXrdbId,
  hasExplicitTmdbMediaTypeInXrdbId,
  isAmbiguousTmdbXrdbId,
} from './proxyIdUtils.ts';
export { decodeProxyConfig, getProxyConfigFromQuery } from './proxyConfigCodec.ts';
export { buildXrdbImageUrl } from './proxyImageUrl.ts';
