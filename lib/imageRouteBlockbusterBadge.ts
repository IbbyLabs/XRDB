import { type BadgeKey } from './imageRouteConfig.ts';
import { parseNumericRatingValue } from './ratingDisplay.ts';
import { sha1Hex } from './imageRouteRuntime.ts';
import { escapeXml, estimateGeneratedLogoLineWidth } from './imageRouteText.ts';

export type BlockbusterBadgeInput = {
  key: BadgeKey;
  label: string;
  value: string;
  sourceValue?: string;
  accentColor: string;
  variant?: 'standard' | 'minimal' | 'summary';
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

const parseDisplayRatingNumber = (value: string) => {
  const numericCandidate = value.replace('%', '').split('/')[0].replace(',', '.').trim();
  return parseNumericRatingValue(numericCandidate);
};

const BLOCKBUSTER_CALLOUT_PRIORITY = new Map<BadgeKey, number>([
  ['tomatoes', 0],
  ['metacritic', 1],
  ['rogerebert', 2],
  ['mdblist', 3],
  ['tomatoesaudience', 4],
  ['metacriticuser', 5],
  ['imdb', 6],
  ['letterboxd', 7],
  ['tmdb', 8],
  ['trakt', 9],
  ['myanimelist', 10],
  ['anilist', 11],
  ['kitsu', 12],
]);

export const getBlockbusterCalloutHeadline = (badge: BlockbusterBadgeInput) => {
  const numericValue = parseDisplayRatingNumber(String(badge.sourceValue || badge.value));

  if ((badge.key === 'tomatoes' || badge.key === 'tomatoesaudience') && numericValue !== null) {
    return numericValue >= 60 ? 'FRESH' : 'ROTTEN';
  }

  if (badge.key === 'metacritic' && numericValue !== null) {
    if (numericValue >= 81) return 'UNIVERSAL ACCLAIM';
    if (numericValue >= 61) return 'GENERALLY FAVORABLE';
    if (numericValue >= 40) return 'MIXED REVIEWS';
    if (numericValue >= 20) return 'GENERALLY UNFAVORABLE';
    return 'OVERWHELMING DISLIKE';
  }

  if (badge.key === 'metacriticuser' && numericValue !== null) {
    if (numericValue >= 8) return 'UNIVERSAL ACCLAIM';
    if (numericValue >= 6) return 'GENERALLY FAVORABLE';
    if (numericValue >= 4) return 'MIXED REVIEWS';
    if (numericValue >= 2) return 'GENERALLY UNFAVORABLE';
    return 'OVERWHELMING DISLIKE';
  }

  return badge.label.trim().toUpperCase();
};

export const getBlockbusterCalloutDetail = (badge: BlockbusterBadgeInput, headline: string) => {
  const label =
    badge.key === 'tomatoesaudience'
      ? 'AUDIENCE'
      : badge.key === 'metacriticuser'
        ? 'USER SCORE'
        : badge.label.trim().toUpperCase();
  const sourceValue = String(badge.sourceValue || badge.value || '')
    .trim()
    .replace(/(\d+)\.0(%|\/10|\/5|\/4)$/i, '$1$2')
    .replace(/(\d+)\.0$/i, '$1')
    .toUpperCase();
  if (!sourceValue) return label;
  return headline === label ? sourceValue : `${label} ${sourceValue}`;
};

const sortBlockbusterBadgesByPriority = (badges: BlockbusterBadgeInput[]) =>
  badges
    .filter(
      (badge) =>
        badge.variant !== 'minimal' &&
        badge.variant !== 'summary' &&
        badge.label.trim().length > 0 &&
        String(badge.sourceValue || badge.value || '').trim().length > 0
    )
    .map((badge) => ({
      badge,
      numericValue: parseDisplayRatingNumber(String(badge.sourceValue || badge.value)),
      priority:
        BLOCKBUSTER_CALLOUT_PRIORITY.get(badge.key) ?? BLOCKBUSTER_CALLOUT_PRIORITY.size + 1,
    }))
    .sort((left, right) => {
      if (left.priority !== right.priority) return left.priority - right.priority;
      if (left.numericValue !== null && right.numericValue !== null) {
        return right.numericValue - left.numericValue;
      }
      if (left.numericValue !== null) return -1;
      if (right.numericValue !== null) return 1;
      return left.badge.label.localeCompare(right.badge.label);
    })
    .map(({ badge }) => badge);

export const pickBlockbusterCalloutBadges = (badges: BlockbusterBadgeInput[]) =>
  sortBlockbusterBadgesByPriority(badges);

export const pickBlockbusterScoreBadges = (badges: BlockbusterBadgeInput[]) =>
  sortBlockbusterBadgesByPriority(badges);

export const buildBlockbusterCalloutSvg = ({
  headline,
  detail,
  accentColor,
  rotation,
  iconDataUri,
  iconMonogram,
}: {
  headline: string;
  detail: string;
  accentColor: string;
  rotation: number;
  iconDataUri?: string | null;
  iconMonogram?: string;
}) => {
  const normalizedHeadline = headline.trim().toUpperCase();
  const normalizedDetail = detail.trim().toUpperCase();
  const headlineFontSize =
    normalizedHeadline.length > 22 ? 12 : normalizedHeadline.length > 15 ? 13 : 15;
  const detailFontSize = normalizedDetail.length > 24 ? 8.5 : 9.5;
  const padX = 13;
  const padTop = 8;
  const padBottom = 8;
  const iconPlateSize = 22;
  const iconGap = 7;
  const hasIconPlate = Boolean(iconDataUri || iconMonogram);
  const stripeHeight = 3.5;
  const lineGap = 4;
  const availableHeadlineWidth = estimateGeneratedLogoLineWidth(normalizedHeadline, headlineFontSize);
  const availableDetailWidth = estimateGeneratedLogoLineWidth(normalizedDetail, detailFontSize);
  const iconSpace = hasIconPlate ? iconPlateSize + iconGap : 0;
  const contentWidth = Math.max(availableHeadlineWidth, availableDetailWidth) + iconSpace;
  const stickerWidth = Math.max(118, Math.min(198, Math.round(contentWidth + padX * 2)));
  const stickerHeight =
    padTop + headlineFontSize + lineGap + detailFontSize + padBottom + stripeHeight;
  const svgWidth = stickerWidth + 14;
  const svgHeight = stickerHeight + 14;
  const centerX = Math.round(svgWidth / 2);
  const centerY = Math.round(svgHeight / 2);
  const iconPlateX = padX;
  const iconPlateY = Math.round((stickerHeight - stripeHeight - iconPlateSize) / 2);
  const iconSize = 15;
  const iconX = iconPlateX + Math.round((iconPlateSize - iconSize) / 2);
  const iconY = iconPlateY + Math.round((iconPlateSize - iconSize) / 2);
  const textX = padX + iconSpace;
  const headlineY = padTop + headlineFontSize;
  const detailY = headlineY + lineGap + detailFontSize;
  const availableTextWidth = Math.max(0, stickerWidth - padX * 2 - iconSpace);
  const headlineTextLength =
    availableHeadlineWidth > availableTextWidth
      ? ` textLength="${availableTextWidth}" lengthAdjust="spacingAndGlyphs"`
      : '';
  const detailTextLength =
    availableDetailWidth > availableTextWidth
      ? ` textLength="${availableTextWidth}" lengthAdjust="spacingAndGlyphs"`
      : '';
  const cardStroke = hexColorToRgba(accentColor, 0.34, 'rgba(167,139,250,0.34)');
  const paperFill = 'rgba(253,251,246,0.98)';
  const paperShade = 'rgba(255,255,255,0.52)';

  return {
    width: svgWidth,
    height: svgHeight,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
<defs>
<filter id="blockbuster-callout-shadow" x="-20%" y="-20%" width="140%" height="150%" color-interpolation-filters="sRGB">
<feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#020617" flood-opacity="0.12" />
</filter>
</defs>
<g filter="url(#blockbuster-callout-shadow)" transform="translate(${centerX},${centerY}) rotate(${rotation}) translate(${-Math.round(stickerWidth / 2)},${-Math.round(stickerHeight / 2)})">
<rect x="0" y="0" width="${stickerWidth}" height="${stickerHeight}" rx="9" fill="${paperFill}" stroke="${cardStroke}" stroke-width="1.1" />
<rect x="0" y="0" width="${stickerWidth}" height="${Math.max(12, Math.round(stickerHeight * 0.38))}" rx="9" fill="${paperShade}" />
${hasIconPlate ? `<rect x="${iconPlateX}" y="${iconPlateY}" width="${iconPlateSize}" height="${iconPlateSize}" rx="11" fill="rgba(255,255,255,0.98)" stroke="${cardStroke}" stroke-width="0.8" />` : ''}
${iconDataUri ? `<image href="${iconDataUri}" x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}" />` : ''}
${!iconDataUri && iconMonogram ? `<text x="${Math.round(iconPlateX + iconPlateSize / 2)}" y="${Math.round(iconPlateY + iconPlateSize / 2 + 4)}" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="10" font-weight="900" text-anchor="middle" fill="rgba(17,24,39,0.84)">${escapeXml(iconMonogram.slice(0, 2))}</text>` : ''}
<rect x="0" y="${Math.max(0, stickerHeight - stripeHeight)}" width="${stickerWidth}" height="${stripeHeight}" rx="${Math.max(2, Math.round(stripeHeight / 2))}" fill="${accentColor}" fill-opacity="0.88" />
<text x="${textX}" y="${headlineY}" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="${headlineFontSize}" font-weight="900" fill="#111827"${headlineTextLength}>${escapeXml(normalizedHeadline)}</text>
<text x="${textX}" y="${detailY}" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="${detailFontSize}" font-weight="800" fill="rgba(17,24,39,0.78)"${detailTextLength}>${escapeXml(normalizedDetail)}</text>
</g>
</svg>`,
  };
};

export const buildBlockbusterScoreTileSvg = ({
  badge,
  iconDataUri,
  iconMonogram,
}: {
  badge: BlockbusterBadgeInput;
  iconDataUri?: string | null;
  iconMonogram?: string;
}) => {
  const normalizedValue = String(badge.sourceValue || badge.value || '')
    .trim()
    .replace(/(\d+)\.0(%|\/10|\/5|\/4)$/i, '$1$2')
    .replace(/(\d+)\.0$/i, '$1')
    .toUpperCase();
  const tileKind =
    badge.key === 'tomatoes' || badge.key === 'tomatoesaudience'
      ? 'seal'
      : badge.key === 'metacritic' || badge.key === 'metacriticuser' || badge.key === 'mdblist'
        ? 'tile'
        : 'pill';
  const accent = badge.accentColor;

  if (tileKind === 'seal') {
    const size = 64;
    const iconSize = 18;
    const fontSize = normalizedValue.length > 3 ? 18 : 21;
    const label = badge.key === 'tomatoesaudience' ? 'AUDIENCE' : badge.label.trim().toUpperCase();
    return {
      width: size + 14,
      height: size + 14,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${size + 14}" height="${size + 14}" viewBox="0 0 ${size + 14} ${size + 14}">
<defs><filter id="blockbuster-seal-shadow" x="-20%" y="-20%" width="150%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#020617" flood-opacity="0.16" /></filter></defs>
<g filter="url(#blockbuster-seal-shadow)" transform="translate(7,7)">
<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1.5}" fill="rgba(252,252,251,0.98)" stroke="${accent}" stroke-width="3" />
${iconDataUri ? `<image href="${iconDataUri}" x="${Math.round(size / 2 - iconSize / 2)}" y="11" width="${iconSize}" height="${iconSize}" />` : ''}
${!iconDataUri && iconMonogram ? `<text x="${Math.round(size / 2)}" y="25" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="10" font-weight="900" text-anchor="middle" fill="rgba(17,24,39,0.88)">${escapeXml(iconMonogram.slice(0, 2))}</text>` : ''}
<text x="${Math.round(size / 2)}" y="${Math.round(size / 2 + 11)}" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="${fontSize}" font-weight="900" text-anchor="middle" fill="#111827">${escapeXml(normalizedValue)}</text>
<text x="${Math.round(size / 2)}" y="${size - 11}" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="7.5" font-weight="900" text-anchor="middle" fill="rgba(17,24,39,0.70)">${escapeXml(label.slice(0, 12))}</text>
</g>
</svg>`,
    };
  }

  if (tileKind === 'tile') {
    const width = 58;
    const height = 52;
    const iconSize = 16;
    const fontSize = normalizedValue.length > 3 ? 17 : 20;
    return {
      width: width + 12,
      height: height + 12,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width + 12}" height="${height + 12}" viewBox="0 0 ${width + 12} ${height + 12}">
<defs><filter id="blockbuster-tile-shadow" x="-20%" y="-20%" width="150%" height="150%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#020617" flood-opacity="0.15" /></filter></defs>
<g filter="url(#blockbuster-tile-shadow)" transform="translate(6,6)">
<rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="rgba(250,250,249,0.98)" stroke="${accent}" stroke-width="2.4" />
${iconDataUri ? `<image href="${iconDataUri}" x="8" y="8" width="${iconSize}" height="${iconSize}" />` : ''}
${!iconDataUri && iconMonogram ? `<text x="16" y="21" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="10" font-weight="900" text-anchor="middle" fill="rgba(17,24,39,0.84)">${escapeXml(iconMonogram.slice(0, 2))}</text>` : ''}
<text x="${Math.round(width / 2)}" y="${Math.round(height / 2 + 14)}" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="${fontSize}" font-weight="900" text-anchor="middle" fill="#111827">${escapeXml(normalizedValue)}</text>
</g>
</svg>`,
    };
  }

  const width = Math.max(72, Math.min(94, 38 + estimateGeneratedLogoLineWidth(normalizedValue, 17)));
  const height = 36;
  const iconSize = 14;
  return {
    width: width + 12,
    height: height + 12,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width + 12}" height="${height + 12}" viewBox="0 0 ${width + 12} ${height + 12}">
<defs><filter id="blockbuster-pill-shadow" x="-20%" y="-20%" width="150%" height="150%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#020617" flood-opacity="0.12" /></filter></defs>
<g filter="url(#blockbuster-pill-shadow)" transform="translate(6,6)">
<rect x="0" y="0" width="${width}" height="${height}" rx="${Math.round(height / 2)}" fill="rgba(13,18,28,0.88)" stroke="${accent}" stroke-opacity="0.52" stroke-width="1.4" />
${iconDataUri ? `<image href="${iconDataUri}" x="10" y="${Math.round((height - iconSize) / 2)}" width="${iconSize}" height="${iconSize}" />` : ''}
${!iconDataUri && iconMonogram ? `<text x="17" y="${Math.round(height / 2 + 4)}" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="10" font-weight="900" text-anchor="middle" fill="white">${escapeXml(iconMonogram.slice(0, 2))}</text>` : ''}
<text x="${iconDataUri || iconMonogram ? 32 : 12}" y="${Math.round(height / 2 + 6)}" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="17" font-weight="900" fill="white">${escapeXml(normalizedValue)}</text>
</g>
</svg>`,
  };
};

export const getBlockbusterBadgeChaos = (badge: BlockbusterBadgeInput, seedSalt = '') => {
  const hash = sha1Hex(`${seedSalt}:${badge.key}:${badge.label}:${badge.value}`);
  const read = (start: number, length = 4) =>
    Number.parseInt(hash.slice(start, start + length), 16) || 0;
  return {
    rotation: ((read(0) % 3400) / 100) - 17,
    xJitter: (read(4) % 145) - 72,
    yJitter: (read(8) % 125) - 62,
    opacity: 0.40 + (read(12) % 17) / 100,
    spreadX: (read(16) % 1000) / 1000,
    spreadY: (read(20) % 1000) / 1000,
  };
};
