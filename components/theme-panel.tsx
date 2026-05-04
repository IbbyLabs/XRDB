'use client';

import { useEffect, useRef, useState } from 'react';

import {
  applyThemeV2,
  DEFAULT_PRESET_V2,
  deletePersonalTheme,
  encodePaletteForUrl,
  getPersonalThemes,
  getStoredThemeV2,
  PRESETS_V2,
  resetThemeV2,
  savePersonalTheme,
  saveThemeV2,
  type XRDBPalette,
  type XRDBThemeV2,
  type ThemePayloadV2,
} from '@/lib/theme';
import { ThemeSwatch } from '@/components/theme-swatch';

type CommunityThemeRow = XRDBThemeV2 & { author?: string };

type Tab = 'presets' | 'community' | 'mine' | 'custom';

function buildCustomPalette(
  surfaceHue: number,
  surfaceDepth: number,
  accentHue: number,
  accentL: number,
  accentC: number,
  textHue: number,
): XRDBPalette {
  return {
    bgBase:     `oklch(${surfaceDepth.toFixed(1)}% 0.010 ${Math.round(surfaceHue)})`,
    bgMid:      `oklch(9.5% 0.012 ${Math.round(surfaceHue)})`,
    bgSurface:  `oklch(11% 0.014 ${Math.round(surfaceHue)})`,
    bgElevated: `oklch(16% 0.018 ${Math.round(surfaceHue)})`,
    accent:     `oklch(${Math.round(accentL)}% ${accentC.toFixed(3)} ${Math.round(accentHue)})`,
    accentDim:  `oklch(19% 0.09 ${Math.round(accentHue)})`,
    accentText: `oklch(76% 0.10 ${Math.round(accentHue)})`,
    ink:        `oklch(93% 0.007 ${Math.round(textHue)})`,
    muted:      `oklch(51% 0.014 ${Math.round(textHue)})`,
    border:     `oklch(22% 0.016 ${Math.round(textHue)})`,
    scrim:      `oklch(4% 0.008 ${Math.round(textHue)} / 0.86)`,
  };
}

const PRESET_GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Dark', ids: ['slate', 'obsidian', 'iron', 'ember', 'verdant', 'crimson', 'copper', 'dusk'] },
  { label: 'Special', ids: ['midnight', 'midnight-crimson', 'midnight-emerald', 'midnight-gold', 'hoth'] },
  { label: 'Service', ids: ['stremio', 'torbox'] },
];

export function ThemePanel({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>('presets');
  const [activeId, setActiveId] = useState<string>(() => getStoredThemeV2()?.id ?? DEFAULT_PRESET_V2.id);

  const [community, setCommunity] = useState<CommunityThemeRow[]>([]);
  const [communityError, setCommunityError] = useState(false);

  const [personalThemes, setPersonalThemes] = useState<XRDBThemeV2[]>(() => getPersonalThemes());
  const [saveSlotName, setSaveSlotName] = useState('');
  const [savingSlot, setSavingSlot] = useState(false);

  const [surfaceHue, setSurfaceHue] = useState<number>(238);
  const [surfaceDepth, setSurfaceDepth] = useState<number>(7.5);
  const [accentHue, setAccentHue] = useState<number>(238);
  const [accentL, setAccentL] = useState<number>(54);
  const [accentC, setAccentC] = useState<number>(0.16);
  const [textHue, setTextHue] = useState<number>(238);

  const [shareLink, setShareLink] = useState<string | null>(null);
  const [sharecopied, setShareCopied] = useState(false);

  const [submitName, setSubmitName] = useState('');
  const [submitAuthor, setSubmitAuthor] = useState('');
  const [submitExpanded, setSubmitExpanded] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'ok' | 'err'>('idle');

  useEffect(() => {
    if (tab !== 'custom') return;
    const palette = buildCustomPalette(surfaceHue, surfaceDepth, accentHue, accentL, accentC, textHue);
    const payload: ThemePayloadV2 = { id: 'custom', name: 'Custom', category: 'personal', palette, source: 'personal' };
    applyThemeV2(payload);
  }, [tab, surfaceHue, surfaceDepth, accentHue, accentL, accentC, textHue]);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function handlePointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [onClose]);

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

  function applyCustom() {
    const palette = buildCustomPalette(surfaceHue, surfaceDepth, accentHue, accentL, accentC, textHue);
    const payload: ThemePayloadV2 = { id: 'custom', name: 'Custom', category: 'personal', palette, source: 'personal' };
    applyThemeV2(payload);
    saveThemeV2(payload);
    setActiveId('custom');
  }

  function handleSaveSlot(e: React.FormEvent) {
    e.preventDefault();
    const name = saveSlotName.trim();
    if (!name) return;
    const palette = buildCustomPalette(surfaceHue, surfaceDepth, accentHue, accentL, accentC, textHue);
    const theme: XRDBThemeV2 = { id: `personal-${Date.now()}`, name, category: 'personal', palette };
    savePersonalTheme(theme);
    setPersonalThemes(getPersonalThemes());
    setSaveSlotName('');
    setSavingSlot(false);
  }

  function handleDeletePersonal(id: string) {
    deletePersonalTheme(id);
    setPersonalThemes(getPersonalThemes());
  }

  function handleCopyShareLink() {
    const palette = buildCustomPalette(surfaceHue, surfaceDepth, accentHue, accentL, accentC, textHue);
    const encoded = encodePaletteForUrl(palette);
    const url = `${window.location.origin}${window.location.pathname}?theme=${encoded}`;
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
    const palette = buildCustomPalette(surfaceHue, surfaceDepth, accentHue, accentL, accentC, textHue);
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

  const tabLabels: Record<Tab, string> = { presets: 'Presets', community: 'Community', mine: 'Mine', custom: 'Custom' };

  return (
    <div className="xrdb-theme-panel" ref={panelRef} role="dialog" aria-label="Theme settings" aria-modal="true">
      <div className="xrdb-theme-panel-header">
        <span className="xrdb-theme-panel-title">Theme</span>
        <button type="button" className="xrdb-theme-panel-close" onClick={onClose} aria-label="Close theme panel">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="xrdb-theme-panel-tabs" role="tablist" aria-label="Theme sections">
        {(['presets', 'community', 'mine', 'custom'] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`xrdb-theme-tab${tab === t ? ' xrdb-theme-tab-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {tabLabels[t]}
          </button>
        ))}
      </div>

      <div className="xrdb-theme-panel-body">

        {tab === 'presets' && (
          <div className="xrdb-theme-preset-groups">
            {PRESET_GROUPS.map(group => {
              const items = PRESETS_V2.filter(p => group.ids.includes(p.id));
              if (!items.length) return null;
              return (
                <div key={group.label} className="xrdb-theme-preset-group">
                  <span className="xrdb-theme-group-label">{group.label}</span>
                  <div className="xrdb-theme-swatch-grid">
                    {items.map(p => (
                      <ThemeSwatch key={p.id} palette={p.palette} label={p.name} isActive={activeId === p.id} onClick={() => selectTheme(p, 'preset')} />
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="xrdb-theme-custom-actions">
              <button type="button" className="xrdb-theme-reset-btn" onClick={handleReset}>
                Reset to default
              </button>
            </div>
          </div>
        )}

        {tab === 'community' && (
          <>
            {communityError && <p className="xrdb-theme-notice">Could not load community themes.</p>}
            {!communityError && community.length === 0 && <p className="xrdb-theme-notice">No community themes yet.</p>}
            {community.length > 0 && (
              <div className="xrdb-theme-swatch-grid">
                {community.map(t => (
                  <ThemeSwatch key={t.id} palette={t.palette} label={t.name} isActive={activeId === t.id} onClick={() => selectTheme(t, 'community')} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'mine' && (
          <div className="xrdb-theme-mine">
            {personalThemes.length === 0 ? (
              <p className="xrdb-theme-notice">No saved themes yet. Customize a theme on the Custom tab and save it here.</p>
            ) : (
              <div className="xrdb-theme-personal-list">
                {personalThemes.map(t => (
                  <div key={t.id} className="xrdb-theme-personal-row">
                    <span
                      className="xrdb-theme-swatch-preview xrdb-theme-personal-swatch"
                      style={{ background: t.palette.bgBase }}
                      aria-hidden="true"
                    >
                      <span className="xrdb-theme-swatch-dot" style={{ background: t.palette.accent }} />
                    </span>
                    <span className="xrdb-theme-personal-name">{t.name}</span>
                    <button
                      type="button"
                      className="xrdb-theme-personal-apply"
                      onClick={() => selectTheme(t, 'personal')}
                      aria-label={`Apply ${t.name}`}
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      className="xrdb-theme-personal-delete"
                      onClick={() => handleDeletePersonal(t.id)}
                      aria-label={`Delete ${t.name}`}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'custom' && (
          <div className="xrdb-theme-custom">
            <div className="xrdb-theme-custom-section">
              <span className="xrdb-theme-section-label">Surfaces</span>
              <label className="xrdb-theme-slider-row">
                <span className="xrdb-theme-slider-label">Surface hue <span className="xrdb-theme-slider-val">{Math.round(surfaceHue)}</span></span>
                <input type="range" min="0" max="359" step="1" value={surfaceHue} onChange={e => setSurfaceHue(Number(e.target.value))} className="xrdb-theme-slider" aria-label="Surface hue" />
              </label>
              <label className="xrdb-theme-slider-row">
                <span className="xrdb-theme-slider-label">Depth <span className="xrdb-theme-slider-val">{surfaceDepth.toFixed(1)}%</span></span>
                <input type="range" min="0" max="20" step="0.5" value={surfaceDepth} onChange={e => setSurfaceDepth(Number(e.target.value))} className="xrdb-theme-slider" aria-label="Surface depth" />
              </label>
            </div>

            <div className="xrdb-theme-custom-section">
              <span className="xrdb-theme-section-label">Accent</span>
              <label className="xrdb-theme-slider-row">
                <span className="xrdb-theme-slider-label">Accent hue <span className="xrdb-theme-slider-val">{Math.round(accentHue)}</span></span>
                <input type="range" min="0" max="359" step="1" value={accentHue} onChange={e => setAccentHue(Number(e.target.value))} className="xrdb-theme-slider" aria-label="Accent hue" />
              </label>
              <label className="xrdb-theme-slider-row">
                <span className="xrdb-theme-slider-label">Lightness <span className="xrdb-theme-slider-val">{Math.round(accentL)}%</span></span>
                <input type="range" min="30" max="85" step="1" value={accentL} onChange={e => setAccentL(Number(e.target.value))} className="xrdb-theme-slider" aria-label="Accent lightness" />
              </label>
              <label className="xrdb-theme-slider-row">
                <span className="xrdb-theme-slider-label">Chroma <span className="xrdb-theme-slider-val">{accentC.toFixed(3)}</span></span>
                <input type="range" min="0" max="0.37" step="0.005" value={accentC} onChange={e => setAccentC(Number(e.target.value))} className="xrdb-theme-slider" aria-label="Accent chroma" />
              </label>
            </div>

            <div className="xrdb-theme-custom-section">
              <span className="xrdb-theme-section-label">Text and borders</span>
              <label className="xrdb-theme-slider-row">
                <span className="xrdb-theme-slider-label">Text hue <span className="xrdb-theme-slider-val">{Math.round(textHue)}</span></span>
                <input type="range" min="0" max="359" step="1" value={textHue} onChange={e => setTextHue(Number(e.target.value))} className="xrdb-theme-slider" aria-label="Text hue" />
              </label>
            </div>

            <div className="xrdb-theme-custom-actions xrdb-theme-custom-action-row">
              <button type="button" className="xrdb-theme-apply-btn" onClick={applyCustom}>
                Apply theme
              </button>
              <button type="button" className="xrdb-theme-save-slot-btn" onClick={() => setSavingSlot(v => !v)}>
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
                <button type="submit" className="xrdb-theme-submit-btn" disabled={!saveSlotName.trim()}>Save</button>
                <button type="button" className="xrdb-theme-reset-btn" onClick={() => setSavingSlot(false)}>Cancel</button>
              </form>
            )}

            {shareLink && (
              <div className="xrdb-theme-share-url">
                <input className="xrdb-theme-input" readOnly value={shareLink} onClick={e => (e.target as HTMLInputElement).select()} aria-label="Share URL" />
              </div>
            )}

            <div className="xrdb-theme-submit">
              <button type="button" className="xrdb-theme-reset-btn" onClick={() => setSubmitExpanded(v => !v)}>
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
                    <button type="submit" className="xrdb-theme-submit-btn" disabled={submitStatus === 'submitting' || !submitName.trim()}>
                      {submitStatus === 'submitting' ? 'Submitting…' : 'Submit'}
                    </button>
                  </form>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
