'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sliders, ArrowLeftRight, Layers, BookOpen } from 'lucide-react';

const tabs = [
  { href: '/', label: 'Configure', icon: Sliders },
  { href: '/export', label: 'Import/Export', icon: ArrowLeftRight },
  { href: '/addon', label: 'Proxy', icon: Layers },
  { href: '/reference', label: 'Reference', icon: BookOpen },
] as const;

export function BottomTabBar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav className="xrdb-bottom-tabs" aria-label="View navigation">
      {tabs.map((tab) => {
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`xrdb-bottom-tab${active ? ' is-active' : ''}`}
          >
            <tab.icon className="xrdb-bottom-tab-icon" aria-hidden="true" />
            <span className="xrdb-bottom-tab-label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
