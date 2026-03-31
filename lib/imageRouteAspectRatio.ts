import type { RenderedImagePayload } from './imageRouteRuntime.ts';

type SourceImageReader = (imgUrl: string) => Promise<RenderedImagePayload>;
type SharpMetadata = {
  width?: number | null;
  height?: number | null;
};
type SharpInstance = {
  metadata: () => Promise<SharpMetadata>;
};
type SharpFactory = (input: Buffer) => SharpInstance;
type SharpFactoryLoader = () => Promise<SharpFactory>;

export const createRemoteImageAspectRatioReader = ({
  getSourceImagePayload,
  getSharpFactory,
}: {
  getSourceImagePayload: SourceImageReader;
  getSharpFactory: SharpFactoryLoader;
}) => {
  return async (imgUrl: string): Promise<number | null> => {
    const normalizedImgUrl = String(imgUrl || '').trim();
    if (!normalizedImgUrl) return null;

    try {
      const sourcePayload = await getSourceImagePayload(normalizedImgUrl);
      const sourceBuffer = Buffer.from(sourcePayload.body);
      const sharp = await getSharpFactory();
      const metadata = await sharp(sourceBuffer).metadata();
      if (!metadata.width || !metadata.height || metadata.height <= 0) {
        return null;
      }
      return metadata.width / metadata.height;
    } catch {
      return null;
    }
  };
};
