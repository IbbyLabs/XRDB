import Link from 'next/link';
import { LayoutGrid, Settings } from 'lucide-react';
import { BRAND_NAME, BRAND_DISCORD_URL, BRAND_SUPPORT_URL } from '@/lib/brand';

export default function HomePage() {
  return (
    <div className="xrdb-page-inner home-page">

      <section className="home-hero">
        <h1 className="home-hero-title">
          <span className="home-hero-x">X</span>RDB
        </h1>
        <p className="home-hero-sub">
          Configure artwork, ratings overlays, and metadata for your media library. Served by a pure-Go render pipeline built for speed.
        </p>
        <div className="home-hero-actions">
          <Link href="/configurator" className="xrdb-btn xrdb-btn-primary home-cta">
            <LayoutGrid size={15} aria-hidden="true" />
            Open Configurator
          </Link>
          <Link href="/admin" className="xrdb-btn xrdb-btn-ghost home-cta">
            <Settings size={15} aria-hidden="true" />
            Admin Panel
          </Link>
        </div>
      </section>

      <section className="home-capabilities" aria-label="Capabilities">
        <div className="home-cap-row">
          <div className="home-cap">
            <span className="home-cap-label">Render pipeline</span>
            <span className="home-cap-value">Go · sub-ms p50</span>
          </div>
          <div className="home-cap-divider" aria-hidden="true" />
          <div className="home-cap">
            <span className="home-cap-label">Output families</span>
            <span className="home-cap-value">Poster · Backdrop · Thumbnail · Logo</span>
          </div>
          <div className="home-cap-divider" aria-hidden="true" />
          <div className="home-cap">
            <span className="home-cap-label">Profile storage</span>
            <span className="home-cap-value">SQLite · export / import</span>
          </div>
          <div className="home-cap-divider" aria-hidden="true" />
          <div className="home-cap">
            <span className="home-cap-label">Cache</span>
            <span className="home-cap-value">Two-tier · hot + disk · 72h TTL</span>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <span>{BRAND_NAME} by IbbyLabs</span>
        <span className="home-footer-links">
          <a href={BRAND_SUPPORT_URL} target="_blank" rel="noreferrer">Support</a>
          <a href={BRAND_DISCORD_URL} target="_blank" rel="noreferrer">Discord</a>
        </span>
      </footer>

    </div>
  );
}
