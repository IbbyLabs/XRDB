'use client';

import { useEffect, useState } from 'react';

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

const MODE_OPTIONS: { value: XRDBModePreference; label: string }[] = [
  { value: 'system',   label: 'Auto' },
  { value: 'light',    label: 'Light' },
  { value: 'dark',     label: 'Dark' },
  { value: 'midnight', label: 'Midnight' },
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

export function ThemeModeControl() {
  const [pref, setPref] = useState<XRDBModePreference>('dark');

  useEffect(() => {
    setPref(getActiveModePreference());
  }, []);

  useEffect(() => {
    if (pref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    function onSystemChange() {
      applyFamilyMode(getActiveFamily(), resolveMode('system'));
    }
    mq.addEventListener('change', onSystemChange);
    return () => mq.removeEventListener('change', onSystemChange);
  }, [pref]);

  function handleSelect(next: XRDBModePreference) {
    setActiveMode(next);
    setPref(next);
    applyFamilyMode(getActiveFamily(), resolveMode(next));
  }

  return (
    <div className="xrdb-mode-toggle" role="group" aria-label="Color mode">
      {MODE_OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={`xrdb-mode-btn${pref === value ? ' xrdb-mode-btn-active' : ''}`}
          onClick={() => handleSelect(value)}
          aria-pressed={pref === value}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
