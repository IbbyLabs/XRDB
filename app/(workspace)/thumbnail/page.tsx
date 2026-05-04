'use client';

import { StepShell } from '@/components/step-shell';
import {
  ProvidersPanel,
  StylePanel,
  PositionPanel,
  QualityPanel,
  AdvancedPanel,
} from '@/components/thumbnail-panels';

const THUMBNAIL_PANELS = {
  providers: <ProvidersPanel />,
  style: <StylePanel />,
  position: <PositionPanel />,
  quality: <QualityPanel />,
  advanced: <AdvancedPanel />,
};

export default function ThumbnailPage() {
  return <StepShell step="thumbnail" panels={THUMBNAIL_PANELS} />;
}
