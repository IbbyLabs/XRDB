'use client';

import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { BRAND_NAME, BRAND_DISCORD_URL, BRAND_SUPPORT_URL } from '@/lib/brand';
import { useT } from '@/lib/i18n';
import { PublicInstanceCard } from '@/components/public-instance-card';

export function HomeContent() {
  const t = useT();
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
          {t('Ratings overlays and artwork for your media library.')}
        </p>
        <div className="home-actions">
          <Link href="/configurator" className="btn btn-primary">
            <LayoutGrid size={15} aria-hidden="true" />
            {t('Open Configurator')}
          </Link>
        </div>
      </section>

      <PublicInstanceCard />

      <footer className="home-footer">
        <span className="home-footer-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ibbylabs-icon-hex.png" alt="" className="footer-mark" aria-hidden="true" width={200} height={212} />
          {t('{brand} by IbbyLabs', { brand: BRAND_NAME })}
        </span>
        <span className="home-footer-links">
          <a href={BRAND_SUPPORT_URL} target="_blank" rel="noreferrer">{t('Support')}</a>
          <a href={BRAND_DISCORD_URL} target="_blank" rel="noreferrer">{t('Discord')}</a>
        </span>
      </footer>

    </div>
  );
}
