import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { BRAND_NAME, BRAND_DISCORD_URL, BRAND_SUPPORT_URL } from '@/lib/brand';

export default function HomePage() {
  return (
    <div className="page-inner home">

      <section className="home-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/xrdb-logo.png" alt="" className="home-logo" aria-hidden="true" width={512} height={512} />
        <h1 className="home-title">
          <span className="home-title-x">X</span>RDB
        </h1>
        <p className="home-longname">
          e<span className="home-title-x">X</span>tended Ratings DataBase
        </p>
        <p className="home-sub">
          Ratings overlays and artwork for your media library.
        </p>
        <div className="home-actions">
          <Link href="/configurator" className="btn btn-primary">
            <LayoutGrid size={15} aria-hidden="true" />
            Open Configurator
          </Link>
        </div>
      </section>

      <footer className="home-footer">
        <span className="home-footer-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ibbylabs-icon-hex.png" alt="" className="footer-mark" aria-hidden="true" width={200} height={212} />
          {BRAND_NAME} by IbbyLabs
        </span>
        <span className="home-footer-links">
          <a href={BRAND_SUPPORT_URL} target="_blank" rel="noreferrer">Support</a>
          <a href={BRAND_DISCORD_URL} target="_blank" rel="noreferrer">Discord</a>
        </span>
      </footer>

    </div>
  );
}
