'use client';

import { useEffect, useState } from 'react';

import {
  applyThemeV2,
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
  const [activeId, setActiveId] = useState<string>(
    () => getStoredThemeV2()?.id ?? DEFAULT_PRESET_V2.id,
  );
  const [activeFamily, setActiveFamilyState] = useState<string>(() => getActiveFamily());
  const [activeMode, setActiveModeState] = useState<XRDBThemeMode>(() => resolveMode(getActiveModePreference()));

  const [community, setCommunity] = useState<CommunityThemeRow[]>([]);
  const [communityError, setCommunityError] = useState(false);

  const [personalThemes, setPersonalThemes] = useState<XRDBThemeV2[]>(() => getPersonalThemes());
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

  useEffect(() => {
    if (tab !== 'custom') return;
    const palette = buildCustomPalette(
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
    );
    const payload: ThemePayloadV2 = { id: 'custom', name: 'Custom', category: 'personal', palette, source: 'personal' };
    applyThemeV2(payload);
  }, [tab, surfaceHue, surfaceDepth, surfaceChroma, midLightness, surfaceLightness, elevatedLightness, accentHue, accentL, accentC, textHue, borderChroma]);

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
    const palette = buildCustomPalette(
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
    );
    const payload: ThemePayloadV2 = { id: 'custom', name: 'Custom', category: 'personal', palette, source: 'personal' };
    applyThemeV2(payload);
    saveThemeV2(payload);
    setActiveId('custom');
  }

  function handleSaveSlot(e: React.FormEvent) {
    e.preventDefault();
    const name = saveSlotName.trim();
    if (!name) return;
    const palette = buildCustomPalette(
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
    );
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
    const palette = buildCustomPalette(
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
    );
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
    setActiveId(DEFAULT_PRESET_V2.id);
    setShareLink(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitStatus === 'submitting') return;
    setSubmitStatus('submitting');
    const palette = buildCustomPalette(
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
    );
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

  const customPalette = buildCustomPalette(
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
  );

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
                    <span
                      className="xrdb-themes-preview-block"
                      style={{ background: customPalette[key] }}
                      aria-hidden="true"
                    />
                    <span className="xrdb-themes-preview-name">{label}</span>
                    <span className="xrdb-themes-preview-value">{customPalette[key]}</span>
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
