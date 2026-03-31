const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

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

const blendHexColors = (baseColor: string, blendColor: string, blendRatio: number) => {
  const base = parseHexColor(baseColor);
  const blend = parseHexColor(blendColor);
  if (!base || !blend) {
    return '#f8fafc';
  }
  const ratio = clamp(blendRatio, 0, 1);
  const inverseRatio = 1 - ratio;
  const toChannel = (left: number, right: number) =>
    Math.round(left * inverseRatio + right * ratio)
      .toString(16)
      .padStart(2, '0');

  return `#${toChannel(base.r, blend.r)}${toChannel(base.g, blend.g)}${toChannel(base.b, blend.b)}`;
};

const estimateTextWidth = (value: string, fontSize: number, letterSpacingEm = 0) => {
  const normalized = value.trim();
  if (!normalized) return 0;

  let width = 0;
  for (const char of normalized) {
    if (char === ' ') {
      width += fontSize * 0.34;
    } else if (char === '.' || char === ',' || char === ':') {
      width += fontSize * 0.24;
    } else if (char === '1' || char === 'I' || char === 'l') {
      width += fontSize * 0.4;
    } else if (char === 'M' || char === 'W' || char === '@' || char === '#') {
      width += fontSize * 0.86;
    } else if (/\d/.test(char)) {
      width += fontSize * 0.62;
    } else {
      width += fontSize * 0.64;
    }
  }

  return Math.round(width + Math.max(0, normalized.length - 1) * fontSize * letterSpacingEm);
};

export type EditorialRatingOverlayInput = {
  outputWidth: number;
  outputHeight: number;
  eyebrowText?: string | null;
  valueText: string;
  accentColor: string;
};

export type EditorialRatingOverlayLayout = {
  top: number;
  left: number;
  width: number;
  height: number;
  textX: number;
  eyebrowY: number;
  eyebrowFontSize: number;
  eyebrowLetterSpacingEm: number;
  valueY: number;
  valueFontSize: number;
  valueColor: string;
};

export type EditorialRatingOverlaySpec = EditorialRatingOverlayLayout & {
  svg: string;
};

export const computeEditorialRatingOverlayLayout = (
  input: EditorialRatingOverlayInput,
): EditorialRatingOverlayLayout => {
  const eyebrowText = String(input.eyebrowText || '').trim();
  const valueText = String(input.valueText || '').trim();

  const left = clamp(Math.round(input.outputWidth * 0.036), 18, 48);
  const top = clamp(Math.round(input.outputHeight * 0.03), 16, 44);
  const textX = clamp(Math.round(input.outputWidth * 0.004), 2, 8);
  const eyebrowFontSize = eyebrowText
    ? clamp(Math.round(input.outputWidth * 0.034), 14, 24)
    : 0;
  const eyebrowLetterSpacingEm = eyebrowText ? 0.075 : 0;
  const valueFontSize = clamp(Math.round(input.outputWidth * 0.076), 28, 54);
  const eyebrowWidth = eyebrowText
    ? estimateTextWidth(eyebrowText, eyebrowFontSize, eyebrowLetterSpacingEm)
    : 0;
  const valueWidth = estimateTextWidth(valueText, valueFontSize, 0);
  const width = Math.max(eyebrowWidth, valueWidth) + textX * 2;
  const topPadding = eyebrowText ? clamp(Math.round(valueFontSize * 0.08), 4, 8) : 2;
  const labelGap = eyebrowText ? clamp(Math.round(valueFontSize * 0.18), 8, 14) : 0;
  const bottomPadding = clamp(Math.round(valueFontSize * 0.12), 6, 12);
  const eyebrowY = eyebrowText ? topPadding + eyebrowFontSize : 0;
  const valueY =
    topPadding + (eyebrowText ? eyebrowFontSize + labelGap : 0) + Math.round(valueFontSize * 0.86);
  const height =
    topPadding +
    (eyebrowText ? eyebrowFontSize + labelGap : 0) +
    valueFontSize +
    bottomPadding;

  return {
    top,
    left,
    width,
    height,
    textX,
    eyebrowY,
    eyebrowFontSize,
    eyebrowLetterSpacingEm,
    valueY,
    valueFontSize,
    valueColor: blendHexColors(input.accentColor, '#f8fafc', 0.72),
  };
};

export const buildEditorialRatingOverlaySvg = (
  input: EditorialRatingOverlayInput,
): EditorialRatingOverlaySpec => {
  const layout = computeEditorialRatingOverlayLayout(input);
  const eyebrowText = String(input.eyebrowText || '').trim();
  const valueText = String(input.valueText || '').trim();
  const eyebrowLetterSpacing =
    eyebrowText && layout.eyebrowLetterSpacingEm > 0
      ? ` letter-spacing="${layout.eyebrowLetterSpacingEm.toFixed(3)}em"`
      : '';

  return {
    ...layout,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">
<defs>
  <filter id="editorial-score-shadow" x="-30%" y="-35%" width="170%" height="190%" color-interpolation-filters="sRGB">
    <feDropShadow dx="0" dy="1.8" stdDeviation="3.8" flood-color="#020617" flood-opacity="0.82" />
    <feDropShadow dx="0" dy="0" stdDeviation="1.6" flood-color="#020617" flood-opacity="0.48" />
  </filter>
  <filter id="editorial-label-shadow" x="-30%" y="-35%" width="170%" height="190%" color-interpolation-filters="sRGB">
    <feDropShadow dx="0" dy="1.2" stdDeviation="2.6" flood-color="#020617" flood-opacity="0.78" />
  </filter>
</defs>
${eyebrowText ? `<text x="${layout.textX}" y="${layout.eyebrowY}" font-family="'Space Grotesk','Noto Sans',Arial,sans-serif" font-size="${layout.eyebrowFontSize}" font-weight="700" fill="${input.accentColor}" filter="url(#editorial-label-shadow)"${eyebrowLetterSpacing}>${escapeXml(eyebrowText)}</text>` : ''}
<text x="${layout.textX}" y="${layout.valueY}" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="${layout.valueFontSize}" font-weight="800" fill="${layout.valueColor}" filter="url(#editorial-score-shadow)">${escapeXml(valueText)}</text>
</svg>`,
  };
};
