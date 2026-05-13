import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildQualityBadgeColumnOverlays,
  buildQualityBadgeColumnOverlaysAt,
  buildQualityBadgeRowOverlays,
  measureQualityBadgeColumnWidth,
} from '../lib/imageRouteQualityPlacement.ts';

test('image route quality placement stacks right aligned poster columns', () => {
  const overlays = buildQualityBadgeColumnOverlays({
    columnBadges: [
      { key: '4k', label: '4K' },
      { key: 'hdr', label: 'HDR' },
    ],
    startY: 30,
    side: 'right',
    imageType: 'poster',
    outputWidth: 320,
    outputHeight: 640,
    badgeTopOffset: 20,
    badgeBottomOffset: 24,
    referenceBadgeHeight: 48,
    qualityBadgeScalePercent: 100,
    badgeGap: 10,
    qualityBadgesStyle: 'glass',
    posterEdgeInset: 18,
    backdropEdgeInset: 12,
  });

  assert.equal(overlays.length, 2);
  assert.equal(overlays[0].top, 30);
  assert.equal(overlays[1].top > overlays[0].top, true);
  assert.equal(overlays[0].left, 320 - overlays[0].width - 18);
});

test('image route quality placement centers poster row overlays across multiple rows', () => {
  const overlays = buildQualityBadgeRowOverlays({
    rowBadges: [
      { key: '4k', label: '4K' },
      { key: 'hdr', label: 'HDR' },
      { key: 'remux', label: 'Remux' },
      { key: 'bluray', label: 'BluRay' },
    ],
    rowY: 80,
    origin: 'top',
    imageType: 'poster',
    outputWidth: 420,
    referenceBadgeHeight: 52,
    qualityBadgeScalePercent: 100,
    badgeGap: 10,
    qualityBadgesStyle: 'plain',
    posterEdgeInset: 16,
    backdropEdgeInset: 12,
  });

  assert.equal(overlays.length, 4);
  const rowTops = [...new Set(overlays.map((overlay) => overlay.top))];
  assert.equal(rowTops.length, 2);
  assert.equal(rowTops[0], 80);
  assert.equal(rowTops[1] > rowTops[0], true);
  assert.equal(
    overlays.every((overlay) => overlay.left >= 16 && overlay.left + overlay.width <= 420 - 16),
    true
  );
});

test('image route quality placement measures uniform column widths for non intrinsic styles', () => {
  const width = measureQualityBadgeColumnWidth({
    columnBadges: [
      { key: '4k', label: '4K' },
      { key: 'hdr', label: 'HDR' },
    ],
    qualityHeight: 44,
    qualityBadgesStyle: 'glass',
    uniformBadgeWidth: 92,
  });

  assert.equal(width, 92);
});

test('image route quality placement preserves intrinsic widths for text badges in non intrinsic styles', () => {
  for (const qualityBadgesStyle of ['glass', 'square', 'plain']) {
    const width = measureQualityBadgeColumnWidth({
      columnBadges: [
        { key: '4k', label: '4K' },
        { key: 'releasestatus', label: 'Digital Release' },
      ],
      qualityHeight: 44,
      qualityBadgesStyle,
      uniformBadgeWidth: 92,
    });

    assert.ok(width > 120, `${qualityBadgesStyle} width ${width}`);
  }
});

test('image route quality placement clamps explicit backdrop column positions', () => {
  const overlays = buildQualityBadgeColumnOverlaysAt({
    columnBadges: [{ key: '4k', label: '4K' }],
    startY: 24,
    x: -120,
    qualityHeight: 44,
    uniformBadgeWidth: 96,
    imageType: 'backdrop',
    outputWidth: 300,
    badgeTopOffset: 18,
    badgeGap: 10,
    qualityBadgesStyle: 'plain',
    posterEdgeInset: 20,
    backdropEdgeInset: 24,
  });

  assert.equal(overlays.length, 1);
  assert.equal(overlays[0].left, 24);
  assert.equal(overlays[0].top, 24);
});

test('image route quality placement keeps release status overlays wider than the fixed badge lane', () => {
  for (const qualityBadgesStyle of ['glass', 'square', 'plain']) {
    const overlays = buildQualityBadgeRowOverlays({
      rowBadges: [{ key: 'releasestatus', label: 'In Cinemas' }],
      rowY: 72,
      origin: 'top',
      imageType: 'poster',
      outputWidth: 420,
      referenceBadgeHeight: 52,
      qualityBadgeScalePercent: 100,
      badgeGap: 10,
      qualityBadgesStyle,
      posterEdgeInset: 16,
      backdropEdgeInset: 12,
    });

    assert.equal(overlays.length, 1);
    assert.ok(overlays[0].width > 100, `${qualityBadgesStyle} width ${overlays[0].width}`);
  }
});

test('image route quality placement clamps intrinsic full-badge width in poster rows', () => {
  const wideIconUrl =
    'data:image/svg+xml;base64,' +
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40"><rect width="220" height="40" rx="8" fill="#111827"/></svg>',
    ).toString('base64');

  const overlays = buildQualityBadgeRowOverlays({
    rowBadges: [
      { key: '4k', label: '4K', iconUrl: wideIconUrl, fullBadge: true },
      { key: 'dolbyvision', label: 'Dolby Vision', iconUrl: wideIconUrl, fullBadge: true },
      { key: 'dolbyatmos', label: 'Dolby Atmos', iconUrl: wideIconUrl, fullBadge: true },
    ],
    rowY: 84,
    origin: 'top',
    imageType: 'poster',
    outputWidth: 420,
    referenceBadgeHeight: 52,
    qualityBadgeScalePercent: 170,
    badgeGap: 10,
    qualityBadgesStyle: 'glass',
    posterEdgeInset: 24,
    backdropEdgeInset: 12,
  });

  assert.equal(overlays.length, 3);
  assert.equal(overlays.every((overlay) => overlay.width <= 372), true);
  assert.equal(overlays.every((overlay) => overlay.left >= 24), true);
  assert.equal(overlays.every((overlay) => overlay.left + overlay.width <= 396), true);
});

test('image route quality placement clamps intrinsic full-badge width in backdrop columns', () => {
  const wideIconUrl =
    'data:image/svg+xml;base64,' +
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 40"><rect width="260" height="40" rx="8" fill="#38bdf8"/></svg>',
    ).toString('base64');

  const overlays = buildQualityBadgeColumnOverlaysAt({
    columnBadges: [
      { key: '4k', label: '4K', iconUrl: wideIconUrl, fullBadge: true },
      { key: 'dolbyatmos', label: 'Dolby Atmos', iconUrl: wideIconUrl, fullBadge: true },
    ],
    startY: 24,
    x: 120,
    qualityHeight: 64,
    uniformBadgeWidth: 112,
    imageType: 'backdrop',
    outputWidth: 360,
    badgeTopOffset: 18,
    badgeGap: 10,
    qualityBadgesStyle: 'plain',
    posterEdgeInset: 20,
    backdropEdgeInset: 24,
  });

  assert.equal(overlays.length, 2);
  assert.equal(overlays.every((overlay) => overlay.width <= 312), true);
  assert.equal(overlays.every((overlay) => overlay.left >= 24), true);
  assert.equal(overlays.every((overlay) => overlay.left + overlay.width <= 336), true);
});
