import { readFileSync } from 'node:fs';
import path from 'node:path';

export type MediaBadgeAssetId = '4k' | 'hdr' | 'bluray' | 'dolbyvision' | 'dolbyatmos' | 'remux';

export type MediaBadgeAsset = {
  fileName: string;
  aspectRatio: number;
  widthRatio: number;
  heightRatio: number;
  horizontalPaddingRatio: number;
  yOffsetRatio?: number;
  dataUri: string;
};

const MEDIA_BADGE_ASSET_DIR = path.join(process.cwd(), 'public', 'assets', 'media-badges');

const loadSvgBadgeAsset = (fileName: string) => {
  const svgMarkup = readFileSync(path.join(MEDIA_BADGE_ASSET_DIR, fileName), 'utf8').trim();
  return `data:image/svg+xml;base64,${Buffer.from(svgMarkup).toString('base64')}`;
};

const createBadgeAsset = (
  asset: Omit<MediaBadgeAsset, 'dataUri'>,
): MediaBadgeAsset => ({
  ...asset,
  dataUri: loadSvgBadgeAsset(asset.fileName),
});

export const MEDIA_BADGE_ASSETS = {
  '4k': createBadgeAsset({
    fileName: '4k-ultra-hd.svg',
    aspectRatio: 191 / 66,
    widthRatio: 2.22,
    heightRatio: 0.72,
    horizontalPaddingRatio: 0.05,
  }),
  hdr: createBadgeAsset({
    fileName: 'hdr10.svg',
    aspectRatio: 288 / 102.7,
    widthRatio: 2.12,
    heightRatio: 0.72,
    horizontalPaddingRatio: 0.05,
  }),
  bluray: createBadgeAsset({
    fileName: 'blu-ray-disc.svg',
    aspectRatio: 420 / 180,
    widthRatio: 2.1,
    heightRatio: 0.74,
    horizontalPaddingRatio: 0.05,
  }),
  dolbyvision: createBadgeAsset({
    fileName: 'dolby-vision.svg',
    aspectRatio: 105.5220032 / 15.6487389,
    widthRatio: 2.38,
    heightRatio: 0.52,
    horizontalPaddingRatio: 0.04,
  }),
  dolbyatmos: createBadgeAsset({
    fileName: 'dolby-atmos.svg',
    aspectRatio: 110.7599945 / 15.6427517,
    widthRatio: 2.48,
    heightRatio: 0.52,
    horizontalPaddingRatio: 0.04,
  }),
  remux: createBadgeAsset({
    fileName: 'remux.svg',
    aspectRatio: 320 / 180,
    widthRatio: 1.72,
    heightRatio: 0.74,
    horizontalPaddingRatio: 0.08,
  }),
} satisfies Record<MediaBadgeAssetId, MediaBadgeAsset>;

export const BLURAY_DISC_LOGO_ASPECT_RATIO = MEDIA_BADGE_ASSETS.bluray.aspectRatio;

export const BLURAY_DISC_LOGO_DATA_URI = MEDIA_BADGE_ASSETS.bluray.dataUri;
