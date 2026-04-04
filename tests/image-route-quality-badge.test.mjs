import test from 'node:test';
import assert from 'node:assert/strict';

import sharp from 'sharp';

import {
  buildQualityBadgeSvg,
  getBadgeIconRadius,
  getBadgeOuterRadius,
  usesIntrinsicQualityBadgeWidths,
} from '../lib/imageRouteQualityBadge.ts';

test('image route quality badge helpers derive expected radii', () => {
  assert.equal(getBadgeOuterRadius(40, 'glass'), 20);
  assert.equal(getBadgeOuterRadius(40, 'square'), 10);
  assert.equal(getBadgeOuterRadius(40, 'stacked'), 12);

  assert.equal(getBadgeIconRadius(24, 'glass'), 12);
  assert.equal(getBadgeIconRadius(24, 'square'), 6);
  assert.equal(getBadgeIconRadius(24, 'stacked'), 7);
});

test('image route quality badge helper marks intrinsic width styles', () => {
  assert.equal(usesIntrinsicQualityBadgeWidths('media'), true);
  assert.equal(usesIntrinsicQualityBadgeWidths('silver'), true);
  assert.equal(usesIntrinsicQualityBadgeWidths('glass'), false);
  assert.equal(usesIntrinsicQualityBadgeWidths('glass', { key: 'releasestatus' }), true);
  assert.equal(usesIntrinsicQualityBadgeWidths('square', { key: '4k' }), false);
});

test('image route quality badge builds media certification output', () => {
  const spec = buildQualityBadgeSvg({ key: 'certification', label: 'PG 13' }, 44, undefined, 'media');

  assert.ok(spec);
  assert.equal(spec.height, 40);
  assert.match(spec.svg, /AGE/);
  assert.match(spec.svg, /PG 13/);
});

test('image route quality badge builds asset backed plain output', () => {
  const spec = buildQualityBadgeSvg({ key: '4k', label: '4K' }, 46, undefined, 'plain');

  assert.ok(spec);
  assert.ok(spec.width > 0);
  assert.match(spec.svg, /<image /);
  assert.match(spec.svg, /quality-badge-logo-shadow/);
});

test('image route quality badge applies no background outline for plain style text', () => {
  const spec = buildQualityBadgeSvg(
    {
      key: 'netflix',
      label: 'Netflix',
      noBackgroundOutlineColor: '#101010',
      noBackgroundOutlineWidth: 2,
    },
    44,
    undefined,
    'plain',
  );

  assert.ok(spec);
  assert.match(spec.svg, /stroke="#101010"/);
  assert.match(spec.svg, /stroke-width="2"/);
  assert.match(spec.svg, /paint-order="stroke fill"/);
});

test('image route quality badge renders streaming provider logos when icon data is present', () => {
  const iconDataUri =
    'data:image/svg+xml;base64,' +
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" rx="6" fill="#E50914"/></svg>',
    ).toString('base64');
  const spec = buildQualityBadgeSvg(
    {
      key: 'netflix',
      label: 'Netflix',
      accentColor: '#e50914',
      iconDataUri,
    },
    44,
    undefined,
    'glass',
  );

  assert.ok(spec);
  assert.match(spec.svg, /<image /);
  assert.match(spec.svg, /NETFLIX/);
});

test('image route quality badge returns null for unsupported keys', () => {
  assert.equal(buildQualityBadgeSvg({ key: 'unknown', label: 'Unknown' }, 40, undefined, 'glass'), null);
});

test('image route quality badge leaves extra width for long plain and silver network labels', async () => {
  const badgeCases = [
    { key: 'appletvplus', label: 'Apple TV Plus', minWidth: 126 },
    { key: 'primevideo', label: 'Prime Video', minWidth: 118 },
  ];

  for (const style of ['plain', 'silver']) {
    for (const badgeCase of badgeCases) {
      const spec = buildQualityBadgeSvg({ key: badgeCase.key, label: badgeCase.label }, 44, undefined, style);

      assert.ok(spec);
      assert.ok(spec.width >= badgeCase.minWidth, `${style} ${badgeCase.key} width ${spec.width}`);

      const { data, info } = await sharp(Buffer.from(spec.svg))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let maxOpaqueX = -1;
      for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
          const alpha = data[(y * info.width + x) * info.channels + 3];
          if (alpha > 160 && x > maxOpaqueX) {
            maxOpaqueX = x;
          }
        }
      }

      assert.ok(maxOpaqueX >= 0);
      assert.ok(info.width - 1 - maxOpaqueX >= 14, `${style} ${badgeCase.key} right margin ${info.width - 1 - maxOpaqueX}`);
    }
  }
});

test('image route quality badge leaves extra width for release status labels in glass square and plain styles', async () => {
  const badgeCases = [
    { label: 'Digital Release', minWidth: 132 },
    { label: 'In Cinemas', minWidth: 108 },
  ];

  for (const style of ['glass', 'square', 'plain']) {
    for (const badgeCase of badgeCases) {
      const spec = buildQualityBadgeSvg(
        { key: 'releasestatus', label: badgeCase.label },
        44,
        undefined,
        style,
      );

      assert.ok(spec);
      assert.ok(spec.width >= badgeCase.minWidth, `${style} ${badgeCase.label} width ${spec.width}`);
    }
  }
});
