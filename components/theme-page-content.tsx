'use client';

import { useEffect, useState } from 'react';

import {
  applyThemeV2,
  DEFAULT_FAMILY_ID,
  DEFAULT_PRESET_V2,
  deletePersonalTheme,
  encodePaletteForUrl,
  getActiveFamily,
  getActiveModePreference,
  getPersonalThemes,
  getStoredThemeV2,
  resolveActiveTheme,
  resolveMode,
  resetThemeV2,
  savePersonalTheme,
  saveThemeV2,
  setActiveFamily,
  setActiveMode,
  THEME_FAMILIES,
  type XRDBPalette,
  type XRDBThemeFamily,
  type XRDBThemeMode,
  type XRDBThemeV2,
  type ThemePayloadV2,
} from '@/lib/theme';
import { ThemeSwatch } from '@/components/theme-swatch';

type CommunityThemeRow = XRDBThemeV2 & { author?: string };

type Tab = 'presets' | 'community' | 'mine' | 'custom';
type CustomSection = 'surfaces' | 'accent' | 'detail';
type PreviewTokenKey = keyof Pick<XRDBPalette, 'bgBase' | 'bgSurface' | 'bgElevated' | 'accent' | 'ink'>;
type PreviewTokenOverrides = Partial<Record<PreviewTokenKey, string>>;

type SliderLegendProps = {
  gradient: string;
  low: string;
  mid: string;
  high: string;
};

function SliderLegend({ gradient, low, mid, high }: SliderLegendProps) {
  return (
    <div className="xrdb-theme-slider-legend" aria-hidden="true">
      <span className="xrdb-theme-slider-legend-track" style={{ background: gradient }} />
      <span className="xrdb-theme-slider-legend-labels">
        <span>{low}</span>
        <span>{mid}</span>
        <span>{high}</span>
      </span>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHue(value: number): number {
  return ((value % 360) + 360) % 360;
}

function parseRgbColor(input: string): { r: number; g: number; b: number } | null {
  const match = input.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const parts = match[1].split(/[\s,\/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const r = Number(parts[0]);
  const g = Number(parts[1]);
  const b = Number(parts[2]);
  if (![r, g, b].every(Number.isFinite)) return null;
  return {
    r: clamp(Math.round(r), 0, 255),
    g: clamp(Math.round(g), 0, 255),
    b: clamp(Math.round(b), 0, 255),
  };
}

function parseOklchColor(input: string): { l: number; c: number; h: number } | null {
  const match = input.match(/oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+)?\s*\)/i);
  if (!match) return null;
  const l = Number(match[1]);
  const c = Number(match[2]);
  const h = Number(match[3]);
  if (![l, c, h].every(Number.isFinite)) return null;
  return {
    l: clamp(l, 0, 100),
    c: Math.max(0, c),
    h: normalizeHue(h),
  };
}

function cssColorToRgb(value: string): { r: number; g: number; b: number } | null {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('span');
  el.style.color = '';
  el.style.color = value;
  if (!el.style.color) return null;
  document.body.appendChild(el);
  const resolved = window.getComputedStyle(el).color;
  el.remove();
  return parseRgbColor(resolved);
}

function toSrgbChannel(channel: number): number {
  const safe = clamp(channel, 0, 1);
  return safe <= 0.0031308 ? 12.92 * safe : 1.055 * safe ** (1 / 2.4) - 0.055;
}

function oklchToRgb(oklch: { l: number; c: number; h: number }): { r: number; g: number; b: number } {
  const l = oklch.l / 100;
  const hRad = (oklch.h * Math.PI) / 180;
  const a = oklch.c * Math.cos(hRad);
  const bAxis = oklch.c * Math.sin(hRad);

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * bAxis) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * bAxis) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * bAxis) ** 3;

  const linearR = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const linearG = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const linearB = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;

  return {
    r: clamp(Math.round(toSrgbChannel(linearR) * 255), 0, 255),
    g: clamp(Math.round(toSrgbChannel(linearG) * 255), 0, 255),
    b: clamp(Math.round(toSrgbChannel(linearB) * 255), 0, 255),
  };
}

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function rgbToOklch(rgb: { r: number; g: number; b: number }): { l: number; c: number; h: number } {
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);

  const lmsL = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const lmsM = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const lmsS = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const l = 0.2104542553 * lmsL + 0.793617785 * lmsM - 0.0040720468 * lmsS;
  const a = 1.9779984951 * lmsL - 2.428592205 * lmsM + 0.4505937099 * lmsS;
  const bAxis = 0.0259040371 * lmsL + 0.7827717662 * lmsM - 0.808675766 * lmsS;
  const c = Math.sqrt(a * a + bAxis * bAxis);
  const rawHue = (Math.atan2(bAxis, a) * 180) / Math.PI;
  return {
    l: clamp(l * 100, 0, 100),
    c,
    h: normalizeHue(rawHue),
  };
}

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  return `#${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`;
}

function cssColorToHex(value: string): string | null {
  const rgb = cssColorToRgb(value);
  if (rgb) return rgbToHex(rgb);
  const parsedOklch = parseOklchColor(value);
  if (!parsedOklch) return null;
  return rgbToHex(oklchToRgb(parsedOklch));
}

function normalizeHex(value: string): string {
  const trimmed = value.trim();
  const raw = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(raw)) return '';
  if (raw.length === 3) {
    const expanded = raw.split('').map(part => `${part}${part}`).join('');
    return `#${expanded.toLowerCase()}`;
  }
  return `#${raw.toLowerCase()}`;
}

function buildCustomPalette(
  surfaceHue: number,
  surfaceDepth: number,
  surfaceChroma: number,
  midLightness: number,
  surfaceLightness: number,
  elevatedLightness: number,
  accentHue: number,
  accentL: number,
  accentC: number,
  textHue: number,
  borderChroma: number,
): XRDBPalette {
  return {
    bgBase:     `oklch(${surfaceDepth.toFixed(1)}% ${surfaceChroma.toFixed(3)} ${Math.round(surfaceHue)})`,
    bgMid:      `oklch(${midLightness.toFixed(1)}% ${(surfaceChroma + 0.002).toFixed(3)} ${Math.round(surfaceHue)})`,
    bgSurface:  `oklch(${surfaceLightness.toFixed(1)}% ${(surfaceChroma + 0.004).toFixed(3)} ${Math.round(surfaceHue)})`,
    bgElevated: `oklch(${elevatedLightness.toFixed(1)}% ${(surfaceChroma + 0.008).toFixed(3)} ${Math.round(surfaceHue)})`,
    accent:     `oklch(${Math.round(accentL)}% ${accentC.toFixed(3)} ${Math.round(accentHue)})`,
    accentDim:  `oklch(19% 0.09 ${Math.round(accentHue)})`,
    accentText: `oklch(76% 0.10 ${Math.round(accentHue)})`,
    ink:        `oklch(93% 0.007 ${Math.round(textHue)})`,
    muted:      `oklch(51% 0.014 ${Math.round(textHue)})`,
    border:     `oklch(22% ${borderChroma.toFixed(3)} ${Math.round(textHue)})`,
    scrim:      `oklch(4% ${(Math.max(0.006, borderChroma * 0.5)).toFixed(3)} ${Math.round(textHue)} / 0.86)`,
  };
}

const TAB_LABELS: Record<Tab, string> = {
  presets: 'Presets',
  community: 'Community',
  mine: 'Mine',
  custom: 'Custom',
};

const PREVIEW_TOKENS: { key: keyof XRDBPalette; label: string }[] = [
  { key: 'bgBase', label: 'Background' },
  { key: 'bgSurface', label: 'Surface' },
  { key: 'bgElevated', label: 'Elevated' },
  { key: 'accent', label: 'Accent' },
  { key: 'ink', label: 'Text' },
];

const FAMILY_MODE_LABELS: { value: XRDBThemeMode; label: string }[] = [
  { value: 'dark',     label: 'Dark' },
  { value: 'light',   label: 'Light' },
  { value: 'midnight', label: 'Midnight' },
];

const CUSTOM_SECTION_LABELS: { value: CustomSection; label: string }[] = [
  { value: 'surfaces', label: 'Surfaces' },
  { value: 'accent', label: 'Accent' },
  { value: 'detail', label: 'Text and borders' },
];

function ThemeFamilyCard({
  family,
  activeFamily,
  activeMode,
  onSelect,
}: {
  family: XRDBThemeFamily;
  activeFamily: string;
  activeMode: XRDBThemeMode;
  onSelect: (familyId: string, mode: XRDBThemeMode) => void;
}) {
  const isActiveFam = family.id === activeFamily;
  return (
    <div className={`xrdb-theme-family-card${isActiveFam ? ' xrdb-theme-family-card-active' : ''}`}>
      <div className="xrdb-theme-family-header">
        <span className="xrdb-theme-family-name">{family.name}</span>
      </div>
      <div className="xrdb-theme-family-swatches">
        {FAMILY_MODE_LABELS.filter(({ value }) => value !== 'midnight' || family.modes.midnight).map(({ value, label }) => (
          <ThemeSwatch
            key={value}
            palette={family.modes[value as keyof typeof family.modes]! as XRDBPalette}
            label={label}
            isActive={isActiveFam && activeMode === value}
            onClick={() => onSelect(family.id, value)}
          />
        ))}
      </div>
    </div>
  );
}

export function ThemePageContent() {
  const [tab, setTab] = useState<Tab>('presets');
  const [customSection, setCustomSection] = useState<CustomSection>('surfaces');
  const [activeId, setActiveId] = useState<string>(DEFAULT_PRESET_V2.id);
  const [activeFamily, setActiveFamilyState] = useState<string>(DEFAULT_FAMILY_ID);
  const [activeMode, setActiveModeState] = useState<XRDBThemeMode>('dark');

  const [community, setCommunity] = useState<CommunityThemeRow[]>([]);
  const [communityError, setCommunityError] = useState(false);

  const [personalThemes, setPersonalThemes] = useState<XRDBThemeV2[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [saveSlotName, setSaveSlotName] = useState('');
  const [savingSlot, setSavingSlot] = useState(false);

  const [surfaceHue, setSurfaceHue] = useState<number>(238);
  const [surfaceDepth, setSurfaceDepth] = useState<number>(7.5);
  const [surfaceChroma, setSurfaceChroma] = useState<number>(0.010);
  const [midLightness, setMidLightness] = useState<number>(9.5);
  const [surfaceLightness, setSurfaceLightness] = useState<number>(11);
  const [elevatedLightness, setElevatedLightness] = useState<number>(16);
  const [accentHue, setAccentHue] = useState<number>(238);
  const [accentL, setAccentL] = useState<number>(54);
  const [accentC, setAccentC] = useState<number>(0.16);
  const [textHue, setTextHue] = useState<number>(238);
  const [borderChroma, setBorderChroma] = useState<number>(0.016);

  const [shareLink, setShareLink] = useState<string | null>(null);
  const [sharecopied, setShareCopied] = useState(false);

  const [submitName, setSubmitName] = useState('');
  const [submitAuthor, setSubmitAuthor] = useState('');
  const [submitExpanded, setSubmitExpanded] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'ok' | 'err'>('idle');
  const [activePreviewEditor, setActivePreviewEditor] = useState<PreviewTokenKey | null>(null);
  const [previewHexDraft, setPreviewHexDraft] = useState('');
  const [previewTokenOverrides, setPreviewTokenOverrides] = useState<PreviewTokenOverrides>({});

  const effectivePalette = {
    ...buildCustomPalette(
      surfaceHue,
      surfaceDepth,
      surfaceChroma,
      midLightness,
      surfaceLightness,
      elevatedLightness,
      accentHue,
      accentL,
      accentC,
      textHue,
      borderChroma,
    ),
    ...previewTokenOverrides,
  };

  useEffect(() => {
    queueMicrotask(() => {
      setActiveId(getStoredThemeV2()?.id ?? DEFAULT_PRESET_V2.id);
      setActiveFamilyState(getActiveFamily());
      setActiveModeState(resolveMode(getActiveModePreference()));
      setPersonalThemes(getPersonalThemes());
    });
  }, []);

  useEffect(() => {
    if (tab !== 'custom') return;
    const palette = effectivePalette;
    const payload: ThemePayloadV2 = { id: 'custom', name: 'Custom', category: 'personal', palette, source: 'personal' };
    applyThemeV2(payload);
  }, [tab, effectivePalette]);

  useEffect(() => {
    if (tab !== 'community') return;
    fetch('/api/themes/community')
      .then(r => r.json())
      .then((data: { themes: CommunityThemeRow[] }) => setCommunity(data.themes ?? []))
      .catch(() => setCommunityError(true));
  }, [tab]);

  function selectTheme(theme: XRDBThemeV2, source: ThemePayloadV2['source']) {
    const payload: ThemePayloadV2 = { ...theme, source };
    applyThemeV2(payload);
    saveThemeV2(payload);
    setActiveId(theme.id);
    setShareLink(null);
  }

  function selectFamilyMode(familyId: string, mode: XRDBThemeMode) {
    const palette = resolveActiveTheme(familyId, mode);
    const payload: ThemePayloadV2 = {
      id: mode === 'midnight' ? `midnight-${familyId}` : `${familyId}-${mode}`,
      name: familyId,
      category: 'preset',
      palette,
      source: 'preset',
    };
    applyThemeV2(payload);
    saveThemeV2(payload);
    setActiveFamily(familyId);
    setActiveMode(mode);
    setActiveFamilyState(familyId);
    setActiveModeState(mode);
    setShareLink(null);
  }

  function applyCustom() {
    const palette = effectivePalette;
    const payload: ThemePayloadV2 = { id: 'custom', name: 'Custom', category: 'personal', palette, source: 'personal' };
    applyThemeV2(payload);
    saveThemeV2(payload);
    setActiveId('custom');
  }

  function handleSaveSlot(e: React.FormEvent) {
    e.preventDefault();
    const name = saveSlotName.trim();
    if (!name) return;
    const palette = effectivePalette;
    const theme: XRDBThemeV2 = { id: `personal-${Date.now()}`, name, category: 'personal', palette };
    savePersonalTheme(theme);
    setPersonalThemes(getPersonalThemes());
    setSaveSlotName('');
    setSavingSlot(false);
  }

  function handleDeletePersonal(id: string) {
    deletePersonalTheme(id);
    setPersonalThemes(getPersonalThemes());
    setPendingDeleteId(null);
  }

  function handleCopyShareLink() {
    const palette = effectivePalette;
    const encoded = encodePaletteForUrl(palette);
    const url = `${window.location.origin}/themes?theme=${encoded}`;
    setShareLink(url);
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }).catch(() => {});
  }

  function handleReset() {
    resetThemeV2();
    setPreviewTokenOverrides({});
    setActivePreviewEditor(null);
    setPreviewHexDraft('');
    setActiveId(DEFAULT_PRESET_V2.id);
    setShareLink(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitStatus === 'submitting') return;
    setSubmitStatus('submitting');
    const palette = effectivePalette;
    try {
      const res = await fetch('/api/themes/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: submitName.trim(), author: submitAuthor.trim() || undefined, palette }),
      });
      setSubmitStatus(res.ok ? 'ok' : 'err');
    } catch {
      setSubmitStatus('err');
    }
  }

  function openPreviewEditor(key: PreviewTokenKey) {
    setActivePreviewEditor(current => {
      if (current === key) {
        setPreviewHexDraft('');
        return null;
      }
      setPreviewHexDraft(cssColorToHex(effectivePalette[key]) ?? '#000000');
      return key;
    });
  }

  function applyPreviewHex(key: PreviewTokenKey, hexValue: string) {
    const normalized = normalizeHex(hexValue);
    if (!normalized) return;
    const rgb = cssColorToRgb(normalized);
    if (!rgb) return;
    const converted = rgbToOklch(rgb);
    const override = `oklch(${converted.l.toFixed(1)}% ${converted.c.toFixed(3)} ${Math.round(converted.h)})`;
    setPreviewTokenOverrides(current => ({ ...current, [key]: override }));
    setPreviewHexDraft(normalized);
  }

  return (
    <div className="xrdb-themes-page">
      <div className="xrdb-themes-page-header">
        <h1 className="xrdb-themes-page-title">Themes</h1>
      </div>

      <div className="xrdb-themes-tabs" role="tablist" aria-label="Theme sections">
        {(['presets', 'community', 'mine', 'custom'] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`xrdb-theme-tab${tab === t ? ' xrdb-theme-tab-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="xrdb-themes-content">

        {tab === 'presets' && (
          <div className="xrdb-themes-preset-groups">
            <div className="xrdb-themes-group">
              <span className="xrdb-themes-group-label">Themes</span>
              <div className="xrdb-theme-family-grid">
                {THEME_FAMILIES.filter(f => !f.service).map(family => (
                  <ThemeFamilyCard
                    key={family.id}
                    family={family}
                    activeFamily={activeFamily}
                    activeMode={activeMode}
                    onSelect={selectFamilyMode}
                  />
                ))}
              </div>
            </div>
            <div className="xrdb-themes-group">
              <span className="xrdb-themes-group-label">Services</span>
              <div className="xrdb-theme-family-grid">
                {THEME_FAMILIES.filter(f => f.service).map(family => (
                  <ThemeFamilyCard
                    key={family.id}
                    family={family}
                    activeFamily={activeFamily}
                    activeMode={activeMode}
                    onSelect={selectFamilyMode}
                  />
                ))}
              </div>
            </div>
            <div className="xrdb-themes-footer-row">
              <button type="button" className="xrdb-theme-reset-btn" onClick={handleReset}>
                Reset to default
              </button>
            </div>
          </div>
        )}

        {tab === 'community' && (
          <div className="xrdb-themes-community">
            {communityError && <p className="xrdb-theme-notice">Could not load community themes.</p>}
            {!communityError && community.length === 0 && (
              <p className="xrdb-theme-notice">No community themes yet.</p>
            )}
            {community.length > 0 && (
              <div className="xrdb-themes-swatch-grid">
                {community.map(t => (
                  <ThemeSwatch
                    key={t.id}
                    palette={t.palette}
                    label={t.name}
                    isActive={activeId === t.id}
                    onClick={() => selectTheme(t, 'community')}
                  />
                ))}
              </div>
            )}
            <div className="xrdb-theme-submit">
              <button
                type="button"
                className="xrdb-theme-reset-btn"
                onClick={() => setSubmitExpanded(v => !v)}
              >
                {submitExpanded ? 'Cancel submission' : 'Submit to community'}
              </button>
              {submitExpanded && (
                submitStatus === 'ok' ? (
                  <p className="xrdb-theme-notice xrdb-theme-notice-ok">Theme submitted for review.</p>
                ) : (
                  <form className="xrdb-theme-submit-form" onSubmit={handleSubmit}>
                    <input
                      className="xrdb-theme-input"
                      type="text"
                      placeholder="Theme name"
                      maxLength={60}
                      required
                      value={submitName}
                      onChange={e => setSubmitName(e.target.value)}
                      aria-label="Theme name"
                    />
                    <input
                      className="xrdb-theme-input"
                      type="text"
                      placeholder="Your name (optional)"
                      maxLength={60}
                      value={submitAuthor}
                      onChange={e => setSubmitAuthor(e.target.value)}
                      aria-label="Author name"
                    />
                    {submitStatus === 'err' && (
                      <p className="xrdb-theme-notice xrdb-theme-notice-err">Submission failed. Try again.</p>
                    )}
                    <button
                      type="submit"
                      className="xrdb-theme-submit-btn"
                      disabled={submitStatus === 'submitting' || !submitName.trim()}
                    >
                      {submitStatus === 'submitting' ? 'Submitting…' : 'Submit'}
                    </button>
                  </form>
                )
              )}
            </div>
          </div>
        )}

        {tab === 'mine' && (
          <div className="xrdb-themes-mine">
            {personalThemes.length === 0 ? (
              <p className="xrdb-theme-notice">
                No saved themes yet. Build one on the Custom tab and save it here.
              </p>
            ) : (
              <div className="xrdb-themes-swatch-grid">
                {personalThemes.map(t => (
                  <div key={t.id} className="xrdb-themes-mine-card">
                    <ThemeSwatch
                      palette={t.palette}
                      label={t.name}
                      isActive={activeId === t.id}
                      onClick={() => selectTheme(t, 'personal')}
                    />
                    {pendingDeleteId === t.id ? (
                      <div className="xrdb-themes-mine-delete-confirm" role="group" aria-label={`Confirm deletion for ${t.name}`}>
                        <button
                          type="button"
                          className="xrdb-themes-mine-delete xrdb-themes-mine-delete-danger"
                          onClick={() => handleDeletePersonal(t.id)}
                          aria-label={`Confirm delete ${t.name}`}
                        >
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          className="xrdb-themes-mine-delete xrdb-themes-mine-delete-cancel"
                          onClick={() => setPendingDeleteId(null)}
                          aria-label={`Cancel delete ${t.name}`}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="xrdb-themes-mine-delete"
                        onClick={() => setPendingDeleteId(t.id)}
                        aria-label={`Delete ${t.name}`}
                      >
                        Delete theme
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'custom' && (
          <div className="xrdb-themes-custom-layout">
            <div className="xrdb-themes-sliders-panel">
              <div className="xrdb-theme-custom-nav" role="tablist" aria-label="Custom theme controls">
                {CUSTOM_SECTION_LABELS.map(section => (
                  <button
                    key={section.value}
                    type="button"
                    role="tab"
                    aria-selected={customSection === section.value}
                    className={`xrdb-theme-custom-tab${customSection === section.value ? ' xrdb-theme-custom-tab-active' : ''}`}
                    onClick={() => setCustomSection(section.value)}
                  >
                    {section.label}
                  </button>
                ))}
              </div>

              {customSection === 'surfaces' && (
              <div className="xrdb-theme-custom-section">
                <span className="xrdb-theme-section-label">Surfaces</span>
                <p className="xrdb-theme-section-help">Set the base shell color and how much contrast each layer gets.</p>
                <label className="xrdb-theme-slider-row">
                  <span className="xrdb-theme-slider-label">
                    Surface color <span className="xrdb-theme-slider-val">{Math.round(surfaceHue)}</span>
                  </span>
                  <input
                    type="range" min="0" max="359" step="1"
                    value={surfaceHue}
                    onChange={e => setSurfaceHue(Number(e.target.value))}
                    className="xrdb-theme-slider"
                    aria-label="Surface hue"
                  />
                  <SliderLegend
                    gradient="linear-gradient(90deg, oklch(14% 0.03 0), oklch(14% 0.03 60), oklch(14% 0.03 120), oklch(14% 0.03 180), oklch(14% 0.03 240), oklch(14% 0.03 300), oklch(14% 0.03 359))"
                    low="Warm"
                    mid="Cool"
                    high="Warm"
                  />
                </label>
                <label className="xrdb-theme-slider-row">
                  <span className="xrdb-theme-slider-label">
                    Depth <span className="xrdb-theme-slider-val">{surfaceDepth.toFixed(1)}%</span>
                  </span>
                  <input
                    type="range" min="0" max="20" step="0.5"
                    value={surfaceDepth}
                    onChange={e => setSurfaceDepth(Number(e.target.value))}
                    className="xrdb-theme-slider"
                    aria-label="Surface depth"
                  />
                  <SliderLegend
                    gradient={`linear-gradient(90deg, oklch(20% ${Math.max(surfaceChroma, 0.01).toFixed(3)} ${Math.round(surfaceHue)}), oklch(11% ${Math.max(surfaceChroma, 0.01).toFixed(3)} ${Math.round(surfaceHue)}), oklch(4% ${Math.max(surfaceChroma, 0.01).toFixed(3)} ${Math.round(surfaceHue)}))`}
                    low="Lifted"
                    mid="Balanced"
                    high="Deep"
                  />
                </label>
                <label className="xrdb-theme-slider-row">
                  <span className="xrdb-theme-slider-label">
                    Color strength <span className="xrdb-theme-slider-val">{surfaceChroma.toFixed(3)}</span>
                  </span>
                  <input
                    type="range" min="0" max="0.035" step="0.001"
                    value={surfaceChroma}
                    onChange={e => setSurfaceChroma(Number(e.target.value))}
                    className="xrdb-theme-slider"
                    aria-label="Surface chroma"
                  />
                  <SliderLegend
                    gradient={`linear-gradient(90deg, oklch(${surfaceDepth.toFixed(1)}% 0 ${Math.round(surfaceHue)}), oklch(${surfaceDepth.toFixed(1)}% 0.017 ${Math.round(surfaceHue)}), oklch(${surfaceDepth.toFixed(1)}% 0.035 ${Math.round(surfaceHue)}))`}
                    low="Neutral"
                    mid="Tinted"
                    high="Saturated"
                  />
                </label>
                <label className="xrdb-theme-slider-row">
                  <span className="xrdb-theme-slider-label">
                    Mid layer <span className="xrdb-theme-slider-val">{midLightness.toFixed(1)}%</span>
                  </span>
                  <input
                    type="range" min="5" max="20" step="0.5"
                    value={midLightness}
                    onChange={e => setMidLightness(Number(e.target.value))}
                    className="xrdb-theme-slider"
                    aria-label="Mid background lightness"
                  />
                  <SliderLegend
                    gradient={`linear-gradient(90deg, oklch(5% ${(surfaceChroma + 0.002).toFixed(3)} ${Math.round(surfaceHue)}), oklch(12% ${(surfaceChroma + 0.002).toFixed(3)} ${Math.round(surfaceHue)}), oklch(20% ${(surfaceChroma + 0.002).toFixed(3)} ${Math.round(surfaceHue)}))`}
                    low="Dark"
                    mid="Balanced"
                    high="Light"
                  />
                </label>
                <label className="xrdb-theme-slider-row">
                  <span className="xrdb-theme-slider-label">
                    Surface layer <span className="xrdb-theme-slider-val">{surfaceLightness.toFixed(1)}%</span>
                  </span>
                  <input
                    type="range" min="6" max="24" step="0.5"
                    value={surfaceLightness}
                    onChange={e => setSurfaceLightness(Number(e.target.value))}
                    className="xrdb-theme-slider"
                    aria-label="Surface lightness"
                  />
                  <SliderLegend
                    gradient={`linear-gradient(90deg, oklch(6% ${(surfaceChroma + 0.004).toFixed(3)} ${Math.round(surfaceHue)}), oklch(15% ${(surfaceChroma + 0.004).toFixed(3)} ${Math.round(surfaceHue)}), oklch(24% ${(surfaceChroma + 0.004).toFixed(3)} ${Math.round(surfaceHue)}))`}
                    low="Dark"
                    mid="Balanced"
                    high="Light"
                  />
                </label>
                <label className="xrdb-theme-slider-row">
                  <span className="xrdb-theme-slider-label">
                    Raised layer <span className="xrdb-theme-slider-val">{elevatedLightness.toFixed(1)}%</span>
                  </span>
                  <input
                    type="range" min="8" max="32" step="0.5"
                    value={elevatedLightness}
                    onChange={e => setElevatedLightness(Number(e.target.value))}
                    className="xrdb-theme-slider"
                    aria-label="Elevated lightness"
                  />
                  <SliderLegend
                    gradient={`linear-gradient(90deg, oklch(8% ${(surfaceChroma + 0.008).toFixed(3)} ${Math.round(surfaceHue)}), oklch(20% ${(surfaceChroma + 0.008).toFixed(3)} ${Math.round(surfaceHue)}), oklch(32% ${(surfaceChroma + 0.008).toFixed(3)} ${Math.round(surfaceHue)}))`}
                    low="Subtle"
                    mid="Balanced"
                    high="Punchy"
                  />
                </label>
              </div>
              )}

              {customSection === 'accent' && (
              <div className="xrdb-theme-custom-section">
                <span className="xrdb-theme-section-label">Accent</span>
                <p className="xrdb-theme-section-help">Tune the main action color, its brightness, and how vivid it feels.</p>
                <label className="xrdb-theme-slider-row">
                  <span className="xrdb-theme-slider-label">
                    Accent color <span className="xrdb-theme-slider-val">{Math.round(accentHue)}</span>
                  </span>
                  <input
                    type="range" min="0" max="359" step="1"
                    value={accentHue}
                    onChange={e => setAccentHue(Number(e.target.value))}
                    className="xrdb-theme-slider"
                    aria-label="Accent hue"
                  />
                  <SliderLegend
                    gradient={`linear-gradient(90deg, oklch(${Math.round(accentL)}% ${Math.max(accentC, 0.12).toFixed(3)} 0), oklch(${Math.round(accentL)}% ${Math.max(accentC, 0.12).toFixed(3)} 60), oklch(${Math.round(accentL)}% ${Math.max(accentC, 0.12).toFixed(3)} 120), oklch(${Math.round(accentL)}% ${Math.max(accentC, 0.12).toFixed(3)} 180), oklch(${Math.round(accentL)}% ${Math.max(accentC, 0.12).toFixed(3)} 240), oklch(${Math.round(accentL)}% ${Math.max(accentC, 0.12).toFixed(3)} 300), oklch(${Math.round(accentL)}% ${Math.max(accentC, 0.12).toFixed(3)} 359))`}
                    low="Warm"
                    mid="Cool"
                    high="Warm"
                  />
                </label>
                <label className="xrdb-theme-slider-row">
                  <span className="xrdb-theme-slider-label">
                    Brightness <span className="xrdb-theme-slider-val">{Math.round(accentL)}%</span>
                  </span>
                  <input
                    type="range" min="30" max="85" step="1"
                    value={accentL}
                    onChange={e => setAccentL(Number(e.target.value))}
                    className="xrdb-theme-slider"
                    aria-label="Accent lightness"
                  />
                  <SliderLegend
                    gradient={`linear-gradient(90deg, oklch(30% ${accentC.toFixed(3)} ${Math.round(accentHue)}), oklch(58% ${accentC.toFixed(3)} ${Math.round(accentHue)}), oklch(85% ${accentC.toFixed(3)} ${Math.round(accentHue)}))`}
                    low="Dark"
                    mid="Balanced"
                    high="Bright"
                  />
                </label>
                <label className="xrdb-theme-slider-row">
                  <span className="xrdb-theme-slider-label">
                    Strength <span className="xrdb-theme-slider-val">{accentC.toFixed(3)}</span>
                  </span>
                  <input
                    type="range" min="0" max="0.37" step="0.005"
                    value={accentC}
                    onChange={e => setAccentC(Number(e.target.value))}
                    className="xrdb-theme-slider"
                    aria-label="Accent chroma"
                  />
                  <SliderLegend
                    gradient={`linear-gradient(90deg, oklch(${Math.round(accentL)}% 0 ${Math.round(accentHue)}), oklch(${Math.round(accentL)}% 0.185 ${Math.round(accentHue)}), oklch(${Math.round(accentL)}% 0.37 ${Math.round(accentHue)}))`}
                    low="Muted"
                    mid="Strong"
                    high="Vivid"
                  />
                </label>
              </div>
              )}

              {customSection === 'detail' && (
              <div className="xrdb-theme-custom-section">
                <span className="xrdb-theme-section-label">Text and borders</span>
                <p className="xrdb-theme-section-help">Refine the ink tint and the edge contrast that holds the interface together.</p>
                <label className="xrdb-theme-slider-row">
                  <span className="xrdb-theme-slider-label">
                    Text tint <span className="xrdb-theme-slider-val">{Math.round(textHue)}</span>
                  </span>
                  <input
                    type="range" min="0" max="359" step="1"
                    value={textHue}
                    onChange={e => setTextHue(Number(e.target.value))}
                    className="xrdb-theme-slider"
                    aria-label="Text hue"
                  />
                  <SliderLegend
                    gradient="linear-gradient(90deg, oklch(72% 0.025 0), oklch(72% 0.025 60), oklch(72% 0.025 120), oklch(72% 0.025 180), oklch(72% 0.025 240), oklch(72% 0.025 300), oklch(72% 0.025 359))"
                    low="Warm"
                    mid="Cool"
                    high="Warm"
                  />
                </label>
                <label className="xrdb-theme-slider-row">
                  <span className="xrdb-theme-slider-label">
                    Border strength <span className="xrdb-theme-slider-val">{borderChroma.toFixed(3)}</span>
                  </span>
                  <input
                    type="range" min="0.004" max="0.050" step="0.001"
                    value={borderChroma}
                    onChange={e => setBorderChroma(Number(e.target.value))}
                    className="xrdb-theme-slider"
                    aria-label="Border chroma"
                  />
                  <SliderLegend
                    gradient={`linear-gradient(90deg, oklch(22% 0.004 ${Math.round(textHue)}), oklch(22% 0.027 ${Math.round(textHue)}), oklch(22% 0.050 ${Math.round(textHue)}))`}
                    low="Soft"
                    mid="Balanced"
                    high="Strong"
                  />
                </label>
              </div>
              )}

              <div className="xrdb-theme-custom-actions xrdb-theme-custom-action-row">
                <button type="button" className="xrdb-theme-apply-btn" onClick={applyCustom}>
                  Apply theme
                </button>
                <button
                  type="button"
                  className="xrdb-theme-save-slot-btn"
                  onClick={() => setSavingSlot(v => !v)}
                >
                  Save to My themes
                </button>
                <button type="button" className="xrdb-theme-share-btn" onClick={handleCopyShareLink}>
                  {sharecopied ? 'Copied!' : 'Copy share link'}
                </button>
                <button type="button" className="xrdb-theme-reset-btn" onClick={handleReset}>
                  Reset to default
                </button>
              </div>

              {savingSlot && (
                <form className="xrdb-theme-save-slot-form" onSubmit={handleSaveSlot}>
                  <input
                    className="xrdb-theme-input"
                    type="text"
                    placeholder="Slot name"
                    maxLength={60}
                    required
                    value={saveSlotName}
                    onChange={e => setSaveSlotName(e.target.value)}
                    aria-label="Slot name"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="xrdb-theme-submit-btn"
                    disabled={!saveSlotName.trim()}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="xrdb-theme-reset-btn"
                    onClick={() => setSavingSlot(false)}
                  >
                    Cancel
                  </button>
                </form>
              )}

              {shareLink && (
                <div className="xrdb-theme-share-url">
                  <input
                    className="xrdb-theme-input"
                    readOnly
                    value={shareLink}
                    onClick={e => (e.target as HTMLInputElement).select()}
                    aria-label="Share URL"
                  />
                </div>
              )}
            </div>

            <div className="xrdb-themes-preview-panel" aria-label="Live theme preview">
              <span className="xrdb-themes-preview-heading">Preview</span>
              <div className="xrdb-themes-preview-swatches">
                {PREVIEW_TOKENS.map(({ key, label }) => (
                  <div key={key} className="xrdb-themes-preview-row">
                    <button
                      type="button"
                      className={`xrdb-themes-preview-block xrdb-themes-preview-block-btn${activePreviewEditor === key ? ' xrdb-themes-preview-block-active' : ''}`}
                      style={{ background: effectivePalette[key as PreviewTokenKey] }}
                      onClick={() => openPreviewEditor(key as PreviewTokenKey)}
                      aria-label={`Edit ${label} color`}
                    />
                    <span className="xrdb-themes-preview-name">{label}</span>
                    <span className="xrdb-themes-preview-value">{effectivePalette[key as PreviewTokenKey]}</span>
                    {activePreviewEditor === key && (
                      <div className="xrdb-themes-preview-editor" role="group" aria-label={`${label} color editor`}>
                        <input
                          type="color"
                          value={normalizeHex(previewHexDraft) || cssColorToHex(effectivePalette[key as PreviewTokenKey]) || '#000000'}
                          onChange={event => {
                            setPreviewHexDraft(event.target.value);
                            applyPreviewHex(key as PreviewTokenKey, event.target.value);
                          }}
                          className="xrdb-themes-preview-color-input"
                          aria-label={`${label} color wheel`}
                        />
                        <input
                          type="text"
                          value={previewHexDraft}
                          onChange={event => setPreviewHexDraft(event.target.value)}
                          onBlur={() => applyPreviewHex(key as PreviewTokenKey, previewHexDraft)}
                          onKeyDown={event => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              applyPreviewHex(key as PreviewTokenKey, previewHexDraft);
                            }
                          }}
                          className="xrdb-theme-input xrdb-themes-preview-hex-input"
                          aria-label={`${label} hex value`}
                          placeholder="#000000"
                          spellCheck={false}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
