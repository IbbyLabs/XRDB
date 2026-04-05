'use client';

import { useConfiguratorContext } from '@/lib/configuratorProvider';
import { ConfiguratorInputsPanel } from '@/components/configurator-inputs-panel';
import { ConfiguratorCenterStage } from '@/components/configurator-center-stage';

export function ConfigureView() {
  const { inputsPanelProps, workspaceColumnsProps } = useConfiguratorContext();
  const { centerStageProps } = workspaceColumnsProps;

  return (
    <div className="xrdb-configure-layout w-full px-4 py-6 md:px-6 md:py-8">
      <div className="order-2 lg:order-1 min-w-0 min-h-0">
        <ConfiguratorInputsPanel {...inputsPanelProps} />
      </div>
      <div className="order-1 lg:order-2 min-w-0 min-h-0">
        <ConfiguratorCenterStage {...centerStageProps} />
      </div>
    </div>
  );
}
