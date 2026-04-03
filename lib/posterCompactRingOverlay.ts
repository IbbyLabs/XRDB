import { escapeXml } from './imageRouteText.ts';

export type PosterCompactRingOverlaySpec = {
  width: number;
  height: number;
  top: number;
  left: number;
  svg: string;
};

const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const buildPosterCompactRingOverlay = ({
  outputWidth,
  outputHeight,
  valueText,
  progressPercent,
  accentColor,
}: {
  outputWidth: number;
  outputHeight: number;
  valueText: string;
  progressPercent: number;
  accentColor: string;
}): PosterCompactRingOverlaySpec => {
  const size = clampNumber(Math.round(outputWidth * 0.145), 76, 116);
  const inset = clampNumber(Math.round(size * 0.24), 18, 30);
  const ringStroke = clampNumber(Math.round(size * 0.11), 7, 12);
  const glowPad = Math.max(18, Math.round(size * 0.34));
  const totalSize = size + glowPad;
  const ringRadius = Math.round((size - ringStroke) / 2);
  const center = Math.round(totalSize / 2);
  const circleRadius = Math.max(10, ringRadius - ringStroke * 0.38);
  const normalizedProgress = clampNumber(Math.round(progressPercent), 0, 100);
  const circumference = 2 * Math.PI * ringRadius;
  const dashOffset = circumference * (1 - normalizedProgress / 100);
  const top = inset;
  const left = Math.max(inset, outputWidth - totalSize - inset);
  const valueFontSize = clampNumber(Math.round(size * 0.34), 24, 38);
  const trackColor = 'rgba(255,255,255,0.18)';

  return {
    width: totalSize,
    height: totalSize,
    top,
    left,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${totalSize}" height="${totalSize}" viewBox="0 0 ${totalSize} ${totalSize}">
<defs>
<filter id="compact-ring-glow" x="-70%" y="-70%" width="240%" height="240%" color-interpolation-filters="sRGB">
<feDropShadow dx="0" dy="0" stdDeviation="${Math.max(8, Math.round(ringStroke * 1.1))}" flood-color="${accentColor}" flood-opacity="0.58" />
<feDropShadow dx="0" dy="0" stdDeviation="${Math.max(3, Math.round(ringStroke * 0.55))}" flood-color="${accentColor}" flood-opacity="0.92" />
</filter>
<linearGradient id="compact-ring-surface" x1="0%" y1="0%" x2="100%" y2="100%">
<stop offset="0%" stop-color="#080b10" stop-opacity="0.94" />
<stop offset="100%" stop-color="#080b10" stop-opacity="0.82" />
</linearGradient>
</defs>
<rect x="${Math.round(glowPad / 2)}" y="${Math.round(glowPad / 2)}" width="${size}" height="${size}" rx="${Math.max(18, Math.round(size * 0.28))}" fill="url(#compact-ring-surface)" />
<circle cx="${center}" cy="${center}" r="${ringRadius}" fill="none" stroke="${trackColor}" stroke-width="${ringStroke}" />
<circle cx="${center}" cy="${center}" r="${ringRadius}" fill="none" stroke="${accentColor}" stroke-width="${ringStroke}" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}" transform="rotate(-90 ${center} ${center})" filter="url(#compact-ring-glow)" />
<circle cx="${center}" cy="${center}" r="${circleRadius}" fill="rgba(8,11,16,0.86)" />
<text x="${center}" y="${center + Math.round(valueFontSize * 0.08)}" font-family="'Space Grotesk','Noto Sans',Arial,sans-serif" font-size="${valueFontSize}" font-weight="700" text-anchor="middle" dominant-baseline="middle" fill="#f8fafc">${escapeXml(valueText)}</text>
</svg>`,
  };
};
