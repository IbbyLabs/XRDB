import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const requestStateSource = readFileSync(
  new URL('../lib/imageRouteRequestState.ts', import.meta.url),
  'utf8',
);

test('rating style query param precedence keeps canonical and legacy aliases', () => {
  assert.match(
    requestStateSource,
    /const typeRatingStyleParam =\s*imageType === 'poster'\s*\?\s*searchParams\.get\('posterRatingStyle'\)\s*\?\?\s*searchParams\.get\('posterRatingsStyle'\)\s*:\s*imageType === 'backdrop'\s*\?\s*searchParams\.get\('backdropRatingStyle'\)\s*\?\?\s*searchParams\.get\('backdropRatingsStyle'\)\s*:\s*searchParams\.get\('logoRatingStyle'\)\s*\?\?\s*searchParams\.get\('logoRatingsStyle'\);/,
  );
  assert.match(
    requestStateSource,
    /searchParams\.get\('ratingStyle'\)\s*\|\|\s*searchParams\.get\('ratingsStyle'\)\s*\|\|\s*typeRatingStyleParam\s*\|\|\s*searchParams\.get\('style'\)/,
  );
});
