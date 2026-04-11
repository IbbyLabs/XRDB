import {
  buildProfileParams,
  normalizeSavedUiConfig,
  serializeSavedUiConfig,
} from './uiConfig.ts';

export type ConfigProfileUnlockSession = {
  profileId: string;
  token: string;
  expiresAt: number;
};

export const getActiveConfigProfileUnlockSession = (
  session: ConfigProfileUnlockSession | null,
  profileId: string | null,
  now = Date.now(),
) => {
  if (!session || !profileId || session.profileId !== profileId || session.expiresAt <= now) {
    return null;
  }

  return session;
};

export const shouldClearConfigProfileUnlockSession = ({
  session,
  profileIdLoaded,
  profileId,
}: {
  session: ConfigProfileUnlockSession | null;
  profileIdLoaded: boolean;
  profileId: string | null;
}) => {
  if (!session || !profileIdLoaded) {
    return false;
  }

  return profileId !== session.profileId;
};

export const buildRevealedConfigState = (params: Record<string, string>) => {
  const normalizedConfig = normalizeSavedUiConfig(
    { settings: params },
    { skipCrossTypeFallbacks: true },
  );

  return {
    normalizedConfig,
    serializedConfig: serializeSavedUiConfig(normalizedConfig),
    fingerprint: JSON.stringify(
      Object.entries(buildProfileParams(normalizedConfig.settings) ?? {}).sort(),
    ),
  };
};