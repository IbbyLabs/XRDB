import {
  clearConfigProfileUnlockFailures,
  createProtectedConfigProfile,
  deleteConfigProfile,
  getConfigProfile,
  getConfigProfileMetadata,
  getConfigProfilePasswordHash,
  recordConfigProfileUnlockFailure,
  rotateConfigProfilePassword,
  updateProtectedConfigProfile,
  type ConfigProfileMetadata,
} from './dbCore.ts';
import {
  createConfigUnlockToken,
  getConfigUnlockTokenFromHeaders,
  hashConfigPassword,
  isValidConfigPassword,
  resolveConfigProfileLockoutUntil,
  verifyConfigPassword,
  verifyConfigUnlockToken,
} from './configProfileAuth.ts';

type AuthFailure = {
  ok: false;
  status: number;
  body: Record<string, unknown>;
};

type AuthSuccess = {
  ok: true;
  metadata: ConfigProfileMetadata;
};

type ConfigProfileAuthResult = AuthFailure | AuthSuccess;

const buildMissingPasswordManagementError = (metadata: ConfigProfileMetadata) => {
  if (metadata.isLegacy) {
    return {
      status: 409,
      body: {
        error: 'Legacy profiles must be migrated before they can be managed.',
        isLegacy: metadata.isLegacy,
      },
    };
  }
  return {
    status: 409,
    body: {
      error: 'This UUID profile has no password. Ask an admin to reset the password, then try again.',
      isLegacy: metadata.isLegacy,
    },
  };
};

const normalizeParamsRecord = (value: unknown): Record<string, string> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const params: Record<string, string> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (key === '_id' || key === 'password' || key === 'newPassword' || key === 'params') {
      continue;
    }
    if (entryValue !== null && entryValue !== undefined) {
      params[key] = String(entryValue);
    }
  }
  return params;
};

const extractConfigProfileParams = (body: unknown): Record<string, string> | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const candidate = body as Record<string, unknown>;
  if (candidate.params && typeof candidate.params === 'object' && !Array.isArray(candidate.params)) {
    return normalizeParamsRecord(candidate.params);
  }
  return normalizeParamsRecord(candidate);
};

const readConfigPasswordFromBody = (
  body: unknown,
  key: 'password' | 'newPassword' = 'password',
): string | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
};

export const buildConfigProfilePublicMetadata = (
  id: string,
): Record<string, unknown> | null => {
  const metadata = getConfigProfileMetadata(id);
  if (!metadata) {
    return null;
  }
  return {
    id: metadata.id,
    isLegacy: metadata.isLegacy,
    requiresPassword: metadata.hasPassword,
    failedAttempts: metadata.failedAttempts,
    lockedUntil: metadata.lockedUntil,
    isLocked: typeof metadata.lockedUntil === 'number' && metadata.lockedUntil > Date.now(),
  };
};

export const createProtectedConfigProfileFromBody = async (body: unknown) => {
  const params = extractConfigProfileParams(body);
  const password = readConfigPasswordFromBody(body, 'password');
  if (!params) {
    return { ok: false as const, status: 400, body: { error: 'Body must be a JSON object' } };
  }
  if (!password || !isValidConfigPassword(password)) {
    return {
      ok: false as const,
      status: 400,
      body: { error: 'Config password must be at least 8 characters.' },
    };
  }

  const passwordHash = await hashConfigPassword(password);
  const id = createProtectedConfigProfile(params, passwordHash);
  return { ok: true as const, id };
};

export const unlockConfigProfileFromBody = async (id: string, body: unknown) => {
  const metadata = getConfigProfileMetadata(id);
  if (!metadata) {
    return { status: 404, body: { error: 'Not found' } };
  }
  if (!metadata.hasPassword) {
    return buildMissingPasswordManagementError(metadata);
  }
  if (typeof metadata.lockedUntil === 'number' && metadata.lockedUntil > Date.now()) {
    return {
      status: 423,
      body: {
        error: 'Profile is locked.',
        failedAttempts: metadata.failedAttempts,
        lockedUntil: metadata.lockedUntil,
      },
    };
  }

  const password = readConfigPasswordFromBody(body, 'password');
  const passwordHash = getConfigProfilePasswordHash(id);
  if (!password || !passwordHash) {
    return { status: 400, body: { error: 'Password is required.' } };
  }

  if (!(await verifyConfigPassword(password, passwordHash))) {
    const nextFailedAttempts = metadata.failedAttempts + 1;
    const lockedUntil = resolveConfigProfileLockoutUntil(nextFailedAttempts);
    const nextMetadata = recordConfigProfileUnlockFailure(id, lockedUntil);
    return {
      status: lockedUntil ? 423 : 401,
      body: {
        error: lockedUntil ? 'Profile is locked.' : 'Invalid password.',
        failedAttempts: nextMetadata?.failedAttempts ?? nextFailedAttempts,
        lockedUntil: nextMetadata?.lockedUntil ?? lockedUntil,
      },
    };
  }

  const clearedMetadata = clearConfigProfileUnlockFailures(id) ?? metadata;
  const expiresAt = Date.now() + 15 * 60 * 1000;
  const token = createConfigUnlockToken({
    id,
    unlockVersion: clearedMetadata.unlockVersion,
    expiresAt,
  });
  return {
    status: 200,
    body: {
      token,
      expiresAt,
      failedAttempts: clearedMetadata.failedAttempts,
      lockedUntil: clearedMetadata.lockedUntil,
    },
  };
};

export const authorizeConfigProfileManagement = (
  headers: Headers,
  id: string,
): ConfigProfileAuthResult => {
  const metadata = getConfigProfileMetadata(id);
  if (!metadata) {
    return { ok: false, status: 404, body: { error: 'Not found' } };
  }
  if (!metadata.hasPassword) {
    const missingPassword = buildMissingPasswordManagementError(metadata);
    return {
      ok: false,
      status: missingPassword.status,
      body: missingPassword.body,
    };
  }
  if (typeof metadata.lockedUntil === 'number' && metadata.lockedUntil > Date.now()) {
    return {
      ok: false,
      status: 423,
      body: {
        error: 'Profile is locked.',
        failedAttempts: metadata.failedAttempts,
        lockedUntil: metadata.lockedUntil,
      },
    };
  }

  const token = getConfigUnlockTokenFromHeaders(headers);
  if (!token) {
    return { ok: false, status: 401, body: { error: 'Unlock required.' } };
  }
  const payload = verifyConfigUnlockToken(token);
  if (!payload || payload.id !== id || payload.unlockVersion !== metadata.unlockVersion) {
    return { ok: false, status: 401, body: { error: 'Unlock required.' } };
  }
  return { ok: true, metadata };
};

export const revealConfigProfileForManagement = (id: string) => getConfigProfile(id);

export const updateConfigProfileFromBody = async (id: string, body: unknown) => {
  const params = extractConfigProfileParams(body);
  if (!params) {
    return { status: 400, body: { error: 'Body must be a JSON object' } };
  }
  const updated = updateProtectedConfigProfile(id, params);
  return {
    status: updated ? 200 : 404,
    body: updated ? { updated: true } : { error: 'Not found' },
  };
};

export const rotateConfigProfilePasswordFromBody = async (id: string, body: unknown) => {
  const password = readConfigPasswordFromBody(body, 'newPassword') || readConfigPasswordFromBody(body, 'password');
  if (!password || !isValidConfigPassword(password)) {
    return {
      status: 400,
      body: { error: 'Config password must be at least 8 characters.' },
    };
  }
  const passwordHash = await hashConfigPassword(password);
  const metadata = rotateConfigProfilePassword(id, passwordHash);
  if (!metadata) {
    return { status: 404, body: { error: 'Not found' } };
  }
  const expiresAt = Date.now() + 15 * 60 * 1000;
  return {
    status: 200,
    body: {
      rotated: true,
      token: createConfigUnlockToken({ id, unlockVersion: metadata.unlockVersion, expiresAt }),
      expiresAt,
    },
  };
};

export const migrateLegacyConfigProfileFromBody = async (id: string, body: unknown) => {
  const metadata = getConfigProfileMetadata(id);
  if (!metadata) {
    return { status: 404, body: { error: 'Not found' } };
  }
  if (!metadata.isLegacy || metadata.hasPassword) {
    return {
      status: 409,
      body: { error: 'Only legacy profiles can be migrated.' },
    };
  }

  const params = getConfigProfile(id);
  if (!params) {
    return { status: 410, body: { error: 'Config profile not found.' } };
  }

  const password = readConfigPasswordFromBody(body, 'password');
  if (!password || !isValidConfigPassword(password)) {
    return {
      status: 400,
      body: { error: 'Config password must be at least 8 characters.' },
    };
  }

  const passwordHash = await hashConfigPassword(password);
  const nextId = createProtectedConfigProfile(params, passwordHash);
  deleteConfigProfile(id);
  return {
    status: 200,
    body: { id: nextId },
  };
};