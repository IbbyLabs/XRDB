import { AdminClient } from '@/components/admin-client';
import { AdminGate } from '@/components/admin-gate';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Admin — XRDB' };

export default function AdminPage() {
  return (
    <AdminGate>
      <AdminClient />
    </AdminGate>
  );
}
