import { redirect } from 'next/navigation';
import { isAdminEnabled, verifyAdminCookie } from '@/lib/adminAuth';
import { AdminNotConfigured } from './login/not-configured';
import { AdminMetricsPanel } from '@/components/admin-metrics-panel';
import { AdminCachePanel } from '@/components/admin-cache-panel';
import { AdminProfilesPanel } from '@/components/admin-profiles-panel';
import { AdminTemplatesPanel } from '@/components/admin-templates-panel';
import { AdminThemesPanel } from '@/components/admin-themes-panel';
import { AdminConfigPanel } from '@/components/admin-config-panel';
import { AdminLogoutButton } from '@/components/admin-logout-button';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  if (!isAdminEnabled()) {
    return <AdminNotConfigured />;
  }

  const authenticated = await verifyAdminCookie();
  if (!authenticated) {
    redirect('/admin/login');
  }

  return (
    <>
      <header className="xrdb-admin-header">
        <span className="xrdb-admin-header-title">
          XRDB
          <span className="xrdb-admin-header-title-badge">Admin</span>
        </span>
        <AdminLogoutButton />
      </header>
      <main className="xrdb-admin-body">
        <AdminMetricsPanel />
        <AdminCachePanel />
        <AdminProfilesPanel />
        <AdminTemplatesPanel />
        <AdminThemesPanel />
        <AdminConfigPanel />
      </main>
    </>
  );
}
