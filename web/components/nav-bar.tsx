'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Settings, Github, Plug } from 'lucide-react';
import { BRAND_NAME, BRAND_GITHUB_URL } from '@/lib/brand';

const NAV_LINKS = [
  { href: '/configurator', label: 'Configurator', icon: LayoutGrid },
  { href: '/integrations', label: 'Integrations', icon: Plug       },
  { href: '/admin',        label: 'Admin',         icon: Settings   },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="xrdb-nav" aria-label="Main navigation">
      <Link href="/" className="xrdb-nav-brand" aria-label={`${BRAND_NAME} home`}>
        <span>
          <span className="xrdb-nav-brand-accent">X</span>RDB
        </span>
        <span className="xrdb-nav-badge">v3</span>
      </Link>

      <span className="xrdb-nav-spacer" />

      {NAV_LINKS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="xrdb-nav-link"
          aria-current={pathname === href || pathname.startsWith(href + '/') ? 'page' : undefined}
        >
          <Icon size={14} aria-hidden="true" />
          {label}
        </Link>
      ))}

      <a
        href={BRAND_GITHUB_URL}
        target="_blank"
        rel="noreferrer"
        className="xrdb-nav-link"
        aria-label="XRDB GitHub repository"
      >
        <Github size={14} aria-hidden="true" />
        <span className="sr-only">GitHub</span>
      </a>
    </nav>
  );
}
