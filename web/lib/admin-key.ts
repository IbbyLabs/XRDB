// Admin key for this browser session. Session-scoped on purpose: closing
// the tab forgets the key, matching how instance owners use the panel.
const STORAGE_KEY = 'xrdb-admin-key';

export function getAdminKey(): string {
  if (typeof window === 'undefined') return '';
  try { return sessionStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
}

export function setAdminKey(value: string): void {
  try { sessionStorage.setItem(STORAGE_KEY, value); } catch { /* unavailable */ }
}

export function clearAdminKey(): void {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* unavailable */ }
}
