// Instance render key (XRDB_API_KEY) for this browser session. Session-scoped
// on purpose: it gates the render and profile routes, so it lives with the
// operator's tab and is never written into a saved profile or share link.
const STORAGE_KEY = 'xrdb-render-key';

export function getRenderKey(): string {
  if (typeof window === 'undefined') return '';
  try { return sessionStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
}

export function setRenderKey(value: string): void {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, value);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* unavailable */ }
}
