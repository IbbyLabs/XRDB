import { buildPosterTitleSvg } from './imageRouteText.ts';
import type { RenderedImagePayload } from './imageRouteRuntime.ts';

export type PosterCleanOverlayAsset = {
  buffer: Buffer;
  width: number;
  height: number;
};

type SharpMetadata = {
  width?: number;
  height?: number;
};

type SharpResizeChain = {
  png(): {
    toBuffer(): Promise<Buffer>;
  };
};

type SharpImageLike = {
  metadata(): Promise<SharpMetadata>;
  resize(width: number, height: number, options: { fit: 'fill' }): SharpResizeChain;
};

type SharpImageFactory = (input: Buffer) => SharpImageLike;

export const buildPosterCleanOverlayAsset = async ({
  imageType,
  posterTitleText,
  posterLogoUrl,
  posterRowRegionWidth,
  outputWidth,
  outputHeight,
  sharp,
  getSourceImagePayload,
}: {
  imageType: 'poster' | 'backdrop' | 'logo';
  posterTitleText?: string | null;
  posterLogoUrl?: string | null;
  posterRowRegionWidth: number;
  outputWidth: number;
  outputHeight: number;
  sharp: SharpImageFactory;
  getSourceImagePayload: (url: string) => Promise<RenderedImagePayload>;
}): Promise<PosterCleanOverlayAsset | null> => {
  if (imageType !== 'poster') return null;

  const titleSpec = posterTitleText
    ? buildPosterTitleSvg(posterTitleText, posterRowRegionWidth)
    : null;

  if (posterLogoUrl) {
    try {
      const logoPayload = await getSourceImagePayload(posterLogoUrl);
      const logoBuffer = Buffer.from(logoPayload.body);
      const logoMeta = await sharp(logoBuffer).metadata();
      if (logoMeta.width && logoMeta.height) {
        const maxLogoWidth = Math.min(posterRowRegionWidth, Math.round(outputWidth * 0.78));
        const maxLogoHeight = Math.max(48, Math.round(outputHeight * 0.16));
        const scale = Math.min(
          1,
          maxLogoWidth / logoMeta.width,
          maxLogoHeight / logoMeta.height
        );
        const logoWidth = Math.max(1, Math.round(logoMeta.width * scale));
        const logoHeight = Math.max(1, Math.round(logoMeta.height * scale));
        const resizedLogoBuffer = await sharp(logoBuffer)
          .resize(logoWidth, logoHeight, { fit: 'fill' })
          .png()
          .toBuffer();

        return {
          buffer: resizedLogoBuffer,
          width: logoWidth,
          height: logoHeight,
        };
      }
    } catch {
    }
  }

  if (!titleSpec) return null;

  return {
    buffer: Buffer.from(titleSpec.svg),
    width: titleSpec.width,
    height: titleSpec.height,
  };
};

export const resolvePosterCleanOverlayPlacement = ({
  overlay,
  bottomBlockTopY,
  topRowBottom,
  badgeGap,
  outputWidth,
  posterRowHorizontalInset,
}: {
  overlay: PosterCleanOverlayAsset | null;
  bottomBlockTopY: number;
  topRowBottom: number;
  badgeGap: number;
  outputWidth: number;
  posterRowHorizontalInset: number;
}) => {
  if (!overlay) return null;

  const overlayGap = Math.max(8, Math.round(badgeGap * 0.9));
  let top = Math.round(bottomBlockTopY - overlayGap - overlay.height);
  if (top < topRowBottom) {
    top = topRowBottom;
  }
  if (top + overlay.height + overlayGap > bottomBlockTopY) {
    return null;
  }

  return {
    top,
    left: Math.max(
      posterRowHorizontalInset,
      Math.round((outputWidth - overlay.width) / 2)
    ),
  };
};
