import '../styles/xrdb-foundation.css';
import '../styles/xrdb-fonts.css';
import '../styles/xrdb-admin.css';

export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="xrdb-admin-layout">{children}</div>;
}
