'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { useConfiguratorWorkspaceRuntime } from '@/lib/useConfiguratorWorkspaceRuntime';

type ConfiguratorContextValue = ReturnType<typeof useConfiguratorWorkspaceRuntime>;

const ConfiguratorContext = createContext<ConfiguratorContextValue | null>(null);

export function ConfiguratorProvider({ children }: { children: ReactNode }) {
  const runtime = useConfiguratorWorkspaceRuntime();
  return (
    <ConfiguratorContext.Provider value={runtime}>
      {children}
    </ConfiguratorContext.Provider>
  );
}

export function useConfiguratorContext(): ConfiguratorContextValue {
  const ctx = useContext(ConfiguratorContext);
  if (!ctx) {
    throw new Error('useConfiguratorContext must be used within a ConfiguratorProvider');
  }
  return ctx;
}
