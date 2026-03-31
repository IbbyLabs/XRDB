import { Buffer } from 'node:buffer';

import { type BlockbusterDensity } from './imageRouteConfig.ts';

export const BLOCKBUSTER_DENSITY_PRESETS = {
  sparse: {
    calloutLimit: 3,
    blurbLimit: 3,
    calloutScales: [0.94, 0.9, 0.86, 0.82, 0.78],
    blurbScales: [0.96, 0.9, 0.84],
    badgeScales: [0.9, 0.86, 0.82, 0.78, 0.74, 0.7, 0.66, 0.62],
    calloutAttempts: 180,
    blurbAttempts: 180,
    badgeAttempts: 220,
    calloutPadding: 8,
    blurbPadding: 8,
    badgePadding: 3,
  },
  balanced: {
    calloutLimit: 4,
    blurbLimit: 4,
    calloutScales: [0.96, 0.92, 0.88, 0.84, 0.8, 0.76],
    blurbScales: [0.98, 0.92, 0.86, 0.8],
    badgeScales: [0.92, 0.88, 0.84, 0.8, 0.76, 0.72, 0.68, 0.64, 0.6, 0.56],
    calloutAttempts: 220,
    blurbAttempts: 220,
    badgeAttempts: 280,
    calloutPadding: 6,
    blurbPadding: 6,
    badgePadding: 2,
  },
  packed: {
    calloutLimit: 4,
    blurbLimit: 6,
    calloutScales: [0.98, 0.94, 0.9, 0.86, 0.82, 0.78, 0.74],
    blurbScales: [1, 0.94, 0.88, 0.82, 0.76],
    badgeScales: [0.94, 0.9, 0.86, 0.82, 0.78, 0.74, 0.7, 0.66, 0.62, 0.58, 0.54, 0.5],
    calloutAttempts: 260,
    blurbAttempts: 260,
    badgeAttempts: 340,
    calloutPadding: 4,
    blurbPadding: 4,
    badgePadding: 1,
  },
} satisfies Record<
  BlockbusterDensity,
  {
    calloutLimit: number;
    blurbLimit: number;
    calloutScales: number[];
    blurbScales: number[];
    badgeScales: number[];
    calloutAttempts: number;
    blurbAttempts: number;
    badgeAttempts: number;
    calloutPadding: number;
    blurbPadding: number;
    badgePadding: number;
  }
>;

export const getBlockbusterDensityScale = (values: number[], index: number) =>
  values[Math.max(0, Math.min(index, values.length - 1))] ?? 1;

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

export const hexColorToRgba = (
  value: string,
  alpha: number,
  fallback = `rgba(167,139,250,${alpha})`,
) => {
  const parsed = parseHexColor(value);
  if (!parsed) return fallback;
  return `rgba(${parsed.r},${parsed.g},${parsed.b},${alpha})`;
};

export const buildProviderMonogram = (label: string) => {
  const cleaned = label.replace(/[^A-Za-z0-9]+/g, ' ').trim();
  if (!cleaned) return 'R';
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
};

export const buildTransformedSvgOverlay = ({
  svg,
  width,
  height,
  rotation,
  opacity,
  scale = 1,
  skewX = 0,
  skewY = 0,
  pad = 18,
}: {
  svg: string;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  scale?: number;
  skewX?: number;
  skewY?: number;
  pad?: number;
}) => {
  const normalizedScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const normalizedSkewX = Number.isFinite(skewX) ? skewX : 0;
  const normalizedSkewY = Number.isFinite(skewY) ? skewY : 0;
  const rotationRadians = Math.abs(rotation) * (Math.PI / 180);
  const skewXRadians = Math.abs(normalizedSkewX) * (Math.PI / 180);
  const skewYRadians = Math.abs(normalizedSkewY) * (Math.PI / 180);
  const skewedWidth = width + Math.abs(height * Math.tan(skewXRadians));
  const skewedHeight = height + Math.abs(width * Math.tan(skewYRadians));
  const transformedWidth =
    Math.abs(skewedWidth * Math.cos(rotationRadians)) +
    Math.abs(skewedHeight * Math.sin(rotationRadians));
  const transformedHeight =
    Math.abs(skewedWidth * Math.sin(rotationRadians)) +
    Math.abs(skewedHeight * Math.cos(rotationRadians));
  const scaledWidth = Math.max(1, Math.ceil(transformedWidth * normalizedScale));
  const scaledHeight = Math.max(1, Math.ceil(transformedHeight * normalizedScale));
  const outerWidth = scaledWidth + pad * 2;
  const outerHeight = scaledHeight + pad * 2;
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return {
    width: outerWidth,
    height: outerHeight,
    offsetX: Math.round((outerWidth - scaledWidth) / 2),
    offsetY: Math.round((outerHeight - scaledHeight) / 2),
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${outerWidth}" height="${outerHeight}" viewBox="0 0 ${outerWidth} ${outerHeight}">
<g opacity="${opacity}" transform="translate(${Math.round(outerWidth / 2)},${Math.round(outerHeight / 2)}) rotate(${rotation}) skewX(${normalizedSkewX}) skewY(${normalizedSkewY}) scale(${normalizedScale}) translate(${-Math.round(width / 2)},${-Math.round(height / 2)})">
<image href="${dataUri}" x="0" y="0" width="${width}" height="${height}" />
</g>
</svg>`,
  };
};
