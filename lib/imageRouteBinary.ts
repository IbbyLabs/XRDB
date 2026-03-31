import {
  getCachedImageFromObjectStorage,
  isObjectStorageConfigured,
  putCachedImageToObjectStorage,
} from './imageObjectStorage.ts';
import { PROVIDER_ICON_CACHE_TTL_MS } from './imageRouteConfig.ts';
import {
  buildProviderIconStorageKey,
  buildSourceImageFallbackCacheControl,
  toImageContentType,
} from './imageRouteSourceUrls.ts';

export const bufferToArrayBuffer = (buffer: Buffer): ArrayBuffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

export const isLightNeutralPixel = (r: number, g: number, b: number, alpha: number) => {
  if (alpha < 200) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max >= 225 && max - min <= 35;
};

export const stripCornerBackgroundFromIcon = async (sharp: any, buffer: Buffer) => {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);
  const { width, height, channels } = info;
  if (!width || !height || channels < 4) {
    return buffer;
  }

  const indexOf = (x: number, y: number) => (y * width + x) * channels;
  const cornerQueue: Array<[number, number]> = [];
  const seen = new Uint8Array(width * height);
  const corners: Array<[number, number]> = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];

  for (const [x, y] of corners) {
    const index = indexOf(x, y);
    if (isLightNeutralPixel(pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3])) {
      cornerQueue.push([x, y]);
    }
  }

  if (cornerQueue.length === 0) {
    return buffer;
  }

  let removedPixelCount = 0;
  for (let queueIndex = 0; queueIndex < cornerQueue.length; queueIndex++) {
    const [x, y] = cornerQueue[queueIndex]!;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const seenIndex = y * width + x;
    if (seen[seenIndex]) continue;
    seen[seenIndex] = 1;

    const index = indexOf(x, y);
    if (!isLightNeutralPixel(pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3])) {
      continue;
    }

    pixels[index + 3] = 0;
    removedPixelCount += 1;

    cornerQueue.push([x + 1, y]);
    cornerQueue.push([x - 1, y]);
    cornerQueue.push([x, y + 1]);
    cornerQueue.push([x, y - 1]);
  }

  if (removedPixelCount === 0) {
    return buffer;
  }

  return sharp(pixels, { raw: { width, height, channels } })
    .png({ compressionLevel: 6 })
    .toBuffer();
};

export const readProviderIconFromStorage = async (
  iconUrl: string,
  iconCornerRadius = 0,
): Promise<string | null> => {
  if (!isObjectStorageConfigured()) return null;
  try {
    const payload = await getCachedImageFromObjectStorage(
      buildProviderIconStorageKey(iconUrl, iconCornerRadius),
    );
    if (!payload) return null;
    const buffer = Buffer.from(payload.body);
    const contentType = toImageContentType(payload.contentType);
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
};

export const writeProviderIconToStorage = async (
  iconUrl: string,
  buffer: Buffer,
  iconCornerRadius = 0,
) => {
  if (!isObjectStorageConfigured()) return;
  try {
    await putCachedImageToObjectStorage(buildProviderIconStorageKey(iconUrl, iconCornerRadius), {
      body: bufferToArrayBuffer(buffer),
      contentType: 'image/png',
      cacheControl: buildSourceImageFallbackCacheControl(PROVIDER_ICON_CACHE_TTL_MS),
    });
  } catch {
  }
};

export const decodeDataUriBuffer = (dataUri: string) => {
  const normalized = dataUri.trim();
  const match = normalized.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,([\s\S]+)$/i);
  if (!match) return null;
  const payload = match[3] || '';
  if (match[2]) {
    try {
      return Buffer.from(payload, 'base64');
    } catch {
      return null;
    }
  }

  try {
    return Buffer.from(decodeURIComponent(payload), 'utf8');
  } catch {
    return null;
  }
};

export const shouldUseNeutralGlassPlateForIcon = async (
  iconDataUri: string | null,
  getSharpFactory: () => Promise<any>,
) => {
  const normalizedIconDataUri = String(iconDataUri || '').trim();
  if (!normalizedIconDataUri.startsWith('data:')) return false;

  const sourceBuffer = decodeDataUriBuffer(normalizedIconDataUri);
  if (!sourceBuffer) return false;

  try {
    const sharp = await getSharpFactory();
    const { data, info } = await sharp(sourceBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (!info.width || !info.height || info.channels < 4) {
      return false;
    }

    let minX = info.width;
    let minY = info.height;
    let maxX = -1;
    let maxY = -1;
    let visiblePixelCount = 0;

    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const alpha = data[(y * info.width + x) * info.channels + 3];
        if (alpha < 40) continue;
        visiblePixelCount += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (visiblePixelCount === 0 || maxX < minX || maxY < minY) {
      return false;
    }

    const boundsWidth = maxX - minX + 1;
    const boundsHeight = maxY - minY + 1;
    const boundsArea = boundsWidth * boundsHeight;
    if (boundsArea <= 0) return false;

    const visibleCoverage = visiblePixelCount / boundsArea;
    return visibleCoverage < 0.82;
  } catch {
    return false;
  }
};

export const chunkBy = <T,>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};
