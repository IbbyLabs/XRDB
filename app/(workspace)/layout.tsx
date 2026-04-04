'use client';

import { ConfiguratorProvider } from '@/lib/configuratorProvider';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <ConfiguratorProvider>{children}</ConfiguratorProvider>;
}
