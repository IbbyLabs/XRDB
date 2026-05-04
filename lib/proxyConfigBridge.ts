export { XRDB_RESERVED_PARAMS, type ProxyConfig } from './proxyConfigSchema.ts';
export {
  parseAddonBaseUrl,
  normalizeXrdbId,
  hasExplicitTmdbMediaTypeInXrdbId,
  isAmbiguousTmdbXrdbId,
} from './proxyIdUtils.ts';
export {
  decodeProxyConfig,
  getProxyConfigFromQuery,
  normalizeProxyConfigPayload,
} from './proxyConfigCodec.ts';
export { buildXrdbImageUrl } from './proxyImageUrl.ts';
