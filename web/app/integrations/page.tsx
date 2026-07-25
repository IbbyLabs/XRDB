import { UserKeysClient } from '@/components/user-keys-client';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Your API keys — XRDB' };

export default function IntegrationsPage() {
  return <UserKeysClient />;
}
