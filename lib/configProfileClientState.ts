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

export const CONFIG_PROFILE_UNLOCK_SESSION_STORAGE_KEY = 'xrdb.configProfileUnlockSession.v1';

export const PROTECTED_CONFIG_PROFILE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isProtectedConfigProfileId = (value: string | null | undefined): value is string =>
  PROTECTED_CONFIG_PROFILE_ID_RE.test(String(value || '').trim());

export const getNextAiometadataUrlMode = ({
  currentMode,
  hasProtectedProfile,
  hasExplicitOverride,
}: {
  currentMode: 'inline' | 'config';
  hasProtectedProfile: boolean;
  hasExplicitOverride: boolean;
}): 'inline' | 'config' => {
  if (!hasProtectedProfile) {
    return 'inline';
  }

  if (!hasExplicitOverride) {
    return 'config';
  }

  return currentMode;
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

export const serializeConfigProfileUnlockSession = (
  session: ConfigProfileUnlockSession | null,
) => {
  if (!session) {
    return null;
  }

  return JSON.stringify(session);
};

export const parseConfigProfileUnlockSession = (
  raw: string | null,
  now = Date.now(),
) => {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ConfigProfileUnlockSession> | null;
    if (
      !parsed
      || typeof parsed.profileId !== 'string'
      || typeof parsed.token !== 'string'
      || typeof parsed.expiresAt !== 'number'
      || !Number.isFinite(parsed.expiresAt)
      || parsed.expiresAt <= now
    ) {
      return null;
    }

    return {
      profileId: parsed.profileId,
      token: parsed.token,
      expiresAt: parsed.expiresAt,
    } satisfies ConfigProfileUnlockSession;
  } catch {
    return null;
  }
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

export const buildConfigProfileFingerprint = (params: Record<string, string> | null | undefined) =>
  params ? JSON.stringify(Object.entries(params).sort()) : null;

export const hasConfigProfileUnsavedChanges = ({
  currentParams,
  savedFingerprint,
  snapshotReady,
}: {
  currentParams: Record<string, string> | null | undefined;
  savedFingerprint: string | null;
  snapshotReady: boolean;
}) => snapshotReady && buildConfigProfileFingerprint(currentParams) !== savedFingerprint;

export const hasConfigProfileLoginConflict = ({
  localParams,
  profileParams,
}: {
  localParams: Record<string, string> | null | undefined;
  profileParams: Record<string, string> | null | undefined;
}) => buildConfigProfileFingerprint(localParams) !== buildConfigProfileFingerprint(profileParams);

export const buildRevealedConfigState = (params: Record<string, string>) => {
  const normalizedConfig = normalizeSavedUiConfig(
    { settings: params },
    { skipCrossTypeFallbacks: true },
  );

  return {
    normalizedConfig,
    serializedConfig: serializeSavedUiConfig(normalizedConfig),
    fingerprint: buildConfigProfileFingerprint(buildProfileParams(normalizedConfig.settings) ?? {}),
  };
};

export const toConfigModeAiometadataUrl = (pattern: string, profileId: string) => {
  const qIdx = pattern.indexOf('?');
  const base = qIdx >= 0 ? pattern.slice(0, qIdx) : pattern;
  return `${base}?config=${profileId}`;
};