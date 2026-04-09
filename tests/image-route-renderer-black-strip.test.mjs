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

const makePosterInput = (overrides = {}) => {
  const sourceSvg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'><rect width='400' height='600' fill='#ffffff'/></svg>";
  return {
    imageType: 'poster',
    ratingPresentation: 'standard',
    aggregateRatingSource: 'combined',
    blockbusterDensity: 'balanced',
    outputFormat: 'png',
    imgUrl: `data:image/svg+xml,${encodeURIComponent(sourceSvg)}`,
    imgFallbackUrl: null,
    outputWidth: 400,
    outputHeight: 600,
    finalOutputHeight: 600,
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
    posterEdgeInset: 24,
    badges: [],
    qualityBadges: [],
    qualityBadgesSide: 'left',
    posterQualityBadgesPosition: 'auto',
    ageRatingBadgePosition: 'inherit',
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
    topBadges: [],
    bottomBadges: [],
    leftBadges: [],
    rightBadges: [],
    posterTopRows: [],
    posterBottomRows: [],
    backdropRows: [],
    blockbusterBlurbs: [],
    cacheControl: 'public, s-maxage=60, stale-while-revalidate=60',
    ...overrides,
  };
};

const phases2 = { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 };

test('flush-bottom strip touches the bottom edge of the poster', async () => {
  const badges = [createBadge('imdb', '8.2'), createBadge('tmdb', '7.9')];
  const input = makePosterInput({
    posterRatingsLayout: 'bottom',
    badges,
    posterBottomRows: [badges],
    ratingBlackStripEnabled: true,
  });

  const result = await renderWithSharp(input, { ...phases2 });
  const bottomPixel = await samplePixel(result.body, 200, 599);

  assert.equal(bottomPixel.a, 255);
  assert.ok(
    bottomPixel.r < 40 && bottomPixel.g < 40 && bottomPixel.b < 40,
    `expected bottom edge to be black, got r=${bottomPixel.r} g=${bottomPixel.g} b=${bottomPixel.b}`,
  );
});

test('flush-top strip touches the top edge of the poster', async () => {
  const badges = [createBadge('imdb', '8.2'), createBadge('tmdb', '7.9')];
  const input = makePosterInput({
    posterRatingsLayout: 'top',
    badges,
    posterTopRows: [badges],
    ratingBlackStripEnabled: true,
  });

  const result = await renderWithSharp(input, { ...phases2 });
  const topPixel = await samplePixel(result.body, 200, 0);

  assert.equal(topPixel.a, 255);
  assert.ok(
    topPixel.r < 40 && topPixel.g < 40 && topPixel.b < 40,
    `expected top edge to be black, got r=${topPixel.r} g=${topPixel.g} b=${topPixel.b}`,
  );
});

test('backdrop flush-bottom strip touches the bottom edge when backdropBottomRatingsRow is true', async () => {
  const sourceSvg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'><rect width='640' height='360' fill='#ffffff'/></svg>";
  const imgUrl = `data:image/svg+xml,${encodeURIComponent(sourceSvg)}`;
  const badges = [createBadge('imdb', '7.5'), createBadge('tmdb', '8.0')];
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
    backdropRatingsLayout: 'center',
    backdropBottomRatingsRow: true,
    sideRatingsPosition: 'center',
    sideRatingsOffset: 0,
    ratingStyle: 'plain',
    ratingBlackStripEnabled: true,
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

  const result = await renderWithSharp(input, { ...phases2 });
  const bottomPixel = await samplePixel(result.body, 320, 359);

  assert.equal(bottomPixel.a, 255);
  assert.ok(
    bottomPixel.r < 40 && bottomPixel.g < 40 && bottomPixel.b < 40,
    `expected bottom edge to be black, got r=${bottomPixel.r} g=${bottomPixel.g} b=${bottomPixel.b}`,
  );
});
