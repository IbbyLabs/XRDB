// Opt-in persistence for the instance key and profile passwords. Off by
// default; when on, both survive closing the browser on this device.
const FLAG_KEY = 'xrdb-remember';
const RENDER_KEY = 'xrdb-render-key';
const PASSWORDS_KEY = 'xrdb-remembered-passwords';

export function isRemembering(): boolean {
  if (typeof window === 'undefined') return false;
  try { return localStorage.getItem(FLAG_KEY) === '1'; } catch { return false; }
}

export function setRemembering(on: boolean, currentRenderKey: string): void {
  try {
    if (on) {
      localStorage.setItem(FLAG_KEY, '1');
      if (currentRenderKey) localStorage.setItem(RENDER_KEY, currentRenderKey);
    } else {
      localStorage.removeItem(FLAG_KEY);
      localStorage.removeItem(RENDER_KEY);
      localStorage.removeItem(PASSWORDS_KEY);
    }
  } catch { /* unavailable */ }
}

export function rememberedRenderKey(): string {
  if (!isRemembering()) return '';
  try { return localStorage.getItem(RENDER_KEY) ?? ''; } catch { return ''; }
}

export function rememberRenderKey(value: string): void {
  if (!isRemembering()) return;
  try {
    if (value) localStorage.setItem(RENDER_KEY, value);
    else localStorage.removeItem(RENDER_KEY);
  } catch { /* unavailable */ }
}

function readPasswords(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PASSWORDS_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
  } catch { return {}; }
}

export function rememberedPassword(profileId: string): string {
  if (!isRemembering() || !profileId) return '';
  return readPasswords()[profileId] ?? '';
}

export function rememberPassword(profileId: string, password: string): void {
  if (!isRemembering() || !profileId || !password) return;
  try { localStorage.setItem(PASSWORDS_KEY, JSON.stringify({ ...readPasswords(), [profileId]: password })); } catch { /* unavailable */ }
}

export function forgetPassword(profileId: string): void {
  const all = readPasswords();
  if (!(profileId in all)) return;
  const rest = Object.fromEntries(Object.entries(all).filter(([id]) => id !== profileId));
  try { localStorage.setItem(PASSWORDS_KEY, JSON.stringify(rest)); } catch { /* unavailable */ }
}
