import {
  DEFAULT_QUALITY_BADGES_STYLE,
  type QualityBadgeStyle,
  type RatingStyle,
} from './ratingAppearance.ts';
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
  iconDataUri?: string | null;
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

export const usesIntrinsicQualityBadgeWidths = (style: QualityBadgeStyle) =>
  style === 'media' || style === 'silver';

export const buildQualityBadgeSvg = (
  badge: QualityBadgeInput,
  height: number,
  widthOverride?: number,
  style: QualityBadgeStyle = DEFAULT_QUALITY_BADGES_STYLE
) => {
  const key = badge.key;
  if (!isMediaFeatureBadgeKey(String(key))) {
    return null;
  }
  const hasStreamingServiceLogo =
    isStreamingServiceBadgeKey(String(key)) &&
    typeof badge.iconDataUri === 'string' &&
    badge.iconDataUri.trim().startsWith('data:');
  const label = (normalizeUserFacingMediaBadgeLabel(badge.label) || '').toUpperCase();
  const h = Math.max(32, Math.round(height * 0.9));
  const radius = style === 'glass' ? Math.round(h / 2) : Math.round(h * 0.18);
  const isSilverStyle = style === 'silver';
  const strokeWidth =
    style === 'glass'
      ? Math.max(1, Math.round(h * 0.04))
      : style === 'square'
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
    return Math.max(
      Math.round(h * 1.45),
      Math.round(
        estimateGeneratedLogoLineWidth(collapsed, textSize) +
          sidePadding * 2 +
          Math.max(12, Math.round(textSize * 0.78))
      ),
    );
  };
  const resolveChrome = (accentColor: string) => {
    if (style === 'plain' || style === 'media' || style === 'silver') return null;
    if (style === 'glass') {
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
    `<defs><filter id="${filterId}" x="-28%" y="-34%" width="156%" height="188%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="2" stdDeviation="3.6" flood-color="#020617" flood-opacity="0.72" /><feDropShadow dx="0" dy="0" stdDeviation="2.1" flood-color="#020617" flood-opacity="0.34" /></filter></defs>`;
  const buildPlainQualitySurface = (width: number, filterId: string) =>
    `<rect x="5" y="7" width="${Math.max(0, width - 10)}" height="${Math.max(0, h - 14)}" rx="${Math.max(8, Math.round(h * 0.24))}" fill="rgba(2,6,23,0.10)" filter="url(#${filterId})" />`;
  const buildSilverQualityMarkDefs = (filterId: string) =>
    `<defs><filter id="${filterId}" x="-25%" y="-30%" width="150%" height="170%" color-interpolation-filters="sRGB"><feDropShadow in="SourceAlpha" dx="0" dy="1.1" stdDeviation="1.8" flood-color="#020617" flood-opacity="0.52" result="silver-shadow" /><feFlood flood-color="#f4f4f5" flood-opacity="0.96" result="silver-fill" /><feComposite in="silver-fill" in2="SourceAlpha" operator="in" result="silver-mark" /><feMerge><feMergeNode in="silver-shadow" /><feMergeNode in="silver-mark" /></feMerge></filter></defs>`;
  const buildSilverQualityTextDefs = (filterId: string) =>
    `<defs><filter id="${filterId}" x="-25%" y="-30%" width="150%" height="170%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="1.1" stdDeviation="2.1" flood-color="#020617" flood-opacity="0.56" /></filter></defs>`;
  const buildAssetBackedBadgeSvg = (
    assetKey: MediaBadgeAssetId,
    variant: 'media' | 'standard',
  ) => {
    const asset = MEDIA_BADGE_ASSETS[assetKey];
    const width = widthOverride ?? Math.round(h * asset.widthRatio);
    const horizontalPadding = Math.round(h * asset.horizontalPaddingRatio);
    const isPlainStandard = variant === 'standard' && style === 'plain';
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
        ? `${buildPlainQualityShadowDefs('quality-badge-plain-shadow')}<defs><filter id="quality-badge-logo-shadow" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="1" stdDeviation="2.1" flood-color="#000000" flood-opacity="0.52" /></filter></defs>`
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
  dataUri: asset.dataUri,
  width,
  height: h,
  assetAspectRatio: asset.aspectRatio,
  horizontalPadding,
  heightRatio: asset.heightRatio,
  yOffset: Math.round(h * (asset.yOffsetRatio || 0)),
  extraAttributes: assetExtraAttributes,
})}
</svg>`,
    };
  };

  if (style === 'media') {
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
    const fill = style === 'plain' ? mediaText : '#e5e7eb';
    const filter = style === 'plain' ? ' filter="url(#quality-badge-text-shadow)"' : '';
    const defs =
      style === 'plain'
        ? `${buildPlainQualityShadowDefs('quality-badge-text-surface')}<defs><filter id="quality-badge-text-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="2.2" flood-color="#000000" flood-opacity="0.56" /></filter></defs>`
        : '';
    const plainStroke =
      style === 'plain' ? buildPlainQualitySurface(width, 'quality-badge-text-surface') : '';
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">
${defs}
${style === 'plain' ? plainStroke : rect}
<text x="${width / 2}" y="${badgeTypeY}" font-family="${fontFamily}" font-size="${badgeTypeSize}" font-weight="700" text-anchor="middle" fill="${style === 'plain' ? 'rgba(245,245,244,0.84)' : 'rgba(229,231,235,0.74)'}"${filter}>${badgeTypeLabel}</text>
<text x="${width / 2}" y="${textY}" font-family="${fontFamily}" font-size="${textSize}" font-weight="800" text-anchor="middle" fill="${fill}"${filter}>${escapeXml(label)}</text>
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

  const accentColor = mediaFrameByKey[key as MediaFeatureBadgeKey]?.stroke ?? 'rgba(255,255,255,0.68)';
  const resolvedAccentColor = badge.accentColor || accentColor;

  if (hasStreamingServiceLogo) {
    const iconSize = Math.max(16, Math.round(h * 0.56));
    const iconPlateSize = Math.max(iconSize + 10, Math.round(h * 0.68));
    const sidePadding = Math.max(10, Math.round(h * 0.22));
    const contentGap = Math.max(9, Math.round(h * 0.16));
    const textSize = Math.round(h * 0.33);
    const width = widthOverride ?? Math.max(
      Math.round(h * 1.9),
      estimateQualityTextBadgeWidth(label, textSize, sidePadding + iconPlateSize + contentGap / 2),
    );
    const iconPlateX = sidePadding;
    const iconPlateY = Math.round((h - iconPlateSize) / 2);
    const iconX = Math.round(iconPlateX + (iconPlateSize - iconSize) / 2);
    const iconY = Math.round((h - iconSize) / 2);
    const textX = iconPlateX + iconPlateSize + contentGap;
    const textY = Math.round(h * 0.66);
    const textFilter = style === 'plain' ? ' filter="url(#quality-badge-stream-text-shadow)"' : '';
    const defs =
      style === 'plain'
        ? `${buildPlainQualityShadowDefs('quality-badge-stream-surface')}<defs><filter id="quality-badge-stream-logo-shadow" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="1" stdDeviation="2.1" flood-color="#000000" flood-opacity="0.52" /></filter><filter id="quality-badge-stream-text-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="2.2" flood-color="#000000" flood-opacity="0.56" /></filter></defs>`
        : '';
    const backgroundMarkup =
      style === 'media'
        ? buildMediaPlate(width, {
            stroke: hexColorToRgba(resolvedAccentColor, 0.68, 'rgba(255,255,255,0.68)'),
            fill: 'rgba(12,18,32,0.24)',
            strokeScale: 0.78,
            radiusScale: 0.27,
            highlightOpacity: 0.055,
          })
        : style === 'plain'
          ? buildPlainQualitySurface(width, 'quality-badge-stream-surface')
          : buildRect(width, resolvedAccentColor);
    const iconPlateRadius = Math.max(8, Math.round(iconPlateSize * 0.28));
    const iconPlateMarkup =
      style === 'plain'
        ? `<rect x="${iconPlateX}" y="${iconPlateY}" width="${iconPlateSize}" height="${iconPlateSize}" rx="${iconPlateRadius}" fill="rgba(2,6,23,0.28)" stroke="rgba(255,255,255,0.16)" stroke-width="1" />`
        : `<rect x="${iconPlateX}" y="${iconPlateY}" width="${iconPlateSize}" height="${iconPlateSize}" rx="${iconPlateRadius}" fill="rgba(255,255,255,0.08)" stroke="${hexColorToRgba(resolvedAccentColor, 0.32, 'rgba(255,255,255,0.24)')}" stroke-width="1" />`;
    const logoExtraAttributes = style === 'plain' ? 'filter="url(#quality-badge-stream-logo-shadow)"' : '';

    return {
      width,
      height: h,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">
${defs}
${backgroundMarkup}
${iconPlateMarkup}
${buildCenteredProviderLogoImage({
  dataUri: badge.iconDataUri as string,
  x: iconX,
  y: iconY,
  size: iconSize,
  extraAttributes: logoExtraAttributes,
})}
<text x="${textX}" y="${textY}" font-family="${fontFamily}" font-size="${textSize}" font-weight="800" text-anchor="start" fill="${style === 'plain' ? hexColorToRgba(resolvedAccentColor, 0.96, '#f5f5f4') : '#f5f5f4'}"${textFilter}>${escapeXml(label)}</text>
</svg>`,
    };
  }

  const textSize = Math.round(h * 0.33);
  const sidePadding = Math.max(10, Math.round(h * 0.24));
  const textWidth = widthOverride ?? estimateQualityTextBadgeWidth(label, textSize, sidePadding);
  const textY = Math.round(h * 0.66);
  if (style === 'media') {
    return {
      width: textWidth,
      height: h,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${textWidth}" height="${h}" viewBox="0 0 ${textWidth} ${h}">
${buildMediaPlate(textWidth, {
  stroke: hexColorToRgba(resolvedAccentColor, 0.68, 'rgba(255,255,255,0.68)'),
  fill: 'rgba(12,18,32,0.24)',
  strokeScale: 0.78,
  radiusScale: 0.27,
  highlightOpacity: 0.055,
})}
<text x="${textWidth / 2}" y="${textY}" font-family="${fontFamily}" font-size="${textSize}" font-weight="800" text-anchor="middle" fill="${hexColorToRgba(resolvedAccentColor, 0.97, '#f5f5f4')}" letter-spacing="0.012em">${escapeXml(label)}</text>
</svg>`,
    };
  }

  const rect = buildRect(textWidth, resolvedAccentColor);
  const plainStroke =
    style === 'plain' ? buildPlainQualitySurface(textWidth, 'quality-badge-text-fallback-surface') : '';
  const filter = style === 'plain' ? ' filter="url(#quality-badge-text-fallback-shadow)"' : '';
  const defs =
    style === 'plain'
      ? `${buildPlainQualityShadowDefs('quality-badge-text-fallback-surface')}<defs><filter id="quality-badge-text-fallback-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="2.2" flood-color="#000000" flood-opacity="0.56" /></filter></defs>`
      : '';
  const textFill =
    style === 'plain' ? hexColorToRgba(resolvedAccentColor, 0.95, '#f5f5f4') : '#f5f5f4';
  return {
    width: textWidth,
    height: h,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${textWidth}" height="${h}" viewBox="0 0 ${textWidth} ${h}">
${defs}
${style === 'plain' ? plainStroke : rect}
<text x="${textWidth / 2}" y="${textY}" font-family="${fontFamily}" font-size="${textSize}" font-weight="800" text-anchor="middle" fill="${textFill}"${filter}>${escapeXml(label)}</text>
</svg>`,
  };
};
