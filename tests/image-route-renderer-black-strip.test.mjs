import test from 'node:test';
import assert from 'node:assert/strict';

import sharp from 'sharp';

import { renderWithSharp } from '../lib/imageRouteRenderer.ts';

const createBadge = (key, value) => ({
  key,
  label: key.toUpperCase(),
  value,
  iconUrl: '',
  accentColor: '#ffffff',
});

const samplePixel = async (buffer, x, y) => {
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelIndex = (y * info.width + x) * info.channels;
  return {
    r: data[pixelIndex],
    g: data[pixelIndex + 1],
    b: data[pixelIndex + 2],
    a: data[pixelIndex + 3],
  };
};

test('image route renderer draws a black ratings strip when blackbar source mode is enabled', async () => {
  const sourceSvg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'><rect width='640' height='360' fill='#ffffff'/></svg>";
  const imgUrl = `data:image/svg+xml,${encodeURIComponent(sourceSvg)}`;
  const badges = [
    createBadge('imdb', '7.5'),
    createBadge('tmdb', '8.0'),
    createBadge('metacritic', '82'),
  ];
  const input = {
    imageType: 'backdrop',
    ratingPresentation: 'standard',
    aggregateRatingSource: 'combined',
    blockbusterDensity: 'balanced',
    outputFormat: 'png',
    imgUrl,
    imgFallbackUrl: null,
    outputWidth: 640,
    outputHeight: 360,
    finalOutputHeight: 360,
    logoBadgeBandHeight: 0,
    logoBadgeMaxWidth: 0,
    logoBadgesPerRow: 0,
    posterRowHorizontalInset: 24,
    posterTitleText: null,
    posterLogoUrl: null,
    editorialOverlay: null,
    compactRingOverlay: null,
    genreBadge: null,
    badgeIconSize: 32,
    badgeFontSize: 24,
    badgePaddingX: 14,
    badgePaddingY: 6,
    badgeGap: 10,
    badgeTopOffset: 20,
    badgeBottomOffset: 20,
    backdropEdgeInset: 12,
    badges,
    qualityBadges: [],
    qualityBadgesSide: 'left',
    posterQualityBadgesPosition: 'auto',
    qualityBadgesStyle: 'plain',
    qualityBadgeScalePercent: 100,
    posterRatingsLayout: 'top',
    posterRatingsMaxPerSide: null,
    posterEdgeOffset: 0,
    backdropRatingsLayout: 'top',
    backdropBottomRatingsRow: false,
    sideRatingsPosition: 'center',
    sideRatingsOffset: 0,
    ratingStyle: 'plain',
    ratingBlackStripEnabled: false,
    ratingStackOffsetX: 0,
    ratingStackOffsetY: 0,
    logoBackground: 'transparent',
    topBadges: badges,
    bottomBadges: [],
    leftBadges: [],
    rightBadges: [],
    posterTopRows: [],
    posterBottomRows: [],
    backdropRows: [badges],
    blockbusterBlurbs: [],
    cacheControl: 'public, s-maxage=60, stale-while-revalidate=60',
  };
  const phases = { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 };

  const baseline = await renderWithSharp(input, { ...phases });
  const withBlackStrip = await renderWithSharp(
    { ...input, ratingBlackStripEnabled: true },
    { ...phases },
  );

  const baselinePixel = await samplePixel(baseline.body, 320, 18);
  const stripPixel = await samplePixel(withBlackStrip.body, 320, 18);

  assert.equal(baselinePixel.a, 255);
  assert.equal(stripPixel.a, 255);
  assert.ok(baselinePixel.r > 240 && baselinePixel.g > 240 && baselinePixel.b > 240);
  assert.ok(stripPixel.r < 40 && stripPixel.g < 40 && stripPixel.b < 40);
});
