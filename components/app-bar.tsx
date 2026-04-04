'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  BrandLockup,
  DeploymentVersionPill,
  DiscordPill,
  LatestReleasePill,
  SupportPill,
  UptimePill,
} from '@/components/site-chrome';
import { LATEST_RELEASE_FEED_URL } from '@/lib/recentCommits';
import { BRAND_DISCORD_OFFICIAL_LABEL, BRAND_DISCORD_OFFICIAL_URL, BRAND_GITHUB_LABEL, BRAND_GITHUB_URL } from '@/lib/siteBrand';

const viewTabs = [
  { href: '/', label: 'Configure' },
  { href: '/export', label: 'Export' },
  { href: '/addon', label: 'Proxy' },
  { href: '/reference', label: 'Reference' },
] as const;

export function AppBar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [latestReleaseTag, setLatestReleaseTag] = useState('');
  const [latestReleaseUrl, setLatestReleaseUrl] = useState('');
  const [pendingReleaseTag, setPendingReleaseTag] = useState('');
  const [isLatestReleaseLoading, setIsLatestReleaseLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const loadLatestRelease = async () => {
      setIsLatestReleaseLoading(true);
      try {
        const url = new URL(LATEST_RELEASE_FEED_URL, window.location.origin);
        const response = await fetch(url.toString(), {
          signal: controller.signal,
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!response.ok) throw new Error(`Feed unavailable (${response.status})`);
        const payload = await response.json();
        if (!active) return;
        setLatestReleaseTag(typeof payload?.tagName === 'string' ? payload.tagName.trim() : '');
        setLatestReleaseUrl(typeof payload?.url === 'string' ? payload.url.trim() : '');
        setPendingReleaseTag(typeof payload?.pendingTagName === 'string' ? payload.pendingTagName.trim() : '');
      } catch (error: any) {
        if (!active || error?.name === 'AbortError') return;
        setLatestReleaseTag('');
        setLatestReleaseUrl('');
        setPendingReleaseTag('');
      } finally {
        if (active) setIsLatestReleaseLoading(false);
      }
    };

    loadLatestRelease();
    return () => { active = false; controller.abort(); };
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const isActiveTab = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav className="xrdb-app-bar sticky top-0 z-50">
      <div className="xrdb-app-bar-inner">
        <div className="xrdb-app-bar-brand">
          <BrandLockup compact />
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
          <DeploymentVersionPill compact />
          <LatestReleasePill
            compact
            releaseTag={latestReleaseTag}
            releaseUrl={latestReleaseUrl}
            loading={isLatestReleaseLoading}
            pendingTag={pendingReleaseTag}
          />
          <DiscordPill href={BRAND_DISCORD_OFFICIAL_URL} label={BRAND_DISCORD_OFFICIAL_LABEL} title={BRAND_DISCORD_OFFICIAL_LABEL} />
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
          <DeploymentVersionPill compact />
          <LatestReleasePill
            compact
            releaseTag={latestReleaseTag}
            releaseUrl={latestReleaseUrl}
            loading={isLatestReleaseLoading}
            pendingTag={pendingReleaseTag}
          />
          <a href={BRAND_GITHUB_URL} target="_blank" rel="noreferrer" className="xrdb-app-bar-overflow-link">
            {BRAND_GITHUB_LABEL}
          </a>
          <UptimePill label="Uptime Tracker" />
          <SupportPill label="Support" />
          <DiscordPill href={BRAND_DISCORD_OFFICIAL_URL} label={BRAND_DISCORD_OFFICIAL_LABEL} title={BRAND_DISCORD_OFFICIAL_LABEL} />
        </div>
      ) : null}
    </nav>
  );
}
