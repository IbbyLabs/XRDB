import { useEffect, useState } from 'react';

import {
  COMMIT_FEED_URL,
  COMMIT_PAGE_SIZE,
  LATEST_RELEASE_FEED_URL,
  isPublicRecentCommit,
  type RecentCommit,
} from '@/lib/recentCommits';

export function useConfiguratorFeeds({
  disabled = false,
}: {
  disabled?: boolean;
} = {}) {
  const [recentCommits, setRecentCommits] = useState<RecentCommit[]>([]);
  const [recentCommitsError, setRecentCommitsError] = useState('');
  const [isRecentCommitsLoading, setIsRecentCommitsLoading] = useState(!disabled);
  const [visibleRecentCommitCount, setVisibleRecentCommitCount] = useState(COMMIT_PAGE_SIZE);
  const [latestReleaseTag, setLatestReleaseTag] = useState('');
  const [latestReleaseUrl, setLatestReleaseUrl] = useState('');
  const [pendingReleaseTag, setPendingReleaseTag] = useState('');
  const [isLatestReleaseLoading, setIsLatestReleaseLoading] = useState(!disabled);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const tick = setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => {
      clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    if (disabled) {
      setRecentCommits([]);
      setRecentCommitsError('');
      setVisibleRecentCommitCount(COMMIT_PAGE_SIZE);
      setIsRecentCommitsLoading(false);
      return;
    }

    let active = true;
    const controller = new AbortController();

    const loadRecentCommits = async () => {
      setIsRecentCommitsLoading(true);
      try {
        const url = new URL(COMMIT_FEED_URL, window.location.origin);
        url.searchParams.set('_ts', String(Date.now()));
        const response = await fetch(url.toString(), {
          signal: controller.signal,
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        if (!response.ok) {
          throw new Error(`Commit feed unavailable (${response.status})`);
        }
        const payload = await response.json();
        const commits = Array.isArray(payload?.commits)
          ? payload.commits
              .filter((entry: any) => entry && typeof entry === 'object')
              .map((entry: any) => ({
                hash: String(entry.hash || ''),
                shortHash: String(entry.shortHash || '').slice(0, 7),
                date: String(entry.date || ''),
                type: String(entry.type || 'chore'),
                title: String(entry.title || ''),
                body: entry.body ? String(entry.body) : null,
                isImported: Boolean(entry.isImported),
              }))
              .filter(
                (entry: any): entry is RecentCommit =>
                  Boolean(entry.hash) && Boolean(entry.shortHash) && Boolean(entry.title),
              )
              .filter((entry: RecentCommit) => isPublicRecentCommit(entry))
          : [];

        if (!active) {
          return;
        }
        setRecentCommits(commits);
        setVisibleRecentCommitCount(COMMIT_PAGE_SIZE);
        setRecentCommitsError('');
      } catch (error: any) {
        if (!active || error?.name === 'AbortError') {
          return;
        }
        setRecentCommits([]);
        setVisibleRecentCommitCount(COMMIT_PAGE_SIZE);
        setRecentCommitsError('Recent changes are unavailable right now.');
      } finally {
        if (active) {
          setIsRecentCommitsLoading(false);
        }
      }
    };

    loadRecentCommits();

    return () => {
      active = false;
      controller.abort();
    };
  }, [disabled]);

  useEffect(() => {
    if (disabled) {
      setLatestReleaseTag('');
      setLatestReleaseUrl('');
      setPendingReleaseTag('');
      setIsLatestReleaseLoading(false);
      return;
    }

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
  }, [disabled]);

  return {
    recentCommits,
    recentCommitsError,
    isRecentCommitsLoading,
    visibleRecentCommitCount,
    setVisibleRecentCommitCount,
    latestReleaseTag,
    latestReleaseUrl,
    pendingReleaseTag,
    isLatestReleaseLoading,
    nowMs,
  };
}
