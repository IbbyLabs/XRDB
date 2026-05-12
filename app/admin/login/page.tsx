import { redirect } from 'next/navigation';
import { isAdminEnabled, verifyAdminCookie } from '@/lib/adminAuth';
import { AdminLoginForm } from './login-form';
import { AdminNotConfigured } from './not-configured';

export default async function AdminLoginPage() {
  if (!isAdminEnabled()) {
    return <AdminNotConfigured />;
  }
  const authenticated = await verifyAdminCookie();
  if (authenticated) {
    redirect('/admin');
  }
  return <AdminLoginForm />;
}
