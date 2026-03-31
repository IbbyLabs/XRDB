import Image from 'next/image';
import Link from 'next/link';
import type { MouseEvent } from 'react';

import {
  BRAND_DISPLAY_NAME,
  BRAND_DISCORD_AIO_URL,
  BRAND_DISCORD_OFFICIAL_URL,
  BRAND_GITHUB_LABEL,
  BRAND_GITHUB_URL,
} from '@/lib/siteBrand';
import { BrandLockup, SupportPill, UptimePill } from '@/components/site-chrome';

export function SitePageOutro({
  onAnchorClick,
  configuratorHref = '/configurator',
  proxyHref = '/configurator#proxy',
  docsHref = '/docs',
}: {
  onAnchorClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  configuratorHref?: string;
  proxyHref?: string;
  docsHref?: string;
}) {
  const footerLinkClass = 'xrdb-footer-link';
  const renderInternalLink = (href: string, label: string) => {
    if (href.startsWith('#')) {
      return (
        <a href={href} onClick={onAnchorClick} className={footerLinkClass}>
          {label}
        </a>
      );
    }
    return (
      <Link href={href} className={footerLinkClass}>
        {label}
      </Link>
    );
  };

  return (
    <>
      <section className="w-full px-6 pb-6 md:pb-10 2xl:px-8" aria-label="Status board information">
        <div className="rounded-2xl border border-white/10 bg-zinc-950/65 p-5 md:p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <h3 className="text-sm md:text-base font-semibold text-white">What is IbbyLabs Uptime Tracker?</h3>
            <p className="text-sm text-zinc-400">
              It is the IbbyLabs public status board for popular Stremio addons, including current health and incident updates.
            </p>
          </div>
          <div className="shrink-0">
            <UptimePill label="View the tracker" />
          </div>
        </div>
      </section>

      <footer className="xrdb-footer py-8">
        <div className="w-full px-6 space-y-4 2xl:px-8">
          <div className="site-page-footer-top">
            <BrandLockup compact />
            <UptimePill />
            <SupportPill />
          </div>
          <div className="site-page-footer-links">
            {renderInternalLink(configuratorHref, 'Configurator')}
            {renderInternalLink(proxyHref, 'Proxy')}
            {renderInternalLink(docsHref, 'Docs')}
            <a href={BRAND_GITHUB_URL} target="_blank" rel="noreferrer" className="xrdb-footer-link">{BRAND_GITHUB_LABEL}</a>
            <a href={BRAND_DISCORD_AIO_URL} target="_blank" rel="noreferrer" className="xrdb-footer-link">XRDB in AIOStreams Discord</a>
            <a href={BRAND_DISCORD_OFFICIAL_URL} target="_blank" rel="noreferrer" className="xrdb-footer-link">Official XRDB Discord</a>
          </div>
          <div className="site-page-credit">
            <Image src="/favicon.png" alt="" aria-hidden="true" width={20} height={20} />
            <span>{BRAND_DISPLAY_NAME} is built by IbbyLabs for artwork and addon workflows.</span>
          </div>
          <p className="text-sm text-zinc-500 text-center md:text-left">
            © 2026 {BRAND_DISPLAY_NAME}. Stateless artwork engine for addons and media tools.
          </p>
        </div>
      </footer>
    </>
  );
}
