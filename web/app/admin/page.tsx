import { AdminClient } from '@/components/admin-client';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Admin — XRDB' };

export default function AdminPage() {
  return <AdminClient />;
}
