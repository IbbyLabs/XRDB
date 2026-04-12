'use client';

import Link from 'next/link';

import { useConfiguratorContext } from '@/lib/configuratorProvider';
import { ConfiguratorInputsPanel } from '@/components/configurator-inputs-panel';
import { ConfiguratorCenterStage } from '@/components/configurator-center-stage';

export function ConfigureView() {
  const { inputsPanelProps, workspaceColumnsProps } = useConfiguratorContext();
  const { centerStageProps, workspaceManagementProps } = workspaceColumnsProps;

  return (
    <div className="xrdb-configure-layout w-full px-4 py-6 md:px-6 md:py-8">
      {workspaceManagementProps.pendingConfigProfileId ? (
        <div className="order-0 mb-4 rounded-[1.75rem] border border-cyan-500/25 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_56%),linear-gradient(180deg,rgba(7,19,28,0.96),rgba(5,10,18,0.96))] p-4 shadow-[0_24px_90px_-55px_rgba(0,0,0,0.9)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-white">Saved profile link detected</div>
              <p className="text-[12px] leading-5 text-cyan-100/75">
                Open Import/Export to unlock and load profile {workspaceManagementProps.pendingConfigProfileId} on this device.
              </p>
            </div>
            <Link
              href="/export"
              className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-cyan-300"
            >
              Open Import/Export
            </Link>
          </div>
        </div>
      ) : null}
      <div className="order-2 lg:order-1 min-w-0 min-h-0">
        <ConfiguratorInputsPanel {...inputsPanelProps} />
      </div>
      <div className="order-1 lg:order-2 min-w-0 min-h-0">
        <ConfiguratorCenterStage {...centerStageProps} />
      </div>
    </div>
  );
}
