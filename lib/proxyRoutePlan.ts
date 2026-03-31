import {
  XRDB_RESERVED_PARAMS,
  decodeProxyConfig,
  getProxyConfigFromQuery,
  type ProxyConfig,
} from './proxyConfigBridge.ts';

export const buildProxyForwardUrl = (
  originBase: string,
  resourceSegments: string[],
  searchParams: URLSearchParams,
) => {
  const forwardUrl = new URL(originBase);
  forwardUrl.pathname = `${forwardUrl.pathname.replace(/\/$/, '')}/${resourceSegments.join('/')}`;

  const forwardParams = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    if (!XRDB_RESERVED_PARAMS.has(key)) {
      forwardParams.append(key, value);
    }
  }
  forwardUrl.search = forwardParams.toString();
  return forwardUrl;
};

export const parseProxyRouteConfig = (
  searchParams: URLSearchParams,
  pathSegments: string[],
): {
  config: ProxyConfig | null;
  resourceSegments: string[];
  configSeed?: string;
  error?: { message: string; status?: number };
} => {
  const hasQueryConfig =
    searchParams.has('url') || searchParams.has('tmdbKey') || searchParams.has('mdblistKey');
  const queryConfig = hasQueryConfig ? getProxyConfigFromQuery(searchParams) : null;

  if (hasQueryConfig && !queryConfig) {
    if (!searchParams.get('url')) {
      return {
        config: null,
        resourceSegments: [],
        error: { message: 'Missing "url" query parameter.' },
      };
    }
    return {
      config: null,
      resourceSegments: [],
      error: { message: 'Missing "tmdbKey" or "mdblistKey" query parameter.' },
    };
  }

  if (queryConfig) {
    return {
      config: queryConfig,
      resourceSegments: pathSegments,
    };
  }

  if (pathSegments.length < 2) {
    return {
      config: null,
      resourceSegments: [],
      error: { message: 'Missing proxy config in path.' },
    };
  }

  const configSeed = pathSegments[0];
  const config = configSeed ? decodeProxyConfig(configSeed) : null;
  if (!config) {
    return {
      config: null,
      resourceSegments: [],
      error: { message: 'Invalid proxy config in path.' },
    };
  }

  return {
    config,
    configSeed,
    resourceSegments: pathSegments.slice(1),
  };
};
