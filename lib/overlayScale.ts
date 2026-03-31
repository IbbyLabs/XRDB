type XrdbImageType = 'poster' | 'backdrop' | 'logo';

const POSTER_BASE_WIDTH = 580;
const POSTER_BASE_HEIGHT = 859;
const BACKDROP_BASE_WIDTH = 1280;
const BACKDROP_BASE_HEIGHT = 720;
const LOGO_BASE_HEIGHT = 320;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const resolveOverlayAutoScale = ({
  imageType,
  outputWidth,
  outputHeight,
}: {
  imageType: XrdbImageType;
  outputWidth: number;
  outputHeight: number;
}) => {
  if (!Number.isFinite(outputWidth) || !Number.isFinite(outputHeight) || outputWidth <= 0 || outputHeight <= 0) {
    return 1;
  }

  if (imageType === 'poster') {
    const widthRatio = outputWidth / POSTER_BASE_WIDTH;
    const heightRatio = outputHeight / POSTER_BASE_HEIGHT;
    return clamp(Math.min(widthRatio, heightRatio), 0.75, 4);
  }

  if (imageType === 'backdrop') {
    const widthRatio = outputWidth / BACKDROP_BASE_WIDTH;
    const heightRatio = outputHeight / BACKDROP_BASE_HEIGHT;
    return clamp(Math.min(widthRatio, heightRatio), 0.75, 3);
  }

  return clamp(outputHeight / LOGO_BASE_HEIGHT, 0.75, 3);
};
