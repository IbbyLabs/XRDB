import type sharp from 'sharp';

export type CompositeOverlayEntry = {
  input: Buffer;
  left: number;
  top: number;
};

const normalizeOverlayOffset = (value: number, limit: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.round(value), Math.max(0, limit)));
};

export const fitCompositeOverlaysToCanvas = async (
  sharpFactory: typeof sharp,
  overlays: CompositeOverlayEntry[],
  canvasWidth: number,
  canvasHeight: number,
) => {
  const normalizedCanvasWidth = Math.max(1, Math.round(canvasWidth));
  const normalizedCanvasHeight = Math.max(1, Math.round(canvasHeight));
  const normalized: CompositeOverlayEntry[] = [];

  for (const overlay of overlays) {
    const metadata = await sharpFactory(overlay.input).metadata();
    const overlayWidth = metadata.width ?? null;
    const overlayHeight = metadata.height ?? null;
    let left = normalizeOverlayOffset(overlay.left, normalizedCanvasWidth);
    let top = normalizeOverlayOffset(overlay.top, normalizedCanvasHeight);

    if (!(overlayWidth && overlayHeight)) {
      normalized.push({ ...overlay, left, top });
      continue;
    }

    const maxWidth = normalizedCanvasWidth - left;
    const maxHeight = normalizedCanvasHeight - top;
    if (maxWidth <= 0 || maxHeight <= 0) continue;

    const scale = Math.min(1, maxWidth / overlayWidth, maxHeight / overlayHeight);
    if (scale >= 1) {
      normalized.push({ ...overlay, left, top });
      continue;
    }

    const resizedWidth = Math.max(1, Math.min(maxWidth, Math.round(overlayWidth * scale)));
    const resizedHeight = Math.max(1, Math.min(maxHeight, Math.round(overlayHeight * scale)));
    left = Math.min(left, Math.max(0, normalizedCanvasWidth - resizedWidth));
    top = Math.min(top, Math.max(0, normalizedCanvasHeight - resizedHeight));

    normalized.push({
      input: await sharpFactory(overlay.input)
        .resize(resizedWidth, resizedHeight, {
          fit: 'contain',
          withoutEnlargement: true,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer(),
      left,
      top,
    });
  }

  return normalized;
};
