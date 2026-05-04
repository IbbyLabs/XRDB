import type { Metadata } from 'next';

import { ThemePageContent } from '@/components/theme-page-content';

export const metadata: Metadata = {
  title: 'Themes — XRDB',
};

export default function ThemesPage() {
  return <ThemePageContent />;
}
