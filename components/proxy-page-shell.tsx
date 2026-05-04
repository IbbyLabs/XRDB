'use client';

import type { ReactNode } from 'react';

import { useOptionalConfiguratorContext } from '@/lib/configuratorProvider';

export function ProxyPageShell({ children }: { children: ReactNode }) {
  const ctx = useOptionalConfiguratorContext();
  const docsCaptureReady = ctx?.docsCaptureReady ?? false;

  return (
    <div
      className="xrdb-page min-h-screen bg-transparent"
      data-docs-capture-ready={docsCaptureReady ? 'true' : undefined}
    >
      {children}
    </div>
  );
}
