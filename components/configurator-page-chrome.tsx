'use client';

import Link from 'next/link';
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
} from '@/lib/siteBrand';
import {
  DiscordPill,
  RecentChanges,
} from '@/components/site-chrome';

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
                Join the XRDB Discord community for help with rendering issues, badges, language settings, and addon setup.
              </p>
              <div className="site-discord-callout-actions">
                <DiscordPill
                  href={BRAND_DISCORD_OFFICIAL_URL}
                  label={BRAND_DISCORD_OFFICIAL_LABEL}
                  title="Join the official XRDB community"
                />
                <DiscordPill
                  href={BRAND_DISCORD_AIO_URL}
                  label={BRAND_DISCORD_AIO_LABEL}
                  title="Join AIOMetadata in AIOStreams"
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
