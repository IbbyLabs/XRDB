import { PROVIDER_ICON_CACHE_TTL_MS } from './imageRouteConfig.ts';
import { assertSafeSourceUrl, fetchWithOneRedirect } from './networkSecurity.ts';
import { BROWSER_LIKE_USER_AGENT } from './imageRouteExternalRatings.ts';
import { withDedupe } from './imageRouteRuntime.ts';
import { buildProviderIconMemoryCacheKey } from './imageRouteSourceUrls.ts';
import type { IconShape } from './ratingAppearance.ts';

type MetadataReader = <T>(key: string) => T | null | undefined;
type MetadataWriter = (key: string, value: any, ttlMs: number) => void;
type ProviderIconStorageReader = (
  iconUrl: string,
  iconCornerRadius?: number,
  iconShape?: IconShape,
) => Promise<string | null>;
type ProviderIconStorageWriter = (
  iconUrl: string,
  buffer: Buffer,
  iconCornerRadius?: number,
  iconShape?: IconShape,
) => Promise<void>;
type CornerBackgroundStripper = (sharp: any, buffer: Buffer) => Promise<Buffer>;
type SharpFactoryLoader = () => Promise<any>;

const buildIconShapeMask = (shape: IconShape, size: number): string | null => {
  if (shape === 'original') return null;
  if (shape === 'circle') {
    const r = size / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="white"/></svg>`;
  }
  const rx = shape === 'squircle' ? Math.round(size * 0.3) : Math.round(size * 0.15);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${rx}" ry="${rx}" fill="white"/></svg>`;
};

const normalizeProviderIconVisualFootprint = async (
  sharp: any,
  buffer: Buffer,
  outputSize: number,
) => {
  try {
    const trimmed = await sharp(buffer)
      .trim()
      .png({ compressionLevel: 6 })
      .toBuffer();

    return await sharp(trimmed)
      .resize(outputSize, outputSize, {
        fit: 'contain',
        kernel: 'lanczos3',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 6 })
      .toBuffer();
  } catch {
    return buffer;
  }
};

export const createProviderIconDataUriResolver = ({
  getMetadata,
  setMetadata,
  readProviderIconFromStorage,
  writeProviderIconToStorage,
  stripCornerBackgroundFromIcon,
  getSharpFactory,
  assertSafeSourceUrlImpl = assertSafeSourceUrl,
  fetchSafeIconImpl = fetchWithOneRedirect,
}: {
  getMetadata: MetadataReader;
  setMetadata: MetadataWriter;
  readProviderIconFromStorage: ProviderIconStorageReader;
  writeProviderIconToStorage: ProviderIconStorageWriter;
  stripCornerBackgroundFromIcon: CornerBackgroundStripper;
  getSharpFactory: SharpFactoryLoader;
  assertSafeSourceUrlImpl?: typeof assertSafeSourceUrl;
  fetchSafeIconImpl?: typeof fetchWithOneRedirect;
}) => {
  const providerIconInFlight = new Map<string, Promise<string | null>>();
  const providerIconOutputSize = 192;

  return async (iconUrl: string, iconCornerRadius = 0, iconShape: IconShape = 'original'): Promise<string | null> => {
    const normalizedIconUrl = iconUrl.trim();
    if (!normalizedIconUrl) return null;
    if (normalizedIconUrl.startsWith('data:')) {
      return normalizedIconUrl;
    }

    const memoryCacheKey = buildProviderIconMemoryCacheKey(normalizedIconUrl, iconCornerRadius, iconShape);

    const localCached = getMetadata<string>(memoryCacheKey);
    if (localCached) {
      return localCached;
    }

    return withDedupe(providerIconInFlight, normalizedIconUrl, async () => {
      const warmLocal = getMetadata<string>(memoryCacheKey);
      if (warmLocal) return warmLocal;

      const storageCached = await readProviderIconFromStorage(normalizedIconUrl, iconCornerRadius, iconShape);
      if (storageCached) {
        setMetadata(memoryCacheKey, storageCached, PROVIDER_ICON_CACHE_TTL_MS);
        return storageCached;
      }

      try {
        const safeIconUrl = await assertSafeSourceUrlImpl(normalizedIconUrl);
        const response = await fetchSafeIconImpl(safeIconUrl.toString(), undefined, { 'User-Agent': BROWSER_LIKE_USER_AGENT });
        if (!response.ok) return null;

        const sourceBuffer = Buffer.from(await response.arrayBuffer());
        const sharp = await getSharpFactory();
        const resizedBuffer = await sharp(sourceBuffer)
          .resize(providerIconOutputSize, providerIconOutputSize, {
            fit: 'contain',
            kernel: 'lanczos3',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png({ compressionLevel: 6 })
          .toBuffer();
        let outputBuffer = await stripCornerBackgroundFromIcon(sharp, resizedBuffer);
        outputBuffer = await normalizeProviderIconVisualFootprint(
          sharp,
          outputBuffer,
          providerIconOutputSize,
        );
        if (iconShape !== 'original') {
          const shapeMask = buildIconShapeMask(iconShape, providerIconOutputSize);
          if (shapeMask) {
            outputBuffer = await sharp(outputBuffer)
              .composite([{ input: Buffer.from(shapeMask), blend: 'dest-in' }])
              .png({ compressionLevel: 6 })
              .toBuffer();
          }
        } else if (iconCornerRadius > 0) {
          const radius = Math.max(1, Math.min(96, Math.round(iconCornerRadius * 2)));
          const roundedMask = Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${providerIconOutputSize}" height="${providerIconOutputSize}"><rect width="${providerIconOutputSize}" height="${providerIconOutputSize}" rx="${radius}" ry="${radius}" fill="white"/></svg>`
          );
          outputBuffer = await sharp(outputBuffer)
            .composite([{ input: roundedMask, blend: 'dest-in' }])
            .png({ compressionLevel: 6 })
            .toBuffer();
        }

        const dataUri = `data:image/png;base64,${outputBuffer.toString('base64')}`;
        setMetadata(memoryCacheKey, dataUri, PROVIDER_ICON_CACHE_TTL_MS);
        await writeProviderIconToStorage(normalizedIconUrl, outputBuffer, iconCornerRadius, iconShape);

        return dataUri;
      } catch {
        return null;
      }
    });
  };
};
