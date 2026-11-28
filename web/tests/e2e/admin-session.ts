import type { Page } from '@playwright/test';

// The e2e server's admin key. It guards a throwaway offline instance only.
export const E2E_ADMIN_KEY = 'xrdb-e2e-admin';

/** Opens the page with the admin key already in the session, as after signing in. */
export async function signInAsAdmin(page: Page): Promise<void> {
  await page.addInitScript(key => sessionStorage.setItem('xrdb-admin-key', key), E2E_ADMIN_KEY);
}
