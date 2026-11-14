'use client';

import { useT } from '@/lib/i18n';

export function SkipLink() {
  const t = useT();
  return <a href="#main" className="skip-link">{t('Skip to content')}</a>;
}
