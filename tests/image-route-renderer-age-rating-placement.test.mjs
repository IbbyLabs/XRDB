import test from 'node:test';
import assert from 'node:assert/strict';

import sharp from 'sharp';

import { renderWithSharp } from '../lib/imageRouteRenderer.ts';

const createQualityBadge = (key, label) => ({
  key,
  label,
  value: '',
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

const createPosterRenderInput = (overrides = {}) => {
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
    badgeIconSize: 24,
    badgeFontSize: 16,
    badgePaddingX: 12,
    badgePaddingY: 6,
    badgeGap: 10,
    badgeTopOffset: 20,
    badgeBottomOffset: 20,
    backdropEdgeInset: 12,
    badges: [],
    qualityBadges: [
      createQualityBadge('certification', 'PG-13'),
      createQualityBadge('hdr', 'HDR'),
    ],
    qualityBadgesSide: 'left',
    posterQualityBadgesPosition: 'auto',
    ageRatingBadgePosition: 'inherit',
    qualityBadgesStyle: 'plain',
    qualityBadgeScalePercent: 100,
    posterRatingsLayout: 'left',
    posterRatingsMaxPerSide: null,
    posterEdgeInset: 24,
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

const phases = { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 };

test('image route renderer can extract the certification badge to the top center on supported poster layouts', async () => {
  const inherited = await renderWithSharp(
    createPosterRenderInput({ posterRatingsLayout: 'top' }),
    { ...phases },
  );
  const explicit = await renderWithSharp(
    createPosterRenderInput({
      posterRatingsLayout: 'top',
      ageRatingBadgePosition: 'top-center',
    }),
    { ...phases },
  );

  const inheritedTopCenter = await samplePixel(inherited.body, 200, 42);
  const explicitTopCenter = await samplePixel(explicit.body, 200, 42);

  assert.ok(inheritedTopCenter.r > 240 && inheritedTopCenter.g > 240 && inheritedTopCenter.b > 240);
  assert.ok(explicitTopCenter.r < 240 || explicitTopCenter.g < 240 || explicitTopCenter.b < 240);
});

test('image route renderer can extract the certification badge independently on top-bottom poster layouts', async () => {
  const explicitTopBottom = await renderWithSharp(
    createPosterRenderInput({
      posterRatingsLayout: 'top-bottom',
      ageRatingBadgePosition: 'top-center',
    }),
    { ...phases },
  );

  const topCenter = await samplePixel(explicitTopBottom.body, 200, 42);

  assert.ok(topCenter.r < 240 || topCenter.g < 240 || topCenter.b < 240);
});

test('image route renderer keeps poster quality badges separate from the age rating on top poster layouts', async () => {
  const explicitTop = await renderWithSharp(
    createPosterRenderInput({
      posterRatingsLayout: 'top',
      ageRatingBadgePosition: 'top-center',
      posterQualityBadgesPosition: 'auto',
    }),
    { ...phases },
  );

  const topCenter = await samplePixel(explicitTop.body, 200, 42);
  const bottomCenter = await samplePixel(explicitTop.body, 200, 560);

  assert.ok(topCenter.r < 240 || topCenter.g < 240 || topCenter.b < 240);
  assert.ok(bottomCenter.r < 240 || bottomCenter.g < 240 || bottomCenter.b < 240);
});

test('image route renderer can place the certification badge on a bottom anchor without moving shared quality badges', async () => {
  const explicitBottom = await renderWithSharp(
    createPosterRenderInput({
      posterRatingsLayout: 'top',
      ageRatingBadgePosition: 'bottom-center',
      posterQualityBadgesPosition: 'auto',
    }),
    { ...phases },
  );

  const bottomCenter = await samplePixel(explicitBottom.body, 200, 560);
  const topCenter = await samplePixel(explicitBottom.body, 200, 42);

  assert.ok(bottomCenter.r < 240 || bottomCenter.g < 240 || bottomCenter.b < 240);
  assert.ok(topCenter.r > 240 && topCenter.g > 240 && topCenter.b > 240);
});

test('image route renderer can place the certification badge on a side anchor for side poster layouts', async () => {
  const explicitSide = await renderWithSharp(
    createPosterRenderInput({
      posterRatingsLayout: 'left',
      ageRatingBadgePosition: 'right-center',
    }),
    { ...phases },
  );

  const rightCenter = await samplePixel(explicitSide.body, 340, 300);

  assert.ok(rightCenter.r < 240 || rightCenter.g < 240 || rightCenter.b < 240);
});

test('image route renderer falls back to inherited placement for unsupported age rating anchors', async () => {
  const unsupported = await renderWithSharp(
    createPosterRenderInput({
      posterRatingsLayout: 'top',
      ageRatingBadgePosition: 'left-center',
    }),
    { ...phases },
  );

  const leftCenter = await samplePixel(unsupported.body, 60, 300);

  assert.ok(leftCenter.r > 240 && leftCenter.g > 240 && leftCenter.b > 240);
});

test('image route renderer does not render a standalone age rating badge when certification is disabled', async () => {
  const explicitWithoutCertification = await renderWithSharp(
    createPosterRenderInput({
      ageRatingBadgePosition: 'top-center',
      qualityBadges: [createQualityBadge('hdr', 'HDR')],
    }),
    { ...phases },
  );

  const topCenter = await samplePixel(explicitWithoutCertification.body, 200, 42);

  assert.ok(topCenter.r > 240 && topCenter.g > 240 && topCenter.b > 240);
});