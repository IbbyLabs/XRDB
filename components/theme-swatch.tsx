'use client';

import type { XRDBPalette } from '@/lib/theme';

export function ThemeSwatch({ palette, label, isActive, onClick }: {
  palette: XRDBPalette;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`xrdb-theme-swatch${isActive ? ' xrdb-theme-swatch-active' : ''}`}
      onClick={onClick}
      aria-pressed={isActive}
      aria-label={`Apply ${label} theme`}
      title={label}
    >
      <span
        className="xrdb-theme-swatch-card"
        aria-hidden="true"
        style={{ background: palette.bgBase }}
      >
        <span
          className="xrdb-theme-swatch-surface"
          style={{
            background: palette.bgSurface,
            borderColor: palette.border,
          }}
        />
        <span className="xrdb-theme-swatch-bottom-row">
          <span
            className="xrdb-theme-swatch-chip"
            style={{ background: palette.accent }}
          />
          <span
            className="xrdb-theme-swatch-aa"
            style={{ color: palette.ink }}
          >
            Aa
          </span>
        </span>
        <span
          className="xrdb-theme-swatch-border-strip"
          style={{ background: palette.border }}
        />
      </span>
      <span className="xrdb-theme-swatch-name">{label}</span>
    </button>
  );
}
