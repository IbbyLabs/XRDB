'use client';

import { ProxyView } from '@/components/proxy-view';
import { useConfiguratorContext } from '@/lib/configuratorProvider';

export default function AddonPage() {
  const { docsCaptureReady } = useConfiguratorContext();

  return (
    <div
      className="xrdb-page min-h-screen bg-transparent text-zinc-300"
      data-docs-capture-ready={docsCaptureReady ? 'true' : 'false'}
    >
      <ProxyView />
    </div>
  );
}
