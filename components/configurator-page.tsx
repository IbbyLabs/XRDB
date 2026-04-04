'use client';

import { ConfigureView } from '@/components/configure-view';

export default function ConfiguratorPage() {
  return (
    <div className="xrdb-page min-h-screen bg-transparent text-zinc-300 selection:bg-violet-500/30">
      <ConfigureView />
    </div>
  );
}
