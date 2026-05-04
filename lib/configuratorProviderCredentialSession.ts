import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';

import { deriveConfigScopedSecret } from './dbCore.ts';
import { deleteMetadata, getMetadata, setMetadata } from './metadataStore.ts';

const CONFIGURATOR_PROVIDER_CREDENTIAL_SESSION_COOKIE = 'xrdb_provider_credentials';

const COOKIE_ENCRYPTION_VERSION = 0x01;
const COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;
const COOKIE_MAX_AGE_MS = COOKIE_MAX_AGE_SECONDS * 1000;
const SESSION_KEY_PREFIX = 'configurator-provider-credential-session:';
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_FIELDS = ['tmdbKey', 'mdblistKey', 'fanartKey', 'simklClientId'] as const;

type ConfiguratorProviderCredentialSession = {
  tmdbKey: string;
  mdblistKey: string;
  fanartKey: string;
  simklClientId: string;
};

type ConfiguratorProviderCredentialSessionStatus = {
  tmdb: boolean;
  mdblist: boolean;
  fanart: boolean;
  simkl: boolean;
};

type ConfiguratorProviderCredentialSessionMaskedPreview = {
  tmdb: string;
  mdblist: string;
  fanart: string;
  simkl: string;
};

type CookieReader = {
  headers: Pick<Headers, 'get'>;
};

type SessionStore = {
  get: (sessionId: string) => string | null;
  set: (sessionId: string, encryptedValue: string, ttlMs: number) => void;
  delete: (sessionId: string) => void;
};

const EMPTY_SESSION: ConfiguratorProviderCredentialSession = {
  tmdbKey: '',
  mdblistKey: '',
  fanartKey: '',
  simklClientId: '',
};

const EMPTY_CONFIGURATOR_PROVIDER_CREDENTIAL_SESSION_STATUS: ConfiguratorProviderCredentialSessionStatus = {
  tmdb: false,
  mdblist: false,
  fanart: false,
  simkl: false,
};

const EMPTY_CONFIGURATOR_PROVIDER_CREDENTIAL_SESSION_MASKED_PREVIEW: ConfiguratorProviderCredentialSessionMaskedPreview = {
  tmdb: '',
  mdblist: '',
  fanart: '',
  simkl: '',
};

const defaultSessionStore: SessionStore = {
  get: (sessionId) => getMetadata<string>(`${SESSION_KEY_PREFIX}${sessionId}`),
  set: (sessionId, encryptedValue, ttlMs) => {
    setMetadata(`${SESSION_KEY_PREFIX}${sessionId}`, encryptedValue, ttlMs);
  },
  delete: (sessionId) => {
    deleteMetadata(`${SESSION_KEY_PREFIX}${sessionId}`);
  },
};

const parseCookieHeader = (value: string) => {
  const cookies = new Map<string, string>();

  for (const entry of value.split(';')) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const name = entry.slice(0, separatorIndex).trim();
    const cookieValue = entry.slice(separatorIndex + 1).trim();
    if (!name) {
      continue;
    }

    cookies.set(name, cookieValue);
  }

  return cookies;
};

const normalizeConfiguratorProviderCredentialSession = (
  value: Partial<ConfiguratorProviderCredentialSession> | null | undefined,
): ConfiguratorProviderCredentialSession => ({
  tmdbKey: String(value?.tmdbKey || '').trim(),
  mdblistKey: String(value?.mdblistKey || '').trim(),
  fanartKey: String(value?.fanartKey || '').trim(),
  simklClientId: String(value?.simklClientId || '').trim(),
});

const hasConfiguratorProviderCredentialSessionValues = (
  value: ConfiguratorProviderCredentialSession,
) => Boolean(value.tmdbKey || value.mdblistKey || value.fanartKey || value.simklClientId);

const getConfiguratorProviderCredentialSessionStatus = (
  value: ConfiguratorProviderCredentialSession,
): ConfiguratorProviderCredentialSessionStatus => ({
  tmdb: Boolean(value.tmdbKey),
  mdblist: Boolean(value.mdblistKey),
  fanart: Boolean(value.fanartKey),
  simkl: Boolean(value.simklClientId),
});

const maskConfiguratorProviderCredential = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }

  if (normalized.length <= 2) {
    return '*'.repeat(normalized.length);
  }

  if (normalized.length <= 4) {
    return `${normalized.slice(0, 1)}**${normalized.slice(-1)}`;
  }

  if (normalized.length <= 8) {
    return `${normalized.slice(0, 2)}****${normalized.slice(-2)}`;
  }

  return `${normalized.slice(0, 4)}${'*'.repeat(Math.max(4, normalized.length - 8))}${normalized.slice(-4)}`;
};

const getConfiguratorProviderCredentialSessionMaskedPreview = (
  value: ConfiguratorProviderCredentialSession,
): ConfiguratorProviderCredentialSessionMaskedPreview => ({
  tmdb: maskConfiguratorProviderCredential(value.tmdbKey),
  mdblist: maskConfiguratorProviderCredential(value.mdblistKey),
  fanart: maskConfiguratorProviderCredential(value.fanartKey),
  simkl: maskConfiguratorProviderCredential(value.simklClientId),
});

const encryptSession = (value: ConfiguratorProviderCredentialSession) => {
  const key = deriveConfigScopedSecret('configurator-provider-credential-session').subarray(0, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([
    Buffer.from([COOKIE_ENCRYPTION_VERSION]),
    iv,
    authTag,
    ciphertext,
  ]).toString('hex');
};

const decryptSession = (value: string): ConfiguratorProviderCredentialSession | null => {
  try {
    const payload = Buffer.from(value, 'hex');
    if (payload.length < 1 + 12 + 16 + 1) {
      return null;
    }

    const version = payload[0];
    if (version !== COOKIE_ENCRYPTION_VERSION) {
      return null;
    }

    const iv = payload.subarray(1, 13);
    const authTag = payload.subarray(13, 29);
    const ciphertext = payload.subarray(29);
    const key = deriveConfigScopedSecret('configurator-provider-credential-session').subarray(0, 32);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const parsed = JSON.parse(plaintext.toString('utf8')) as Partial<ConfiguratorProviderCredentialSession>;

    return normalizeConfiguratorProviderCredentialSession(parsed);
  } catch {
    return null;
  }
};

const readSessionCookieValue = (request: CookieReader) => {
  const cookieHeader = request.headers.get('cookie') || '';
  if (!cookieHeader) {
    return '';
  }

  return parseCookieHeader(cookieHeader).get(CONFIGURATOR_PROVIDER_CREDENTIAL_SESSION_COOKIE) || '';
};

const parseOpaqueSessionId = (value: string) => (SESSION_ID_RE.test(value) ? value : null);

const buildConfiguratorProviderCredentialSessionCookie = (sessionId: string | null) => ({
  name: CONFIGURATOR_PROVIDER_CREDENTIAL_SESSION_COOKIE,
  value: sessionId || '',
  maxAge: sessionId ? COOKIE_MAX_AGE_SECONDS : 0,
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
});

export const buildLegacyConfiguratorProviderCredentialSessionCookie = (
  value: Partial<ConfiguratorProviderCredentialSession> | null | undefined,
) => {
  const normalized = normalizeConfiguratorProviderCredentialSession(value);
  const hasValues = hasConfiguratorProviderCredentialSessionValues(normalized);

  return {
    name: CONFIGURATOR_PROVIDER_CREDENTIAL_SESSION_COOKIE,
    value: hasValues ? encryptSession(normalized) : '',
    maxAge: hasValues ? COOKIE_MAX_AGE_SECONDS : 0,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
};

const normalizeConfiguratorProviderCredentialSessionPatch = (
  value: Record<string, unknown> | null | undefined,
) => {
  const patch: Partial<ConfiguratorProviderCredentialSession> = {};

  if (!value || typeof value !== 'object') {
    return patch;
  }

  for (const field of SESSION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      patch[field] = String(value[field] || '').trim();
    }
  }

  return patch;
};

export const readConfiguratorProviderCredentialSession = (
  request: CookieReader,
  store: SessionStore = defaultSessionStore,
): ConfiguratorProviderCredentialSession => {
  const cookieValue = readSessionCookieValue(request);
  if (!cookieValue) {
    return EMPTY_SESSION;
  }

  const sessionId = parseOpaqueSessionId(cookieValue);
  if (sessionId) {
    const encrypted = store.get(sessionId);
    if (!encrypted) {
      return EMPTY_SESSION;
    }

    return decryptSession(encrypted) || EMPTY_SESSION;
  }

  return decryptSession(cookieValue) || EMPTY_SESSION;
};

export const describeConfiguratorProviderCredentialSession = (
  request: CookieReader,
  store: SessionStore = defaultSessionStore,
) => {
  const session = readConfiguratorProviderCredentialSession(request, store);

  return {
    session,
    status: getConfiguratorProviderCredentialSessionStatus(session),
    maskedPreview: getConfiguratorProviderCredentialSessionMaskedPreview(session),
  };
};

export const migrateConfiguratorProviderCredentialSession = (
  request: CookieReader,
  store: SessionStore = defaultSessionStore,
  sessionIdFactory: () => string = randomUUID,
) => {
  const cookieValue = readSessionCookieValue(request);
  if (!cookieValue || parseOpaqueSessionId(cookieValue)) {
    return null;
  }

  const legacySession = decryptSession(cookieValue);
  if (!legacySession || !hasConfiguratorProviderCredentialSessionValues(legacySession)) {
    return {
      session: EMPTY_SESSION,
      status: EMPTY_CONFIGURATOR_PROVIDER_CREDENTIAL_SESSION_STATUS,
      maskedPreview: EMPTY_CONFIGURATOR_PROVIDER_CREDENTIAL_SESSION_MASKED_PREVIEW,
      cookie: buildConfiguratorProviderCredentialSessionCookie(null),
    };
  }

  const sessionId = sessionIdFactory();
  store.set(sessionId, encryptSession(legacySession), COOKIE_MAX_AGE_MS);

  return {
    session: legacySession,
    status: getConfiguratorProviderCredentialSessionStatus(legacySession),
    maskedPreview: getConfiguratorProviderCredentialSessionMaskedPreview(legacySession),
    cookie: buildConfiguratorProviderCredentialSessionCookie(sessionId),
  };
};

export const updateConfiguratorProviderCredentialSession = (
  request: CookieReader,
  value: Record<string, unknown> | null | undefined,
  store: SessionStore = defaultSessionStore,
  sessionIdFactory: () => string = randomUUID,
) => {
  const current = readConfiguratorProviderCredentialSession(request, store);
  const patch = normalizeConfiguratorProviderCredentialSessionPatch(value);
  const next = normalizeConfiguratorProviderCredentialSession({
    ...current,
    ...patch,
  });
  const existingSessionId = parseOpaqueSessionId(readSessionCookieValue(request));

  if (!hasConfiguratorProviderCredentialSessionValues(next)) {
    if (existingSessionId) {
      store.delete(existingSessionId);
    }

    return {
      session: EMPTY_SESSION,
      status: EMPTY_CONFIGURATOR_PROVIDER_CREDENTIAL_SESSION_STATUS,
      maskedPreview: EMPTY_CONFIGURATOR_PROVIDER_CREDENTIAL_SESSION_MASKED_PREVIEW,
      cookie: buildConfiguratorProviderCredentialSessionCookie(null),
    };
  }

  const sessionId = existingSessionId || sessionIdFactory();
  store.set(sessionId, encryptSession(next), COOKIE_MAX_AGE_MS);

  return {
    session: next,
    status: getConfiguratorProviderCredentialSessionStatus(next),
    maskedPreview: getConfiguratorProviderCredentialSessionMaskedPreview(next),
    cookie: buildConfiguratorProviderCredentialSessionCookie(sessionId),
  };
};