export function AdminNotConfigured() {
  return (
    <div className="xrdb-admin-login">
      <div className="xrdb-admin-login-card">
        <p className="xrdb-admin-login-title">Admin not configured</p>
        <p className="xrdb-admin-login-subtitle">
          Set the <code>ADMIN_KEY</code> environment variable to enable the admin panel.
        </p>
      </div>
    </div>
  );
}
