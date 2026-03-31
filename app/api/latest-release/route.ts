import { NextResponse } from 'next/server';

import {
  fetchLatestGitHubRelease,
  resolveGitHubRepository,
} from '@/lib/githubRelease';

const LATEST_RELEASE_CACHE_SECONDS = 60;
export const revalidate = 60;

const CACHE_CONTROL = `public, s-maxage=${LATEST_RELEASE_CACHE_SECONDS}, stale-while-revalidate=${LATEST_RELEASE_CACHE_SECONDS}`;

export async function GET() {
  const repository = resolveGitHubRepository();
  const release = await fetchLatestGitHubRelease({ repository });

  return NextResponse.json(
    {
      repositoryUrl: repository?.htmlUrl || null,
      tagName: release?.tagName || null,
      url: release?.url || null,
      publishedAt: release?.publishedAt || null,
      pendingTagName: release?.pendingTagName || null,
    },
    {
      headers: {
        'Cache-Control': CACHE_CONTROL,
      },
    }
  );
}
