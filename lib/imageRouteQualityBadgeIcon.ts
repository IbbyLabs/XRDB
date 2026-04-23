import { withDedupe } from './imageRouteRuntime.ts';
import { assertSafeSourceUrl, fetchWithOneRedirect } from './networkSecurity.ts';

type MetadataReader = <T>(key: string) => T | null | undefined;
type MetadataWriter = (key: string, value: any, ttlMs: number) => void;

const QUALITY_BADGE_ICON_CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export const createQualityBadgeIconDataUriResolver = ({
  getMetadata,
  setMetadata,
  assertSafeSourceUrlImpl = assertSafeSourceUrl,
  fetchSafeIconImpl = fetchWithOneRedirect,
}: {
  getMetadata: MetadataReader;
  setMetadata: MetadataWriter;
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
        const response = await fetchSafeIconImpl(safeIconUrl.toString());
        if (!response.ok) return null;

        const contentType = response.headers.get('content-type') || 'image/png';
        const buffer = Buffer.from(await response.arrayBuffer());
        const dataUri = `data:${contentType};base64,${buffer.toString('base64')}`;

        setMetadata(memoryCacheKey, dataUri, QUALITY_BADGE_ICON_CACHE_TTL_MS);
        return dataUri;
      } catch {
        return null;
      }
    });
  };
};
