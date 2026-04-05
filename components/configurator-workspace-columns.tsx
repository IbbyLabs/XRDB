'use client';

import type { ComponentProps } from 'react';

import { WorkspaceManagementSection } from '@/components/configurator-basics';
import { ConfiguratorCenterStage } from '@/components/configurator-center-stage';
import { ConfiguratorExportPanels } from '@/components/configurator-export-panels';
import { ConfiguratorSupportPanels } from '@/components/configurator-support-panels';

export function ConfiguratorWorkspaceColumns({
  workspaceManagementProps,
  centerStageProps,
  exportPanelsProps,
  supportPanelsProps,
}: {
  workspaceManagementProps: ComponentProps<typeof WorkspaceManagementSection>;
  centerStageProps: ComponentProps<typeof ConfiguratorCenterStage>;
  exportPanelsProps: ComponentProps<typeof ConfiguratorExportPanels>;
  supportPanelsProps: ComponentProps<typeof ConfiguratorSupportPanels>;
}) {
  return (
    <>
      <div className="min-w-0">
        <ConfiguratorCenterStage {...centerStageProps} />
      </div>
      <div className="xrdb-workspace-side-rail xrdb-workspace-scroll-region min-h-0">
        <ConfiguratorExportPanels {...exportPanelsProps} workspaceManagementProps={workspaceManagementProps} />
        <ConfiguratorSupportPanels {...supportPanelsProps} />
      </div>
    </>
  );
}
