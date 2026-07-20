'use client';

import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { fetchTemplates, type Template } from '@/lib/api';
import type { ConfigState, UpdateConfigFn } from './configurator-types';
import {
  LAYOUT_OPTIONS, RATING_OPTIONS, BADGE_STYLE_OPTIONS, BADGE_THEME_OPTIONS,
  RING_POS_OPTIONS, SIX_POS_OPTIONS, QUALITY_STYLE_OPTIONS,
} from './configurator-types';

// ── Template strip ────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  minimal:   'Minimal',
  detailed:  'Detailed',
  cinema:    'Cinema',
  streaming: 'Streaming',
};

export function TemplateStrip({
  appliedId, onApply,
}: { appliedId: string | null; onApply: (t: Template) => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  useEffect(() => {
    fetchTemplates()
      .then(setTemplates)
      .catch((e: unknown) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  // Templates are a shortcut, never a blocker — degrade silently to the
  // manual controls when the endpoint is unreachable.
  if (error) return null;

  return (
    <section aria-label="Templates" style={{ marginBottom: 'var(--sp-4)' }}>
      <span className="label">Start from a template</span>
      <div className="tpl-strip">
        {loading
          ? [0, 1, 2, 3].map(i => <div key={i} className="skeleton tpl-skeleton" />)
          : templates.map(t => {
              const applied = appliedId === t.id;
              return (
                <button
                  key={t.id}
                  className={`tpl-card${applied ? ' tpl-card--applied' : ''}`}
                  onClick={() => onApply(t)}
                  aria-pressed={applied}
                  aria-label={`Apply template: ${t.name}`}
                >
                  <span className="tpl-cat">{CATEGORY_LABELS[t.category] ?? t.category}</span>
                  <span className="tpl-name">
                    {applied && <Check size={13} aria-hidden />}
                    {t.name}
                  </span>
                  <span className="tpl-desc">{t.description}</span>
                </button>
              );
            })}
      </div>
    </section>
  );
}

// ── Ratings panel ─────────────────────────────────────────────────────────────

interface RatingsPanelProps {
  uid: string;
  config: ConfigState;
  onUpdate: UpdateConfigFn;
  onToggleRating: (r: string) => void;
}

export function RatingsPanel({ uid, config, onUpdate, onToggleRating }: RatingsPanelProps) {
  // Track source logos that fail to load so we fall back to the accent dot.
  const [logoFailed, setLogoFailed] = useState<Record<string, boolean>>({});
  return (
    <div className="panel">
      <div className="panel-body cfg-fields">
        <div className="field">
          <span className="label" id={`${uid}-layout-label`}>Position</span>
          <div className="opt-grid" role="group" aria-labelledby={`${uid}-layout-label`}>
            {LAYOUT_OPTIONS.map(o => (
              <button
                key={o.id}
                className={`opt-btn${config.ratingsLayout === o.id ? ' opt-btn--active' : ''}`}
                onClick={() => onUpdate('ratingsLayout', o.id)}
                aria-pressed={config.ratingsLayout === o.id}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {config.ratingsLayout !== 'none' && (
          <>
            <div className="field">
              <span className="label" id={`${uid}-bstyle-label`}>Badge style</span>
              <div className="opt-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }} role="group" aria-labelledby={`${uid}-bstyle-label`}>
                {BADGE_STYLE_OPTIONS.map(o => (
                  <button
                    key={o.id}
                    className={`opt-btn${config.badgeStyle === o.id ? ' opt-btn--active' : ''}`}
                    onClick={() => onUpdate('badgeStyle', o.id)}
                    aria-pressed={config.badgeStyle === o.id}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="label" id={`${uid}-btheme-label`}>Badge theme</span>
              <div className="opt-grid" role="group" aria-labelledby={`${uid}-btheme-label`}>
                {BADGE_THEME_OPTIONS.map(o => (
                  <button
                    key={o.id}
                    className={`opt-btn${config.badgeTheme === o.id ? ' opt-btn--active' : ''}`}
                    onClick={() => onUpdate('badgeTheme', o.id)}
                    aria-pressed={config.badgeTheme === o.id}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {config.ratings.length > 0 && (
          <>
            <div className="field">
              <span className="label" id={`${uid}-ring-label`}>Average ring</span>
              <div className="opt-grid" role="group" aria-labelledby={`${uid}-ring-label`}>
                <button
                  className={`opt-btn${!config.ratingRing ? ' opt-btn--active' : ''}`}
                  onClick={() => onUpdate('ratingRing', false)}
                  aria-pressed={!config.ratingRing}
                >
                  Off
                </button>
                <button
                  className={`opt-btn${config.ratingRing ? ' opt-btn--active' : ''}`}
                  onClick={() => onUpdate('ratingRing', true)}
                  aria-pressed={config.ratingRing}
                >
                  Ring
                </button>
              </div>
            </div>

            {config.ratingRing && (
              <>
                <div className="field">
                  <span className="label" id={`${uid}-ring-pos-label`}>Ring position</span>
                  <div className="opt-grid" role="group" aria-labelledby={`${uid}-ring-pos-label`}>
                    {RING_POS_OPTIONS.map(o => (
                      <button
                        key={o.id}
                        className={`opt-btn${config.ratingRingPos === o.id ? ' opt-btn--active' : ''}`}
                        onClick={() => onUpdate('ratingRingPos', o.id)}
                        aria-pressed={config.ratingRingPos === o.id}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label className="label" htmlFor={`${uid}-ring-color`}>Ring color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                    <input
                      id={`${uid}-ring-color`}
                      type="color"
                      value={config.ratingRingColor || '#27ae60'}
                      onChange={e => onUpdate('ratingRingColor', e.target.value)}
                      style={{ width: 36, height: 28, padding: 2, border: '1px solid var(--border)', borderRadius: 4, background: 'none', cursor: 'pointer' }}
                    />
                    <button
                      className={`opt-btn${!config.ratingRingColor ? ' opt-btn--active' : ''}`}
                      onClick={() => onUpdate('ratingRingColor', '')}
                      aria-pressed={!config.ratingRingColor}
                      style={{ flex: 1 }}
                    >
                      Auto (score-based)
                    </button>
                  </div>
                  <span className="hint" style={{ marginTop: 'var(--sp-1)' }}>
                    Auto uses green / amber / red based on the score. Pick a color to override.
                  </span>
                </div>
              </>
            )}
          </>
        )}

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 'var(--sp-2)' }}>
            Sources
            {config.ratings.length > 0 && (
              <span className="count-pill">{config.ratings.length}</span>
            )}
          </legend>
          {([
            { key: 'general', label: 'General', items: RATING_OPTIONS.filter(r => !r.group) },
            { key: 'anime',   label: 'Anime',   items: RATING_OPTIONS.filter(r => r.group === 'anime') },
          ]).map(group => (
            <div key={group.key} style={{ marginBottom: 'var(--sp-2)' }}>
              <span className="hint" style={{ marginTop: 0, marginBottom: 'var(--sp-1)' }}>{group.label}</span>
              <div className="src-list" role="group" aria-label={`${group.label} rating sources`}>
                {group.items.map(r => {
                  const active = config.ratings.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      className={`src-row${active ? ' src-row--active' : ''}`}
                      onClick={() => onToggleRating(r.id)}
                      aria-pressed={active}
                    >
                      {r.icon && !logoFailed[r.id] ? (
                        <img
                          className="src-logo"
                          src={r.icon}
                          alt=""
                          aria-hidden
                          width={18}
                          height={18}
                          loading="lazy"
                          onError={() => setLogoFailed(prev => ({ ...prev, [r.id]: true }))}
                        />
                      ) : (
                        <span className="src-dot" style={{ background: r.accent }} aria-hidden />
                      )}
                      <span className="src-label">{r.label}</span>
                      <span className="src-check" aria-hidden>
                        {active ? <Check size={12} /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <span className="hint" style={{ marginTop: 0 }}>
            Displayed in the order selected. Only sources that have data for
            the specific title will appear — selecting a source does not
            guarantee it shows up if the provider has no rating for that title.
          </span>
        </fieldset>
      </div>
    </div>
  );
}

// ── Advanced panel (v2 parity fine-grained styling) ───────────────────────────

/** A labelled numeric field. Zero renders as the placeholder ("default"). */
function NumField({
  id, label, value, onChange, min, max, step = 1, placeholder = 'default', hint,
}: {
  id: string; label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; placeholder?: string; hint?: string;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value === 0 ? '' : value}
        placeholder={placeholder}
        onChange={e => {
          const n = e.target.value === '' ? 0 : Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        style={{ maxWidth: '9rem' }}
      />
      {hint && <span className="hint" style={{ marginTop: 'var(--sp-1)' }}>{hint}</span>}
    </div>
  );
}

/** A labelled color field with an "auto/none" reset when a fallback exists. */
function ColorField({
  id, label, value, onChange, fallback = '#3355ff', resetLabel,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  fallback?: string; resetLabel?: string;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
        <input
          id={id}
          type="color"
          value={value || fallback}
          onChange={e => onChange(e.target.value)}
          style={{ width: 36, height: 28, padding: 2, border: '1px solid var(--border)', borderRadius: 4, background: 'none', cursor: 'pointer' }}
        />
        {resetLabel && (
          <button
            className={`opt-btn${!value ? ' opt-btn--active' : ''}`}
            onClick={() => onChange('')}
            aria-pressed={!value}
            style={{ flex: 1 }}
          >
            {resetLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/** A six-position picker backed by a native select for compactness. */
function PosSelect({
  id, label, value, onChange,
}: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} className="select" value={value} onChange={e => onChange(e.target.value)} style={{ maxWidth: '12rem' }}>
        {SIX_POS_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

/**
 * AdvancedPanel exposes the fine-grained badge controls carried over from v2:
 * per-element scale, position, offset, opacity, and colour. It is collapsed by
 * default so the common controls stay uncluttered.
 */
export function AdvancedPanel({ uid, config, onUpdate }: {
  uid: string; config: ConfigState; onUpdate: UpdateConfigFn;
}) {
  return (
    <details className="adv-details" style={{ marginTop: 'var(--sp-4)' }}>
      <summary className="label" style={{ cursor: 'pointer', userSelect: 'none' }}>
        Advanced styling
      </summary>
      <div className="cfg-fields" style={{ marginTop: 'var(--sp-3)' }}>
        <p className="hint" style={{ marginTop: 0 }}>
          Fine-grained control over each badge. Blank numbers use the default.
          These apply to the surface you are editing.
        </p>

        <span className="label">Rating badges</span>
        <NumField id={`${uid}-rating-scale`} label="Scale (%)" value={config.ratingBadgeScale}
          onChange={v => onUpdate('ratingBadgeScale', v)} min={70} max={200} step={5}
          hint="70–200. Blank keeps the default size." />
        <NumField id={`${uid}-ratings-max`} label="Max badges" value={config.ratingsMax}
          onChange={v => onUpdate('ratingsMax', v)} min={0} max={20} placeholder="no cap"
          hint="0 shows all selected sources that have data." />
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <NumField id={`${uid}-rating-ox`} label="Offset X" value={config.ratingBadgeOffsetX}
            onChange={v => onUpdate('ratingBadgeOffsetX', v)} min={-320} max={320} />
          <NumField id={`${uid}-rating-oy`} label="Offset Y" value={config.ratingBadgeOffsetY}
            onChange={v => onUpdate('ratingBadgeOffsetY', v)} min={-320} max={320} />
        </div>

        <span className="label" style={{ marginTop: 'var(--sp-3)' }}>Quality badges</span>
        <PosSelect id={`${uid}-quality-pos`} label="Position" value={config.qualityBadgesPos}
          onChange={v => onUpdate('qualityBadgesPos', v)} />
        <NumField id={`${uid}-quality-scale`} label="Scale (%)" value={config.qualityBadgeScale}
          onChange={v => onUpdate('qualityBadgeScale', v)} min={70} max={200} step={5} />
        <div className="field">
          <span className="label" id={`${uid}-quality-style-label`}>Style</span>
          <div className="opt-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }} role="group" aria-labelledby={`${uid}-quality-style-label`}>
            {QUALITY_STYLE_OPTIONS.map(o => (
              <button
                key={o.id}
                className={`opt-btn${config.qualityBadgesStyle === o.id ? ' opt-btn--active' : ''}`}
                onClick={() => onUpdate('qualityBadgesStyle', o.id)}
                aria-pressed={config.qualityBadgesStyle === o.id}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {config.qualityBadgesStyle === 'tile' && (
          <div className="field">
            <label className="label" htmlFor={`${uid}-quality-tile-color`}>Tile color</label>
            <input
              id={`${uid}-quality-tile-color`}
              type="color"
              value={config.qualityBadgesTileAccentColor || '#3355ff'}
              onChange={e => onUpdate('qualityBadgesTileAccentColor', e.target.value)}
              style={{ width: 36, height: 28, padding: 2, border: '1px solid var(--border)', borderRadius: 4, background: 'none', cursor: 'pointer' }}
            />
          </div>
        )}

        <span className="label" style={{ marginTop: 'var(--sp-3)' }}>Genre badge</span>
        <NumField id={`${uid}-genre-scale`} label="Scale (%)" value={config.genreBadgeScale}
          onChange={v => onUpdate('genreBadgeScale', v)} min={70} max={200} step={5} />
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <NumField id={`${uid}-genre-ox`} label="Offset X" value={config.genreBadgeOffsetX}
            onChange={v => onUpdate('genreBadgeOffsetX', v)} min={-320} max={320} />
          <NumField id={`${uid}-genre-oy`} label="Offset Y" value={config.genreBadgeOffsetY}
            onChange={v => onUpdate('genreBadgeOffsetY', v)} min={-320} max={320} />
        </div>
        <NumField id={`${uid}-genre-op`} label="Background opacity (%)" value={config.genreBadgeBackgroundOpacity}
          onChange={v => onUpdate('genreBadgeBackgroundOpacity', v)} min={0} max={100} step={5} />

        <span className="label" style={{ marginTop: 'var(--sp-3)' }}>Aggregate bar</span>
        <div className="field">
          <label className="label" htmlFor={`${uid}-agg-color`}>Accent color</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
            <input
              id={`${uid}-agg-color`}
              type="color"
              value={config.aggregateAccentColor || '#3355ff'}
              onChange={e => onUpdate('aggregateAccentColor', e.target.value)}
              style={{ width: 36, height: 28, padding: 2, border: '1px solid var(--border)', borderRadius: 4, background: 'none', cursor: 'pointer' }}
            />
            <button
              className={`opt-btn${!config.aggregateAccentColor ? ' opt-btn--active' : ''}`}
              onClick={() => onUpdate('aggregateAccentColor', '')}
              aria-pressed={!config.aggregateAccentColor}
              style={{ flex: 1 }}
            >
              Auto (score-based)
            </button>
          </div>
        </div>
        <details className="adv-details">
          <summary className="hint" style={{ cursor: 'pointer', userSelect: 'none' }}>Scorebar bands (when accent is auto)</summary>
          <div className="cfg-fields" style={{ marginTop: 'var(--sp-2)' }}>
            <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
              <ColorField id={`${uid}-sb-low`} label="Low" value={config.scorebarLowColor} onChange={v => onUpdate('scorebarLowColor', v)} fallback="#c0392b" resetLabel="Auto" />
              <ColorField id={`${uid}-sb-mid`} label="Mid" value={config.scorebarMidColor} onChange={v => onUpdate('scorebarMidColor', v)} fallback="#e67e22" resetLabel="Auto" />
              <ColorField id={`${uid}-sb-high`} label="High" value={config.scorebarHighColor} onChange={v => onUpdate('scorebarHighColor', v)} fallback="#27ae60" resetLabel="Auto" />
            </div>
            <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
              <NumField id={`${uid}-sb-lowt`} label="Low threshold" value={config.scorebarLowThreshold} onChange={v => onUpdate('scorebarLowThreshold', v)} min={0} max={10} step={0.5} placeholder="5" />
              <NumField id={`${uid}-sb-hight`} label="High threshold" value={config.scorebarHighThreshold} onChange={v => onUpdate('scorebarHighThreshold', v)} min={0} max={10} step={0.5} placeholder="8" />
            </div>
          </div>
        </details>

        <span className="label" style={{ marginTop: 'var(--sp-3)' }}>Age rating badge</span>
        <div className="field">
          <span className="label" id={`${uid}-age-style-label`}>Style</span>
          <div className="opt-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }} role="group" aria-labelledby={`${uid}-age-style-label`}>
            {QUALITY_STYLE_OPTIONS.map(o => (
              <button
                key={o.id}
                className={`opt-btn${config.ageRatingBadgeStyle === o.id ? ' opt-btn--active' : ''}`}
                onClick={() => onUpdate('ageRatingBadgeStyle', o.id)}
                aria-pressed={config.ageRatingBadgeStyle === o.id}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {config.ageRatingBadgeStyle === 'tile' && (
          <div className="field">
            <label className="label" htmlFor={`${uid}-age-tile-color`}>Tile color</label>
            <input
              id={`${uid}-age-tile-color`}
              type="color"
              value={config.ageRatingTileColor || '#3355ff'}
              onChange={e => onUpdate('ageRatingTileColor', e.target.value)}
              style={{ width: 36, height: 28, padding: 2, border: '1px solid var(--border)', borderRadius: 4, background: 'none', cursor: 'pointer' }}
            />
          </div>
        )}

        <span className="label" style={{ marginTop: 'var(--sp-3)' }}>Trending tag</span>
        <PosSelect id={`${uid}-trending-pos`} label="Position" value={config.trendingPos}
          onChange={v => onUpdate('trendingPos', v)} />
        <ColorField id={`${uid}-trending-color`} label="Text color" value={config.trendingTextColor}
          onChange={v => onUpdate('trendingTextColor', v)} fallback="#fff4ee" resetLabel="Default" />

        <span className="label" style={{ marginTop: 'var(--sp-3)' }}>Rating ring</span>
        <NumField id={`${uid}-ring-center-op`} label="Center opacity (%)" value={config.ringCenterOpacity}
          onChange={v => onUpdate('ringCenterOpacity', v)} min={0} max={100} step={5}
          hint="Opacity of the disc behind the ring's number. Blank keeps the default." />
        <div className="field">
          <label className="label" htmlFor={`${uid}-ring-value-src`}>Value source</label>
          <select id={`${uid}-ring-value-src`} className="select" value={config.ringValueSource} onChange={e => onUpdate('ringValueSource', e.target.value)} style={{ maxWidth: '12rem' }}>
            <option value="overall">Overall average</option>
            {RATING_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${uid}-ring-prog-src`}>Fill source</label>
          <select id={`${uid}-ring-prog-src`} className="select" value={config.ringProgressSource} onChange={e => onUpdate('ringProgressSource', e.target.value)} style={{ maxWidth: '12rem' }}>
            <option value="overall">Overall average</option>
            {RATING_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>

        <span className="label" style={{ marginTop: 'var(--sp-3)' }}>Logo surface</span>
        <div className="field">
          <span className="label" id={`${uid}-logo-bg-label`}>Background (logo type)</span>
          <div className="opt-grid" role="group" aria-labelledby={`${uid}-logo-bg-label`}>
            {[{ id: 'transparent', label: 'Transparent' }, { id: 'dark', label: 'Dark panel' }].map(o => (
              <button
                key={o.id}
                className={`opt-btn${config.logoBackground === o.id ? ' opt-btn--active' : ''}`}
                onClick={() => onUpdate('logoBackground', o.id)}
                aria-pressed={config.logoBackground === o.id}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}
