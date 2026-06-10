'use client';

import { useState, useEffect, useRef, useId } from 'react';
import { Palette, Check } from 'lucide-react';

// Each theme recolors the entire token system through one hue.
// Swatch colors approximate each theme's accent for the picker.
const THEMES = [
  { id: 'midnight', label: 'Midnight', swatch: 'oklch(52% 0.165 238)' },
  { id: 'violet',   label: 'Violet',   swatch: 'oklch(52% 0.165 300)' },
  { id: 'emerald',  label: 'Emerald',  swatch: 'oklch(50% 0.165 165)' },
  { id: 'ember',    label: 'Ember',    swatch: 'oklch(52% 0.165 50)' },
  { id: 'crimson',  label: 'Crimson',  swatch: 'oklch(52% 0.165 20)' },
  { id: 'slate',    label: 'Slate',    swatch: 'oklch(52% 0.03 238)' },
] as const;

type ThemeId = typeof THEMES[number]['id'];

const STORAGE_KEY = 'xrdb-ui-theme';

function applyTheme(id: ThemeId) {
  if (id === 'midnight') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = id;
  }
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* unavailable */ }
}

function storedTheme(): ThemeId {
  if (typeof window === 'undefined') return 'midnight';
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (stored && THEMES.some(t => t.id === stored)) return stored;
  } catch { /* unavailable */ }
  return 'midnight';
}

export function ThemeSwitcher() {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ThemeId>(storedTheme);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const select = (id: ThemeId) => {
    setActive(id);
    applyTheme(id);
    setOpen(false);
  };

  return (
    <div className="theme-menu-wrap" ref={wrapRef}>
      <button
        className="nav-link"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-controls={`${uid}-menu`}
        aria-label="UI theme"
      >
        <Palette size={14} aria-hidden="true" />
        <span className="sr-only">UI theme</span>
      </button>

      {open && (
        <div id={`${uid}-menu`} className="theme-menu" role="radiogroup" aria-label="UI theme">
          {THEMES.map(t => (
            <button
              key={t.id}
              role="radio"
              aria-checked={active === t.id}
              className="theme-option"
              onClick={() => select(t.id)}
            >
              <span className="theme-swatch" style={{ background: t.swatch }} aria-hidden />
              {t.label}
              {active === t.id && (
                <span className="theme-check" aria-hidden><Check size={13} /></span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
