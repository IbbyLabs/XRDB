// Instance render key (XRDB_API_KEY) for this browser session. Session-scoped
// unless the user opts in to remembering it on this device. It is never
// written into a saved profile or share link.
import { rememberRenderKey, rememberedRenderKey } from './remember';

const STORAGE_KEY = 'xrdb-render-key';

export function getRenderKey(): string {
  if (typeof window === 'undefined') return '';
  try { return sessionStorage.getItem(STORAGE_KEY) || rememberedRenderKey(); } catch { return ''; }
}

export function setRenderKey(value: string): void {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, value);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* unavailable */ }
  rememberRenderKey(value);
}
