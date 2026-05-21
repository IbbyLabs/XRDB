'use client';

import { useState, type ReactNode } from 'react';

import { NavBar } from '@/components/nav-bar';
import { IntegrationsOverlay } from '@/components/integrations-overlay';
import { PageFooter } from '@/components/site-chrome';
import type { ConfiguratorEnvAccessKeys } from '@/lib/configuratorEnvAccessKeys';
import { ConfiguratorProvider } from '@/lib/configuratorProvider';

export function AppShellLayout({
  children,
  envAccessKeys,
  adminEnabled,
}: {
  children: ReactNode;
  envAccessKeys: ConfiguratorEnvAccessKeys;
  adminEnabled: boolean;
}) {
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  return (
    <ConfiguratorProvider envAccessKeys={envAccessKeys}>
      <div className="xrdb-app-shell">
        <header className="xrdb-app-chrome">
          <NavBar adminEnabled={adminEnabled} onOpenIntegrations={() => setIntegrationsOpen(true)} />
        </header>
        <main id="main-content" className="xrdb-app-content">{children}</main>
        <PageFooter />
        <IntegrationsOverlay open={integrationsOpen} onClose={() => setIntegrationsOpen(false)} />
      </div>
    </ConfiguratorProvider>
  );
}
