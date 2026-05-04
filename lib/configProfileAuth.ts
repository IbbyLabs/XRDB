import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

import { deriveConfigScopedSecret } from './dbCore.ts';

const scrypt = promisify(scryptCallback);

const PASSWORD_HASH_PREFIX = 'scrypt';
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SALT_LENGTH = 16;
const LOCKOUT_THRESHOLD = 5;
const BASE_LOCKOUT_MS = 15 * 60 * 1000;

const CONFIG_PROFILE_MIN_PASSWORD_LENGTH = 8;
const CONFIG_PROFILE_UNLOCK_TOKEN_TTL_MS = 15 * 60 * 1000;
export const CONFIG_PROFILE_UNLOCK_HEADER = 'x-xrdb-config-unlock';

type UnlockTokenPayload = {
  id: string;
  unlockVersion: number;
  expiresAt: number;
};

const signUnlockTokenPayload = (payload: string) =>
  createHmac('sha256', deriveConfigScopedSecret('config-profile-unlock-token'))
    .update(payload)
    .digest('base64url');

const parsePasswordHash = (storedHash: string) => {
  const [prefix, saltHex, derivedHex] = String(storedHash || '').split('$');
  if (!prefix || !saltHex || !derivedHex || prefix !== PASSWORD_HASH_PREFIX) {
    return null;
  }
  try {
    return {
      salt: Buffer.from(saltHex, 'hex'),
      derived: Buffer.from(derivedHex, 'hex'),
    };
  } catch {
    return null;
  }
};

export const isValidConfigPassword = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length >= CONFIG_PROFILE_MIN_PASSWORD_LENGTH;

export const hashConfigPassword = async (password: string): Promise<string> => {
  if (!isValidConfigPassword(password)) {
    throw new Error('Config password must be at least 8 characters.');
  }
  const salt = randomBytes(PASSWORD_SALT_LENGTH);
  const derived = (await scrypt(password.trim(), salt, PASSWORD_KEY_LENGTH)) as Buffer;
  return `${PASSWORD_HASH_PREFIX}$${salt.toString('hex')}$${derived.toString('hex')}`;
};

export const verifyConfigPassword = async (
  password: string,
  storedHash: string,
): Promise<boolean> => {
  const parsed = parsePasswordHash(storedHash);
  if (!parsed || !isValidConfigPassword(password)) {
    return false;
  }
  const derived = (await scrypt(password.trim(), parsed.salt, parsed.derived.length)) as Buffer;
  if (derived.length !== parsed.derived.length) {
    return false;
  }
  return timingSafeEqual(derived, parsed.derived);
};

export const resolveConfigProfileLockoutUntil = (
  failedAttempts: number,
  now = Date.now(),
): number | null => {
  if (failedAttempts < LOCKOUT_THRESHOLD) {
    return null;
  }
  const exponent = Math.min(failedAttempts - LOCKOUT_THRESHOLD, 4);
  return now + BASE_LOCKOUT_MS * 2 ** exponent;
};

export const createConfigUnlockToken = ({
  id,
  unlockVersion,
  expiresAt = Date.now() + CONFIG_PROFILE_UNLOCK_TOKEN_TTL_MS,
}: UnlockTokenPayload): string => {
  const payload = Buffer.from(
    JSON.stringify({ id, unlockVersion, expiresAt } satisfies UnlockTokenPayload),
    'utf8',
  ).toString('base64url');
  return `${payload}.${signUnlockTokenPayload(payload)}`;
};

export const verifyConfigUnlockToken = (
  token: string,
): UnlockTokenPayload | null => {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) {
    return null;
  }
  const expectedSignature = signUnlockTokenPayload(payload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as UnlockTokenPayload;
    if (
      typeof parsed?.id !== 'string'
      || typeof parsed?.unlockVersion !== 'number'
      || typeof parsed?.expiresAt !== 'number'
      || parsed.expiresAt <= Date.now()
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const getConfigUnlockTokenFromHeaders = (headers: Headers): string | null => {
  const token = headers.get(CONFIG_PROFILE_UNLOCK_HEADER) || '';
  const normalized = token.trim();
  return normalized || null;
};