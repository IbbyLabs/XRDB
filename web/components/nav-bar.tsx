'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Settings, Github, Plug, CircleHelp } from 'lucide-react';
import { BRAND_NAME, BRAND_GITHUB_URL } from '@/lib/brand';
import { fetchHealth } from '@/lib/api';
import { ThemeSwitcher } from './theme-switcher';

const NAV_LINKS = [
  { href: '/configurator', label: 'Configurator', icon: LayoutGrid },
  { href: '/integrations', label: 'Integrations', icon: Plug },
  { href: '/help',         label: 'Help',         icon: CircleHelp },
  { href: '/admin',        label: 'Admin',        icon: Settings },
];

const FALLBACK_VERSION = 'v3';

/**
 * Dev builds stamp `channel.date.time.sha`, which is far too wide for a phone
 * bar. Narrow screens get the channel and the commit, the two parts that
 * identify a build. Release tags (`v3.1.0`) are short enough to keep whole.
 */
function compactVersion(version: string): string {
  const parts = version.split('.');
  if (parts.length < 3 || version.length <= 10) return version;
  return `${parts[0]}·${parts[parts.length - 1]}`;
}

function useDeploymentVersion(): string {
  const [version, setVersion] = useState(FALLBACK_VERSION);
  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then(h => {
        // Release builds stamp XRDB_VERSION from the git tag; anything
        // without a digit (e.g. "dev") falls back to the major label.
        if (!cancelled && /\d/.test(h.version)) {
          setVersion(`v${h.version.replace(/^v/, '')}`);
        }
      })
      .catch(() => { /* unreachable backend — keep fallback */ });
    return () => { cancelled = true; };
  }, []);
  return version;
}

export function NavBar() {
  const pathname = usePathname();
  const version = useDeploymentVersion();

  return (
    <nav className="nav" aria-label="Main navigation">
      <Link href="/" className="nav-brand" aria-label={`${BRAND_NAME} home`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/xrdb-logo.png" alt="" className="nav-logo" aria-hidden="true" width={512} height={512} />
        <span className="nav-word">
          <span className="nav-brand-x">X</span>RDB
        </span>
        <span className="nav-badge" title={`${BRAND_NAME} deployment version: ${version}`}>
          <span className="nav-badge-full">{version}</span>
          <span className="nav-badge-short">{compactVersion(version)}</span>
        </span>
      </Link>

      <span className="nav-spacer" />

      {NAV_LINKS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="nav-link"
          aria-current={pathname === href || pathname.startsWith(href + '/') ? 'page' : undefined}
        >
          <Icon size={14} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}

      <ThemeSwitcher />

      <a
        href={BRAND_GITHUB_URL}
        target="_blank"
        rel="noreferrer"
        className="nav-link"
        aria-label="XRDB GitHub repository"
      >
        <Github size={14} aria-hidden="true" />
        <span className="sr-only">GitHub</span>
      </a>
    </nav>
  );
}
