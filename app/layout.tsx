import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';

import { AppShellLayout } from '@/components/app-shell-layout';
import { RootLayoutShell } from '@/components/root-layout-shell';
import { isAdminEnabled } from '@/lib/adminAuth';
import { getConfiguratorEnvAccessKeys } from '@/lib/configuratorEnvAccessKeys';
import { scheduleImdbDatasetSync } from '@/lib/imdbDatasetScheduler';
import { buildRuntimeSiteMetadata, siteViewport } from '@/lib/siteMetadata';
import './styles/xrdb-fonts.css';
import './styles/xrdb-foundation.css';
import './styles/xrdb-shell.css';
import './styles/xrdb-responsive.css';

export const viewport: Viewport = siteViewport;

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const hostHeader = requestHeaders.get('host');
  const forwardedProtoHeader = requestHeaders.get('x-forwarded-proto');
  const requestProto = forwardedProtoHeader?.split(',')[0]?.trim().toLowerCase() === 'https' ? 'https' : 'http';
  const requestUrl = hostHeader ? `${requestProto}://${hostHeader}/` : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return buildRuntimeSiteMetadata({
    requestUrl,
    hostHeader,
    forwardedHostHeader: requestHeaders.get('x-forwarded-host'),
    forwardedProtoHeader,
    trustForwarded: process.env.XRDB_TRUST_PROXY_HEADERS === 'true',
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  });
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  scheduleImdbDatasetSync();
  const envAccessKeys = getConfiguratorEnvAccessKeys();
  const adminEnabled = isAdminEnabled();
  return (
    <RootLayoutShell>
      <AppShellLayout envAccessKeys={envAccessKeys} adminEnabled={adminEnabled}>{children}</AppShellLayout>
    </RootLayoutShell>
  );
}
