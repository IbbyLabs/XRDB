import { DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET } from './ratingPresentation.ts';
import {
  DEFAULT_PROVIDER_ICON_SCALE_PERCENT,
  DEFAULT_STACKED_ACCENT_MODE,
  DEFAULT_STACKED_ELEMENT_OFFSET_PX,
  DEFAULT_STACKED_LINE_GAP_PERCENT,
  DEFAULT_STACKED_LINE_HEIGHT_PERCENT,
  DEFAULT_STACKED_LINE_WIDTH_PERCENT,
  DEFAULT_STACKED_SURFACE_OPACITY_PERCENT,
  MIN_STACKED_SURFACE_OPACITY_PERCENT,
  type StackedAccentMode,
} from './badgeCustomization.ts';
import { computeStackedBadgeLayout } from './stackedBadgeLayout.ts';
import { type BadgeKey } from './imageRouteConfig.ts';
import { type RatingStyle } from './ratingAppearance.ts';
import { escapeXml } from './imageRouteText.ts';
import {
  estimateBadgeTextWidth,
  getSummaryBadgeHorizontalMetrics,
  resolveBadgeIconRenderSize,
} from './imageRouteBadgeMetrics.ts';
import { getBadgeIconRadius, getBadgeOuterRadius } from './imageRouteQualityBadge.ts';
import { hexColorToRgba } from './imageRouteBlockbusterLayout.ts';

export type BuildBadgeSvgInput = {
  width: number;
  height: number;
  iconSize: number;
  fontSize: number;
  paddingX: number;
  gap: number;
  accentColor: string;
  monogram: string;
  iconDataUri?: string | null;
  iconCornerRadius?: number;
  iconKey?: BadgeKey;
  labelText?: string;
  value: string;
  badgeVariant?: 'standard' | 'minimal' | 'summary';
  accentBarOffset?: number;
  accentBarVisible?: boolean;
  ratingStyle: RatingStyle;
  iconScalePercent?: number;
  stackedLineVisible?: boolean;
  stackedLineWidthPercent?: number;
  stackedLineHeightPercent?: number;
  stackedLineGapPercent?: number;
  stackedSurfaceOpacityPercent?: number;
  stackedAccentMode?: StackedAccentMode;
  stackedLineOffsetX?: number;
  stackedLineOffsetY?: number;
  stackedIconOffsetX?: number;
  stackedIconOffsetY?: number;
  stackedValueOffsetX?: number;
  stackedValueOffsetY?: number;
  preferReadablePlainSurface?: boolean;
  preferNeutralGlassPlate?: boolean;
  compactText?: boolean;
};

export const buildBadgeSvg = ({
  width,
  height,
  iconSize,
  fontSize,
  paddingX,
  gap,
  accentColor,
  monogram,
  iconDataUri,
  iconCornerRadius = 0,
  iconKey,
  labelText,
  value,
  badgeVariant = 'standard',
  accentBarOffset = DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET,
  accentBarVisible = true,
  ratingStyle,
  iconScalePercent = DEFAULT_PROVIDER_ICON_SCALE_PERCENT,
  stackedLineVisible = true,
  stackedLineWidthPercent = DEFAULT_STACKED_LINE_WIDTH_PERCENT,
  stackedLineHeightPercent = DEFAULT_STACKED_LINE_HEIGHT_PERCENT,
  stackedLineGapPercent = DEFAULT_STACKED_LINE_GAP_PERCENT,
  stackedSurfaceOpacityPercent = DEFAULT_STACKED_SURFACE_OPACITY_PERCENT,
  stackedAccentMode = DEFAULT_STACKED_ACCENT_MODE,
  stackedLineOffsetX = DEFAULT_STACKED_ELEMENT_OFFSET_PX,
  stackedLineOffsetY = DEFAULT_STACKED_ELEMENT_OFFSET_PX,
  stackedIconOffsetX = DEFAULT_STACKED_ELEMENT_OFFSET_PX,
  stackedIconOffsetY = DEFAULT_STACKED_ELEMENT_OFFSET_PX,
  stackedValueOffsetX = DEFAULT_STACKED_ELEMENT_OFFSET_PX,
  stackedValueOffsetY = DEFAULT_STACKED_ELEMENT_OFFSET_PX,
  preferReadablePlainSurface = false,
  preferNeutralGlassPlate = false,
  compactText = false,
}: BuildBadgeSvgInput) => {
  const radius = getBadgeOuterRadius(height, ratingStyle);
  const outerRect =
    ratingStyle === 'plain'
      ? ''
      : `<rect x="0.75" y="0.75" width="${Math.max(0, width - 1.5)}" height="${Math.max(0, height - 1.5)}" rx="${radius}" fill="${ratingStyle === 'square' ? 'rgb(5,5,5)' : 'rgb(17,24,39)'}" fill-opacity="${ratingStyle === 'square' ? '0.94' : '0.70'}" stroke="${ratingStyle === 'square' ? accentColor : 'rgba(255,255,255,0.30)'}" stroke-width="${ratingStyle === 'square' ? '1.5' : '1'}" />`;
  const plainBadgeDefs =
    ratingStyle === 'plain'
      ? `<defs><filter id="text-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="2.4" flood-color="#000000" flood-opacity="0.55" /></filter><filter id="plain-icon-shadow" x="-35%" y="-35%" width="170%" height="170%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="0" stdDeviation="1.4" flood-color="#020617" flood-opacity="0.78" /><feDropShadow dx="0" dy="1" stdDeviation="2.2" flood-color="#020617" flood-opacity="0.46" /></filter>${preferReadablePlainSurface ? `<filter id="plain-badge-surface-shadow" x="-28%" y="-40%" width="156%" height="190%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="2.1" stdDeviation="3.8" flood-color="#020617" flood-opacity="0.72" /><feDropShadow dx="0" dy="0" stdDeviation="1.8" flood-color="#020617" flood-opacity="0.34" /></filter><linearGradient id="plain-badge-surface-fill" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#020617" stop-opacity="0.22" /><stop offset="100%" stop-color="#0f172a" stop-opacity="0.15" /></linearGradient>` : ''}</defs>`
      : '';
  const plainBadgeSurface =
    ratingStyle === 'plain' && preferReadablePlainSurface
      ? (() => {
          const surfaceInsetX = Math.max(3.5, Math.round(height * 0.1));
          const surfaceInsetY = Math.max(4, Math.round(height * 0.14));
          const surfaceWidth = Math.max(0, width - surfaceInsetX * 2);
          const surfaceHeight = Math.max(0, height - surfaceInsetY * 2);
          const surfaceRadius = Math.max(10, Math.round(surfaceHeight / 2));
          const highlightInsetX = surfaceInsetX + 1.25;
          const highlightInsetY = surfaceInsetY + 1.25;
          const highlightWidth = Math.max(0, width - highlightInsetX * 2);
          const highlightHeight = Math.max(0, Math.round(surfaceHeight * 0.42));
          const highlightRadius = Math.max(8, Math.round(highlightHeight / 2));
          return `<rect x="${surfaceInsetX}" y="${surfaceInsetY}" width="${surfaceWidth}" height="${surfaceHeight}" rx="${surfaceRadius}" fill="url(#plain-badge-surface-fill)" stroke="rgba(255,255,255,0.16)" stroke-width="1" filter="url(#plain-badge-surface-shadow)" />
<rect x="${highlightInsetX}" y="${highlightInsetY}" width="${highlightWidth}" height="${highlightHeight}" rx="${highlightRadius}" fill="rgba(255,255,255,0.05)" />`;
        })()
      : '';
  const valueFilter = ratingStyle === 'plain' ? ' filter="url(#text-shadow)"' : '';
  if (badgeVariant !== 'standard') {
    const valueNumericStyle =
      ' style="font-variant-numeric: tabular-nums lining-nums; font-feature-settings: \'tnum\' 1, \'lnum\' 1;"';
    const centerX = Math.round(width / 2);
    const centerY = Math.round(height / 2);
    if (ratingStyle === 'plain') {
      const plainDefs = `<defs><filter id="plain-variant-text-shadow" x="-20%" y="-25%" width="140%" height="150%"><feDropShadow dx="0" dy="1" stdDeviation="2.2" flood-color="#000000" flood-opacity="0.64" /></filter><filter id="plain-variant-surface-shadow" x="-30%" y="-45%" width="160%" height="200%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="2" stdDeviation="3.6" flood-color="#020617" flood-opacity="0.74" /></filter></defs>`;
      if (badgeVariant === 'minimal') {
        const accentRailWidth = Math.max(28, Math.round(width * 0.42));
        const accentRailHeight = Math.max(5, Math.round(height * 0.12));
        const accentRailX = Math.round((width - accentRailWidth) / 2);
        const accentRailY = Math.max(
          4,
          Math.min(height - accentRailHeight - 4, Math.round(height * 0.16) + accentBarOffset),
        );
        const valueFontSize = Math.max(18, Math.round(fontSize * 1.05));
        const valueY = Math.round(centerY + 1);
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${plainDefs}
${accentBarVisible ? `<rect x="${accentRailX}" y="${accentRailY}" width="${accentRailWidth}" height="${accentRailHeight}" rx="${Math.max(2, Math.round(accentRailHeight / 2))}" fill="${accentColor}" fill-opacity="0.78" filter="url(#plain-variant-surface-shadow)" />` : ''}
<text x="${centerX}" y="${valueY}" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="${valueFontSize}" font-weight="800" text-anchor="middle" dominant-baseline="middle" fill="white" filter="url(#plain-variant-text-shadow)"${valueNumericStyle}>${escapeXml(value)}</text>
</svg>`;
      }

      const {
        summaryLabel,
        summaryLabelFontSize,
        sideInset,
        contentGap,
        chipWidth,
      } = getSummaryBadgeHorizontalMetrics(labelText || '', fontSize, paddingX);
      const valueWidth = estimateBadgeTextWidth(value, fontSize, false);
      const contentWidth = chipWidth + contentGap + valueWidth;
      const contentLeft = Math.max(sideInset, Math.round((width - contentWidth) / 2));
      const labelX = Math.round(contentLeft + chipWidth / 2);
      const labelY = Math.max(
        Math.round(height * 0.38),
        Math.round(centerY - summaryLabelFontSize * 0.25),
      );
      const valueX = contentLeft + contentWidth;
      const valueY = Math.round(centerY + fontSize * 0.22);
      const accentRailWidth = Math.max(24, Math.round(width * 0.14));
      const accentRailY = Math.max(
        4,
        Math.min(height - 7, Math.round(height * 0.16) + accentBarOffset),
      );
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${plainDefs}
${accentBarVisible ? `<rect x="${sideInset}" y="${accentRailY}" width="${accentRailWidth}" height="3" rx="1.5" fill="${accentColor}" fill-opacity="0.82" filter="url(#plain-variant-surface-shadow)" />` : ''}
<text x="${labelX}" y="${labelY}" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="${summaryLabelFontSize}" font-weight="800" text-anchor="middle" fill="${accentColor}" filter="url(#plain-variant-text-shadow)">${escapeXml(summaryLabel)}</text>
<text x="${valueX}" y="${valueY}" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="${fontSize}" font-weight="800" text-anchor="end" dominant-baseline="middle" fill="white" filter="url(#plain-variant-text-shadow)"${valueNumericStyle}>${escapeXml(value)}</text>
</svg>`;
    }
    const accentStrokeOpacity = ratingStyle === 'square' ? 0.9 : 0.86;
    const accentTintStartOpacity = ratingStyle === 'square' ? 0.18 : 0.16;
    const accentTintEndOpacity = ratingStyle === 'square' ? 0.06 : 0.05;
    const baseFill =
      ratingStyle === 'square'
        ? 'rgb(5,5,5)'
        : 'rgb(11,17,28)';
    const baseFillOpacity = ratingStyle === 'square' ? 0.96 : 0.82;
    const innerStroke = 'rgb(255,255,255)';
    const innerStrokeOpacity = 0.16;
    const strokeWidth = ratingStyle === 'square' ? 1.7 : 1.45;
    const variantOuterInset = 0.9;
    const variantOuterWidth = Math.max(0, width - variantOuterInset * 2);
    const variantOuterHeight = Math.max(0, height - variantOuterInset * 2);
    const variantInnerInset = 1.6;
    const variantInnerWidth = Math.max(0, width - variantInnerInset * 2);
    const variantInnerHeight = Math.max(0, height - variantInnerInset * 2);
    const variantInnerRadius = Math.max(2, radius - 1);
    const variantStrokeInset = 2.3;
    const variantStrokeWidth = Math.max(0, width - variantStrokeInset * 2);
    const variantStrokeHeight = Math.max(0, height - variantStrokeInset * 2);
    const variantStrokeRadius = Math.max(2, radius - 2);
    const variantDefs = `<defs>
<linearGradient id="variant-surface-fill" x1="0%" y1="0%" x2="100%" y2="100%">
<stop offset="0%" stop-color="${accentColor}" stop-opacity="${accentTintStartOpacity}" />
<stop offset="100%" stop-color="${accentColor}" stop-opacity="${accentTintEndOpacity}" />
</linearGradient>
</defs>`;
    const variantChrome = `
<rect x="${variantOuterInset}" y="${variantOuterInset}" width="${variantOuterWidth}" height="${variantOuterHeight}" rx="${radius}" fill="${baseFill}" fill-opacity="${baseFillOpacity}" stroke="${accentColor}" stroke-opacity="${accentStrokeOpacity}" stroke-width="${strokeWidth}" />
<rect x="${variantInnerInset}" y="${variantInnerInset}" width="${variantInnerWidth}" height="${variantInnerHeight}" rx="${variantInnerRadius}" fill="url(#variant-surface-fill)" />
<rect x="${variantStrokeInset}" y="${variantStrokeInset}" width="${variantStrokeWidth}" height="${variantStrokeHeight}" rx="${variantStrokeRadius}" fill="none" stroke="${innerStroke}" stroke-opacity="${innerStrokeOpacity}" stroke-width="0.85" />`;

    if (badgeVariant === 'minimal') {
      const valueFontSize = Math.max(18, Math.round(fontSize * 1.05));
      const valueY = Math.round(centerY + 1);
      const accentRailWidth = Math.max(24, Math.round(width * 0.4));
      const accentRailHeight = Math.max(3, Math.round(height * 0.08));
      const accentRailX = Math.round((width - accentRailWidth) / 2);
      const accentRailY = Math.max(
        4,
        Math.min(height - accentRailHeight - 4, Math.round(height * 0.18) + accentBarOffset),
      );
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${variantDefs}
${variantChrome}
${accentBarVisible ? `<rect x="${accentRailX}" y="${accentRailY}" width="${accentRailWidth}" height="${accentRailHeight}" rx="${Math.max(1, Math.round(accentRailHeight / 2))}" fill="${accentColor}" />` : ''}
<text x="${centerX}" y="${valueY}" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="${valueFontSize}" font-weight="800" text-anchor="middle" dominant-baseline="middle" fill="white"${valueFilter}${valueNumericStyle}>${escapeXml(value)}</text>
</svg>`;
    }

    const {
      summaryLabel,
      summaryLabelFontSize,
      sideInset,
      chipWidth,
      contentGap,
    } = getSummaryBadgeHorizontalMetrics(labelText || '', fontSize, paddingX);
    const valueWidth = estimateBadgeTextWidth(value, fontSize, false);
    const chipHeight = Math.max(summaryLabelFontSize + 12, Math.round(height * 0.56));
    const chipY = Math.round((height - chipHeight) / 2);
    const chipRadius = Math.round(chipHeight / 2);
    const contentWidth = chipWidth + contentGap + valueWidth;
    const chipX = Math.max(sideInset, Math.round((width - contentWidth) / 2));
    const labelX = Math.round(chipX + chipWidth / 2);
    const labelY = Math.round(chipY + chipHeight / 2 + 1);
    const valueX = chipX + contentWidth;
    const valueY = Math.round(centerY + 1);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${variantDefs}
${variantChrome}
<rect x="${chipX}" y="${chipY}" width="${chipWidth}" height="${chipHeight}" rx="${chipRadius}" fill="${accentColor}" fill-opacity="0.94" />
<text x="${labelX}" y="${labelY}" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="${summaryLabelFontSize}" font-weight="800" text-anchor="middle" dominant-baseline="middle" fill="white"${valueFilter}>${escapeXml(summaryLabel)}</text>
<text x="${valueX}" y="${valueY}" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="${fontSize}" font-weight="800" text-anchor="end" dominant-baseline="middle" fill="white"${valueFilter}${valueNumericStyle}>${escapeXml(value)}</text>
</svg>`;
  }
  if (ratingStyle === 'stacked') {
    const stackedOuterInset = 0.9;
    const stackedOuterWidth = Math.max(0, width - stackedOuterInset * 2);
    const stackedOuterHeight = Math.max(0, height - stackedOuterInset * 2);
    const stackedInnerInset = 1.8;
    const stackedInnerWidth = Math.max(0, width - stackedInnerInset * 2);
    const stackedInnerHeight = Math.max(0, height - stackedInnerInset * 2);
    const renderIconSize = resolveBadgeIconRenderSize({
      iconSlotSize: Math.max(14, Math.round(iconSize * 0.72)),
      badgeHeight: Math.max(18, Math.round(height * 0.3)),
      iconScalePercent,
    });
    const stackedLayout = computeStackedBadgeLayout({
      width,
      height,
      paddingX,
      fontSize,
      renderIconSize,
      accentLineVisible: stackedLineVisible,
      accentLineWidthPercent: stackedLineWidthPercent,
      accentLineHeightPercent: stackedLineHeightPercent,
      accentLineGapPercent: stackedLineGapPercent,
      lineOffsetX: stackedLineOffsetX,
      lineOffsetY: stackedLineOffsetY,
      iconOffsetX: stackedIconOffsetX,
      iconOffsetY: stackedIconOffsetY,
      valueOffsetX: stackedValueOffsetX,
      valueOffsetY: stackedValueOffsetY,
    });
    const valueTextWidth = estimateBadgeTextWidth(value, stackedLayout.valueFontSize, compactText);
    const valueAvailableWidth = stackedLayout.valueAvailableWidth;
    const valueTextLength =
      valueTextWidth > valueAvailableWidth
        ? ` textLength="${valueAvailableWidth}" lengthAdjust="spacingAndGlyphs"`
        : '';
    const valueNumericStyle =
      ' style="font-variant-numeric: tabular-nums lining-nums; font-feature-settings: \'tnum\' 1, \'lnum\' 1;"';
    const surfaceOpacityRatio = Math.max(
      MIN_STACKED_SURFACE_OPACITY_PERCENT / 100,
      Math.min(1, stackedSurfaceOpacityPercent / 100),
    );
    const useLogoOnlyAccent = stackedAccentMode === 'logo';
    const iconSurfaceFill = hexColorToRgba(accentColor, 0.22, 'rgba(167,139,250,0.22)');
    const iconSurfaceStroke = hexColorToRgba(accentColor, 0.54, 'rgba(167,139,250,0.54)');
    const stackedSurfaceStartColor = useLogoOnlyAccent ? '#ffffff' : accentColor;
    const stackedSurfaceEndColor = useLogoOnlyAccent ? '#94a3b8' : accentColor;
    const stackedSurfaceStartOpacity = (useLogoOnlyAccent ? 0.06 : 0.14) * surfaceOpacityRatio;
    const stackedSurfaceEndOpacity = (useLogoOnlyAccent ? 0.015 : 0.04) * surfaceOpacityRatio;
    const stackedBodyFillOpacity = 0.9 * surfaceOpacityRatio;
    const stackedBodyStroke = useLogoOnlyAccent
      ? 'rgba(255,255,255,0.22)'
      : hexColorToRgba(accentColor, 0.28, 'rgba(255,255,255,0.22)');
    const stackedDefs = `<defs>
<linearGradient id="stacked-surface-fill" x1="0%" y1="0%" x2="100%" y2="100%">
<stop offset="0%" stop-color="${stackedSurfaceStartColor}" stop-opacity="${stackedSurfaceStartOpacity}" />
<stop offset="100%" stop-color="${stackedSurfaceEndColor}" stop-opacity="${stackedSurfaceEndOpacity}" />
</linearGradient>
<clipPath id="stacked-icon-clip">
<rect x="${stackedLayout.iconX}" y="${stackedLayout.iconY}" width="${renderIconSize}" height="${renderIconSize}" rx="${Math.max(6, stackedLayout.iconRadius - 4)}" />
</clipPath>
</defs>`;
    const iconImage = iconDataUri
      ? `<image href="${iconDataUri}" x="${stackedLayout.iconX}" y="${stackedLayout.iconY}" width="${renderIconSize}" height="${renderIconSize}" preserveAspectRatio="xMidYMid meet" clip-path="url(#stacked-icon-clip)" />`
      : '';
    const monogramText = iconDataUri
      ? ''
      : `<text x="${stackedLayout.iconCenterX}" y="${Math.round(stackedLayout.iconCenterY + stackedLayout.iconFontSize * 0.34)}" font-family="Arial, sans-serif" font-size="${stackedLayout.iconFontSize}" font-weight="700" text-anchor="middle" fill="${accentColor}">${escapeXml(monogram)}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${stackedDefs}
<rect x="${stackedOuterInset}" y="${stackedOuterInset}" width="${stackedOuterWidth}" height="${stackedOuterHeight}" rx="${radius}" fill="rgba(8,11,16,${stackedBodyFillOpacity.toFixed(3)})" stroke="${stackedBodyStroke}" stroke-width="1.15" />
<rect x="${stackedInnerInset}" y="${stackedInnerInset}" width="${stackedInnerWidth}" height="${stackedInnerHeight}" rx="${Math.max(10, radius - 3)}" fill="url(#stacked-surface-fill)" />
${stackedLayout.showAccentRail ? `<rect x="${stackedLayout.accentRailX}" y="${stackedLayout.accentRailY}" width="${stackedLayout.accentRailWidth}" height="${stackedLayout.accentRailHeight}" rx="${Math.max(2, Math.round(stackedLayout.accentRailHeight / 2))}" fill="${accentColor}" />` : ''}
<rect x="${stackedLayout.iconPlateX}" y="${stackedLayout.iconPlateY}" width="${stackedLayout.iconPlateSize}" height="${stackedLayout.iconPlateSize}" rx="${Math.max(10, Math.round(stackedLayout.iconPlateSize * 0.28))}" fill="${iconSurfaceFill}" stroke="${iconSurfaceStroke}" stroke-width="1.05" />
${iconImage}
${monogramText}
<text x="${stackedLayout.valueX}" y="${stackedLayout.valueTopY}" font-family="'Noto Sans','DejaVu Sans',Arial,sans-serif" font-size="${stackedLayout.valueFontSize}" font-weight="800" text-anchor="middle" dominant-baseline="hanging" fill="white"${valueTextLength}${valueNumericStyle}>${escapeXml(value)}</text>
</svg>`;
  }
  const outerPadding = Math.max(6, Math.round(paddingX * 0.7));
  const innerGap = outerPadding;
  const renderIconSize = resolveBadgeIconRenderSize({
    iconSlotSize: iconSize,
    badgeHeight: height,
    iconScalePercent,
  });
  const iconRadius = getBadgeIconRadius(renderIconSize, ratingStyle);
  const iconSlotX = outerPadding;
  const iconX = iconSlotX + Math.round((iconSize - renderIconSize) / 2);
  const iconCx = iconSlotX + Math.round(iconSize / 2);
  const iconCy = Math.round(height / 2);
  const iconFontSize = Math.max(12, Math.round(renderIconSize * 0.42));
  const valueX = iconSlotX + iconSize + innerGap;
  const valueY = Math.round(height / 2 + fontSize * 0.36);
  const valueTextWidth = estimateBadgeTextWidth(value, fontSize, compactText);
  const valueRightInset = outerPadding;
  const valueAvailableWidth = Math.max(0, width - valueX - valueRightInset);
  const valueTextLength =
    compactText && valueTextWidth > valueAvailableWidth
      ? ` textLength="${valueAvailableWidth}" lengthAdjust="spacingAndGlyphs"`
      : '';
  const shouldCenterValueInSlot = /^\d+(?:\.0)?$/.test(value.trim());
  const valueFontFamily = compactText
    ? `'Noto Sans','DejaVu Sans','Arial Narrow','Liberation Sans Narrow','Nimbus Sans Narrow','Roboto Condensed',Arial,sans-serif`
    : `'Noto Sans','DejaVu Sans',Arial,sans-serif`;
  const valueLetterSpacing = compactText ? ' letter-spacing="-0.04em"' : '';
  const iconY = Math.round((height - renderIconSize) / 2);
  const useNeutralGlassPlate = ratingStyle === 'glass' && preferNeutralGlassPlate;
  const iconShape =
    ratingStyle === 'plain'
      ? ''
      : ratingStyle === 'square'
        ? `<rect x="${iconX + 0.75}" y="${iconY + 0.75}" width="${Math.max(0, renderIconSize - 1.5)}" height="${Math.max(0, renderIconSize - 1.5)}" rx="${Math.max(4, iconCornerRadius || iconRadius)}" fill="${iconKey === 'tomatoes' || iconKey === 'tomatoesaudience' ? 'rgba(255,248,240,0.96)' : 'rgb(10,10,10)'}" />`
        : useNeutralGlassPlate
          ? `<circle cx="${iconCx}" cy="${iconCy}" r="${iconRadius}" fill="rgba(15,23,42,0.92)" stroke="${accentColor}" stroke-width="1.5" />`
          : `<circle cx="${iconCx}" cy="${iconCy}" r="${iconRadius}" fill="${accentColor}" stroke="rgba(255,255,255,0.45)" />`;
  const iconClipPath =
    ratingStyle === 'plain'
      ? ''
      : ratingStyle === 'square'
        ? `<rect x="${iconX + 1.5}" y="${iconY + 1.5}" width="${Math.max(0, renderIconSize - 3)}" height="${Math.max(0, renderIconSize - 3)}" rx="${Math.max(4, iconCornerRadius || iconRadius - 1)}" />`
        : `<circle cx="${iconCx}" cy="${iconCy}" r="${Math.max(1, iconRadius - 1)}" />`;
  const iconBorder =
    ratingStyle === 'plain'
      ? ''
      : ratingStyle === 'square'
        ? iconCornerRadius > 0
          ? `<rect x="${iconX + 1.5}" y="${iconY + 1.5}" width="${Math.max(0, renderIconSize - 3)}" height="${Math.max(0, renderIconSize - 3)}" rx="${Math.max(4, iconCornerRadius || iconRadius - 1)}" fill="none" stroke="rgba(255,255,255,0.18)" />`
          : ''
        : useNeutralGlassPlate
          ? `<circle cx="${iconCx}" cy="${iconCy}" r="${Math.max(1, iconRadius - 0.75)}" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="0.75" />`
          : `<circle cx="${iconCx}" cy="${iconCy}" r="${iconRadius}" fill="none" stroke="rgba(255,255,255,0.45)" />`;
  const monogramFill = ratingStyle === 'glass' && !useNeutralGlassPlate ? 'white' : accentColor;
  const plainIconFilter = ratingStyle === 'plain' ? ' filter="url(#plain-icon-shadow)"' : '';
  const iconImage =
    !iconDataUri
      ? ''
      : ratingStyle === 'plain'
        ? `<image href="${iconDataUri}" x="${iconX}" y="${iconY}" width="${renderIconSize}" height="${renderIconSize}" preserveAspectRatio="xMidYMid meet"${plainIconFilter} />`
        : `<defs><clipPath id="icon-clip">${iconClipPath}</clipPath></defs><image href="${iconDataUri}" x="${iconX}" y="${iconY}" width="${renderIconSize}" height="${renderIconSize}" preserveAspectRatio="xMidYMid meet" clip-path="url(#icon-clip)" />${iconBorder}`;
  const monogramText =
    iconDataUri
      ? ''
      : `<text x="${iconCx}" y="${Math.round(iconCy + iconFontSize * 0.34)}" font-family="Arial, sans-serif" font-size="${iconFontSize}" font-weight="700" text-anchor="middle" fill="${monogramFill}"${plainIconFilter}>${escapeXml(monogram)}</text>${iconBorder}`;
  const valueNumericStyle =
    ' style="font-variant-numeric: tabular-nums lining-nums; font-feature-settings: \'tnum\' 1, \'lnum\' 1;"';
  const valueAnchor = shouldCenterValueInSlot ? 'middle' : 'start';
  const valueRenderX = shouldCenterValueInSlot
    ? Math.round(valueX + valueAvailableWidth / 2)
    : valueX;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${plainBadgeDefs}
${plainBadgeSurface}
${outerRect}
${iconShape}
${iconImage}
${monogramText}
<text x="${valueRenderX}" y="${valueY}" font-family="${valueFontFamily}" font-size="${fontSize}" font-weight="800" text-anchor="${valueAnchor}" fill="white"${valueFilter}${valueLetterSpacing}${valueTextLength}${valueNumericStyle}>${escapeXml(value)}</text>
</svg>`;
};
