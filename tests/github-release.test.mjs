import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compareReleaseTagVersions,
  fetchLatestGitHubRelease,
  parseGitHubRepositoryUrl,
  selectLatestPublishedReleaseEntry,
  selectPreviousPublishedReleaseTag,
} from '../lib/githubRelease.ts';

test('parseGitHubRepositoryUrl resolves repository metadata from GitHub URLs', () => {
  assert.deepEqual(
    parseGitHubRepositoryUrl('git+https://github.com/IbbyLabs/xrdb.git'),
    {
      owner: 'IbbyLabs',
      name: 'xrdb',
      htmlUrl: 'https://github.com/IbbyLabs/xrdb',
      latestReleaseApiUrl: 'https://api.github.com/repos/IbbyLabs/xrdb/releases/latest',
      releasesApiUrl: 'https://api.github.com/repos/IbbyLabs/xrdb/releases?per_page=100',
    }
  );

  assert.deepEqual(
    parseGitHubRepositoryUrl('https://github.com/IbbyLabs/xrdb#readme'),
    {
      owner: 'IbbyLabs',
      name: 'xrdb',
      htmlUrl: 'https://github.com/IbbyLabs/xrdb',
      latestReleaseApiUrl: 'https://api.github.com/repos/IbbyLabs/xrdb/releases/latest',
      releasesApiUrl: 'https://api.github.com/repos/IbbyLabs/xrdb/releases?per_page=100',
    }
  );
});

test('parseGitHubRepositoryUrl ignores non GitHub URLs', () => {
  assert.equal(parseGitHubRepositoryUrl('https://example.com/IbbyLabs/xrdb'), null);
  assert.equal(parseGitHubRepositoryUrl(''), null);
});

test('compareReleaseTagVersions orders semantic release tags numerically', () => {
  assert.equal(compareReleaseTagVersions('v2.31.1', 'v2.31.0') > 0, true);
  assert.equal(compareReleaseTagVersions('v2.31.0', 'v2.31.1') < 0, true);
  assert.equal(compareReleaseTagVersions('v2.31.0', 'v2.31.0'), 0);
  assert.equal(compareReleaseTagVersions('v2.31.10', 'v2.31.9') > 0, true);
});

test('fetchLatestGitHubRelease returns the latest release payload', async () => {
  const release = await fetchLatestGitHubRelease({
    repository: parseGitHubRepositoryUrl('https://github.com/IbbyLabs/xrdb'),
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://api.github.com/repos/IbbyLabs/xrdb/releases?per_page=100');
      assert.equal(init?.headers?.accept, 'application/vnd.github+json');

      return new Response(
        JSON.stringify([
          {
            tag_name: 'v2.24.1',
            html_url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.24.1',
            published_at: '2026-03-23T19:13:31Z',
            draft: false,
            prerelease: false,
          },
          {
            tag_name: 'v2.24.0',
            html_url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.24.0',
            published_at: '2026-03-23T08:48:01Z',
            draft: false,
            prerelease: false,
          },
        ]),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    },
  });

  assert.deepEqual(release, {
    tagName: 'v2.24.1',
    url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.24.1',
    publishedAt: '2026-03-23T19:13:31Z',
    pendingTagName: null,
  });
});

test('fetchLatestGitHubRelease ignores drafts and prereleases while choosing the highest published version', async () => {
  const release = await fetchLatestGitHubRelease({
    repository: parseGitHubRepositoryUrl('https://github.com/IbbyLabs/xrdb'),
    fetchImpl: async () =>
      new Response(
        JSON.stringify([
          {
            tag_name: 'v2.24.3',
            html_url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.24.3',
            published_at: '2026-03-23T21:00:00Z',
            draft: true,
            prerelease: false,
          },
          {
            tag_name: 'v2.24.2',
            html_url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.24.2',
            published_at: '2026-03-23T20:00:00Z',
            draft: false,
            prerelease: true,
          },
          {
            tag_name: 'v2.24.10',
            html_url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.24.10',
            published_at: '2026-03-23T22:00:00Z',
            draft: false,
            prerelease: false,
          },
          {
            tag_name: 'v2.24.9',
            html_url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.24.9',
            published_at: '2026-03-23T23:00:00Z',
            draft: false,
            prerelease: false,
          },
        ]),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
  });

  assert.deepEqual(release, {
    tagName: 'v2.24.10',
    url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.24.10',
    publishedAt: '2026-03-23T22:00:00Z',
    pendingTagName: null,
  });
});

test('fetchLatestGitHubRelease returns pendingTagName when a draft release is ahead of the latest published version', async () => {
  const release = await fetchLatestGitHubRelease({
    repository: parseGitHubRepositoryUrl('https://github.com/IbbyLabs/xrdb'),
    fetchImpl: async () =>
      new Response(
        JSON.stringify([
          {
            tag_name: 'v2.44.4',
            html_url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.44.4',
            published_at: null,
            draft: true,
            prerelease: false,
          },
          {
            tag_name: 'v2.44.3',
            html_url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.44.3',
            published_at: '2026-03-26T17:30:00Z',
            draft: false,
            prerelease: false,
          },
        ]),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
  });

  assert.deepEqual(release, {
    tagName: 'v2.44.3',
    url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.44.3',
    publishedAt: '2026-03-26T17:30:00Z',
    pendingTagName: 'v2.44.4',
  });
});

test('selectLatestPublishedReleaseEntry prefers the highest semver even when an older release was published later', () => {
  const release = selectLatestPublishedReleaseEntry([
    {
      id: 11,
      tag_name: 'v2.37.6',
      html_url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.37.6',
      published_at: '2026-03-25T16:43:44Z',
      draft: false,
      prerelease: false,
    },
    {
      id: 12,
      tag_name: 'v2.37.5',
      html_url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.37.5',
      published_at: '2026-03-25T16:43:46Z',
      draft: false,
      prerelease: false,
    },
  ]);

  assert.equal(release?.tag_name, 'v2.37.6');
});

test('selectPreviousPublishedReleaseTag uses semantic version order instead of API response order', () => {
  const previousTag = selectPreviousPublishedReleaseTag(
    [
      {
        tag_name: 'v2.37.5',
        published_at: '2026-03-25T16:43:46Z',
        draft: false,
        prerelease: false,
      },
      {
        tag_name: 'v2.37.6',
        published_at: '2026-03-25T16:43:44Z',
        draft: false,
        prerelease: false,
      },
      {
        tag_name: 'v2.37.4',
        published_at: '2026-03-25T16:39:13Z',
        draft: false,
        prerelease: false,
      },
    ],
    'v2.37.6'
  );

  assert.equal(previousTag, 'v2.37.5');
});

test('fetchLatestGitHubRelease falls back to null when the release is unavailable', async () => {
  const release = await fetchLatestGitHubRelease({
    repository: parseGitHubRepositoryUrl('https://github.com/IbbyLabs/xrdb'),
    fetchImpl: async () => new Response('not found', { status: 404 }),
  });

  assert.equal(release, null);
});

test('fetchLatestGitHubRelease falls back to null when the GitHub API times out', async () => {
  const release = await fetchLatestGitHubRelease({
    repository: parseGitHubRepositoryUrl('https://github.com/IbbyLabs/xrdb'),
    timeoutMs: 10,
    fetchImpl: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          },
          { once: true }
        );
      }),
  });

  assert.equal(release, null);
});
