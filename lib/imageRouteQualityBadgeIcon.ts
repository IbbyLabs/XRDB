import { withDedupe } from './imageRouteRuntime.ts';
import { assertSafeSourceUrl, fetchWithOneRedirect } from './networkSecurity.ts';
import { BROWSER_LIKE_USER_AGENT } from './imageRouteExternalRatings.ts';

type MetadataReader = <T>(key: string) => T | null | undefined;
type MetadataWriter = (key: string, value: any, ttlMs: number) => void;
type SharpFactoryLoader = () => Promise<any>;

const QUALITY_BADGE_ICON_CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

const isSvgContentType = (contentType: string) =>
  contentType.includes('svg');

export const createQualityBadgeIconDataUriResolver = ({
  getMetadata,
  setMetadata,
  getSharpFactory,
  assertSafeSourceUrlImpl = assertSafeSourceUrl,
  fetchSafeIconImpl = fetchWithOneRedirect,
}: {
  getMetadata: MetadataReader;
  setMetadata: MetadataWriter;
  getSharpFactory?: SharpFactoryLoader;
  assertSafeSourceUrlImpl?: typeof assertSafeSourceUrl;
  fetchSafeIconImpl?: typeof fetchWithOneRedirect;
}) => {
  const qualityBadgeIconInFlight = new Map<string, Promise<string | null>>();

  const buildQualityBadgeIconMemoryCacheKey = (iconUrl: string) =>
    `xrdb:quality-badge-icon:${iconUrl}`;

  return async (iconUrl: string): Promise<string | null> => {
    const normalizedIconUrl = iconUrl.trim();
    if (!normalizedIconUrl) return null;
    if (normalizedIconUrl.startsWith('data:')) {
      return normalizedIconUrl;
    }

    const memoryCacheKey = buildQualityBadgeIconMemoryCacheKey(normalizedIconUrl);

    const localCached = getMetadata<string>(memoryCacheKey);
    if (localCached) {
      return localCached;
    }

    return withDedupe(qualityBadgeIconInFlight, normalizedIconUrl, async () => {
      const warmLocal = getMetadata<string>(memoryCacheKey);
      if (warmLocal) return warmLocal;

      try {
        const safeIconUrl = await assertSafeSourceUrlImpl(normalizedIconUrl);
        const response = await fetchSafeIconImpl(safeIconUrl.toString(), undefined, { 'User-Agent': BROWSER_LIKE_USER_AGENT });
        if (!response.ok) return null;

        const contentType = response.headers.get('content-type') || 'image/png';
        const sourceBuffer = Buffer.from(await response.arrayBuffer());

        if (isSvgContentType(contentType) && getSharpFactory) {
          try {
            const sharp = await getSharpFactory();
            const pngBuffer = await sharp(sourceBuffer)
              .resize(512, 512, {
                fit: 'contain',
                kernel: 'lanczos3',
                background: { r: 0, g: 0, b: 0, alpha: 0 },
              })
              .png({ compressionLevel: 6 })
              .toBuffer();
            const dataUri = `data:image/png;base64,${pngBuffer.toString('base64')}`;
            setMetadata(memoryCacheKey, dataUri, QUALITY_BADGE_ICON_CACHE_TTL_MS);
            return dataUri;
          } catch {
            // fall through to raw data URI if sharp fails
          }
        }

        const dataUri = `data:${contentType};base64,${sourceBuffer.toString('base64')}`;
        setMetadata(memoryCacheKey, dataUri, QUALITY_BADGE_ICON_CACHE_TTL_MS);
        return dataUri;
      } catch {
        return null;
      }
    });
  };
};
