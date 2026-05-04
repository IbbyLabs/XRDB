'use client';

import { StepShell } from '@/components/step-shell';
import {
  ProvidersPanel,
  StylePanel,
  PositionPanel,
  AdvancedPanel,
} from '@/components/logo-panels';

const LOGO_PANELS = {
  providers: <ProvidersPanel />,
  style: <StylePanel />,
  position: <PositionPanel />,
  advanced: <AdvancedPanel />,
};

export default function LogoPage() {
  return <StepShell step="logo" panels={LOGO_PANELS} />;
}
