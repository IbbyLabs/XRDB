import test from 'node:test';
import assert from 'node:assert/strict';

import sharp from 'sharp';

import { renderWithSharp } from '../lib/imageRouteRenderer.ts';

const SCOREBAR_GLOBAL_Y = 577;
const BAR_LEFT_X = 48;

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

const colorDistance = (left, right) =>
  Math.sqrt(
    (left.r - right.r) ** 2 +
      (left.g - right.g) ** 2 +
      (left.b - right.b) ** 2,
  );

const countDifferentPixelsInRect = async (
  leftBuffer,
  rightBuffer,
  left,
  top,
  width,
  height,
  differenceThreshold = 22,
) => {
  const [leftRaw, rightRaw] = await Promise.all([
    sharp(leftBuffer).raw().toBuffer({ resolveWithObject: true }),
    sharp(rightBuffer).raw().toBuffer({ resolveWithObject: true }),
  ]);

  const maxY = Math.min(leftRaw.info.height, top + height);
  const maxX = Math.min(leftRaw.info.width, left + width);
  let different = 0;

  for (let y = top; y < maxY; y += 1) {
    for (let x = left; x < maxX; x += 1) {
      const idx = (y * leftRaw.info.width + x) * leftRaw.info.channels;
      const dr = Math.abs(leftRaw.data[idx] - rightRaw.data[idx]);
      const dg = Math.abs(leftRaw.data[idx + 1] - rightRaw.data[idx + 1]);
      const db = Math.abs(leftRaw.data[idx + 2] - rightRaw.data[idx + 2]);
      if (dr > differenceThreshold || dg > differenceThreshold || db > differenceThreshold) {
        different += 1;
      }
    }
  }

  return different;
};

const createScorebarInput = (style) => {
  const sourceSvg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'><rect width='400' height='600' fill='#ffffff'/></svg>";
  return {
    imageType: 'poster',
    ratingPresentation: 'scorebar',
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
    scorebarBandHeight: 28,
    scorebarConfig: {
      style,
      lowColor: '#ff0000',
      midColor: '#00ff00',
      highColor: '#0000ff',
      lowThreshold: 35,
      highThreshold: 70,
    },
    scorebarNormalizedScore: 90,
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
    qualityBadges: [],
    trendingTagPosition: 'auto',
    trendingTagStylePreset: 'auto-minimal',
    trendingTagTextColor: null,
    qualityBadgesSide: 'left',
    posterQualityBadgesPosition: 'auto',
    posterQualityBadgeOffsetX: 0,
    posterQualityBadgeOffsetY: 0,
    ageRatingBadgePosition: 'inherit',
    qualityBadgesStyle: 'plain',
    qualityBadgeScalePercent: 100,
    posterRatingsLayout: 'top',
    posterRatingsMaxPerSide: null,
    posterEdgeInset: 24,
    backdropRatingsLayout: 'top',
    backdropBottomRatingsRow: false,
    sideRatingsPosition: 'center',
    sideRatingsOffset: 0,
    ratingStyle: 'plain',
    iconShape: 'rounded',
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
  };
};

const phases = { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 };

test('scorebar progress style renders segment gaps that are not present in solid style', async () => {
  const solid = await renderWithSharp(createScorebarInput('solid'), { ...phases });
  const progress = await renderWithSharp(createScorebarInput('progress'), { ...phases });

  const segmentPixelX = BAR_LEFT_X + 23;
  const gapPixelX = BAR_LEFT_X + 29;

  const solidSegmentPixel = await samplePixel(solid.body, segmentPixelX, SCOREBAR_GLOBAL_Y);
  const solidGapPixel = await samplePixel(solid.body, gapPixelX, SCOREBAR_GLOBAL_Y);
  const progressSegmentPixel = await samplePixel(progress.body, segmentPixelX, SCOREBAR_GLOBAL_Y);
  const progressGapPixel = await samplePixel(progress.body, gapPixelX, SCOREBAR_GLOBAL_Y);

  assert.ok(colorDistance(solidSegmentPixel, solidGapPixel) < 25);
  assert.ok(colorDistance(progressSegmentPixel, progressGapPixel) > 50);
});

test('scorebar gradient style has visible color shift across fill unlike solid style', async () => {
  const solid = await renderWithSharp(createScorebarInput('solid'), { ...phases });
  const gradient = await renderWithSharp(createScorebarInput('gradient'), { ...phases });

  const changedPixels = await countDifferentPixelsInRect(
    solid.body,
    gradient.body,
    BAR_LEFT_X,
    SCOREBAR_GLOBAL_Y - 10,
    304,
    20,
  );

  assert.ok(changedPixels > 350, `expected strong gradient-vs-solid visual difference, got ${changedPixels}`);
});
