import { redirect } from 'next/navigation';
import { isAdminEnabled, verifyAdminCookie } from '@/lib/adminAuth';
import { AdminLoginForm } from './login-form';

export default async function AdminLoginPage() {
  if (!isAdminEnabled()) {
    return null;
  }
  const authenticated = await verifyAdminCookie();
  if (authenticated) {
    redirect('/admin');
  }
  return <AdminLoginForm />;
}
