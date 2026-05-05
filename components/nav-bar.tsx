'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useOptionalConfiguratorContext } from '@/lib/configuratorProvider';
import {
  BRAND_NAME,
  NAV_VERSION_COMMIT_HASH,
  NAV_VERSION_COMMIT_URL,
  NAV_VERSION_LABEL,
} from '@/lib/siteBrand';
import { ThemeModeControl } from '@/components/theme-mode-control';
import { BrandLogoIcon } from '@/components/brand-logo-icon';
import {
  applyThemeV2,
  getActiveFamily,
  getActiveModePreference,
  resolveActiveTheme,
  resolveMode,
  setActiveMode,
  type XRDBModePreference,
  type XRDBThemeMode,
} from '@/lib/theme';

const MODE_OPTIONS: { value: XRDBModePreference; label: string; icon: string }[] = [
  { value: 'system',   label: 'Auto',     icon: 'A' },
  { value: 'light',    label: 'Light',    icon: 'L' },
  { value: 'dark',     label: 'Dark',     icon: 'D' },
  { value: 'midnight', label: 'Midnight', icon: 'M' },
];

function applyFamilyMode(familyId: string, effective: XRDBThemeMode) {
  const palette = resolveActiveTheme(familyId, effective);
  applyThemeV2({
    id: effective === 'midnight' ? `midnight-${familyId}` : `${familyId}-${effective}`,
    name: familyId,
    category: 'preset',
    palette,
    source: 'preset',
  });
}

function ThemeModePopover() {
  const [open, setOpen] = useState(false);
  const [pref, setPref] = useState<XRDBModePreference>(() => {
    if (typeof window === 'undefined') return 'dark';
    return getActiveModePreference();
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function handleSelect(next: XRDBModePreference) {
    setActiveMode(next);
    setPref(next);
    applyFamilyMode(getActiveFamily(), resolveMode(next));
    setOpen(false);
  }

  const activeModeLabel = MODE_OPTIONS.find(m => m.value === pref)?.label ?? pref;

  return (
    <div ref={ref} className="xrdb-nav-mode-popover-wrap" aria-label="Color mode">
      <button
        type="button"
        className="xrdb-theme-icon-btn"
        aria-label={`Color mode: ${activeModeLabel}. Tap to change.`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(o => !o)}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2a6 6 0 1 0 6 6 4.5 4.5 0 0 1-6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="xrdb-nav-mode-popover" role="listbox" aria-label="Color mode">
          {MODE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={pref === value}
              className={`xrdb-nav-mode-popover-item${pref === value ? ' xrdb-nav-mode-popover-item-active' : ''}`}
              onClick={() => handleSelect(value)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const STEP_TABS = [
  { label: 'Poster', href: '/poster' },
  { label: 'Backdrop', href: '/backdrop' },
  { label: 'Thumbnail', href: '/thumbnail' },
  { label: 'Logo', href: '/logo' },
  { label: 'Save', href: '/save' },
] as const;

const UTIL_TABS = [
  { label: 'Proxy', href: '/proxy' },
  { label: 'Reference', href: '/reference' },
] as const;

export function NavBar({ adminEnabled = false }: { adminEnabled?: boolean }) {
  const pathname = usePathname();
  const configurator = useOptionalConfiguratorContext();
  const activeMode = configurator?.experienceMode ?? 'simple';
  const isStepRoute =
    pathname.startsWith('/poster')
    || pathname.startsWith('/backdrop')
    || pathname.startsWith('/thumbnail')
    || pathname.startsWith('/logo');
  const showModeToggle = isStepRoute;
  function handleModeSelect(nextMode: 'simple' | 'advanced') {
    if (!configurator) {
      return;
    }
    configurator.handleSelectExperienceMode(nextMode);
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <nav className="xrdb-nav" aria-label="Main navigation">
      <div className="xrdb-nav-inner">
        <div className="xrdb-nav-brand">
          <Link href="/" className="xrdb-nav-brand-home" aria-label={`${BRAND_NAME} home`}>
            <BrandLogoIcon className="xrdb-nav-brand-mark" />
            <span className="xrdb-nav-brand-sep" aria-hidden="true" />
            <div className="xrdb-nav-brand-stack">
              <span className="xrdb-nav-brand-label" aria-hidden="true">Extended Ratings Database</span>
              <div className="xrdb-nav-brand-row">
                <span className="xrdb-nav-brand-name">{BRAND_NAME}</span>
                <div className="xrdb-nav-build-meta" aria-label={`Build ${NAV_VERSION_LABEL}`}>
                  <span className="xrdb-nav-brand-version">{NAV_VERSION_LABEL}</span>
                  {NAV_VERSION_COMMIT_HASH && NAV_VERSION_COMMIT_URL ? (
                    <a
                      className="xrdb-nav-commit-link"
                      href={NAV_VERSION_COMMIT_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open commit ${NAV_VERSION_COMMIT_HASH}`}
                    >
                      {NAV_VERSION_COMMIT_HASH}
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </Link>
        </div>

        <div className="xrdb-nav-tabs">
          <div className="xrdb-nav-step-tabs">
            {STEP_TABS.map(tab => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`xrdb-nav-tab${isActive(tab.href) ? ' xrdb-nav-tab-active' : ''}`}
                aria-current={isActive(tab.href) ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            ))}
          </div>
          <div className="xrdb-nav-divider" aria-hidden="true" />
          <div className="xrdb-nav-util-tabs">
            {UTIL_TABS.map(tab => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`xrdb-nav-tab${isActive(tab.href) ? ' xrdb-nav-tab-active' : ''}`}
                aria-current={isActive(tab.href) ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            ))}
            {adminEnabled ? (
              <>
                <span className="xrdb-nav-divider" aria-hidden="true" />
                <Link
                  href="/admin"
                  className={`xrdb-nav-tab xrdb-nav-tab-admin${isActive('/admin') ? ' xrdb-nav-tab-active' : ''}`}
                  aria-current={isActive('/admin') ? 'page' : undefined}
                >
                  Admin
                </Link>
              </>
            ) : null}
          </div>
        </div>

        <div className="xrdb-nav-right">
          {showModeToggle ? (
            <div className="xrdb-nav-controls">
              <div className="xrdb-mode-toggle" role="group" aria-label="Interface mode">
                <button
                  className={`xrdb-mode-btn${activeMode === 'simple' ? ' xrdb-mode-btn-active' : ''}`}
                  onClick={() => handleModeSelect('simple')}
                  aria-pressed={activeMode === 'simple'}
                  type="button"
                >
                  Simple
                </button>
                <button
                  className={`xrdb-mode-btn${activeMode === 'advanced' ? ' xrdb-mode-btn-active' : ''}`}
                  onClick={() => handleModeSelect('advanced')}
                  aria-pressed={activeMode === 'advanced'}
                  type="button"
                >
                  Advanced
                </button>
              </div>
            </div>
          ) : null}

          <div className="xrdb-nav-theme-tools">
            <span className="xrdb-nav-theme-control-full"><ThemeModeControl /></span>
            <span className="xrdb-nav-theme-control-compact"><ThemeModePopover /></span>

            <div className="xrdb-theme-trigger">
              <Link
                href="/themes"
                className={`xrdb-theme-icon-btn${isActive('/themes') ? ' xrdb-theme-icon-btn-active' : ''}`}
                aria-label="Theme settings"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.36 3.64l-1.06 1.06M4.7 11.3l-1.06 1.06M12.36 12.36l-1.06-1.06M4.7 4.7L3.64 3.64" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
