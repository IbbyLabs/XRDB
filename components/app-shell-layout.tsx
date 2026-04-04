import type { ReactNode } from 'react';

import { AppBar } from '@/components/app-bar';
import { BottomTabBar } from '@/components/bottom-tab-bar';

export function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="xrdb-app-shell">
      <AppBar />
      <div className="xrdb-app-content">{children}</div>
      <BottomTabBar />
    </div>
  );
}
