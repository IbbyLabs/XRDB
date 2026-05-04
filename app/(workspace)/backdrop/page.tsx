'use client';

import { StepShell } from '@/components/step-shell';
import {
  ProvidersPanel,
  StylePanel,
  PositionPanel,
  AdvancedPanel,
} from '@/components/backdrop-panels';

const BACKDROP_PANELS = {
  providers: <ProvidersPanel />,
  style: <StylePanel />,
  position: <PositionPanel />,
  advanced: <AdvancedPanel />,
};

export default function BackdropPage() {
  return <StepShell step="backdrop" panels={BACKDROP_PANELS} />;
}
