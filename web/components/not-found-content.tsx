'use client';

import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { useT } from '@/lib/i18n';

export function NotFoundContent() {
  const t = useT();
  return (
    <div className="page-inner">
      <div className="notfound">
        <span className="notfound-code">404</span>
        <h1 className="notfound-title">{t('Nothing rendered here')}</h1>
        <p className="notfound-sub">
          {t("This page doesn't exist. If you followed an artwork URL, check the media type and ID — renders live at")}{' '}
          <code>/poster/&#123;id&#125;</code>.
        </p>
        <Link href="/configurator" className="btn btn-primary">
          <LayoutGrid size={15} aria-hidden="true" />
          {t('Open Configurator')}
        </Link>
      </div>
    </div>
  );
}
