import type sharp from 'sharp';

import {
  fitCompositeOverlaysToCanvas,
  type CompositeOverlayEntry,
} from './compositeOverlay.ts';
import { outputFormatToContentType, type OutputFormat } from './imageRouteMedia.ts';
import type { LogoBackground } from './imageRouteConfig.ts';

export const resolveFinalCompositeBackground = ({
  imageType,
  logoBackground,
}: {
  imageType: 'poster' | 'backdrop' | 'logo';
  logoBackground: LogoBackground;
}) =>
  imageType === 'logo'
    ? logoBackground === 'dark'
      ? { r: 17, g: 24, b: 39, alpha: 1 }
      : { r: 0, g: 0, b: 0, alpha: 0 }
    : { r: 17, g: 17, b: 17, alpha: 1 };

export const renderFinalCompositeImage = async ({
  sharpFactory,
  overlays,
  outputWidth,
  finalOutputHeight,
  imageType,
  logoBackground,
  outputFormat,
}: {
  sharpFactory: typeof sharp;
  overlays: CompositeOverlayEntry[];
  outputWidth: number;
  finalOutputHeight: number;
  imageType: 'poster' | 'backdrop' | 'logo';
  logoBackground: LogoBackground;
  outputFormat: OutputFormat;
}) => {
  const fittedOverlays = await fitCompositeOverlaysToCanvas(
    sharpFactory,
    overlays,
    outputWidth,
    finalOutputHeight,
  );

  const pipeline = sharpFactory({
    create: {
      width: outputWidth,
      height: finalOutputHeight,
      channels: 4,
      background: resolveFinalCompositeBackground({ imageType, logoBackground }),
    },
  }).composite(fittedOverlays);

  if (outputFormat === 'webp') {
    return {
      body: await pipeline.webp({ quality: 80, effort: 3 }).toBuffer(),
      contentType: outputFormatToContentType(outputFormat),
    };
  }

  if (outputFormat === 'jpeg') {
    return {
      body: await pipeline.jpeg({ quality: 82 }).toBuffer(),
      contentType: outputFormatToContentType(outputFormat),
    };
  }

  return {
    body: await pipeline.png({ compressionLevel: 1 }).toBuffer(),
    contentType: outputFormatToContentType(outputFormat),
  };
};
