import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
export type { CommunityBadgeTheme } from './communityBadgeTheme.ts';
export {
  DEFAULT_COMMUNITY_BADGE_THEME,
  COMMUNITY_BADGE_THEME_OPTIONS,
  normalizeCommunityBadgeTheme,
} from './communityBadgeTheme.ts';
import type { CommunityBadgeTheme } from './communityBadgeTheme.ts';

const BADGE_DIR = path.join(
  process.cwd(),
  'public',
  'assets',
  'community-badges',
  'canonical',
);

const badgeAsset = (...segments: string[]): string => path.join(BADGE_DIR, ...segments);

const svgCache = new Map<string, { svgContent: string; aspectRatio: number }>();

const RAINBOW_GRADIENT_MARKUP = `<linearGradient id="rainbow" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#ff4d6d"/><stop offset="20%" stop-color="#ffb347"/><stop offset="40%" stop-color="#fff75e"/><stop offset="60%" stop-color="#7dff7a"/><stop offset="80%" stop-color="#54c6ff"/><stop offset="100%" stop-color="#d07cff"/></linearGradient>`;

const THEME_FRAME_STROKE: Record<CommunityBadgeTheme, string> = {
  gold: '#8b6a22',
  white: '#42506d',
  rainbow: 'url(#rainbow)',
  black: '#2f3545',
};

const THEME_BG_GRADIENT: Record<CommunityBadgeTheme, string> = {
  gold: '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#120d05"/><stop offset="100%" stop-color="#2a1f10"/></linearGradient>',
  white: '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#09101b"/><stop offset="100%" stop-color="#1a2230"/></linearGradient>',
  rainbow: '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0a0a0d"/><stop offset="100%" stop-color="#181b22"/></linearGradient>',
  black: '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#06070a"/><stop offset="100%" stop-color="#181b22"/></linearGradient>',
};

const THEME_TEXT_COLOR: Record<CommunityBadgeTheme, string> = {
  gold: '#f3d27c',
  white: '#ffffff',
  rainbow: '#ffffff',
  black: '#ffffff',
};

const resolveCommunityTextColor = (_key: string, theme: CommunityBadgeTheme) =>
  THEME_TEXT_COLOR[theme];

function normalizeCommunitySvg(
  svg: string,
  key: string,
  theme: CommunityBadgeTheme,
): string {
  let normalized = svg;

  if (theme === 'rainbow') {
    if (!normalized.includes('id="rainbow"')) {
      if (normalized.includes('<defs>')) {
        normalized = normalized.replace('<defs>', `<defs>${RAINBOW_GRADIENT_MARKUP}`);
      } else {
        normalized = normalized.replace(/(<svg\b[^>]*>)/i, `$1<defs>${RAINBOW_GRADIENT_MARKUP}</defs>`);
      }
    }
  }

  normalized = normalized.replace(
    /(<rect\b[^>]*\bx\s*=\s*["']3["'][^>]*\by\s*=\s*["']3["'][^>]*)\bstroke\s*=\s*["'][^"']*["']/i,
    `$1stroke="${THEME_FRAME_STROKE[theme]}"`,
  );

  const textColor = resolveCommunityTextColor(key, theme);
  normalized = normalized.replace(
    /(<text\b[^>]*?)\sfill\s*=\s*["'][^"']*["']/gi,
    `$1 fill="${textColor}"`,
  );

  return normalized;
}

function buildCommunityFallbackBadge(
  key: string,
  theme: CommunityBadgeTheme,
  label: string,
  targetHeight: number,
): { svg: string; width: number; height: number } {
  const safeLabel = String(label || '').trim().toUpperCase() || 'BADGE';
  const words = safeLabel.split(/\s+/).filter(Boolean);
  const shouldSplit = words.length > 1 && safeLabel.length > 10;
  const lines = shouldSplit
    ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')]
    : [safeLabel];
  const fontSize = Math.max(11, Math.round(targetHeight * (lines.length > 1 ? 0.22 : 0.3)));
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const width = Math.max(Math.round(targetHeight * 1.45), Math.round(longest * fontSize * 0.68 + targetHeight * 0.9));
  const outerRx = Math.max(8, Math.round(targetHeight * 0.2));
  const innerRx = Math.max(6, Math.round(targetHeight * 0.15));
  const defs = theme === 'rainbow'
    ? `<defs>${THEME_BG_GRADIENT[theme]}${RAINBOW_GRADIENT_MARKUP}</defs>`
    : `<defs>${THEME_BG_GRADIENT[theme]}</defs>`;
  const textColor = resolveCommunityTextColor(key, theme);
  const lineY = lines.length > 1
    ? [Math.round(targetHeight * 0.36), Math.round(targetHeight * 0.64)]
    : [Math.round(targetHeight * 0.6)];
  const textSvg = lines
    .map(
      (line, index) =>
        `<text x="${Math.round(width / 2)}" y="${lineY[index]}" text-anchor="middle" dominant-baseline="middle" fill="${textColor}" font-family="Avenir Next, Helvetica Neue, Arial, sans-serif" font-weight="900" font-size="${fontSize}" letter-spacing="0.6">${line}</text>`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${targetHeight}" role="img" aria-label="${safeLabel}">${defs}<rect x="2" y="2" width="${Math.max(0, width - 4)}" height="${Math.max(0, targetHeight - 4)}" rx="${outerRx}" fill="url(#bg)" stroke="${THEME_FRAME_STROKE[theme]}" stroke-width="3"/><rect x="8" y="10" width="${Math.max(0, width - 16)}" height="${Math.max(0, targetHeight - 20)}" rx="${innerRx}" fill="#0c1018" fill-opacity="0.72"/>${textSvg}</svg>`;
  return { svg, width, height: targetHeight };
}

function loadSvg(filePath: string): { svgContent: string; aspectRatio: number } | null {
  if (svgCache.has(filePath)) return svgCache.get(filePath)!;
  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf8').trim();
    const vbMatch = content.match(/viewBox\s*=\s*["']([^"']+)["']/i);
    if (!vbMatch) return null;
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length < 4 || !parts[2] || !parts[3]) return null;
    const aspectRatio = parts[2] / parts[3];
    const result = { svgContent: content, aspectRatio };
    svgCache.set(filePath, result);
    return result;
  } catch {
    return null;
  }
}

function setSvgRootDimension(svg: string, attr: 'width' | 'height', value: number): string {
  const rootMatch = svg.match(/<svg\b[^>]*>/i);
  if (!rootMatch) return svg;
  const rootTag = rootMatch[0];
  const attrPattern = new RegExp(`\\s${attr}\\s*=\\s*(["']).*?\\1`, 'i');
  const updatedRoot = attrPattern.test(rootTag)
    ? rootTag.replace(attrPattern, ` ${attr}="${value}"`)
    : rootTag.replace(/<svg/i, `<svg ${attr}="${value}"`);
  return svg.replace(rootTag, updatedRoot);
}

function resizeSvg(
  asset: { svgContent: string; aspectRatio: number },
  targetHeight: number,
): { svg: string; width: number; height: number } {
  const width = Math.round(targetHeight * asset.aspectRatio);
  const svg = setSvgRootDimension(
    setSvgRootDimension(asset.svgContent, 'width', width),
    'height',
    targetHeight,
  );
  return { svg, width, height: targetHeight };
}

const AGE_LABEL_TO_CANONICAL_NAME: Record<string, string> = {
  G: 'g.svg',
  PG: 'pg.svg',
  'PG 13': 'pg-13.svg',
  'PG-13': 'pg-13.svg',
  R: 'r.svg',
  'TV PG': 'tv-pg.svg',
  'TV-PG': 'tv-pg.svg',
  'TV 14': 'tv-14.svg',
  'TV-14': 'tv-14.svg',
  'TV MA': 'tv-ma.svg',
  'TV-MA': 'tv-ma.svg',
  '15': '15.svg',
  '18': '18.svg',
};

const NETWORK_KEY_TO_CANONICAL_NAME: Partial<Record<string, string>> = {
  netflix: 'netflix.svg',
  hbo: 'hbo.svg',
  primevideo: 'prime.svg',
  disneyplus: 'disney.svg',
  appletvplus: 'apple.svg',
  hulu: 'hulu.svg',
  paramountplus: 'paramount.svg',
  peacock: 'peacock.svg',
};

const QUALITY_GOLD: Partial<Record<string, string>> = {
  '4k': badgeAsset('quality', 'gold', '4k.svg'),
  hd: badgeAsset('quality', 'gold', 'hd.svg'),
  remux: badgeAsset('quality', 'gold', 'remux.svg'),
  bdremux: badgeAsset('quality', 'gold', 'bdremux.svg'),
  hdr: badgeAsset('quality', 'gold', 'hdr.svg'),
  dolbyvision: badgeAsset('quality', 'gold', 'dolby-vision.svg'),
};

const QUALITY_WHITE: Partial<Record<string, string>> = {
  '4k': badgeAsset('quality', 'white', '4k.svg'),
  hd: badgeAsset('quality', 'white', 'hd.svg'),
  remux: badgeAsset('quality', 'white', 'remux.svg'),
  bdremux: badgeAsset('quality', 'white', 'bdremux.svg'),
  bluray: badgeAsset('quality', 'white', 'bluray.svg'),
  hdr: badgeAsset('quality', 'white', 'hdr.svg'),
  dolbyvision: badgeAsset('quality', 'white', 'dolby-vision.svg'),
  dolbyatmos: badgeAsset('quality', 'white', 'dolby-atmos.svg'),
};

const QUALITY_RAINBOW: Partial<Record<string, string>> = {
  hdr: badgeAsset('quality', 'rainbow', 'hdr.svg'),
  dolbyvision: badgeAsset('quality', 'rainbow', 'dolby-vision.svg'),
};

const QUALITY_BLACK: Partial<Record<string, string>> = {
  '4k': badgeAsset('quality', 'black', '4k.svg'),
  hd: badgeAsset('quality', 'black', 'hd.svg'),
  remux: badgeAsset('quality', 'black', 'remux.svg'),
  bdremux: badgeAsset('quality', 'black', 'bdremux.svg'),
  bluray: badgeAsset('quality', 'black', 'bluray.svg'),
  hdr: badgeAsset('quality', 'black', 'hdr.svg'),
  dolbyvision: badgeAsset('quality', 'black', 'dolby-vision.svg'),
  dolbyatmos: badgeAsset('quality', 'black', 'dolby-atmos.svg'),
};

function resolveQualityFilePath(theme: CommunityBadgeTheme, key: string): string | null {
  if (theme === 'white') {
    return QUALITY_WHITE[key] ?? null;
  }
  if (theme === 'rainbow') {
    return (
      QUALITY_RAINBOW[key] ??
      QUALITY_GOLD[key] ??
      QUALITY_WHITE[key] ??
      QUALITY_BLACK[key] ??
      null
    );
  }
  if (theme === 'gold') {
    return QUALITY_GOLD[key] ?? QUALITY_WHITE[key] ?? QUALITY_BLACK[key] ?? null;
  }
  if (theme === 'black') {
    return QUALITY_BLACK[key] ?? QUALITY_WHITE[key] ?? null;
  }
  return null;
}

function resolveFilePath(
  key: string,
  theme: CommunityBadgeTheme,
  label: string,
): string | null {
  if (key === 'certification') {
    const normalizedLabel = label.trim().toUpperCase();
    const canonicalName = AGE_LABEL_TO_CANONICAL_NAME[normalizedLabel];
    if (!canonicalName) return null;
    const themeDir = theme === 'gold' ? 'gold' : theme === 'black' ? 'black' : 'white';
    return badgeAsset('age', themeDir, canonicalName);
  }

  const canonicalNetworkName = NETWORK_KEY_TO_CANONICAL_NAME[key];
  if (canonicalNetworkName) {
    const themeDir = theme === 'gold' ? 'gold' : theme === 'black' ? 'black' : 'white';
    return badgeAsset('network', themeDir, canonicalNetworkName);
  }

  return resolveQualityFilePath(theme, key);
}

export const getCommunityBadgeSvg = (
  key: string,
  theme: CommunityBadgeTheme,
  label: string,
  targetHeight: number,
): { svg: string; width: number; height: number } | null => {
  const filePath = resolveFilePath(key, theme, label);
  if (!filePath) {
    return buildCommunityFallbackBadge(key, theme, label || key, targetHeight);
  }
  const asset = loadSvg(filePath);
  if (!asset) {
    return buildCommunityFallbackBadge(key, theme, label || key, targetHeight);
  }
  const normalizedAsset = {
    ...asset,
    svgContent: normalizeCommunitySvg(asset.svgContent, key, theme),
  };
  return resizeSvg(normalizedAsset, targetHeight);
};
