import { IntegrationsClient } from '@/components/integrations-client';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Integrations — XRDB' };

export default function IntegrationsPage() {
  return <IntegrationsClient />;
}
