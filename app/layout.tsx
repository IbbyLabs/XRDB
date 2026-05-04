import type { Metadata, Viewport } from 'next';

import { AppShellLayout } from '@/components/app-shell-layout';
import { RootLayoutShell } from '@/components/root-layout-shell';
import { getConfiguratorEnvAccessKeys } from '@/lib/configuratorEnvAccessKeys';
import { scheduleImdbDatasetSync } from '@/lib/imdbDatasetScheduler';
import { buildSiteMetadata, siteViewport } from '@/lib/siteMetadata';
import './styles/xrdb-fonts.css';
import './styles/xrdb-foundation.css';
import './styles/xrdb-shell.css';
import './styles/xrdb-responsive.css';

export const metadata: Metadata = buildSiteMetadata(process.env.NEXT_PUBLIC_APP_URL);
export const viewport: Viewport = siteViewport;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  scheduleImdbDatasetSync();
  const envAccessKeys = getConfiguratorEnvAccessKeys();
  return (
    <RootLayoutShell>
      <AppShellLayout envAccessKeys={envAccessKeys}>{children}</AppShellLayout>
    </RootLayoutShell>
  );
}
