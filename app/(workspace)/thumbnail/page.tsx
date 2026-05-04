'use client';

import { StepShell } from '@/components/step-shell';
import {
  ProvidersPanel,
  StylePanel,
  PositionPanel,
  AdvancedPanel,
} from '@/components/thumbnail-panels';

const THUMBNAIL_PANELS = {
  providers: <ProvidersPanel />,
  style: <StylePanel />,
  position: <PositionPanel />,
  advanced: <AdvancedPanel />,
};

export default function ThumbnailPage() {
  return <StepShell step="thumbnail" panels={THUMBNAIL_PANELS} />;
}
