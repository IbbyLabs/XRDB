import { type BlockbusterDensity } from './imageRouteConfig.ts';
import { sha1Hex } from './imageRouteRuntime.ts';
import { escapeXml, estimateGeneratedLogoLineWidth } from './imageRouteText.ts';

export type BlockbusterBlurb = {
  text: string;
  author: string;
};

export const sanitizeBlockbusterReviewText = (value: string) =>
  String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/[_*~>#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const trimBlockbusterReviewText = (value: string, maxLength = 220) => {
  const normalized = sanitizeBlockbusterReviewText(value);
  if (!normalized) return '';

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length > 0) {
    const combinedSentences: string[] = [];
    for (const sentence of sentences) {
      const candidate = combinedSentences.length > 0
        ? `${combinedSentences.join(' ')} ${sentence}`
        : sentence;
      if (candidate.length > maxLength) break;
      combinedSentences.push(sentence);
      if (candidate.length >= 72) {
        return candidate;
      }
    }

    const pickedSentence =
      sentences.find((sentence) => sentence.length >= 52 && sentence.length <= maxLength) ||
      combinedSentences[0];
    if (pickedSentence && pickedSentence.length <= maxLength) {
      return pickedSentence;
    }
  }

  if (normalized.length <= maxLength) return normalized;

  const sliced = normalized.slice(0, maxLength + 1);
  const boundary = Math.max(sliced.lastIndexOf(' '), sliced.lastIndexOf(','), sliced.lastIndexOf('.'));
  const trimmed = (boundary > 48 ? sliced.slice(0, boundary) : sliced.slice(0, maxLength)).trim();
  return `${trimmed}...`;
};

export const extractBlockbusterReviewBlurbs = (payload: any): BlockbusterBlurb[] => {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results
    .flatMap((review: any) => {
      const normalized = sanitizeBlockbusterReviewText(review?.content || '');
      if (!normalized) return [];
      const snippets = normalized
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => trimBlockbusterReviewText(sentence, 220))
        .filter((sentence) => sentence.length >= 34);
      const shortlist =
        snippets.length > 0
          ? Array.from(new Set(snippets)).slice(0, 2)
          : (() => {
              const fallback = trimBlockbusterReviewText(normalized, 220);
              return fallback.length >= 34 ? [fallback] : [];
            })();
      if (shortlist.length === 0) return [];
      const author = String(
        review?.author_details?.username ||
        review?.author_details?.name ||
        review?.author ||
        'TMDB review'
      )
        .replace(/\s+/g, ' ')
        .trim();
      return shortlist.map((text) => ({
        text,
        author: author || 'TMDB review',
      }));
    })
    .filter((review: BlockbusterBlurb | null): review is BlockbusterBlurb => review !== null);
};

export const dedupeBlockbusterBlurbs = (blurbs: BlockbusterBlurb[], limit = 10) => {
  const seen = new Set<string>();
  const merged: BlockbusterBlurb[] = [];

  for (const blurb of blurbs) {
    const text = blurb.text.replace(/\s+/g, ' ').trim();
    const author = blurb.author.replace(/\s+/g, ' ').trim();
    const key = `${author.toLowerCase()}::${text.toLowerCase()}`;
    if (!text || seen.has(key)) continue;
    seen.add(key);
    merged.push({ text, author });
    if (merged.length >= limit) break;
  }

  return merged;
};

const fitBlockbusterBlurbLine = (
  text: string,
  fontSize: number,
  maxWidth: number,
) => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (estimateGeneratedLogoLineWidth(normalized, fontSize) <= maxWidth) return normalized;
  const words = normalized.split(' ').filter(Boolean);
  while (words.length > 1) {
    words.pop();
    const candidate = `${words.join(' ')}...`.trim();
    if (estimateGeneratedLogoLineWidth(candidate, fontSize) <= maxWidth) {
      return candidate;
    }
  }
  return normalized;
};

const splitBlockbusterBlurbLines = (
  text: string,
  fontSize: number,
  maxWidth: number,
  maxLines: number,
) => {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let didOverflow = false;

  for (const word of words) {
    const currentLine = lines[lines.length - 1] || '';
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (!currentLine || estimateGeneratedLogoLineWidth(candidate, fontSize) <= maxWidth) {
      if (currentLine) {
        lines[lines.length - 1] = candidate;
      } else {
        lines.push(candidate);
      }
      continue;
    }

    if (lines.length < maxLines) {
      lines.push(word);
      continue;
    }

    lines[maxLines - 1] = fitBlockbusterBlurbLine(`${lines[maxLines - 1]} ${word}`, fontSize, maxWidth);
    didOverflow = true;
    break;
  }

  return {
    lines: lines.slice(0, maxLines),
    didOverflow,
  };
};

export const buildBlockbusterReviewCalloutSvg = ({
  text,
  author,
  rotation: _rotation,
}: {
  text: string;
  author: string;
  rotation: number;
}) => {
  const normalizedText = sanitizeBlockbusterReviewText(text);
  const quoteText = normalizedText ? `“${normalizedText}”` : '';
  const padX = 15;
  const padTop = 12;
  const padBottom = 12;
  const bylineFontSize = 8.5;
  const layoutOptions = [
    { fontSize: 13, maxLines: 3, minWidth: 190, maxWidth: 248 },
    { fontSize: 12, maxLines: 4, minWidth: 214, maxWidth: 276 },
    { fontSize: 11, maxLines: 5, minWidth: 232, maxWidth: 304 },
    { fontSize: 10, maxLines: 6, minWidth: 248, maxWidth: 324 },
  ];
  let chosenWidth = layoutOptions[layoutOptions.length - 1].maxWidth;
  let chosenFontSize = layoutOptions[layoutOptions.length - 1].fontSize;
  let chosenLines: string[] = quoteText ? [quoteText] : [];

  for (let index = 0; index < layoutOptions.length; index += 1) {
    const option = layoutOptions[index];
    const width = Math.max(
      option.minWidth,
      Math.min(
        option.maxWidth,
        136 + Math.round(estimateGeneratedLogoLineWidth(quoteText, option.fontSize) * 0.62)
      )
    );
    const maxTextWidth = width - padX * 2;
    const wrapped = splitBlockbusterBlurbLines(quoteText, option.fontSize, maxTextWidth, option.maxLines);
    chosenWidth = width;
    chosenFontSize = option.fontSize;
    chosenLines = wrapped.lines;
    if (!wrapped.didOverflow) {
      break;
    }
    if (index === layoutOptions.length - 1 && chosenLines.length > 0) {
      chosenLines[chosenLines.length - 1] = fitBlockbusterBlurbLine(
        chosenLines[chosenLines.length - 1],
        option.fontSize,
        maxTextWidth
      );
    }
  }

  const width = chosenWidth;
  const textFontSize = chosenFontSize;
  const maxTextWidth = width - padX * 2;
  const lines = chosenLines;
  const lineHeight = Math.round(textFontSize * 1.24);
  const bylineY = padTop + lines.length * lineHeight + 8;
  const cardHeight = bylineY + bylineFontSize + padBottom;
  const outerWidth = width + 12;
  const outerHeight = cardHeight + 12;
  const centerX = Math.round(outerWidth / 2);
  const centerY = Math.round(outerHeight / 2);
  const byline = author.trim().toUpperCase().slice(0, 26) || 'TMDB REVIEW';
  const tspans = lines
    .map((line, index) => {
      const y = padTop + textFontSize + index * lineHeight;
      const estimatedWidth = estimateGeneratedLogoLineWidth(line, textFontSize);
      const textLength =
        estimatedWidth > maxTextWidth
          ? ` textLength="${maxTextWidth}" lengthAdjust="spacingAndGlyphs"`
          : '';
      return `<tspan x="${padX}" y="${y}"${textLength}>${escapeXml(line)}</tspan>`;
    })
    .join('');
  const stripeWidth = Math.max(26, Math.round(width * 0.2));

  return {
    width: outerWidth,
    height: outerHeight,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${outerWidth}" height="${outerHeight}" viewBox="0 0 ${outerWidth} ${outerHeight}">
<defs>
<filter id="blockbuster-review-shadow" x="-20%" y="-20%" width="160%" height="170%" color-interpolation-filters="sRGB">
<feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#020617" flood-opacity="0.12" />
</filter>
</defs>
<g filter="url(#blockbuster-review-shadow)" transform="translate(${centerX},${centerY}) translate(${-Math.round(width / 2)},${-Math.round(cardHeight / 2)})">
<rect x="0" y="0" width="${width}" height="${cardHeight}" rx="9" fill="rgba(253,251,246,0.98)" stroke="rgba(15,23,42,0.14)" stroke-width="0.95" />
<rect x="${padX}" y="${padTop - 5}" width="${stripeWidth}" height="3" rx="1.5" fill="rgba(15,23,42,0.28)" />
<text x="${padX}" y="${padTop + textFontSize}" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="${textFontSize}" font-weight="900" fill="rgba(15,23,42,0.92)">${tspans}</text>
<text x="${padX}" y="${bylineY}" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="${bylineFontSize}" font-weight="800" letter-spacing="0.04em" fill="rgba(15,23,42,0.62)">${escapeXml(byline)}</text>
</g>
</svg>`,
  };
};

export const getBlockbusterBlurbChaos = (seedKey: string, density: BlockbusterDensity) => {
  const hash = sha1Hex(seedKey);
  const read = (start: number, length = 4) =>
    Number.parseInt(hash.slice(start, start + length), 16) || 0;
  const densityMultiplier =
    density === 'packed' ? 1.28 : density === 'balanced' ? 1.08 : 0.92;
  const baseOuterRotation = ((((read(4) % 7600) / 100) - 38) * 0.42) * densityMultiplier;
  const verticalRoll = read(28) % 100;
  const shouldGoNearVertical =
    density === 'packed' ? verticalRoll < 34 : density === 'balanced' ? verticalRoll < 10 : false;
  const verticalSign = read(32) % 2 === 0 ? -1 : 1;
  const nearVerticalRotation = verticalSign * (52 + (read(36) % 19));
  const outerRotation = shouldGoNearVertical ? nearVerticalRotation : baseOuterRotation;
  return {
    innerRotation: ((((read(0) % 4200) / 100) - 21) * 0.24) * densityMultiplier,
    outerRotation,
    skewX:
      ((((read(8) % 3200) / 100) - 16) * 0.34) *
      (shouldGoNearVertical ? Math.max(0.72, densityMultiplier * 0.78) : densityMultiplier),
    skewY:
      ((((read(12) % 1800) / 100) - 9) * 0.16) *
      (shouldGoNearVertical ? Math.max(0.7, densityMultiplier * 0.72) : densityMultiplier),
    scale:
      (0.92 + (read(16) % 18) / 100) *
      (shouldGoNearVertical ? (density === 'packed' ? 0.84 : 0.88) : 1),
    horizontalBias: (read(20) % 1000) / 1000,
    verticalBias: (read(24) % 1000) / 1000,
    isNearVertical: shouldGoNearVertical,
  };
};
