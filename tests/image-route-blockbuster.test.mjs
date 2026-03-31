import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchBlockbusterBlurbsWithFallback } from '../lib/imageRouteBlockbuster.ts';

const buildReviewPayload = (authorPrefix, count) => ({
  results: Array.from({ length: count }, (_, index) => ({
    author: `${authorPrefix}-${index + 1}`,
    content: `This is a very enthusiastic review sentence number ${index + 1} with enough detail to survive trimming cleanly.`,
  })),
});

test('image route blockbuster blurbs fall back when the requested language is sparse', async () => {
  const requestedCalls = [];
  const blurbs = await fetchBlockbusterBlurbsWithFallback({
    mediaType: 'movie',
    tmdbId: 88,
    tmdbKey: 'tmdb-key',
    requestedLanguage: 'fr',
    fallbackLanguage: 'en',
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    fetchJsonCached: async (key) => {
      requestedCalls.push(key);
      return {
        ok: true,
        status: 200,
        data: key.includes(':reviews:fr:')
          ? buildReviewPayload('fr', 2)
          : buildReviewPayload('en', 4),
      };
    },
  });

  assert.ok(requestedCalls.some((key) => key.includes(':reviews:fr:page:1')));
  assert.ok(requestedCalls.some((key) => key.includes(':reviews:en:page:1')));
  assert.ok(blurbs.length >= 6);
  assert.ok(blurbs.every((blurb) => blurb.text.length >= 34));
});
