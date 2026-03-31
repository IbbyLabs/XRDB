'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import type { MouseEvent, RefObject } from 'react';

import type { RecentCommit } from '@/lib/recentCommits';
import {
  BRAND_DISPLAY_NAME,
  BRAND_FULL_NAME,
  BRAND_DISCORD_AIO_LABEL,
  BRAND_DISCORD_AIO_URL,
  BRAND_DISCORD_DM_HANDLE,
  BRAND_DISCORD_DM_URL,
  BRAND_DISCORD_OFFICIAL_LABEL,
  BRAND_DISCORD_OFFICIAL_URL,
  BRAND_GITHUB_LABEL,
  BRAND_GITHUB_URL,
} from '@/lib/siteBrand';
import {
  BrandLockup,
  DeploymentVersionPill,
  DiscordPill,
  LatestReleasePill,
  RecentChanges,
  SectionHeader,
  SupportPill,
  UptimePill,
} from '@/components/site-chrome';

export function ConfiguratorTopNav({
  navRef,
  latestReleaseTag,
  latestReleaseUrl,
  isLatestReleaseLoading,
  pendingReleaseTag,
  isMobileNavOpen,
  onToggleMobileNav,
  onCloseMobileNav,
  onAnchorClick,
}: {
  navRef: RefObject<HTMLElement | null>;
  latestReleaseTag: string;
  latestReleaseUrl: string;
  isLatestReleaseLoading: boolean;
  pendingReleaseTag: string;
  isMobileNavOpen: boolean;
  onToggleMobileNav: () => void;
  onCloseMobileNav: () => void;
  onAnchorClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <nav ref={navRef} className="xrdb-chrome sticky top-0 z-50">
      <div className="xrdb-nav-shell w-full px-6 py-4 2xl:px-8">
        <div className="xrdb-nav-desktop flex flex-wrap items-center justify-between gap-4">
          <div className="xrdb-nav-primary min-w-0">
            <BrandLockup compact />
            <span className="xrdb-brand-tag">Stateless artwork engine</span>
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
            <a href="#preview" onClick={onAnchorClick} className="xrdb-nav-link">Configurator</a>
            <a href="#proxy" onClick={onAnchorClick} className="xrdb-nav-link">Proxy</a>
            <Link href="/docs" className="xrdb-nav-link">Docs</Link>
            <a href={BRAND_GITHUB_URL} target="_blank" rel="noreferrer" className="xrdb-nav-link">{BRAND_GITHUB_LABEL}</a>
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
            onClick={onToggleMobileNav}
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
            <a href="#preview" onClick={onAnchorClick} className="xrdb-nav-link">Configurator</a>
            <a href="#proxy" onClick={onAnchorClick} className="xrdb-nav-link">Proxy</a>
            <Link href="/docs" className="xrdb-nav-link" onClick={onCloseMobileNav}>Docs</Link>
            <a
              href={BRAND_GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="xrdb-nav-link"
              onClick={onCloseMobileNav}
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

export function ConfiguratorHero({
  heroRef,
  versionStatusNote,
  onAnchorClick,
  recentCommits,
  visibleRecentCommitCount,
  onLoadMoreRecentCommits,
  isRecentCommitsLoading,
  recentCommitsError,
  nowMs,
}: {
  heroRef: RefObject<HTMLElement | null>;
  versionStatusNote: string;
  onAnchorClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  recentCommits: RecentCommit[];
  visibleRecentCommitCount: number;
  onLoadMoreRecentCommits: (next: number) => void;
  isRecentCommitsLoading: boolean;
  recentCommitsError: string;
  nowMs: number;
}) {
  return (
    <>
      <section ref={heroRef} className="xrdb-hero-section relative">
        <div className="xrdb-hero-orb absolute inset-0 rounded-[3rem] pointer-events-none" />
        <div className="xrdb-hero-grid">
          <div className="xrdb-hero-copy">
            <div className="xrdb-hero-meta">
              <p className="site-section-eyebrow font-mono">{BRAND_DISPLAY_NAME}</p>
            </div>
            <h1 className="xrdb-hero-title font-bold text-white">
              Live Ratings.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-500 to-violet-600">
                Stateless delivery.
              </span>
            </h1>
            <p className="xrdb-hero-subtitle mt-4 text-lg text-zinc-400 leading-relaxed">
              XRDB, {BRAND_FULL_NAME}, builds posters, backdrops, thumbnails, and logos from one configuration.
              Tune artwork, export integration settings, and deploy the same output model across addons and media tools.
            </p>
            <p className="xrdb-hero-version-note font-mono">
              {versionStatusNote}
            </p>
            <div className="xrdb-hero-actions flex flex-wrap items-center gap-4">
              <a href="#preview" onClick={onAnchorClick} className="xrdb-hero-primary">
                Open Configurator
              </a>
              <Link href="/docs" className="xrdb-hero-secondary">
                Read Docs
              </Link>
            </div>
            <div className="site-discord-callout">
              <p className="site-discord-callout-title">Need help with XRDB, ratings, or proxy setup?</p>
              <p className="site-discord-callout-copy">
                Join the XRDB communities for help with rendering issues, badges, language settings, or addon setup. The AIOStreams channel is useful for shared troubleshooting, and the official XRDB server is the main project home.
              </p>
              <div className="site-discord-callout-actions">
                <DiscordPill
                  href={BRAND_DISCORD_AIO_URL}
                  label={BRAND_DISCORD_AIO_LABEL}
                  title="Open the XRDB channel in the AIOStreams Discord"
                />
                <DiscordPill
                  href={BRAND_DISCORD_OFFICIAL_URL}
                  label={BRAND_DISCORD_OFFICIAL_LABEL}
                  title="Open the official XRDB Discord"
                />
              </div>
              <span className="site-discord-fallback">
                If an invite does not open or has expired, message{' '}
                <a href={BRAND_DISCORD_DM_URL} target="_blank" rel="noreferrer">
                  {BRAND_DISCORD_DM_HANDLE}
                </a>{' '}
                on Discord.
              </span>
            </div>
            <div className="xrdb-hero-strip">
              <div className="xrdb-hero-chip">Poster, backdrop, and logo output</div>
              <div className="xrdb-hero-chip">One config string for every integration</div>
              <div className="xrdb-hero-chip">Manifest proxy for Stremio addons</div>
            </div>
            <RecentChanges
              commits={recentCommits}
              visibleCount={visibleRecentCommitCount}
              onLoadMore={onLoadMoreRecentCommits}
              loading={isRecentCommitsLoading}
              error={recentCommitsError}
              nowMs={nowMs}
            />
          </div>

          <aside className="xrdb-panel xrdb-hero-panel">
            <p className="xrdb-panel-eyebrow font-mono">Workflow</p>
            <div className="xrdb-hero-panel-stack">
              <div>
                <h2 className="xrdb-panel-title text-white">From setup to artwork in one flow</h2>
                <p className="xrdb-panel-copy text-zinc-400">
                  Configure once, then export a config string or proxy manifest for the integration that needs it.
                </p>
              </div>
              <div className="xrdb-hero-flow">
                <div className="xrdb-hero-flow-step">
                  <span className="xrdb-hero-flow-index">1</span>
                  <div>
                    <div className="xrdb-hero-flow-title">Set providers and layouts</div>
                    <div className="xrdb-hero-flow-copy">Choose per type ratings, text, and badge behavior.</div>
                  </div>
                </div>
                <div className="xrdb-hero-flow-step">
                  <span className="xrdb-hero-flow-index">2</span>
                  <div>
                    <div className="xrdb-hero-flow-title">Copy the generated output</div>
                    <div className="xrdb-hero-flow-copy">Use a config string or a proxy manifest depending on the integration.</div>
                  </div>
                </div>
                <div className="xrdb-hero-flow-step">
                  <span className="xrdb-hero-flow-index">3</span>
                  <div>
                    <div className="xrdb-hero-flow-title">Render artwork on demand</div>
                    <div className="xrdb-hero-flow-copy">Serve branded media images without storing user settings on the server.</div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

export function ConfiguratorWorkspaceIntro() {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <SectionHeader
        eyebrow="Workspace"
        title="Configurator & Proxy"
        description="Tune layout, ratings, badges, and language once, then export a shareable config string or generate a proxy manifest from the same state. Saved workspace values stay in this browser until you copy or export them."
      />
      <div className="flex flex-wrap gap-2 xl:max-w-md xl:justify-end">
        {[
          'Shared workspace',
          'Live preview',
          'Config string export',
          'Proxy manifest export',
        ].map((item) => (
          <span
            key={item}
            className="rounded-full border border-white/10 bg-zinc-950/80 px-3 py-1 text-[11px] font-medium text-zinc-300"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
