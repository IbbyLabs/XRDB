import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveLatestPublishedReleaseId } from '../.github/scripts/reconcile-github-release-latest.mjs';

test('resolveLatestPublishedReleaseId returns the highest published semantic version', () => {
  const release = resolveLatestPublishedReleaseId([
    {
      id: 201,
      tag_name: 'v2.37.6',
      published_at: '2026-03-25T16:43:44Z',
      draft: false,
      prerelease: false,
    },
    {
      id: 202,
      tag_name: 'v2.37.5',
      published_at: '2026-03-25T16:43:46Z',
      draft: false,
      prerelease: false,
    },
  ]);

  assert.deepEqual(release, {
    id: 201,
    tagName: 'v2.37.6',
  });
});
