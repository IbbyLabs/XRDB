import { withDedupe } from './imageRouteRuntime.ts';
import { assertSafeSourceUrl, fetchWithOneRedirect } from './networkSecurity.ts';
import { BROWSER_LIKE_USER_AGENT } from './imageRouteExternalRatings.ts';

type MetadataReader = <T>(key: string) => T | null | undefined;
type MetadataWriter = (key: string, value: any, ttlMs: number) => void;
type SharpFactoryLoader = () => Promise<any>;

const QUALITY_BADGE_ICON_CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

const isSvgContentType = (contentType: string) =>
  contentType.includes('svg');

const looksLikeSvgUrl = (iconUrl: string) => {
  try {
    const { pathname } = new URL(iconUrl);
    return pathname.toLowerCase().endsWith('.svg');
  } catch {
    return iconUrl.toLowerCase().includes('.svg');
  }
};

const looksLikeSvgMarkup = (sourceBuffer: Buffer) => {
  const markup = sourceBuffer.toString('utf8', 0, Math.min(sourceBuffer.length, 512)).trimStart();
  return markup.startsWith('<svg') || markup.startsWith('<?xml');
};

const ensureSvgHasSize = (sourceBuffer: Buffer): Buffer | null => {
  const markup = sourceBuffer.toString('utf8');
  const svgMatch = /<svg\b([^>]*)>/i.exec(markup);
  if (!svgMatch) return null;

  const attrs = svgMatch[1] || '';
  const hasWidth = /\bwidth\s*=\s*['"][^'"]+['"]/i.test(attrs);
  const hasHeight = /\bheight\s*=\s*['"][^'"]+['"]/i.test(attrs);
  if (hasWidth && hasHeight) return null;

  const viewBoxMatch = /\bviewBox\s*=\s*['"]\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)\s*['"]/i.exec(attrs);
  if (!viewBoxMatch) return null;

  const width = Number.parseFloat(viewBoxMatch[1]);
  const height = Number.parseFloat(viewBoxMatch[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const replacement = `<svg${attrs} width="${width}" height="${height}">`;
  const updated = markup.replace(/<svg\b[^>]*>/i, replacement);
  return Buffer.from(updated, 'utf8');
};

const rasterizeSvgToPng = async (sharp: any, sourceBuffer: Buffer): Promise<Buffer> =>
  sharp(sourceBuffer)
    .resize(512, 512, {
      fit: 'contain',
      kernel: 'lanczos3',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 6 })
    .toBuffer();

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
        const shouldTreatAsSvg =
          isSvgContentType(contentType) ||
          looksLikeSvgUrl(normalizedIconUrl) ||
          looksLikeSvgMarkup(sourceBuffer);

        if (shouldTreatAsSvg && getSharpFactory) {
          try {
            const sharp = await getSharpFactory();
            let pngBuffer: Buffer | null = null;

            try {
              pngBuffer = await rasterizeSvgToPng(sharp, sourceBuffer);
            } catch {
              const normalizedSvg = ensureSvgHasSize(sourceBuffer);
              if (normalizedSvg) {
                pngBuffer = await rasterizeSvgToPng(sharp, normalizedSvg);
              }
            }

            if (!pngBuffer) {
              throw new Error('svg-rasterization-failed');
            }

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
