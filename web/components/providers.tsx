'use client';

import type { ReactNode } from 'react';
import { LangProvider } from '@/lib/i18n';

export function Providers({ children }: { children: ReactNode }) {
  return <LangProvider>{children}</LangProvider>;
}
