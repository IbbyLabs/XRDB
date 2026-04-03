import { DEFAULT_BADGE_SCALE_PERCENT } from './badgeCustomization.ts';
import {
  type GenreBadgeFamilyId,
  type GenreBadgeMode,
  type GenreBadgeStyle,
} from './genreBadge.ts';
import { estimateSummaryLabelWidth } from './imageRouteBadgeMetrics.ts';
import { escapeXml } from './imageRouteText.ts';

export type GenreBadgeRenderSpec = {
  familyId: GenreBadgeFamilyId;
  label: string;
  accentColor: string;
  mode: GenreBadgeMode;
  style: GenreBadgeStyle;
  scalePercent?: number;
};

const estimateGenreBadgeLabelWidth = (label: string, fontSize: number) => {
  const normalized = label.trim().toUpperCase();
  if (!normalized) return Math.max(fontSize * 2, Math.round(fontSize * 2.2));
  const baseWidth = estimateSummaryLabelWidth(normalized, fontSize);
  const letterSpacingWidth = Math.round(Math.max(0, normalized.length - 1) * fontSize * 0.08);
  const safetyWidth = Math.max(10, Math.round(fontSize * 0.62));
  return Math.max(Math.round(fontSize * 2.2), baseWidth + letterSpacingWidth + safetyWidth);
};

const buildGenreBadgeIconMarkup = ({
  familyId,
  color,
}: {
  familyId: GenreBadgeFamilyId;
  color: string;
}) => {
  if (familyId === 'anime') {
    return `<path d="M12 2 14.8 9.2 22 12 14.8 14.8 12 22 9.2 14.8 2 12 9.2 9.2Z" fill="${color}" opacity="0.96"/>`;
  }

  if (familyId === 'animation') {
    return `<rect x="4.1" y="5.3" width="15.8" height="13.4" rx="2.4" fill="none" stroke="${color}" stroke-width="1.9"/><path d="M9.4 8.4 15.9 12 9.4 15.6Z" fill="${color}" opacity="0.96"/><circle cx="6.2" cy="8.2" r="0.8" fill="${color}"/><circle cx="17.8" cy="8.2" r="0.8" fill="${color}"/><circle cx="6.2" cy="15.8" r="0.8" fill="${color}"/><circle cx="17.8" cy="15.8" r="0.8" fill="${color}"/>`;
  }

  if (familyId === 'horror') {
    return `<path d="M12 3c4.6 0 8 3.3 8 7.9 0 2.3-.9 4.2-2.4 5.7V20h-3v-2h-1v2h-3v-2H9v2H6v-3.4A7.8 7.8 0 0 1 4 10.9C4 6.3 7.4 3 12 3Z" fill="${color}" opacity="0.96"/><circle cx="9" cy="11" r="1.5" fill="#05070b"/><circle cx="15" cy="11" r="1.5" fill="#05070b"/><rect x="10.4" y="14.6" width="3.2" height="2.2" rx="1.1" fill="#05070b"/>`;
  }

  if (familyId === 'comedy') {
    return `<circle cx="12" cy="12" r="8.6" fill="none" stroke="${color}" stroke-width="2.1"/><circle cx="9.1" cy="10.1" r="1.1" fill="${color}"/><circle cx="14.9" cy="10.1" r="1.1" fill="${color}"/><path d="M8 14.3c1.1 1.8 2.4 2.7 4 2.7s2.9-.9 4-2.7" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
  }

  if (familyId === 'romance') {
    return `<path d="M12 20.2 4.9 13.4C3.7 12.2 3 10.7 3 9.1 3 6 5.3 4 8.2 4c1.7 0 3.2.8 3.8 2.1C12.6 4.8 14.1 4 15.8 4 18.7 4 21 6 21 9.1c0 1.6-.7 3.1-1.9 4.3L12 20.2Z" fill="${color}" opacity="0.97"/>`;
  }

  if (familyId === 'action') {
    return `<path d="M13.8 2 6.9 12h4l-1.1 10L17.1 12h-4L13.8 2Z" fill="${color}" opacity="0.97"/>`;
  }

  if (familyId === 'scifi') {
    return `<ellipse cx="12" cy="12" rx="8.8" ry="4.4" fill="none" stroke="${color}" stroke-width="1.9" transform="rotate(-24 12 12)"/><circle cx="12" cy="12" r="3.2" fill="${color}" opacity="0.92"/><circle cx="18.2" cy="8.8" r="1.4" fill="${color}"/>`;
  }

  if (familyId === 'fantasy') {
    return `<path d="M12 3 15.1 6.1 13.1 8.1v6.8l1.9 1.9-1.2 1.2-1.8-1.8-1.8 1.8-1.2-1.2 1.9-1.9V8.1L8.9 6.1 12 3Z" fill="${color}" opacity="0.96"/><rect x="7" y="13.8" width="10" height="2.2" rx="1.1" fill="${color}"/>`;
  }

  if (familyId === 'crime') {
    return `<path d="M12 3 18.3 5.7V11c0 4.2-2.5 7.2-6.3 9.1C8.2 18.2 5.7 15.2 5.7 11V5.7L12 3Z" fill="none" stroke="${color}" stroke-width="2"/><path d="M9 10.2h6M9 13.8h6" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`;
  }

  if (familyId === 'drama') {
    return `<path d="M7.1 5.1h4.3c1.4 0 2.6 1.1 2.6 2.6V15c0 2.4-1.8 4.2-4.3 4.2S5.4 17.4 5.4 15V6.8c0-.9.7-1.7 1.7-1.7Z" fill="none" stroke="${color}" stroke-width="1.8"/><path d="M14.2 6.2h2.8c1 0 1.7.8 1.7 1.7v6.4c0 2.2-1.6 4-3.9 4H12" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="10.3" r="1" fill="${color}"/><circle cx="12" cy="10.3" r="1" fill="${color}"/><path d="M8.3 14c.9.9 1.8 1.3 2.7 1.3s1.8-.4 2.7-1.3" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round"/><circle cx="15.6" cy="10.8" r="0.9" fill="${color}"/><circle cx="18" cy="10.8" r="0.9" fill="${color}"/><path d="M15.1 14.8c.8-.8 1.7-1.2 2.5-1.2.4 0 .8.1 1.2.3" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>`;
  }

  return `<rect x="4" y="7" width="12" height="9.5" rx="2" fill="none" stroke="${color}" stroke-width="2"/><rect x="8" y="4.5" width="4.4" height="2.7" rx="1.2" fill="${color}"/><circle cx="10" cy="11.8" r="2.1" fill="${color}"/><path d="M16 9.2 20.5 7.1v9.4L16 14.4Z" fill="${color}" opacity="0.96"/>`;
};

export const buildGenreBadgeSvg = (
  genreBadge: GenreBadgeRenderSpec,
  imageType: 'poster' | 'backdrop' | 'logo',
) => {
  const baseHeight =
    imageType === 'logo'
      ? 38
      : imageType === 'backdrop'
        ? 44
        : 40;
  const scaleRatio = Math.max(0.7, (genreBadge.scalePercent ?? DEFAULT_BADGE_SCALE_PERCENT) / 100);
  const height = Math.max(
    genreBadge.style === 'plain' ? 26 : 30,
    Math.round(baseHeight * scaleRatio),
  );
  const radius =
    genreBadge.style === 'square' ? Math.max(10, Math.round(height * 0.28)) : Math.round(height / 2);
  const strokeWidth = genreBadge.style === 'plain' ? 0 : imageType === 'backdrop' ? 1.5 : 1.4;
  const iconSize = Math.round(height * (imageType === 'backdrop' ? 0.46 : 0.48));
  const fontSize = genreBadge.mode === 'text' ? Math.round(height * 0.37) : Math.round(height * 0.34);
  const label = genreBadge.label.trim().toUpperCase();
  const showIcon = genreBadge.mode === 'icon' || genreBadge.mode === 'both';
  const showText = genreBadge.mode === 'text' || genreBadge.mode === 'both';
  const paddingX =
    genreBadge.style === 'plain'
      ? showText
        ? showIcon
          ? 8
          : 6
        : 4
      : showText
        ? showIcon
          ? 13
          : 15
        : 12;
  const iconGap = showIcon && showText ? Math.max(7, Math.round(height * 0.16)) : 0;
  const labelWidth = showText ? estimateGenreBadgeLabelWidth(label, fontSize) : 0;
  const width = Math.max(
    height,
    paddingX * 2 + (showIcon ? iconSize : 0) + iconGap + labelWidth,
  );
  const iconX = showText ? paddingX : Math.round((width - iconSize) / 2);
  const iconY = Math.round((height - iconSize) / 2);
  const iconCenterX = Math.round(iconX + iconSize / 2);
  const iconCenterY = Math.round(iconY + iconSize / 2);
  const textX = iconX + (showIcon ? iconSize + iconGap : 0);
  const textCenterX = textX + Math.round(labelWidth / 2);
  const textY = Math.round(height / 2 + fontSize * 0.05);
  const iconMarkup = showIcon
    ? `<g transform="translate(${iconCenterX} ${iconCenterY}) scale(${iconSize / 24}) translate(-12 -12)">${buildGenreBadgeIconMarkup({
        familyId: genreBadge.familyId,
        color: genreBadge.accentColor,
      })}</g>`
    : '';
  const textMarkup = showText
    ? `<text x="${textCenterX}" y="${textY}" text-anchor="middle" dominant-baseline="middle" font-family="'Space Grotesk','Noto Sans',Arial,sans-serif" font-size="${fontSize}" font-weight="700" letter-spacing="0.08em" fill="${genreBadge.accentColor}">${escapeXml(label)}</text>`
    : '';
  const plainShadowFilter = `<defs><filter id="genreBadgeShadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="1.6" stdDeviation="2.2" flood-color="rgba(0,0,0,0.68)"/><feDropShadow dx="0" dy="0" stdDeviation="1.1" flood-color="rgba(0,0,0,0.32)"/></filter></defs>`;

  if (genreBadge.style === 'plain') {
    return {
      width,
      height,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${plainShadowFilter}
<g filter="url(#genreBadgeShadow)">
${iconMarkup}
${textMarkup}
</g>
</svg>`,
    };
  }

  if (genreBadge.style === 'square') {
    const capHeight = Math.max(4, Math.round(height * 0.14));
    const capWidth = Math.min(width - 20, Math.max(Math.round(width * 0.34), 18));
    const capCenterX = showText ? textCenterX : Math.round(width / 2);
    const capLeft = Math.max(
      6,
      Math.min(width - capWidth - 6, Math.round(capCenterX - capWidth / 2)),
    );
    const capTop = 6;

    return {
      width,
      height,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect x="0.7" y="0.7" width="${Math.max(0, width - 1.4)}" height="${Math.max(0, height - 1.4)}" rx="${radius}" fill="rgba(8,11,16,0.88)" stroke="rgba(255,255,255,0.09)" stroke-width="1.4"/>
<rect x="${capLeft}" y="${capTop}" width="${capWidth}" height="${capHeight}" rx="${Math.round(capHeight / 2)}" fill="${genreBadge.accentColor}" opacity="0.92"/>
<rect x="4" y="4" width="${Math.max(0, width - 8)}" height="${Math.max(0, height - 8)}" rx="${Math.max(8, radius - 3)}" fill="rgba(255,255,255,0.03)"/>
${iconMarkup}
${textMarkup}
</svg>`,
    };
  }

  return {
    width,
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect x="${strokeWidth / 2}" y="${strokeWidth / 2}" width="${Math.max(0, width - strokeWidth)}" height="${Math.max(0, height - strokeWidth)}" rx="${radius}" fill="rgba(8,11,16,0.78)" stroke="${genreBadge.accentColor}" stroke-width="${strokeWidth}"/>
<rect x="${Math.max(2, strokeWidth)}" y="${Math.max(2, strokeWidth)}" width="${Math.max(0, width - Math.max(4, strokeWidth * 2))}" height="${Math.max(0, Math.round(height * 0.45))}" rx="${Math.max(8, radius - 4)}" fill="rgba(255,255,255,0.05)"/>
${iconMarkup}
${textMarkup}
</svg>`,
  };
};
