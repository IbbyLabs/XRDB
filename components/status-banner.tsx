'use client';

import { useEffect, useState } from 'react';

import { DeploymentVersionPill, LatestReleasePill } from '@/components/site-chrome';
import { LATEST_RELEASE_FEED_URL } from '@/lib/recentCommits';

export function StatusBanner() {
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
      } catch (error: unknown) {
        if (!active || (error instanceof Error && error.name === 'AbortError')) return;
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

  return (
    <div className="xrdb-status-banner">
      <DeploymentVersionPill compact labelless />
      <LatestReleasePill
        compact
        labelless
        releaseTag={latestReleaseTag}
        releaseUrl={latestReleaseUrl}
        loading={isLatestReleaseLoading}
        pendingTag={pendingReleaseTag}
      />
    </div>
  );
}
