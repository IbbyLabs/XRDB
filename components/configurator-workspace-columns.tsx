'use client';

import type { ComponentProps } from 'react';

import { ConfiguratorCenterStage } from '@/components/configurator-center-stage';
import { ConfiguratorExportPanels } from '@/components/configurator-export-panels';
import { ConfiguratorSupportPanels } from '@/components/configurator-support-panels';

export function ConfiguratorWorkspaceColumns({
  centerStageProps,
  exportPanelsProps,
  supportPanelsProps,
}: {
  centerStageProps: ComponentProps<typeof ConfiguratorCenterStage>;
  exportPanelsProps: ComponentProps<typeof ConfiguratorExportPanels>;
  supportPanelsProps: ComponentProps<typeof ConfiguratorSupportPanels>;
}) {
  return (
    <>
      <div className="min-w-0">
        <ConfiguratorCenterStage {...centerStageProps} />
      </div>
      <div className="xrdb-workspace-side-rail">
        <ConfiguratorExportPanels {...exportPanelsProps} />
        <ConfiguratorSupportPanels {...supportPanelsProps} />
      </div>
    </>
  );
}
