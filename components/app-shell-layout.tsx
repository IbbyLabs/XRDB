import type { ReactNode } from 'react';

import { NavBar } from '@/components/nav-bar';
import { PageFooter } from '@/components/site-chrome';
import type { ConfiguratorEnvAccessKeys } from '@/lib/configuratorEnvAccessKeys';
import { ConfiguratorProvider } from '@/lib/configuratorProvider';
import { isAdminEnabled } from '@/lib/adminAuth';

export function AppShellLayout({
  children,
  envAccessKeys,
}: {
  children: ReactNode;
  envAccessKeys: ConfiguratorEnvAccessKeys;
}) {
  const adminEnabled = isAdminEnabled();
  return (
    <ConfiguratorProvider envAccessKeys={envAccessKeys}>
      <div className="xrdb-app-shell">
        <header className="xrdb-app-chrome">
          <NavBar adminEnabled={adminEnabled} />
        </header>
        <main id="main-content" className="xrdb-app-content">{children}</main>
        <PageFooter />
      </div>
    </ConfiguratorProvider>
  );
}
