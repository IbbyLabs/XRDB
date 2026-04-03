import { PROVIDER_ICON_CACHE_TTL_MS } from './imageRouteConfig.ts';
import { withDedupe } from './imageRouteRuntime.ts';
import { buildProviderIconMemoryCacheKey } from './imageRouteSourceUrls.ts';

type MetadataReader = <T>(key: string) => T | null | undefined;
type MetadataWriter = (key: string, value: any, ttlMs: number) => void;
type ProviderIconStorageReader = (
  iconUrl: string,
  iconCornerRadius?: number,
) => Promise<string | null>;
type ProviderIconStorageWriter = (
  iconUrl: string,
  buffer: Buffer,
  iconCornerRadius?: number,
) => Promise<void>;
type CornerBackgroundStripper = (sharp: any, buffer: Buffer) => Promise<Buffer>;
type SharpFactoryLoader = () => Promise<any>;

export const createProviderIconDataUriResolver = ({
  getMetadata,
  setMetadata,
  readProviderIconFromStorage,
  writeProviderIconToStorage,
  stripCornerBackgroundFromIcon,
  getSharpFactory,
  fetchImpl = fetch,
}: {
  getMetadata: MetadataReader;
  setMetadata: MetadataWriter;
  readProviderIconFromStorage: ProviderIconStorageReader;
  writeProviderIconToStorage: ProviderIconStorageWriter;
  stripCornerBackgroundFromIcon: CornerBackgroundStripper;
  getSharpFactory: SharpFactoryLoader;
  fetchImpl?: typeof fetch;
}) => {
  const providerIconInFlight = new Map<string, Promise<string | null>>();
  const providerIconOutputSize = 192;

  return async (iconUrl: string, iconCornerRadius = 0): Promise<string | null> => {
    const normalizedIconUrl = iconUrl.trim();
    if (!normalizedIconUrl) return null;
    if (normalizedIconUrl.startsWith('data:')) {
      return normalizedIconUrl;
    }

    const memoryCacheKey = buildProviderIconMemoryCacheKey(normalizedIconUrl, iconCornerRadius);

    const localCached = getMetadata<string>(memoryCacheKey);
    if (localCached) {
      return localCached;
    }

    return withDedupe(providerIconInFlight, normalizedIconUrl, async () => {
      const warmLocal = getMetadata<string>(memoryCacheKey);
      if (warmLocal) return warmLocal;

      const storageCached = await readProviderIconFromStorage(normalizedIconUrl, iconCornerRadius);
      if (storageCached) {
        setMetadata(memoryCacheKey, storageCached, PROVIDER_ICON_CACHE_TTL_MS);
        return storageCached;
      }

      try {
        const response = await fetchImpl(normalizedIconUrl, { cache: 'no-store' });
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
        if (iconCornerRadius > 0) {
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
        await writeProviderIconToStorage(normalizedIconUrl, outputBuffer, iconCornerRadius);

        return dataUri;
      } catch {
        return null;
      }
    });
  };
};
