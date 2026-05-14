import {
  DEFAULT_QUALITY_BADGES_STYLE,
  type QualityBadgeStyle,
  type RatingStyle,
} from './ratingAppearance.ts';
import {
  getCommunityBadgeSvg,
  DEFAULT_COMMUNITY_BADGE_THEME,
  type CommunityBadgeTheme,
} from './communityBadgeAssets.ts';
import {
  MEDIA_BADGE_ASSETS,
  type MediaBadgeAssetId,
} from './mediaBadgeAssets.ts';
import {
  isStreamingServiceBadgeKey,
  isMediaFeatureBadgeKey,
  normalizeUserFacingMediaBadgeLabel,
  type MediaFeatureBadgeKey,
} from './mediaFeatures.ts';
import { escapeXml, estimateGeneratedLogoLineWidth } from './imageRouteText.ts';

export type QualityBadgeInput = {
  key: string;
  label: string;
  accentColor?: string;
  tileAccentColor?: string;
  communityBadgeTheme?: CommunityBadgeTheme;
  styleOverride?: QualityBadgeStyle;
  iconDataUri?: string | null;
  iconUrl?: string;
  noBackgroundOutlineColor?: string;
  noBackgroundOutlineWidth?: number;
  fullBadge?: boolean;
};

const resolveBadgeDataUri = (badge: Pick<QualityBadgeInput, 'iconDataUri' | 'iconUrl'>) => {
  const iconDataUri = typeof badge.iconDataUri === 'string' ? badge.iconDataUri.trim() : '';
  if (iconDataUri.startsWith('data:')) {
    return iconDataUri;
  }
  const iconUrlDataUri = typeof badge.iconUrl === 'string' ? badge.iconUrl.trim() : '';
  if (iconUrlDataUri.startsWith('data:')) {
    return iconUrlDataUri;
  }
  return null;
};

const decodeDataUriPayload = (dataUri: string) => {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i.exec(dataUri);
  if (!match) return null;
  const [, mimeType = '', base64Flag, payload = ''] = match;
  try {
    const buffer = base64Flag
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
    return {
      mimeType: mimeType.toLowerCase(),
      buffer,
    };
  } catch {
    return null;
  }
};

const parseNumericSvgLength = (value: string | undefined) => {
  if (!value) return null;
  const match = /^\s*([0-9]+(?:\.[0-9]+)?)/.exec(value);
  if (!match) return null;
  const numeric = Number.parseFloat(match[1]);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const inferSvgAspectRatio = (svgMarkup: string) => {
  const viewBoxMatch = /viewBox\s*=\s*['"]\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)\s*['"]/i.exec(
    svgMarkup,
  );
  if (viewBoxMatch) {
    const width = Number.parseFloat(viewBoxMatch[1]);
    const height = Number.parseFloat(viewBoxMatch[2]);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return width / height;
    }
  }

  const svgTagMatch = /<svg\b([^>]+)>/i.exec(svgMarkup);
  if (!svgTagMatch) return null;
  const attrs = svgTagMatch[1];
  const widthAttr = /\bwidth\s*=\s*['"]([^'"]+)['"]/i.exec(attrs)?.[1];
  const heightAttr = /\bheight\s*=\s*['"]([^'"]+)['"]/i.exec(attrs)?.[1];
  const width = parseNumericSvgLength(widthAttr);
  const height = parseNumericSvgLength(heightAttr);
  if (width && height) {
    return width / height;
  }
  return null;
};

const inferPngAspectRatio = (buffer: Buffer) => {
  if (buffer.length < 24) return null;
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width <= 0 || height <= 0) return null;
  return width / height;
};

const inferBadgeDataUriAspectRatio = (dataUri: string | null) => {
  if (!dataUri) return null;
  const decoded = decodeDataUriPayload(dataUri);
  if (!decoded) return null;
  if (decoded.mimeType === 'image/svg+xml') {
    return inferSvgAspectRatio(decoded.buffer.toString('utf8'));
  }
  if (decoded.mimeType === 'image/png') {
    return inferPngAspectRatio(decoded.buffer);
  }
  return null;
};

const parseHexColor = (value: string) => {
  const normalized = String(value || '').trim().replace(/^#/, '');
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : normalized;

  if (!/^[0-9a-f]{6}$/i.test(expanded)) {
    return null;
  }

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
};

const normalizeHexColorString = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(normalized)) {
    return `#${normalized
      .split('')
      .map((char) => `${char}${char}`)
      .join('')
      .toLowerCase()}`;
  }
  if (/^[0-9a-f]{6}$/i.test(normalized)) {
    return `#${normalized.toLowerCase()}`;
  }
  return null;
};

const hexColorToRgba = (value: string, alpha: number, fallback = `rgba(167,139,250,${alpha})`) => {
  const parsed = parseHexColor(value);
  if (!parsed) return fallback;
  return `rgba(${parsed.r},${parsed.g},${parsed.b},${alpha})`;
};

export const getBadgeOuterRadius = (height: number, ratingStyle: RatingStyle) =>
  ratingStyle === 'square'
    ? Math.max(10, Math.round(height * 0.24))
    : ratingStyle === 'stacked'
      ? Math.max(12, Math.round(height * 0.28))
      : Math.round(height / 2);

export const getBadgeIconRadius = (iconSize: number, ratingStyle: RatingStyle) =>
  ratingStyle === 'square'
    ? Math.max(6, Math.round(iconSize * 0.22))
    : ratingStyle === 'stacked'
      ? Math.max(7, Math.round(iconSize * 0.26))
      : Math.round(iconSize / 2);

const buildCenteredBadgeAssetImage = ({
  dataUri,
  width,
  height,
  assetAspectRatio,
  horizontalPadding,
  heightRatio = 0.6,
  yOffset = 0,
  extraAttributes = '',
}: {
  dataUri: string;
  width: number;
  height: number;
  assetAspectRatio: number;
  horizontalPadding: number;
  heightRatio?: number;
  yOffset?: number;
  extraAttributes?: string;
}) => {
  const maxWidth = Math.max(0, width - horizontalPadding * 2);
  const targetHeight = Math.max(1, Math.round(height * heightRatio));
  const targetWidth = Math.round(targetHeight * assetAspectRatio);
  const assetWidth = Math.min(maxWidth, targetWidth);
  const assetHeight = Math.max(1, Math.round(assetWidth / assetAspectRatio));
  const x = Math.round((width - assetWidth) / 2);
  const y = Math.round((height - assetHeight) / 2 + yOffset);
  return `<image href="${dataUri}" x="${x}" y="${y}" width="${assetWidth}" height="${assetHeight}" preserveAspectRatio="xMidYMid meet"${extraAttributes ? ` ${extraAttributes}` : ''} />`;
};

const buildCenteredProviderLogoImage = ({
  dataUri,
  x,
  y,
  size,
  extraAttributes = '',
}: {
  dataUri: string;
  x: number;
  y: number;
  size: number;
  extraAttributes?: string;
}) =>
  `<image href="${dataUri}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"${extraAttributes ? ` ${extraAttributes}` : ''} />`;

export const usesIntrinsicQualityBadgeWidths = (
  style: QualityBadgeStyle,
  badge?: Pick<QualityBadgeInput, 'key' | 'iconDataUri' | 'iconUrl' | 'styleOverride' | 'fullBadge'>,
) => {
  const badgeDataUri = badge ? resolveBadgeDataUri(badge) : null;
  if (badge?.fullBadge && badgeDataUri) {
    return true;
  }
  const effectiveStyle = badge?.styleOverride ?? style;
  if (effectiveStyle === 'media' || effectiveStyle === 'silver' || effectiveStyle === 'tile' || effectiveStyle === 'community-badge') {
    return true;
  }
  if (!badge) {
    return false;
  }
  const hasStreamingServiceLogo =
    isStreamingServiceBadgeKey(String(badge.key)) &&
    Boolean(badgeDataUri);
  return !(String(badge.key) in MEDIA_BADGE_ASSETS) && !hasStreamingServiceLogo;
};

export const buildQualityBadgeSvg = (
  badge: QualityBadgeInput,
  height: number,
  widthOverride?: number,
  style: QualityBadgeStyle = DEFAULT_QUALITY_BADGES_STYLE
): { svg: string; width: number; height: number } | null => {
  const key = badge.key;
  if (!isMediaFeatureBadgeKey(String(key))) {
    return null;
  }
  const effectiveStyle = badge.styleOverride ?? style;
  const badgeDataUri = resolveBadgeDataUri(badge);
  const badgeDataUriAspectRatio = inferBadgeDataUriAspectRatio(badgeDataUri);

  if (badge.fullBadge && badgeDataUri) {
    const fullBadgeHeight = Math.max(32, Math.round(height * 0.9));
    const fullBadgeWidth =
      widthOverride ??
      Math.max(
        24,
        Math.round(fullBadgeHeight * Math.max(0.45, Math.min(badgeDataUriAspectRatio ?? 1, 6))),
      );
    return {
      width: fullBadgeWidth,
      height: fullBadgeHeight,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${fullBadgeWidth}" height="${fullBadgeHeight}" viewBox="0 0 ${fullBadgeWidth} ${fullBadgeHeight}"><image href="${badgeDataUri}" x="0" y="0" width="${fullBadgeWidth}" height="${fullBadgeHeight}" preserveAspectRatio="xMidYMid meet" /></svg>`,
    };
  }

  const noBackgroundOutlineWidth =
    effectiveStyle === 'plain' && Number.isFinite(badge.noBackgroundOutlineWidth)
      ? Math.max(0, Number(badge.noBackgroundOutlineWidth))
      : 0;
  const hasNoBackgroundOutline = noBackgroundOutlineWidth > 0;
  const noBackgroundOutlineColor =
    normalizeHexColorString(badge.noBackgroundOutlineColor) || '#000000';
  const plainTextOutlineAttributes = hasNoBackgroundOutline
    ? ` stroke="${noBackgroundOutlineColor}" stroke-width="${noBackgroundOutlineWidth}" paint-order="stroke fill" stroke-linejoin="round"`
    : '';
  const hasStreamingServiceLogo =
    isStreamingServiceBadgeKey(String(key)) &&
    Boolean(badgeDataUri);
  const label = (normalizeUserFacingMediaBadgeLabel(badge.label) || '').toUpperCase();
  const releaseStatusWidthScale =
    key === 'releasestatus' && label === 'DIGITAL RELEASE' ? 0.84 : 1;
  const streamingBadgeWidthScale = hasStreamingServiceLogo ? 0.95 : 1;
  const h = effectiveStyle === 'community-badge'
    ? Math.max(44, Math.round(height * 1.15))
    : Math.max(32, Math.round(height * 0.9));
  if (effectiveStyle === 'community-badge') {
    const theme = badge.communityBadgeTheme ?? DEFAULT_COMMUNITY_BADGE_THEME;
    const result = getCommunityBadgeSvg(String(key), theme, label, h);
    if (result) return result;
    return null;
  }
  const radius = effectiveStyle === 'glass' ? Math.round(h / 2) : Math.round(h * 0.18);
  const isSilverStyle = effectiveStyle === 'silver';
  const strokeWidth =
    effectiveStyle === 'glass'
      ? Math.max(1, Math.round(h * 0.04))
      : effectiveStyle === 'square'
        ? Math.max(1, Math.round(h * 0.05))
        : Math.max(2, Math.round(h * 0.08));
  const fontFamily = `'Noto Sans','DejaVu Sans',Arial,sans-serif`;
  const mediaText = '#f5f5f4';
  const certStroke = 'rgba(255,247,237,0.94)';
  const certFill = 'rgba(17,24,39,0.42)';
  const certText = '#fffaf5';
  const silverStroke = 'rgba(244,244,245,0.9)';
  const silverText = 'rgba(244,244,245,0.96)';
  const mediaFrameByKey: Partial<Record<MediaFeatureBadgeKey, { stroke: string; fill: string }>> = {
    '4k': {
      stroke: 'rgba(56,189,248,0.88)',
      fill: 'rgba(2,132,199,0.16)',
    },
    hdr: {
      stroke: 'rgba(255,255,255,0.76)',
      fill: 'rgba(148,163,184,0.16)',
    },
    remux: {
      stroke: 'rgba(251,146,60,0.92)',
      fill: 'rgba(239,68,68,0.16)',
    },
    bdremux: {
      stroke: 'rgba(217,119,6,0.88)',
      fill: 'rgba(180,83,9,0.14)',
    },
    bluray: {
      stroke: 'rgba(125,211,252,0.34)',
      fill: 'rgba(15,23,42,0.16)',
    },
    dolbyvision: {
      stroke: 'rgba(255,255,255,0.58)',
      fill: 'rgba(15,23,42,0.18)',
    },
    dolbyatmos: {
      stroke: 'rgba(255,255,255,0.58)',
      fill: 'rgba(15,23,42,0.18)',
    },
  };
  const standardAssetStrokeByKey: Partial<Record<MediaBadgeAssetId, string>> = {
    '4k': '#7dd3fc',
    hdr: '#e5e7eb',
    bluray: '#dbeafe',
    dolbyvision: '#e5e7eb',
    dolbyatmos: '#e5e7eb',
    remux: '#fb923c',
    bdremux: '#d97706',
  };
  const baseRect = (width: number, stroke: string, fill: string, extra = '') =>
    `<rect x="${strokeWidth / 2}" y="${strokeWidth / 2}" width="${Math.max(0, width - strokeWidth)}" height="${Math.max(0, h - strokeWidth)}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${extra}/>`;
  const buildMediaPlate = (
    width: number,
    input: {
      stroke: string;
      fill: string;
      strokeScale?: number;
      radiusScale?: number;
      highlightOpacity?: number;
    },
  ) => {
    const plateStrokeWidth = Math.max(1.35, strokeWidth * (input.strokeScale ?? 0.82));
    const radiusValue = Math.max(10, Math.round(h * (input.radiusScale ?? 0.26)));
    const inset = plateStrokeWidth / 2;
    const innerInset = Math.max(1.5, Math.round(plateStrokeWidth * 0.9));
    return `<rect x="${inset}" y="${inset}" width="${Math.max(0, width - plateStrokeWidth)}" height="${Math.max(0, h - plateStrokeWidth)}" rx="${radiusValue}" fill="${input.fill}" stroke="${input.stroke}" stroke-width="${plateStrokeWidth}" />
<rect x="${innerInset}" y="${innerInset}" width="${Math.max(0, width - innerInset * 2)}" height="${Math.max(0, Math.round(h * 0.42))}" rx="${Math.max(8, radiusValue - 4)}" fill="rgba(255,255,255,${input.highlightOpacity ?? 0.06})" />`;
  };
  const estimateMediaLabelWidth = (labelText: string, textSize: number, trackingEm = 0, sidePadding = 0) => {
    const collapsed = labelText.trim().toUpperCase();
    if (!collapsed) return Math.max(0, sidePadding * 2);
    const nonSpaceCount = [...collapsed].filter((ch) => ch !== ' ').length;
    const trackingWidth = Math.max(0, nonSpaceCount - 1) * trackingEm * textSize;
    const safetyWidth = Math.max(8, Math.round(textSize * 0.46));
    return Math.round(estimateGeneratedLogoLineWidth(collapsed, textSize) + trackingWidth + sidePadding * 2 + safetyWidth);
  };
  const estimateQualityTextBadgeWidth = (labelText: string, textSize: number, sidePadding = 0) => {
    const collapsed = labelText.trim().toUpperCase();
    if (!collapsed) return Math.max(Math.round(h * 1.45), sidePadding * 2);
    const rawTextWidth = estimateGeneratedLogoLineWidth(collapsed, textSize);
    const boldCompensation = rawTextWidth * 0.14;
    return Math.max(
      Math.round(h * 1.45),
      Math.round(
        (rawTextWidth +
          boldCompensation +
          sidePadding * 2 +
          Math.max(12, Math.round(textSize * 0.78))) * releaseStatusWidthScale
      ),
    );
  };
  const resolveChrome = (accentColor: string) => {
    if (effectiveStyle === 'plain' || effectiveStyle === 'media' || effectiveStyle === 'silver') return null;
    if (effectiveStyle === 'glass') {
      return {
        stroke: 'rgba(255,255,255,0.45)',
        fill: 'rgba(17,24,39,0.70)',
      };
    }
    return { stroke: accentColor, fill: '#0b0b0b' };
  };
  const buildRect = (width: number, accentColor: string, extra = '') => {
    const chrome = resolveChrome(accentColor);
    if (!chrome) return '';
    return baseRect(width, chrome.stroke, chrome.fill, extra);
  };
  const buildMediaCertificationSvg = () => {
    const badgeTypeLabel = 'AGE';
    const badgeTypeSize = Math.max(9, Math.round(h * 0.2));
    const textSize = Math.round(h * 0.34);
    const sidePadding = Math.round(h * 0.26);
    const width = widthOverride ?? Math.max(
      Math.round(h * 1.22),
      estimateMediaLabelWidth(label, textSize, 0.012, sidePadding),
      estimateMediaLabelWidth(badgeTypeLabel, badgeTypeSize, 0.14, sidePadding),
    );
    const badgeTypeY = Math.round(h * 0.3);
    const textY = Math.round(h * 0.72);
    return {
      width,
      height: h,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">
${buildMediaPlate(width, {
  stroke: certStroke,
  fill: certFill,
  strokeScale: 0.95,
  radiusScale: 0.29,
  highlightOpacity: 0.08,
})}
<text x="${width / 2}" y="${badgeTypeY}" font-family="${fontFamily}" font-size="${badgeTypeSize}" font-weight="700" text-anchor="middle" fill="rgba(255,250,245,0.82)" letter-spacing="0.16em">${badgeTypeLabel}</text>
<text x="${width / 2}" y="${textY}" font-family="${fontFamily}" font-size="${textSize}" font-weight="800" text-anchor="middle" fill="${certText}" letter-spacing="0.012em">${escapeXml(label)}</text>
</svg>`,
    };
  };
  const buildPlainQualityShadowDefs = (filterId: string) =>
    `<defs><filter id="${filterId}" x="-28%" y="-34%" width="156%" height="188%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="1.2" stdDeviation="2.4" flood-color="#020617" flood-opacity="0.66" /><feDropShadow dx="0" dy="0" stdDeviation="1.35" flood-color="#020617" flood-opacity="0.28" /></filter></defs>`;
  const buildPlainQualitySurface = (width: number, filterId: string) =>
    `<rect x="5" y="7" width="${Math.max(0, width - 10)}" height="${Math.max(0, h - 14)}" rx="${Math.max(8, Math.round(h * 0.24))}" fill="rgba(2,6,23,0.10)" filter="url(#${filterId})" />`;
  const buildSilverQualitySurface = (width: number, insetX = 2) => {
    const rx = Math.max(8, Math.round(h * 0.24));
    const outerX = Math.max(0, insetX);
    const outerWidth = Math.max(0, width - outerX * 2);
    const innerX = outerX + 4;
    const innerWidth = Math.max(0, width - outerX * 2 - 4);
    const innerHeight = Math.max(0, h - 4);
    return `
      <defs>
        <linearGradient id="silverBadgeFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="rgba(245,245,244,0.16)" />
          <stop offset="42%" stop-color="rgba(148,163,184,0.11)" />
          <stop offset="100%" stop-color="rgba(15,23,42,0.22)" />
        </linearGradient>
        <filter id="quality-badge-silver-surface" x="-24%" y="-24%" width="148%" height="148%" color-interpolation-filters="sRGB">
          <feDropShadow dx="0" dy="1" stdDeviation="1.8" flood-color="#020617" flood-opacity="0.52" />
        </filter>
      </defs>
      <rect x="${outerX}" y="2" width="${outerWidth}" height="${innerHeight}" rx="${rx}" fill="url(#silverBadgeFill)" stroke="rgba(229,231,235,0.52)" stroke-width="1.2" filter="url(#quality-badge-silver-surface)" />
      <rect x="${innerX}" y="5" width="${Math.max(0, width - outerX * 2 - 8)}" height="${Math.max(0, Math.round(h * 0.34))}" rx="${Math.max(6, rx - 3)}" fill="rgba(255,255,255,0.06)" />`;
  };
  const buildSilverQualityMarkDefs = (filterId: string) =>
    `<defs><filter id="${filterId}" x="-25%" y="-30%" width="150%" height="170%" color-interpolation-filters="sRGB"><feDropShadow in="SourceAlpha" dx="0" dy="1.1" stdDeviation="1.8" flood-color="#020617" flood-opacity="0.52" result="silver-shadow" /><feFlood flood-color="#f4f4f5" flood-opacity="0.96" result="silver-fill" /><feComposite in="silver-fill" in2="SourceAlpha" operator="in" result="silver-mark" /><feMerge><feMergeNode in="silver-shadow" /><feMergeNode in="silver-mark" /></feMerge></filter></defs>`;
  const buildSilverQualityTextDefs = (filterId: string) =>
    `<defs><filter id="${filterId}" x="-25%" y="-30%" width="150%" height="170%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="1.1" stdDeviation="2.1" flood-color="#020617" flood-opacity="0.56" /></filter></defs>`;
  const buildAssetBackedBadgeSvg = (
    assetKey: MediaBadgeAssetId,
    variant: 'media' | 'standard',
  ) => {
    const asset = MEDIA_BADGE_ASSETS[assetKey];
    const customAssetDataUri = badgeDataUri;
    const assetDataUri = customAssetDataUri ?? asset.dataUri;
    const assetAspectRatio = customAssetDataUri ? badgeDataUriAspectRatio ?? asset.aspectRatio : asset.aspectRatio;
    const assetHeightRatio = customAssetDataUri ? 0.62 : asset.heightRatio;
    const assetYOffsetRatio = customAssetDataUri ? 0 : (asset.yOffsetRatio || 0);
    const width = widthOverride ?? Math.round(h * asset.widthRatio);
    const horizontalPadding = Math.round(h * asset.horizontalPaddingRatio);
    const isPlainStandard = variant === 'standard' && effectiveStyle === 'plain';
    const isSilverStandard = variant === 'standard' && isSilverStyle;
    const mediaFrame = mediaFrameByKey[assetKey];
    const backgroundMarkup =
      isSilverStandard
        ? ''
        : variant === 'media'
        ? buildMediaPlate(width, {
            stroke: mediaFrame?.stroke || 'rgba(255,255,255,0.78)',
            fill: mediaFrame?.fill || 'rgba(255,255,255,0.04)',
            strokeScale: assetKey === 'bluray' ? 0.66 : assetKey.startsWith('dolby') ? 0.78 : 0.82,
            radiusScale: assetKey === 'bluray' ? 0.24 : 0.27,
            highlightOpacity: assetKey === 'bluray' ? 0.035 : 0.05,
          })
        : isPlainStandard
          ? buildPlainQualitySurface(width, 'quality-badge-plain-shadow')
          : buildRect(width, standardAssetStrokeByKey[assetKey] || '#e5e7eb');
    const defs = isSilverStandard
      ? buildSilverQualityMarkDefs('quality-badge-silver-logo')
      : isPlainStandard
        ? `${buildPlainQualityShadowDefs('quality-badge-plain-shadow')}<defs><filter id="quality-badge-logo-shadow" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="0.8" stdDeviation="1.45" flood-color="#000000" flood-opacity="0.48" /></filter></defs>`
        : '';
    const assetExtraAttributes = isSilverStandard
      ? 'filter="url(#quality-badge-silver-logo)"'
      : isPlainStandard
        ? 'filter="url(#quality-badge-logo-shadow)"'
        : '';
    return {
      width,
      height: h,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">
${defs}
${backgroundMarkup}
${buildCenteredBadgeAssetImage({
  dataUri: assetDataUri,
  width,
  height: h,
  assetAspectRatio,
  horizontalPadding,
  heightRatio: assetHeightRatio,
  yOffset: Math.round(h * assetYOffsetRatio),
  extraAttributes: assetExtraAttributes,
})}
</svg>`,
    };
  };

  if (effectiveStyle === 'media') {
    if (key === 'certification') {
      return buildMediaCertificationSvg();
    }
    if (key in MEDIA_BADGE_ASSETS) {
      return buildAssetBackedBadgeSvg(key as MediaBadgeAssetId, 'media');
    }
  }

  if (isSilverStyle) {
    if (key === 'certification') {
      const textSize = Math.round(h * 0.42);
      const sidePadding = Math.max(10, Math.round(h * 0.18));
      const width = widthOverride ?? estimateQualityTextBadgeWidth(label, textSize, sidePadding);
      const certRadius = Math.max(8, Math.round(h * 0.22));
      const textY = Math.round(h * 0.66);
      return {
        width,
        height: h,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">
${buildSilverQualityTextDefs('quality-badge-silver-text')}
<rect x="${Math.max(1, strokeWidth * 0.4)}" y="${Math.max(1, strokeWidth * 0.4)}" width="${Math.max(0, width - Math.max(2, strokeWidth * 0.8))}" height="${Math.max(0, h - Math.max(2, strokeWidth * 0.8))}" rx="${certRadius}" fill="none" stroke="${silverStroke}" stroke-width="${Math.max(1.5, strokeWidth * 0.72)}" filter="url(#quality-badge-silver-text)" />
<text x="${width / 2}" y="${textY}" font-family="${fontFamily}" font-size="${textSize}" font-weight="800" text-anchor="middle" fill="${silverText}" filter="url(#quality-badge-silver-text)">${escapeXml(label)}</text>
</svg>`,
      };
    }
    if (key in MEDIA_BADGE_ASSETS) {
      return buildAssetBackedBadgeSvg(key as MediaBadgeAssetId, 'standard');
    }
  }

  if (effectiveStyle === 'tile') {
    const TILE_BG = '#0f1117';
    const tileR = Math.max(7, Math.round(h * 0.18));
    const tileStripW = Math.max(tileR + 2, Math.round(h * 0.22));
    const tileAccentColor = badge.tileAccentColor ?? badge.accentColor ?? '#38bdf8';
    const tileStripPath = `M ${tileR},0 L ${tileStripW},0 L ${tileStripW},${h} L ${tileR},${h} Q 0,${h} 0,${h - tileR} L 0,${tileR} Q 0,0 ${tileR},0 Z`;

    if (key === 'certification') {
      const textSize = Math.round(h * 0.38);
      const badgeTypeSize = Math.max(8, Math.round(h * 0.18));
      const sidePadding = Math.max(8, Math.round(h * 0.22));
      const width = widthOverride ?? Math.max(
        Math.round(h * 1.22),
        estimateQualityTextBadgeWidth(label, textSize, sidePadding),
        estimateQualityTextBadgeWidth('AGE', badgeTypeSize, sidePadding),
      );
      const contentCx = tileStripW + Math.round((width - tileStripW) / 2);
      return {
        width, height: h,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}"><rect x="0" y="0" width="${width}" height="${h}" rx="${tileR}" fill="${TILE_BG}"/><path d="${tileStripPath}" fill="${badge.tileAccentColor ?? 'rgba(245,245,244,0.36)'}"/><text x="${contentCx}" y="${Math.round(h * 0.32)}" font-family="${fontFamily}" font-size="${badgeTypeSize}" font-weight="700" text-anchor="middle" fill="rgba(245,245,244,0.52)" letter-spacing="0.14em">AGE</text><text x="${contentCx}" y="${Math.round(h * 0.73)}" font-family="${fontFamily}" font-size="${textSize}" font-weight="800" text-anchor="middle" fill="#f5f5f4">${escapeXml(label)}</text></svg>`,
      };
    }

    if (hasStreamingServiceLogo) {
      const iconSize = Math.max(16, Math.round(h * 0.5));
      const platePad = Math.round((h - iconSize) / 2);
      const iconPlateW = iconSize + platePad * 2;
      const contentGap = Math.max(6, Math.round(h * 0.1));
      const textSize = Math.round(h * 0.32);
      const textSidePad = Math.max(8, Math.round(h * 0.18));
      const naturalWidth = estimateQualityTextBadgeWidth(label, textSize, iconPlateW + contentGap + textSidePad);
      const width = widthOverride ?? Math.min(
        Math.max(Math.round(h * 2.2), naturalWidth),
        Math.round(h * 3.6),
      );
      const iconX = Math.round((iconPlateW - iconSize) / 2);
      const iconY = Math.round((h - iconSize) / 2);
      const platePath = `M ${tileR},0 L ${iconPlateW},0 L ${iconPlateW},${h} L ${tileR},${h} Q 0,${h} 0,${h - tileR} L 0,${tileR} Q 0,0 ${tileR},0 Z`;
      const textCx = Math.round(iconPlateW + contentGap + (width - iconPlateW - contentGap - textSidePad) / 2);
      const iconOutlineR = Math.max(1, Math.round(h * 0.04));
      const iconOutlineDefs = `<defs><filter id="tile-provider-outline" x="-25%" y="-25%" width="150%" height="150%"><feMorphology in="SourceAlpha" operator="dilate" radius="${iconOutlineR}" result="exp"/><feComposite in="exp" in2="SourceAlpha" operator="out" result="ring"/><feFlood flood-color="#ffffff" flood-opacity="0.82" result="wht"/><feComposite in="wht" in2="ring" operator="in" result="outline"/><feMerge><feMergeNode in="outline"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
      return {
        width, height: h,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">${iconOutlineDefs}<rect x="0" y="0" width="${width}" height="${h}" rx="${tileR}" fill="${TILE_BG}"/><path d="${platePath}" fill="${tileAccentColor}"/>${buildCenteredProviderLogoImage({ dataUri: badgeDataUri as string, x: iconX, y: iconY, size: iconSize, extraAttributes: 'filter="url(#tile-provider-outline)"' })}<text x="${textCx}" y="${Math.round(h * 0.64)}" font-family="${fontFamily}" font-size="${textSize}" font-weight="800" text-anchor="middle" fill="#f5f5f4">${escapeXml(label)}</text></svg>`,
      };
    }

    const textSize = Math.round(h * 0.33);
    const sidePadding = Math.max(10, Math.round(h * 0.24));
    const textWidth = widthOverride ?? estimateQualityTextBadgeWidth(label, textSize, sidePadding);
    const contentCx = tileStripW + Math.round((textWidth - tileStripW) / 2);
    return {
      width: textWidth, height: h,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${textWidth}" height="${h}" viewBox="0 0 ${textWidth} ${h}"><rect x="0" y="0" width="${textWidth}" height="${h}" rx="${tileR}" fill="${TILE_BG}"/><path d="${tileStripPath}" fill="${tileAccentColor}"/><text x="${contentCx}" y="${Math.round(h * 0.66)}" font-family="${fontFamily}" font-size="${textSize}" font-weight="800" text-anchor="middle" fill="#f5f5f4">${escapeXml(label)}</text></svg>`,
    };
  }

  if (key === 'certification') {
    const badgeTypeLabel = 'AGE';
    const badgeTypeSize = Math.max(9, Math.round(h * 0.2));
    const textSize = Math.round(h * 0.36);
    const sidePadding = Math.max(8, Math.round(h * 0.18));
    const width = widthOverride ?? Math.max(
      Math.round(h * 1.08),
      estimateQualityTextBadgeWidth(label, textSize, sidePadding),
      estimateQualityTextBadgeWidth(badgeTypeLabel, badgeTypeSize, sidePadding),
    );
    const badgeTypeY = Math.round(h * 0.31);
    const textY = Math.round(h * 0.72);
    const rect = buildRect(width, '#e5e7eb');
    const fill = effectiveStyle === 'plain' ? mediaText : '#e5e7eb';
    const filter = effectiveStyle === 'plain' ? ' filter="url(#quality-badge-text-shadow)"' : '';
    const defs =
      effectiveStyle === 'plain'
        ? `${buildPlainQualityShadowDefs('quality-badge-text-surface')}<defs><filter id="quality-badge-text-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0.9" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.50" /></filter></defs>`
        : '';
    const plainStroke =
      effectiveStyle === 'plain' ? buildPlainQualitySurface(width, 'quality-badge-text-surface') : '';
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">
${defs}
${effectiveStyle === 'plain' ? plainStroke : rect}
<text x="${width / 2}" y="${badgeTypeY}" font-family="${fontFamily}" font-size="${badgeTypeSize}" font-weight="700" text-anchor="middle" fill="${effectiveStyle === 'plain' ? 'rgba(245,245,244,0.84)' : 'rgba(229,231,235,0.74)'}"${effectiveStyle === 'plain' ? plainTextOutlineAttributes : ''}${filter}>${badgeTypeLabel}</text>
<text x="${width / 2}" y="${textY}" font-family="${fontFamily}" font-size="${textSize}" font-weight="800" text-anchor="middle" fill="${fill}"${effectiveStyle === 'plain' ? plainTextOutlineAttributes : ''}${filter}>${escapeXml(label)}</text>
</svg>`,
      width,
      height: h,
    };
  }

  if (key === '4k') {
    return buildAssetBackedBadgeSvg('4k', 'standard');
  }

  if (key === 'hdr') {
    return buildAssetBackedBadgeSvg('hdr', 'standard');
  }

  if (key === 'bluray') {
    return buildAssetBackedBadgeSvg('bluray', 'standard');
  }

  if (key === 'dolbyvision') {
    return buildAssetBackedBadgeSvg('dolbyvision', 'standard');
  }

  if (key === 'dolbyatmos') {
    return buildAssetBackedBadgeSvg('dolbyatmos', 'standard');
  }

  if (key === 'remux') {
    return buildAssetBackedBadgeSvg('remux', 'standard');
  }

  if (key === 'bdremux') {
    return buildAssetBackedBadgeSvg('bdremux', 'standard');
  }

  const accentColor =
    effectiveStyle === 'media'
      ? mediaFrameByKey[key as MediaFeatureBadgeKey]?.stroke ?? '#7dd3fc'
      : mediaFrameByKey[key as MediaFeatureBadgeKey]?.stroke ?? 'rgba(255,255,255,0.68)';
  const resolvedAccentColor = badge.accentColor || accentColor;

  if (hasStreamingServiceLogo) {
    const iconSize = Math.max(16, Math.round(h * 0.56));
    const iconPlateSize = Math.max(iconSize + 8, Math.round(h * 0.62));
    const sidePadding = Math.max(8, Math.round(h * 0.18));
    const contentGap = Math.max(7, Math.round(h * 0.12));
    const textSize = Math.round(h * 0.33);
    const width = widthOverride ?? Math.max(
      Math.round(h * 1.72),
      Math.round(
        estimateQualityTextBadgeWidth(
          label,
          textSize,
          sidePadding + iconPlateSize + Math.round(contentGap * 0.35),
        ) * streamingBadgeWidthScale,
      ),
    );
    const iconPlateX = sidePadding;
    const iconPlateY = Math.round((h - iconPlateSize) / 2);
    const iconX = Math.round(iconPlateX + (iconPlateSize - iconSize) / 2);
    const iconY = Math.round((h - iconSize) / 2);
    const textX = iconPlateX + iconPlateSize + contentGap;
    const textY = Math.round(h * 0.66);
    const textFilter = effectiveStyle === 'plain' ? ' filter="url(#quality-badge-stream-text-shadow)"' : '';
    const iconOutlineR = Math.max(1, Math.round(h * 0.04));
    const iconOutlineFilter = `<filter id="provider-icon-outline" x="-25%" y="-25%" width="150%" height="150%"><feMorphology in="SourceAlpha" operator="dilate" radius="${iconOutlineR}" result="exp"/><feComposite in="exp" in2="SourceAlpha" operator="out" result="ring"/><feFlood flood-color="#ffffff" flood-opacity="0.82" result="wht"/><feComposite in="wht" in2="ring" operator="in" result="outline"/><feMerge><feMergeNode in="outline"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    const defs =
      effectiveStyle === 'plain'
        ? `${buildPlainQualityShadowDefs('quality-badge-stream-surface')}<defs><filter id="quality-badge-stream-logo-shadow" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="0.8" stdDeviation="1.45" flood-color="#000000" flood-opacity="0.48" /></filter><filter id="quality-badge-stream-text-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0.9" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.50" /></filter>${iconOutlineFilter}</defs>`
        : `<defs>${iconOutlineFilter}</defs>`;
    const backgroundMarkup =
      effectiveStyle === 'media'
        ? buildMediaPlate(width, {
            stroke: hexColorToRgba(resolvedAccentColor, 0.68, 'rgba(255,255,255,0.68)'),
            fill: 'rgba(12,18,32,0.24)',
            strokeScale: 0.78,
            radiusScale: 0.27,
            highlightOpacity: 0.055,
          })
        : effectiveStyle === 'plain'
          ? buildPlainQualitySurface(width, 'quality-badge-stream-surface')
          : buildRect(width, resolvedAccentColor);
    const iconPlateRadius = Math.max(8, Math.round(iconPlateSize * 0.28));
    const iconPlateMarkup =
      effectiveStyle === 'plain'
        ? `<rect x="${iconPlateX}" y="${iconPlateY}" width="${iconPlateSize}" height="${iconPlateSize}" rx="${iconPlateRadius}" fill="rgba(2,6,23,0.28)" stroke="rgba(255,255,255,0.16)" stroke-width="1" />`
        : `<rect x="${iconPlateX}" y="${iconPlateY}" width="${iconPlateSize}" height="${iconPlateSize}" rx="${iconPlateRadius}" fill="rgba(255,255,255,0.08)" stroke="${hexColorToRgba(resolvedAccentColor, 0.32, 'rgba(255,255,255,0.24)')}" stroke-width="1" />`;
    const logoExtraAttributes = 'filter="url(#provider-icon-outline)"';

    return {
      width,
      height: h,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">
${defs}
${backgroundMarkup}
${iconPlateMarkup}
${buildCenteredProviderLogoImage({
  dataUri: badgeDataUri as string,
  x: iconX,
  y: iconY,
  size: iconSize,
  extraAttributes: logoExtraAttributes,
})}
<text x="${textX}" y="${textY}" font-family="${fontFamily}" font-size="${textSize}" font-weight="800" text-anchor="start" fill="${effectiveStyle === 'plain' ? hexColorToRgba(resolvedAccentColor, 0.96, '#f5f5f4') : '#f5f5f4'}"${effectiveStyle === 'plain' ? plainTextOutlineAttributes : ''}${textFilter}>${escapeXml(label)}</text>
</svg>`,
    };
  }

  const textSize =
    key === 'releasestatus'
      ? Math.max(13, Math.round(h * 0.33))
      : Math.max(
          14,
          Math.round(
            h *
              (effectiveStyle === 'glass'
                ? 0.37
                : effectiveStyle === 'square'
                  ? 0.36
                  : effectiveStyle === 'media'
                    ? 0.35
                    : effectiveStyle === 'silver'
                      ? 0.35
                      : 0.34),
          ),
        );
  const sidePadding =
    effectiveStyle === 'plain' || effectiveStyle === 'silver'
      ? Math.max(14, Math.round(h * 0.3))
      : Math.max(10, Math.round(h * 0.24));
  const textWidth = widthOverride ?? estimateQualityTextBadgeWidth(label, textSize, sidePadding);
  const textY = Math.round(h / 2);
  if (effectiveStyle === 'media') {
    return {
      width: textWidth,
      height: h,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${textWidth}" height="${h}" viewBox="0 0 ${textWidth} ${h}">
${buildMediaPlate(textWidth, {
  stroke: hexColorToRgba(resolvedAccentColor, 0.68, 'rgba(255,255,255,0.68)'),
  fill: 'rgba(7,16,28,0.34)',
  strokeScale: 0.92,
  radiusScale: 0.2,
  highlightOpacity: 0.09,
})}
<text x="${textWidth / 2}" y="${textY}" font-family="${fontFamily}" font-size="${textSize}" font-weight="900" text-anchor="middle" dominant-baseline="middle" fill="${hexColorToRgba(resolvedAccentColor, 0.99, '#dbeafe')}" letter-spacing="0.08em">${escapeXml(label)}</text>
</svg>`,
    };
  }

  const rect = buildRect(textWidth, resolvedAccentColor);
  const silverSurface = effectiveStyle === 'silver'
    ? buildSilverQualitySurface(textWidth, Math.max(14, Math.round(h * 0.34)))
    : '';
  const plainStroke = effectiveStyle === 'plain' ? '' : '';
  const filter = effectiveStyle === 'plain' ? ' filter="url(#quality-badge-text-fallback-shadow)"' : effectiveStyle === 'silver' ? ' filter="url(#quality-badge-silver-text)"' : '';
  const defs =
    effectiveStyle === 'plain'
      ? `${buildPlainQualityShadowDefs('quality-badge-text-fallback-surface')}<defs><filter id="quality-badge-text-fallback-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0.9" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.50" /></filter></defs>`
      : effectiveStyle === 'silver'
        ? buildSilverQualityTextDefs('quality-badge-silver-text')
      : '';
  const textFill =
    effectiveStyle === 'plain' ? hexColorToRgba(resolvedAccentColor, 0.95, '#f5f5f4') : '#f5f5f4';
  return {
    width: textWidth,
    height: h,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${textWidth}" height="${h}" viewBox="0 0 ${textWidth} ${h}">
${defs}
${effectiveStyle === 'plain' ? plainStroke : effectiveStyle === 'silver' ? silverSurface : rect}
<text x="${textWidth / 2}" y="${textY}" font-family="${fontFamily}" font-size="${textSize}" font-weight="${effectiveStyle === 'glass' ? '900' : effectiveStyle === 'square' ? '850' : '800'}" text-anchor="middle" dominant-baseline="middle" fill="${effectiveStyle === 'silver' ? silverText : textFill}" letter-spacing="${effectiveStyle === 'glass' ? '0.06em' : effectiveStyle === 'square' ? '0.045em' : '0.02em'}"${effectiveStyle === 'plain' ? plainTextOutlineAttributes : ''}${filter}>${escapeXml(label)}</text>
</svg>`,
  };
};
