import { StepShell } from '@/components/step-shell';
import { AdvancedPanel, PositionPanel, ProvidersPanel, QualityPanel, StylePanel } from '@/components/poster-panels';

const POSTER_PANELS = {
  providers: <ProvidersPanel />,
  style: <StylePanel />,
  position: <PositionPanel />,
  quality: <QualityPanel />,
  advanced: <AdvancedPanel />,
};

export default function PosterPage() {
  return <StepShell step="poster" panels={POSTER_PANELS} />;
}
