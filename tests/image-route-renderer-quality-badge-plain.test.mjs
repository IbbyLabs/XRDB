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
  trendingTagPosition,
  trendingTagStylePreset,
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
  trendingTagPosition,
  trendingTagStylePreset,
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

test('poster trending tags respect top-left and top-right anchor positions', async () => {
  const sourceSvg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'><rect width='400' height='600' fill='#ffffff'/></svg>";
  const imgUrl = `data:image/svg+xml,${encodeURIComponent(sourceSvg)}`;
  const trendingOnlyBadges = [
    createQualityBadge('trendingtoday', 'Trending Today'),
    createQualityBadge('trendingweek', 'Trending This Week'),
    createQualityBadge('bingeready', 'Binge Ready'),
  ];

  const topLeft = await renderWithSharp(
    createPosterRenderInput({
      imgUrl,
      qualityBadges: trendingOnlyBadges,
      trendingTagPosition: 'top-left',
      trendingTagStylePreset: 'community-badge',
    }),
    { ...phases },
  );
  const topRight = await renderWithSharp(
    createPosterRenderInput({
      imgUrl,
      qualityBadges: trendingOnlyBadges,
      trendingTagPosition: 'top-right',
      trendingTagStylePreset: 'community-badge',
    }),
    { ...phases },
  );

  const leftRegionTopLeft = await countNonWhitePixelsInRect(topLeft.body, 8, 14, 170, 220);
  const rightRegionTopLeft = await countNonWhitePixelsInRect(topLeft.body, 222, 14, 170, 220);
  const leftRegionTopRight = await countNonWhitePixelsInRect(topRight.body, 8, 14, 170, 220);
  const rightRegionTopRight = await countNonWhitePixelsInRect(topRight.body, 222, 14, 170, 220);

  assert.ok(leftRegionTopLeft > rightRegionTopLeft + 350);
  assert.ok(rightRegionTopRight > leftRegionTopRight + 350);
});

test('styled poster trending badges scale up with larger poster outputs', async () => {
  const sourceSvg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='2000' height='2926' viewBox='0 0 2000 2926'><rect width='2000' height='2926' fill='#ffffff'/></svg>";
  const imgUrl = `data:image/svg+xml,${encodeURIComponent(sourceSvg)}`;
  const trendingOnlyBadges = [
    createQualityBadge('trendingtoday', 'Trending Today'),
    createQualityBadge('trendingweek', 'Trending This Week'),
  ];

  const normal = await renderWithSharp(
    createPosterRenderInput({
      imgUrl,
      qualityBadges: trendingOnlyBadges,
      trendingTagPosition: 'top-left',
      trendingTagStylePreset: 'community-badge',
      posterQualityBadgeOffsetX: 0,
      posterQualityBadgeOffsetY: 0,
    }),
    { ...phases },
  );

  const fourK = await renderWithSharp(
    {
      ...createPosterRenderInput({
        imgUrl,
        qualityBadges: trendingOnlyBadges,
        trendingTagPosition: 'top-left',
        trendingTagStylePreset: 'community-badge',
      }),
      outputWidth: 2000,
      outputHeight: 2926,
      finalOutputHeight: 2926,
      badgeIconSize: 92,
      badgeFontSize: 68,
      badgePaddingX: 38,
      badgePaddingY: 24,
      badgeGap: 22,
      badgeTopOffset: 56,
      badgeBottomOffset: 56,
      posterEdgeInset: 56,
      posterRowHorizontalInset: 56,
    },
    { ...phases },
  );

  const normalTopLeftDensity = await countNonWhitePixelsInRect(normal.body, 8, 14, 170, 220);
  const fourKTopLeftDensity = await countNonWhitePixelsInRect(fourK.body, 40, 40, 760, 720);

  assert.ok(fourKTopLeftDensity > normalTopLeftDensity * 3);
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

  const noTrendingGenreBright = await countBrightPixelsInRect(noTrending.body, 60, 430, 280, 70);
  const withTrendingGenreBright = await countBrightPixelsInRect(withTrending.body, 60, 430, 280, 70);
  const withTrendingTagBright = await countBrightPixelsInRect(withTrending.body, 40, 480, 320, 70);

  assert.ok(noTrendingGenreBright > 150);
  assert.ok(withTrendingTagBright > 300);
  assert.ok(withTrendingGenreBright < Math.floor(noTrendingGenreBright * 0.7));
});

test('explicit top-left trending badges leave a second visible row for top-left genre badges', async () => {
  const sourceSvg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'><rect width='400' height='600' fill='#ffffff'/></svg>";
  const imgUrl = `data:image/svg+xml,${encodeURIComponent(sourceSvg)}`;

  const withGenreOnly = await renderWithSharp(
    {
      ...createPosterRenderInput({ imgUrl }),
      genreBadge: {
        familyId: 'anime',
        label: 'Action',
        accentColor: '#38bdf8',
        mode: 'genre',
        style: 'glass',
        position: 'topLeft',
        scalePercent: 100,
      },
    },
    { ...phases },
  );

  const withTrendingAndGenre = await renderWithSharp(
    {
      ...createPosterRenderInput({
        imgUrl,
        qualityBadges: [
          createQualityBadge('trendingtoday', 'Trending Today'),
          createQualityBadge('bingeready', 'Binge Ready'),
        ],
        trendingTagPosition: 'top-left',
        trendingTagStylePreset: 'community-badge',
      }),
      genreBadge: {
        familyId: 'anime',
        label: 'Action',
        accentColor: '#38bdf8',
        mode: 'genre',
        style: 'glass',
        position: 'topLeft',
        scalePercent: 100,
      },
    },
    { ...phases },
  );

  const genreOnlyLowerBand = await countNonWhitePixelsInRect(withGenreOnly.body, 10, 88, 220, 70);
  const trendingAndGenreTopBand = await countNonWhitePixelsInRect(withTrendingAndGenre.body, 10, 18, 220, 70);
  const trendingAndGenreLowerBand = await countNonWhitePixelsInRect(withTrendingAndGenre.body, 10, 88, 220, 70);

  assert.ok(genreOnlyLowerBand < 250);
  assert.ok(trendingAndGenreTopBand > 900);
  assert.ok(trendingAndGenreLowerBand > 450);
});

test('auto-minimal top-left trending badges leave a second visible row for top-left genre badges', async () => {
  const sourceSvg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600' viewBox='0 0 400 600'><rect width='400' height='600' fill='#ffffff'/></svg>";
  const imgUrl = `data:image/svg+xml,${encodeURIComponent(sourceSvg)}`;

  const withGenreOnly = await renderWithSharp(
    {
      ...createPosterRenderInput({ imgUrl }),
      genreBadge: {
        familyId: 'anime',
        label: 'Action',
        accentColor: '#38bdf8',
        mode: 'genre',
        style: 'glass',
        position: 'topLeft',
        scalePercent: 100,
      },
    },
    { ...phases },
  );

  const withTrendingAndGenre = await renderWithSharp(
    {
      ...createPosterRenderInput({
        imgUrl,
        qualityBadges: [
          createQualityBadge('trendingtoday', 'Trending Today'),
          createQualityBadge('bingeready', 'Binge Ready'),
        ],
        trendingTagPosition: 'top-left',
        trendingTagStylePreset: 'auto-minimal',
      }),
      genreBadge: {
        familyId: 'anime',
        label: 'Action',
        accentColor: '#38bdf8',
        mode: 'genre',
        style: 'glass',
        position: 'topLeft',
        scalePercent: 100,
      },
    },
    { ...phases },
  );

  const genreOnlyLowerBand = await countNonWhitePixelsInRect(withGenreOnly.body, 10, 88, 220, 70);
  const trendingAndGenreTopBand = await countNonWhitePixelsInRect(withTrendingAndGenre.body, 10, 18, 220, 70);
  const trendingAndGenreLowerBand = await countNonWhitePixelsInRect(withTrendingAndGenre.body, 10, 88, 220, 70);

  assert.ok(genreOnlyLowerBand < 250);
  assert.ok(trendingAndGenreTopBand > 650);
  assert.ok(trendingAndGenreLowerBand > 450);
});

test('auto-minimal trending text remains proportionally visible at 4K poster size', async () => {
  const sourceSvg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='2000' height='2926' viewBox='0 0 2000 2926'><rect width='2000' height='2926' fill='#ffffff'/></svg>";
  const imgUrl = `data:image/svg+xml,${encodeURIComponent(sourceSvg)}`;
  const trendingOnlyBadges = [
    createQualityBadge('trendingtoday', 'Trending Today'),
    createQualityBadge('trendingweek', 'Trending This Week'),
  ];

  const normal = await renderWithSharp(
    createPosterRenderInput({
      imgUrl,
      qualityBadges: trendingOnlyBadges,
      trendingTagPosition: 'auto',
      trendingTagStylePreset: 'auto-minimal',
    }),
    { ...phases },
  );

  const fourK = await renderWithSharp(
    {
      ...createPosterRenderInput({
        imgUrl,
        qualityBadges: trendingOnlyBadges,
        trendingTagPosition: 'auto',
        trendingTagStylePreset: 'auto-minimal',
      }),
      outputWidth: 2000,
      outputHeight: 2926,
      finalOutputHeight: 2926,
      badgeIconSize: 92,
      badgeFontSize: 68,
      badgePaddingX: 38,
      badgePaddingY: 24,
      badgeGap: 22,
      badgeTopOffset: 56,
      badgeBottomOffset: 56,
      posterEdgeInset: 56,
      posterRowHorizontalInset: 56,
    },
    { ...phases },
  );

  const sampleByRatio = (width, height) => ({
    x: Math.round(width * 0.1),
    y: Math.round(height * 0.8),
    w: Math.round(width * 0.8),
    h: Math.round(height * 0.1167),
  });

  const normalRegion = sampleByRatio(400, 600);
  const fourKRegion = sampleByRatio(2000, 2926);

  const normalBright = await countBrightPixelsInRect(
    normal.body,
    normalRegion.x,
    normalRegion.y,
    normalRegion.w,
    normalRegion.h,
  );
  const fourKBright = await countBrightPixelsInRect(
    fourK.body,
    fourKRegion.x,
    fourKRegion.y,
    fourKRegion.w,
    fourKRegion.h,
  );

  const normalDensity = normalBright / (normalRegion.w * normalRegion.h);
  const fourKDensity = fourKBright / (fourKRegion.w * fourKRegion.h);

  assert.ok(normalBright > 250);
  assert.ok(fourKBright > 4000);
  assert.ok(
    fourKDensity > normalDensity * 0.55,
    `expected 4k trending text density to remain proportional, normal=${normalDensity.toFixed(4)} 4k=${fourKDensity.toFixed(4)}`,
  );
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
