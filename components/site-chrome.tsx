'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, ExternalLink, Tag, Terminal } from 'lucide-react';
import {
  BRAND_DISPLAY_NAME,
  BRAND_FULL_NAME,
  BRAND_GITHUB_LABEL,
  BRAND_GITHUB_URL,
  BRAND_NAME,
  BRAND_SUPPORT_URL,
  BRAND_UPTIME_URL,
  DEPLOYMENT_VERSION,
} from '@/lib/siteBrand';
import { COMMIT_PAGE_SIZE, type RecentCommit } from '@/lib/recentCommits';

const INVALID_COMMIT_TIMESTAMP_LABEL = 'unknown';

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  const accentIndex = BRAND_FULL_NAME.indexOf('X');
  const eyebrowLead = accentIndex >= 0 ? BRAND_FULL_NAME.slice(0, accentIndex) : BRAND_FULL_NAME;
  const eyebrowAccent = accentIndex >= 0 ? BRAND_FULL_NAME.slice(accentIndex, accentIndex + 1) : '';
  const eyebrowTail = accentIndex >= 0 ? BRAND_FULL_NAME.slice(accentIndex + 1) : '';

  return (
    <Link href="/" className={`site-brand-lockup${compact ? ' site-brand-lockup-compact' : ''}`}>
      <span className="site-brand-badge" aria-hidden="true">
        <Image src="/favicon.png" alt="" className="site-brand-logo" width={38} height={38} priority />
      </span>
      <span className="site-brand-copy">
        <span className="site-brand-eyebrow" aria-label={BRAND_FULL_NAME}>
          <span>{eyebrowLead}</span>
          {eyebrowAccent ? <span className="site-brand-eyebrow-accent">{eyebrowAccent}</span> : null}
          <span>{eyebrowTail}</span>
        </span>
        <span className="site-brand-name">{BRAND_NAME}</span>
      </span>
    </Link>
  );
}

export function SupportPill({ label = 'Support' }: { label?: string }) {
  return (
    <a
      className="site-support-pill"
      href={BRAND_SUPPORT_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Optional support on Kofi"
      title="Optional support on Kofi"
    >
      <Image
        className="site-support-icon"
        src="/kofi-favicon.png"
        alt=""
        aria-hidden="true"
        width={20}
        height={20}
      />
      <span className="site-support-text">{label}</span>
    </a>
  );
}

export function UptimePill({ label = 'IbbyLabs Uptime Tracker' }: { label?: string }) {
  return (
    <a
      className="site-status-pill"
      href={BRAND_UPTIME_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Open IbbyLabs Uptime Tracker page"
      title="Open IbbyLabs Uptime Tracker page"
    >
      <span className="site-status-text">{label}</span>
      <ExternalLink className="site-status-icon" aria-hidden="true" />
    </a>
  );
}

export function DeploymentVersionPill({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`xrdb-deployment-pill${compact ? ' xrdb-deployment-pill-compact' : ''}`}
      aria-label={`Current deployment version ${DEPLOYMENT_VERSION}`}
      title={`${BRAND_DISPLAY_NAME} deployment version`}
    >
      <Terminal className="xrdb-deployment-pill-icon" aria-hidden="true" />
      <span className="xrdb-deployment-pill-label font-mono">
        {compact ? 'Live' : 'Current deployment'}
      </span>
      <span className="xrdb-deployment-pill-value font-mono">{DEPLOYMENT_VERSION}</span>
    </span>
  );
}

export function LatestReleasePill({
  compact = false,
  releaseTag,
  releaseUrl,
  loading,
  pendingTag = '',
}: {
  compact?: boolean;
  releaseTag: string;
  releaseUrl: string;
  loading: boolean;
  pendingTag?: string;
}) {
  const hasPendingRelease = !loading && Boolean(pendingTag);
  const value = loading ? 'Checking' : hasPendingRelease ? pendingTag : releaseTag || 'Unknown';
  const label = loading
    ? compact
      ? 'Latest deployment'
      : 'Latest deployment'
    : hasPendingRelease
      ? compact
        ? 'Publishing'
        : 'Deployment publishing'
      : compact
        ? 'Latest deployment'
        : 'Latest deployment';
  const title = loading
    ? 'Checking GitHub for the latest deployment.'
    : hasPendingRelease
      ? releaseTag
        ? `${pendingTag} is still publishing. Latest published deployment is ${releaseTag}.`
        : `${pendingTag} is still publishing on GitHub.`
      : releaseUrl
        ? `Open ${value} on GitHub`
        : 'Latest GitHub deployment is unavailable right now.';
  const content = (
    <>
      <Tag className="xrdb-release-pill-icon" aria-hidden="true" />
      <span className="xrdb-release-pill-label font-mono">{label}</span>
      <span className="xrdb-release-pill-value font-mono">{value}</span>
    </>
  );

  if (!hasPendingRelease && releaseUrl) {
    return (
      <a
        className={`xrdb-release-pill xrdb-release-pill-link${compact ? ' xrdb-release-pill-compact' : ''}`}
        href={releaseUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Latest deployment version ${value}`}
        title={title}
      >
        {content}
      </a>
    );
  }

  return (
    <span
      className={`xrdb-release-pill${hasPendingRelease ? ' xrdb-release-pill-pending' : ''}${compact ? ' xrdb-release-pill-compact' : ''}`}
      aria-label={`${hasPendingRelease ? 'Deployment publishing' : 'Latest deployment version'} ${value}`}
      title={title}
    >
      {content}
    </span>
  );
}

export function DiscordPill({ href, label, title }: { href: string; label: string; title: string }) {
  return (
    <a
      className="site-discord-pill"
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={title}
      title={title}
    >
      <svg className="site-discord-icon" viewBox="0 0 127.14 96.36" fill="currentColor" aria-hidden="true">
        <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.31,60,73.31,53s5-12.74,11.43-12.74S96.33,46,96.22,53,91.08,65.69,84.69,65.69Z" />
      </svg>
      <span>{label}</span>
    </a>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = 'left',
}: {
  eyebrow: string;
  title: string;
  description: string;
  align?: 'left' | 'center';
}) {
  return (
    <div className={`xrdb-section-header${align === 'center' ? ' xrdb-section-header-center' : ''}`}>
      <p className="site-section-eyebrow font-mono">{eyebrow}</p>
      <h2 className="xrdb-section-title text-white">{title}</h2>
      <p className="xrdb-section-copy text-zinc-400">{description}</p>
    </div>
  );
}

export function ConfiguratorAccordionSection({
  title,
  description,
  isOpen,
  onToggle,
  tone = 'default',
  children,
}: {
  title: string;
  description: string;
  isOpen: boolean;
  onToggle: () => void;
  tone?: 'default' | 'accent';
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border ${
        tone === 'accent'
          ? 'border-violet-500/20 bg-[linear-gradient(180deg,rgba(32,20,54,0.92),rgba(16,10,28,0.98))]'
          : 'border-white/10 bg-black/30'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-0.5 text-[11px] leading-5 text-zinc-500">{description}</div>
        </div>
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${
            isOpen ? 'rotate-90 text-violet-300' : ''
          }`}
        />
      </button>
      <div className="xrdb-accordion-body" data-open={isOpen}>
        <div className="xrdb-accordion-inner">
          <div className="border-t border-white/10 px-4 py-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

const formatCommitTimestamp = (value: string, nowMs: number) => {
  const commitMs = Date.parse(value);
  if (!Number.isFinite(commitMs)) {
    return INVALID_COMMIT_TIMESTAMP_LABEL;
  }
  const deltaSeconds = Math.max(0, Math.floor((nowMs - commitMs) / 1000));
  if (deltaSeconds < 60) {
    return 'just now';
  }
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(commitMs);
};

export function RecentChanges({
  commits,
  visibleCount,
  onLoadMore,
  loading,
  error,
  nowMs,
}: {
  commits: RecentCommit[];
  visibleCount: number;
  onLoadMore: (next: number) => void;
  loading: boolean;
  error: string;
  nowMs: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const visibleCommits = commits.slice(0, visibleCount);
  const hasMore = visibleCount < commits.length;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current || panelRef.current.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div className="xrdb-commit-window-wrap">
      {isOpen ? <div className="xrdb-commit-window-backdrop" aria-hidden="true" /> : null}
      <button
        type="button"
        className="xrdb-commit-window-trigger"
        aria-label="Open recent changes"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        Recent changes
      </button>

      {isOpen ? (
        <section
          ref={panelRef}
          className="xrdb-commit-window"
          role="dialog"
          aria-modal="false"
          aria-label="Recent commits"
        >
          <div className="xrdb-commit-window-head">
            <h2>Recent Changes</h2>
            <div className="xrdb-commit-window-actions">
              <span className="xrdb-commit-window-count font-mono">
                {visibleCommits.length}/{commits.length}
              </span>
              <button
                type="button"
                className="xrdb-commit-window-close"
                aria-label="Close recent changes"
                onClick={() => setIsOpen(false)}
              >
                ×
              </button>
            </div>
          </div>

          {loading ? (
            <p className="xrdb-commit-window-empty font-mono">Loading commits...</p>
          ) : error ? (
            <p className="xrdb-commit-window-empty font-mono">{error}</p>
          ) : commits.length === 0 ? (
            <p className="xrdb-commit-window-empty font-mono">No recent commits to show.</p>
          ) : (
            <>
              <ol className="xrdb-commit-list">
                {visibleCommits.map((commit) => (
                  <li key={commit.hash} className="xrdb-commit-item">
                    <div className="xrdb-commit-item-head">
                      <span className={`xrdb-commit-type xrdb-commit-type-${commit.type}`}>
                        {commit.type.toUpperCase()}
                      </span>
                      {commit.isImported && (
                        <span className="xrdb-commit-type xrdb-commit-type-imported">
                          SOURCE
                        </span>
                      )}
                      <span className="xrdb-commit-hash font-mono">{commit.shortHash}</span>
                    </div>
                    <p className="xrdb-commit-title">{commit.title}</p>
                    <p className="xrdb-commit-date font-mono">{formatCommitTimestamp(commit.date, nowMs)}</p>
                  </li>
                ))}
              </ol>

              {hasMore ? (
                <button
                  type="button"
                  className="xrdb-commit-load-more"
                  onClick={() => onLoadMore(Math.min(visibleCount + COMMIT_PAGE_SIZE, commits.length))}
                >
                  Load 5 more
                </button>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
