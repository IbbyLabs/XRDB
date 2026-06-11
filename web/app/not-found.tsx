import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="page-inner">
      <div className="notfound">
        <span className="notfound-code">404</span>
        <h1 className="notfound-title">Nothing rendered here</h1>
        <p className="notfound-sub">
          This page doesn&apos;t exist. If you followed an artwork URL, check the
          media type and ID — renders live at <code>/poster/&#123;id&#125;</code>.
        </p>
        <Link href="/configurator" className="btn btn-primary">
          <LayoutGrid size={15} aria-hidden="true" />
          Open Configurator
        </Link>
      </div>
    </div>
  );
}
