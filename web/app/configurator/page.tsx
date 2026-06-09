import { ConfiguratorClient } from '@/components/configurator-client';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Configurator — XRDB' };

export default function ConfiguratorPage() {
  return <ConfiguratorClient />;
}
