import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBlockbusterReviewCalloutSvg,
  dedupeBlockbusterBlurbs,
  extractBlockbusterReviewBlurbs,
  getBlockbusterBlurbChaos,
  sanitizeBlockbusterReviewText,
  trimBlockbusterReviewText,
} from '../lib/imageRouteBlockbusterReview.ts';

test('image route blockbuster review text sanitizes markdown and html noise', () => {
  const value = sanitizeBlockbusterReviewText('**Bold** <b>tag</b> [link](https://example.com) `code`');

  assert.equal(value, 'Bold tag link code');
});

test('image route blockbuster review text trims long content predictably', () => {
  const value = trimBlockbusterReviewText(
    'This is a longer review sentence that should survive trimming intact. Another sentence should be skipped once the first one is enough.',
    90,
  );

  assert.match(value, /^This is a longer review sentence/);
  assert.ok(value.length <= 90);
});

test('image route blockbuster review extraction normalizes authors and snippets', () => {
  const blurbs = extractBlockbusterReviewBlurbs({
    results: [
      {
        content: 'Excellent pacing and an unusually graceful finish that keeps the emotion sharp. Another memorable beat lands with real confidence.',
        author_details: { username: 'critic_user' },
      },
      {
        content: '',
        author: 'Ignored',
      },
    ],
  });

  assert.equal(blurbs.length, 2);
  assert.equal(blurbs[0]?.author, 'critic_user');
  assert.ok(blurbs.every((blurb) => blurb.text.length >= 34));
});

test('image route blockbuster review blurbs dedupe repeated author text pairs', () => {
  const blurbs = dedupeBlockbusterBlurbs([
    { text: 'Same text', author: 'Name' },
    { text: 'Same text', author: 'Name' },
    { text: 'Different text', author: 'Name' },
  ]);

  assert.deepEqual(blurbs, [
    { text: 'Same text', author: 'Name' },
    { text: 'Different text', author: 'Name' },
  ]);
});

test('image route blockbuster review callout builds bounded svg output', () => {
  const spec = buildBlockbusterReviewCalloutSvg({
    text: 'A sharp, stylish, and unexpectedly moving genre piece that keeps building momentum.',
    author: 'Example Critic',
    rotation: 0,
  });

  assert.ok(spec.width > 0);
  assert.ok(spec.height > 0);
  assert.match(spec.svg, /EXAMPLE CRITIC/);
  assert.match(spec.svg, /blockbuster-review-shadow/);
});

test('image route blockbuster review chaos stays deterministic per seed', () => {
  const first = getBlockbusterBlurbChaos('seed-value', 'balanced');
  const second = getBlockbusterBlurbChaos('seed-value', 'balanced');

  assert.deepEqual(first, second);
  assert.equal(typeof first.outerRotation, 'number');
  assert.equal(typeof first.isNearVertical, 'boolean');
});
