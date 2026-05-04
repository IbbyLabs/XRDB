import type { NextRequest } from 'next/server';

const ADMIN_COOKIE_NAME = 'xrdb_admin_key';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export const getAdminKeyFromEnv = (): string => {
  return String(process.env.ADMIN_KEY ?? '').trim();
};

export const isAdminEnabled = (): boolean => {
  return getAdminKeyFromEnv().length > 0;
};

export const verifyAdminKey = (key: string): boolean => {
  const configured = getAdminKeyFromEnv();
  if (!configured) return false;
  return key === configured;
};

export const verifyAdminBearerToken = (request: NextRequest | Request): boolean => {
  const configured = getAdminKeyFromEnv();
  if (!configured) return false;
  const authHeader = request.headers.get('Authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return bearer === configured;
};

export const getAdminCookieValue = async (): Promise<string | undefined> => {
  const { cookies } = await import('next/headers');
  const jar = await cookies();
  return jar.get(ADMIN_COOKIE_NAME)?.value;
};

export const verifyAdminCookie = async (): Promise<boolean> => {
  const configured = getAdminKeyFromEnv();
  if (!configured) return false;
  const value = await getAdminCookieValue();
  return value === configured;
};

export const buildSetAdminCookieHeader = (key: string): string => {
  return `${ADMIN_COOKIE_NAME}=${key}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
};

export const buildClearAdminCookieHeader = (): string => {
  return `${ADMIN_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
};

export const verifyAdminRequestCookie = (request: Request): boolean => {
  const configured = getAdminKeyFromEnv();
  if (!configured) return false;
  const cookieHeader = request.headers.get('Cookie') ?? '';
  const re = new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE_NAME}=([^;]+)`);
  const match = re.exec(cookieHeader);
  if (!match) return false;
  return match[1] === configured;
};

export const verifyAdminRequest = (request: Request): boolean => {
  return verifyAdminBearerToken(request) || verifyAdminRequestCookie(request);
};
