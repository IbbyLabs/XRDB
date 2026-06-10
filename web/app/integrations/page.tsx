import { IntegrationsClient } from '@/components/integrations-client';
import { AdminGate } from '@/components/admin-gate';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Integrations — XRDB' };

export default function IntegrationsPage() {
  return (
    <AdminGate>
      <IntegrationsClient />
    </AdminGate>
  );
}
