'use client';

import { useState, useEffect, useRef, useId, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Palette, Check } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { msg } from '@/lib/i18n-msg';

// Each theme recolors the entire token system through one hue.
// Swatch colors approximate each theme's accent for the picker.
const THEMES = [
  { id: 'midnight', label: msg('Midnight'), swatch: 'oklch(52% 0.165 238)' },
  { id: 'violet',   label: msg('Violet'),   swatch: 'oklch(52% 0.165 300)' },
  { id: 'emerald',  label: msg('Emerald'),  swatch: 'oklch(50% 0.165 165)' },
  { id: 'ember',    label: msg('Ember'),    swatch: 'oklch(52% 0.165 50)' },
  { id: 'crimson',  label: msg('Crimson'),  swatch: 'oklch(52% 0.165 20)' },
  { id: 'slate',    label: msg('Slate'),    swatch: 'oklch(52% 0.03 238)' },
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
  const t = useT();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ThemeId>(storedTheme);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  // On open, move focus into the menu onto the checked option (radiogroup convention).
  useEffect(() => {
    if (!open) return;
    const i = THEMES.findIndex(t => t.id === active);
    optionsRef.current[i < 0 ? 0 : i]?.focus();
  }, [open, active]);

  const closeToTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Arrow keys move the selection (applying the theme live) and focus; Escape
  // closes and returns focus to the trigger — the ARIA radiogroup contract.
  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); closeToTrigger(); return; }
    const cur = THEMES.findIndex(t => t.id === active);
    let next = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (cur + 1) % THEMES.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (cur - 1 + THEMES.length) % THEMES.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = THEMES.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const id = THEMES[next].id;
    setActive(id);
    applyTheme(id);
    optionsRef.current[next]?.focus();
  };

  const select = (id: ThemeId) => {
    setActive(id);
    applyTheme(id);
    closeToTrigger();
  };

  return (
    <div className="theme-menu-wrap" ref={wrapRef}>
      <button
        ref={triggerRef}
        className="nav-link"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-controls={`${uid}-menu`}
        aria-label={t('UI theme')}
      >
        <Palette size={14} aria-hidden="true" />
        <span className="sr-only">{t('UI theme')}</span>
      </button>

      {open && (
        <div
          id={`${uid}-menu`}
          className="theme-menu"
          role="radiogroup"
          aria-label={t('UI theme')}
          onKeyDown={onMenuKeyDown}
        >
          {THEMES.map((th, i) => (
            <button
              key={th.id}
              ref={el => { optionsRef.current[i] = el; }}
              role="radio"
              aria-checked={active === th.id}
              tabIndex={active === th.id ? 0 : -1}
              className="theme-option"
              onClick={() => select(th.id)}
            >
              <span className="theme-swatch" style={{ background: th.swatch }} aria-hidden />
              {t(th.label)}
              {active === th.id && (
                <span className="theme-check" aria-hidden><Check size={13} /></span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
