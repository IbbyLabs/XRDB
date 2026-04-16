export type ConfiguratorEnvAccessKeys = {
  fanartKey: string;
  mdblistKey: string;
  simklClientId: string;
  hasServerFanartKey: boolean;
  hasServerMdblistKey: boolean;
  hasServerSimklClientId: boolean;
  hasServerTmdbKey: boolean;
};

const trimEnvValue = (value: string | undefined) => String(value || '').trim();

const firstNonEmptyCsvValue = (value: string | undefined) =>
  String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .find(Boolean) || '';

export const getConfiguratorEnvAccessKeys = (
  env: NodeJS.ProcessEnv = process.env,
): ConfiguratorEnvAccessKeys => ({
  fanartKey: '',
  mdblistKey: '',
  simklClientId: '',
  hasServerFanartKey: Boolean(
    trimEnvValue(env.XRDB_FANART_API_KEY) || trimEnvValue(env.FANART_API_KEY),
  ),
  hasServerMdblistKey: Boolean(
    firstNonEmptyCsvValue(env.MDBLIST_API_KEYS) ||
      trimEnvValue(env.MDBLIST_API_KEY) ||
      trimEnvValue(env.MDBLIST_KEY),
  ),
  hasServerSimklClientId: Boolean(
    trimEnvValue(env.SIMKL_CLIENT_ID) ||
      trimEnvValue(env.SIMKL_API_KEY) ||
      trimEnvValue(env.XRDB_SIMKL_CLIENT_ID),
  ),
  hasServerTmdbKey: Boolean(
    trimEnvValue(env.XRDB_TMDB_API_KEY) ||
      trimEnvValue(env.TMDB_API_KEY) ||
      trimEnvValue(env.TMDB_KEY),
  ),
});

export const applyConfiguratorEnvAccessKeys = (
  current: Pick<ConfiguratorEnvAccessKeys, 'fanartKey' | 'mdblistKey' | 'simklClientId'>,
  defaults: ConfiguratorEnvAccessKeys,
): Pick<ConfiguratorEnvAccessKeys, 'fanartKey' | 'mdblistKey' | 'simklClientId'> => ({
  fanartKey: current.fanartKey.trim() || defaults.fanartKey,
  mdblistKey: current.mdblistKey.trim() || defaults.mdblistKey,
  simklClientId: current.simklClientId.trim() || defaults.simklClientId,
});

export const hasConfiguratorEnvAccessKeys = (keys: ConfiguratorEnvAccessKeys) =>
  Boolean(
    keys.fanartKey ||
      keys.mdblistKey ||
      keys.simklClientId ||
      keys.hasServerFanartKey ||
      keys.hasServerMdblistKey ||
      keys.hasServerSimklClientId ||
      keys.hasServerTmdbKey,
  );
