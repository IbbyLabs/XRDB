import test from 'node:test';
import assert from 'node:assert/strict';

import sharp from 'sharp';

import { renderWithSharp } from '../lib/imageRouteRenderer.ts';
import { buildQualityBadgeRowOverlays } from '../lib/imageRouteQualityPlacement.ts';

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

const hasNonWhitePixelInRect = async (buffer, left, top, width, height) => {
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let y = top; y < Math.min(info.height, top + height); y += 1) {
    for (let x = left; x < Math.min(info.width, left + width); x += 1) {
      const pixelIndex = (y * info.width + x) * info.channels;
      const r = data[pixelIndex];
      const g = data[pixelIndex + 1];
      const b = data[pixelIndex + 2];
      if (r < 240 || g < 240 || b < 240) {
        return true;
      }
    }
  }

  return false;
};

const countNonWhitePixelsInRect = async (buffer, left, top, width, height) => {
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  let count = 0;
  for (let y = top; y < Math.min(info.height, top + height); y += 1) {
    for (let x = left; x < Math.min(info.width, left + width); x += 1) {
      const pixelIndex = (y * info.width + x) * info.channels;
      const r = data[pixelIndex];
      const g = data[pixelIndex + 1];
      const b = data[pixelIndex + 2];
      if (r < 240 || g < 240 || b < 240) {
        count += 1;
      }
    }
  }

  return count;
};

const countBrightPixelsInRect = async (buffer, left, top, width, height) => {
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  let count = 0;
  for (let y = top; y < Math.min(info.height, top + height); y += 1) {
    for (let x = left; x < Math.min(info.width, left + width); x += 1) {
      const pixelIndex = (y * info.width + x) * info.channels;
      const r = data[pixelIndex];
      const g = data[pixelIndex + 1];
      const b = data[pixelIndex + 2];
      if (r > 185 && g > 185 && b > 185) {
        count += 1;
      }
    }
  }

  return count;
};

const createPosterRenderInput = ({
  imgUrl,
  posterQualityBadgeOffsetX = 0,
  posterQualityBadgeOffsetY = 0,
  qualityBadges = [createQualityBadge('hdr', 'HDR')],
  posterTitleText = null,
  posterLogoUrl = null,
}) => ({
  imageType: 'poster',
  ratingPresentation: 'standard',
  aggregateRatingSource: 'combined',
  blockbusterDensity: 'balanced',
  outputFormat: 'png',
  imgUrl,
  imgFallbackUrl: null,
  outputWidth: 400,
  outputHeight: 600,
  finalOutputHeight: 600,
  logoBadgeBandHeight: 0,
  logoBadgeMaxWidth: 0,
  logoBadgesPerRow: 0,
  posterRowHorizontalInset: 24,
  posterTitleText,
  posterLogoUrl,
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
  qualityBadges,
  qualityBadgesSide: 'left',
  posterQualityBadgesPosition: 'auto',
  posterQualityBadgeOffsetX,
  posterQualityBadgeOffsetY,
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
});

const phases = { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 };

test('poster quality badge X and Y offsets move the rendered badge position', async () => {
  const sourceSvg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'><rect width='400' height='600' fill='#ffffff'/></svg>";
  const imgUrl = `data:image/svg+xml,${encodeURIComponent(sourceSvg)}`;
  const baseline = await renderWithSharp(
    createPosterRenderInput({ imgUrl }),
    { ...phases },
  );
  const shifted = await renderWithSharp(
    createPosterRenderInput({
      imgUrl,
      posterQualityBadgeOffsetX: -110,
      posterQualityBadgeOffsetY: -120,
    }),
    { ...phases },
  );

  const baselineBottomCenter = await hasNonWhitePixelInRect(baseline.body, 140, 520, 120, 60);
  const shiftedBottomCenter = await hasNonWhitePixelInRect(shifted.body, 140, 520, 120, 60);
  const shiftedUpperLeft = await hasNonWhitePixelInRect(shifted.body, 20, 390, 150, 80);

  assert.ok(baselineBottomCenter);
  assert.equal(shiftedBottomCenter, false);
  assert.ok(shiftedUpperLeft);
});

test('poster quality badge offsets clamp to safe render bounds', async () => {
  const sourceSvg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'><rect width='400' height='600' fill='#ffffff'/></svg>";
  const imgUrl = `data:image/svg+xml,${encodeURIComponent(sourceSvg)}`;
  const clamped = await renderWithSharp(
    createPosterRenderInput({
      imgUrl,
      posterQualityBadgeOffsetX: -320,
      posterQualityBadgeOffsetY: 320,
    }),
    { ...phases },
  );

  const leftEdgeBandHasBadge = await hasNonWhitePixelInRect(clamped.body, 20, 520, 140, 70);
  const rightCenterBandHasBadge = await hasNonWhitePixelInRect(clamped.body, 240, 520, 140, 70);

  assert.ok(leftEdgeBandHasBadge);
  assert.equal(rightCenterBandHasBadge, false);
});

test('poster trending tags render in center region above logo while regular quality badges stay in bottom row', async () => {
  const sourceSvg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'><rect width='400' height='600' fill='#ffffff'/></svg>";
  const logoSvg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='220' height='80' viewBox='0 0 220 80'><rect width='220' height='80' rx='14' fill='#111827'/></svg>";
  const imgUrl = `data:image/svg+xml,${encodeURIComponent(sourceSvg)}`;
  const posterLogoUrl = `data:image/svg+xml,${encodeURIComponent(logoSvg)}`;

  const baseline = await renderWithSharp(
    createPosterRenderInput({
      imgUrl,
      posterTitleText: 'Sample',
      posterLogoUrl,
      qualityBadges: [createQualityBadge('hdr', 'HDR')],
    }),
    { ...phases },
  );
  const withTrending = await renderWithSharp(
    createPosterRenderInput({
      imgUrl,
      posterTitleText: 'Sample',
      posterLogoUrl,
      qualityBadges: [
        createQualityBadge('hdr', 'HDR'),
        createQualityBadge('trendingtoday', 'Trending Today'),
        createQualityBadge('trendingweek', 'Trending This Week'),
      ],
    }),
    { ...phases },
  );

  const baselineCenterCount = await countNonWhitePixelsInRect(baseline.body, 80, 250, 240, 210);
  const trendingCenterCount = await countNonWhitePixelsInRect(withTrending.body, 80, 250, 240, 210);
  const baselineBottom = await hasNonWhitePixelInRect(baseline.body, 120, 510, 160, 70);
  const trendingBottom = await hasNonWhitePixelInRect(withTrending.body, 120, 510, 160, 70);

  assert.ok(trendingCenterCount > baselineCenterCount + 500);
  assert.ok(baselineBottom);
  assert.ok(trendingBottom);
});

test('auto-minimal trending tags do not occlude clean genre label in poster layouts', async () => {
  const sourceSvg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'><defs><linearGradient id='bg' x1='0' y1='0' x2='0' y2='1'><stop offset='0%' stop-color='#1f2937'/><stop offset='60%' stop-color='#111827'/><stop offset='100%' stop-color='#030712'/></linearGradient></defs><rect width='400' height='600' fill='url(#bg)'/></svg>";
  const imgUrl = `data:image/svg+xml,${encodeURIComponent(sourceSvg)}`;

  const baseInput = createPosterRenderInput({
    imgUrl,
    posterTitleText: 'Breaking Bad',
    qualityBadges: [createQualityBadge('hdr', 'HDR')],
  });

  const genreBadge = {
    familyId: 'crime',
    label: 'Crime',
    accentColor: '#22c55e',
    mode: 'text',
    style: 'clean',
    position: 'bottomCenter',
    scalePercent: 118,
    borderWidth: 1,
    backgroundOpacity: 56,
  };

  const noTrending = await renderWithSharp(
    {
      ...baseInput,
      genreBadge,
      trendingTagPosition: 'auto',
      trendingTagStylePreset: 'auto-minimal',
    },
    { ...phases },
  );

  const withTrending = await renderWithSharp(
    {
      ...baseInput,
      genreBadge,
      qualityBadges: [
        createQualityBadge('hdr', 'HDR'),
        createQualityBadge('bingeready', 'Binge Ready'),
        createQualityBadge('fanfavourite', 'Fan Favourite'),
      ],
      trendingTagPosition: 'auto',
      trendingTagStylePreset: 'auto-minimal',
    },
    { ...phases },
  );

  const noTrendingGenreBright = await countBrightPixelsInRect(noTrending.body, 120, 556, 160, 24);
  const withTrendingGenreBright = await countBrightPixelsInRect(withTrending.body, 120, 556, 160, 24);
  const withTrendingTagBright = await countBrightPixelsInRect(withTrending.body, 40, 480, 320, 70);

  assert.ok(noTrendingGenreBright > 150);
  assert.ok(withTrendingTagBright > 1200);
  assert.ok(withTrendingGenreBright > Math.floor(noTrendingGenreBright * 0.7));
});

test('adaptive plain plate appears on busy backgrounds and stays off on flat backgrounds', async () => {
  const flatSvg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'><rect width='400' height='600' fill='#ffffff'/></svg>";
  const noisySvg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'><defs><pattern id='p' width='8' height='8' patternUnits='userSpaceOnUse'><rect width='8' height='8' fill='#ffffff'/><rect width='4' height='4' fill='#0f172a'/><rect x='4' y='4' width='4' height='4' fill='#0f172a'/></pattern></defs><rect width='400' height='600' fill='url(#p)'/></svg>";
  const flatUrl = `data:image/svg+xml,${encodeURIComponent(flatSvg)}`;
  const noisyUrl = `data:image/svg+xml,${encodeURIComponent(noisySvg)}`;

  const overlay = buildQualityBadgeRowOverlays({
    rowBadges: [createQualityBadge('hdr', 'HDR')],
    rowY: 530,
    origin: 'bottom',
    align: 'center',
    imageType: 'poster',
    outputWidth: 400,
    referenceBadgeHeight: 50,
    qualityBadgeScalePercent: 100,
    badgeGap: 10,
    qualityBadgesStyle: 'plain',
    posterEdgeInset: 24,
    backdropEdgeInset: 12,
  })[0];

  assert.ok(overlay);

  const sampleX = Math.max(0, overlay.left - 3);
  const sampleY = Math.round(overlay.top + overlay.height / 2);

  const flat = await renderWithSharp(createPosterRenderInput({ imgUrl: flatUrl }), { ...phases });
  const noisy = await renderWithSharp(createPosterRenderInput({ imgUrl: noisyUrl }), { ...phases });

  const flatPixel = await samplePixel(flat.body, sampleX, sampleY);
  const noisyPixel = await samplePixel(noisy.body, sampleX, sampleY);

  assert.ok(flatPixel.r > 240 && flatPixel.g > 240 && flatPixel.b > 240);
  assert.ok(noisyPixel.r < 220 || noisyPixel.g < 220 || noisyPixel.b < 220);
});
