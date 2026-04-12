export type ConfiguratorEnvAccessKeys = {
  fanartKey: string;
  mdblistKey: string;
  simklClientId: string;
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
  fanartKey: trimEnvValue(env.XRDB_FANART_API_KEY) || trimEnvValue(env.FANART_API_KEY),
  mdblistKey: firstNonEmptyCsvValue(env.MDBLIST_API_KEYS) || trimEnvValue(env.MDBLIST_API_KEY),
  simklClientId:
    trimEnvValue(env.SIMKL_CLIENT_ID) ||
    trimEnvValue(env.SIMKL_API_KEY) ||
    trimEnvValue(env.XRDB_SIMKL_CLIENT_ID),
});

export const applyConfiguratorEnvAccessKeys = (
  current: ConfiguratorEnvAccessKeys,
  defaults: ConfiguratorEnvAccessKeys,
): ConfiguratorEnvAccessKeys => ({
  fanartKey: current.fanartKey.trim() || defaults.fanartKey,
  mdblistKey: current.mdblistKey.trim() || defaults.mdblistKey,
  simklClientId: current.simklClientId.trim() || defaults.simklClientId,
});

export const hasConfiguratorEnvAccessKeys = (keys: ConfiguratorEnvAccessKeys) =>
  Boolean(keys.fanartKey || keys.mdblistKey || keys.simklClientId);
