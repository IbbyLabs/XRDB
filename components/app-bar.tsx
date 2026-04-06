'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

import {
  BrandLockup,
  DiscordPill,
  SupportPill,
  UptimePill,
} from '@/components/site-chrome';
import { StatusBanner } from '@/components/status-banner';
import { BRAND_DISCORD_OFFICIAL_LABEL, BRAND_DISCORD_OFFICIAL_URL, BRAND_GITHUB_LABEL, BRAND_GITHUB_URL } from '@/lib/siteBrand';

const viewTabs = [
  { href: '/', label: 'Configure' },
  { href: '/export', label: 'Import/Export' },
  { href: '/addon', label: 'Proxy' },
  { href: '/reference', label: 'Reference' },
] as const;

export function AppBar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setIsMobileMenuOpen(false);
  }

  const isActiveTab = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav className="xrdb-app-bar">
      <div className="xrdb-app-bar-inner">
        <div className="xrdb-app-bar-brand">
          <BrandLockup compact nameSlot={<StatusBanner />} />
        </div>

        <div className="xrdb-app-bar-tabs">
          {viewTabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`xrdb-app-bar-tab${isActiveTab(tab.href) ? ' is-active' : ''}`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <div className="xrdb-app-bar-status">
          <DiscordPill href={BRAND_DISCORD_OFFICIAL_URL} label={BRAND_DISCORD_OFFICIAL_LABEL} title={BRAND_DISCORD_OFFICIAL_LABEL} popover />
        </div>

        <button
          type="button"
          className="xrdb-app-bar-menu-btn"
          aria-expanded={isMobileMenuOpen}
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setIsMobileMenuOpen((o) => !o)}
        >
          {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {isMobileMenuOpen ? (
        <div className="xrdb-app-bar-overflow">
          <a href={BRAND_GITHUB_URL} target="_blank" rel="noreferrer" className="xrdb-app-bar-overflow-link">
            {BRAND_GITHUB_LABEL}
          </a>
          <UptimePill label="Uptime Tracker" />
          <SupportPill label="Support" />
          <DiscordPill href={BRAND_DISCORD_OFFICIAL_URL} label={BRAND_DISCORD_OFFICIAL_LABEL} title={BRAND_DISCORD_OFFICIAL_LABEL} popover />
        </div>
      ) : null}
    </nav>
  );
}
