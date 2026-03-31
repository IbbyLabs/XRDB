'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { BrandLockup, DeploymentVersionPill, LatestReleasePill, SupportPill, UptimePill } from '@/components/site-chrome';
import { LATEST_RELEASE_FEED_URL } from '@/lib/recentCommits';
import { BRAND_GITHUB_LABEL, BRAND_GITHUB_URL } from '@/lib/siteBrand';

type NavItem = {
  href: string;
  label: string;
};

export function SitePrimaryNav({
  brandTag,
  items,
}: {
  brandTag: string;
  items: readonly NavItem[];
}) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [latestReleaseTag, setLatestReleaseTag] = useState('');
  const [latestReleaseUrl, setLatestReleaseUrl] = useState('');
  const [pendingReleaseTag, setPendingReleaseTag] = useState('');
  const [isLatestReleaseLoading, setIsLatestReleaseLoading] = useState(true);

  const closeMobileNav = () => setIsMobileNavOpen(false);
  const toggleMobileNav = () => setIsMobileNavOpen((open) => !open);

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
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        if (!response.ok) {
          throw new Error(`Latest release feed unavailable (${response.status})`);
        }
        const payload = await response.json();
        const nextTag = typeof payload?.tagName === 'string' ? payload.tagName.trim() : '';
        const nextUrl = typeof payload?.url === 'string' ? payload.url.trim() : '';
        const nextPendingTag = typeof payload?.pendingTagName === 'string' ? payload.pendingTagName.trim() : '';

        if (!active) {
          return;
        }

        setLatestReleaseTag(nextTag);
        setLatestReleaseUrl(nextUrl);
        setPendingReleaseTag(nextPendingTag);
      } catch (error: any) {
        if (!active || error?.name === 'AbortError') {
          return;
        }

        setLatestReleaseTag('');
        setLatestReleaseUrl('');
        setPendingReleaseTag('');
      } finally {
        if (active) {
          setIsLatestReleaseLoading(false);
        }
      }
    };

    loadLatestRelease();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return (
    <nav className="xrdb-chrome sticky top-0 z-50">
      <div className="xrdb-nav-shell w-full px-6 py-4 2xl:px-8">
        <div className="xrdb-nav-desktop flex flex-wrap items-center justify-between gap-4">
          <div className="xrdb-nav-primary min-w-0">
            <BrandLockup compact />
            <span className="xrdb-brand-tag">{brandTag}</span>
            <DeploymentVersionPill compact />
            <LatestReleasePill
              compact
              releaseTag={latestReleaseTag}
              releaseUrl={latestReleaseUrl}
              loading={isLatestReleaseLoading}
              pendingTag={pendingReleaseTag}
            />
          </div>
          <div className="xrdb-nav-links flex flex-wrap items-center gap-2 text-sm font-medium">
            {items.map((item) => (
              <Link key={item.href} href={item.href} className="xrdb-nav-link">
                {item.label}
              </Link>
            ))}
            <a href={BRAND_GITHUB_URL} target="_blank" rel="noreferrer" className="xrdb-nav-link">
              {BRAND_GITHUB_LABEL}
            </a>
            <UptimePill label="Uptime Tracker" />
            <SupportPill label="Support" />
          </div>
        </div>
        <div className="xrdb-nav-mobile-row">
          <BrandLockup compact />
          <button
            type="button"
            className="xrdb-nav-menu-button"
            aria-expanded={isMobileNavOpen}
            aria-controls="site-mobile-nav"
            aria-label={isMobileNavOpen ? 'Close site navigation' : 'Open site navigation'}
            onClick={toggleMobileNav}
          >
            {isMobileNavOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
            <span className="font-mono text-[11px] uppercase tracking-[0.22em]">
              {isMobileNavOpen ? 'Close' : 'Menu'}
            </span>
          </button>
        </div>
        <div className="xrdb-nav-mobile-status">
          <DeploymentVersionPill compact />
          <LatestReleasePill
            compact
            releaseTag={latestReleaseTag}
            releaseUrl={latestReleaseUrl}
            loading={isLatestReleaseLoading}
            pendingTag={pendingReleaseTag}
          />
        </div>
        <div
          id="site-mobile-nav"
          aria-hidden={!isMobileNavOpen}
          className={`xrdb-mobile-nav-drawer${isMobileNavOpen ? ' is-open' : ''}`}
        >
          <div className="xrdb-mobile-nav-links">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="xrdb-nav-link"
                onClick={closeMobileNav}
              >
                {item.label}
              </Link>
            ))}
            <a
              href={BRAND_GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="xrdb-nav-link"
              onClick={closeMobileNav}
            >
              {BRAND_GITHUB_LABEL}
            </a>
            <UptimePill label="Uptime Tracker" />
            <SupportPill label="Support" />
          </div>
        </div>
      </div>
    </nav>
  );
}
