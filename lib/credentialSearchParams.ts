export const SENSITIVE_CREDENTIAL_QUERY_PARAM_NAMES = new Set([
  'api_key',
  'apikey',
  'client_id',
  'client_key',
  'fanartClientKey',
  'fanartKey',
  'fanart_client_key',
  'fanart_key',
  'mdblistKey',
  'mdblist_key',
  'simklClientId',
  'simkl_client_id',
  'tmdbKey',
  'tmdb_key',
  'xrdbKey',
  'xrdb_key',
]);

export const stripSensitiveCredentialSearchParams = (searchParams: URLSearchParams) => {
  for (const key of SENSITIVE_CREDENTIAL_QUERY_PARAM_NAMES) {
    searchParams.delete(key);
  }
  return searchParams;
};

export const sanitizeSensitiveCredentialUrl = (value: string, replacement = '[redacted]') => {
  try {
    const target = new URL(value);
    for (const key of SENSITIVE_CREDENTIAL_QUERY_PARAM_NAMES) {
      if (target.searchParams.has(key)) {
        target.searchParams.set(key, replacement);
      }
    }
    return target.toString();
  } catch {
    return value;
  }
};