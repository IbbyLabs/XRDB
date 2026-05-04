import { isAdminEnabled } from '@/lib/adminAuth';
import '../styles/xrdb-foundation.css';
import '../styles/xrdb-fonts.css';
import '../styles/xrdb-admin.css';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isAdminEnabled()) {
    return null;
  }

  return <div className="xrdb-admin-layout">{children}</div>;
}
