import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGeneratedLogoDataUrl,
  buildPosterTitleSvg,
  escapeXml,
  estimateGeneratedLogoLineWidth,
  LOGO_BASE_HEIGHT,
  LOGO_FALLBACK_ASPECT_RATIO,
  LOGO_MAX_WIDTH,
  LOGO_MIN_WIDTH,
  splitTitleForGeneratedLogo,
} from '../lib/imageRouteText.ts';

test('image route text escapes xml content safely', () => {
  assert.equal(escapeXml(`Tom & "Jerry" <best>`), 'Tom &amp; &quot;Jerry&quot; &lt;best&gt;');
});

test('image route text estimates wide characters larger than narrow ones', () => {
  assert.ok(estimateGeneratedLogoLineWidth('WW', 20) > estimateGeneratedLogoLineWidth('ii', 20));
});

test('image route text splits long titles into controlled generated logo lines', () => {
  const lines = splitTitleForGeneratedLogo('The Extremely Long Voyage of Captain Example Through Time');
  assert.ok(lines.length >= 2);
  assert.ok(lines.length <= 4);
});

test('image route text builds generated logo data urls with stable sizing constants', () => {
  const generated = buildGeneratedLogoDataUrl('Example Show');
  assert.match(generated.dataUrl, /^data:image\/svg\+xml,/);
  assert.ok(generated.aspectRatio > 1);
  assert.equal(LOGO_BASE_HEIGHT, 320);
  assert.equal(LOGO_FALLBACK_ASPECT_RATIO, 2.5);
  assert.ok(LOGO_MIN_WIDTH < LOGO_MAX_WIDTH);
});

test('image route text builds escaped poster title svg output', () => {
  const posterTitle = buildPosterTitleSvg(`Tom & Jerry`, 420);
  assert.ok(posterTitle);
  assert.equal(posterTitle.width, 420);
  assert.match(posterTitle.svg, /Tom &amp; Jerry/);
});
