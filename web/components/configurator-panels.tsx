'use client';

import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { fetchTemplates, type Template } from '@/lib/api';
import type { ConfigState, UpdateConfigFn } from './configurator-types';
import {
  LAYOUT_OPTIONS, RATING_OPTIONS, BADGE_STYLE_OPTIONS, BADGE_THEME_OPTIONS, RING_POS_OPTIONS,
} from './configurator-types';
import { RatingBadgesFine, RatingRingFine } from './configurator-fine';

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
  /** Reveals the per-badge scale, offset and colour controls in place. */
  fine: boolean;
}

export function RatingsPanel({ uid, config, onUpdate, onToggleRating, fine }: RatingsPanelProps) {
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

        {config.ratingsLayout === 'split-side' && (
          <>
            <div className="field">
              <label className="label" htmlFor={`${uid}-side-pos`}>Side ratings vertical</label>
              <select id={`${uid}-side-pos`} className="select" value={config.sideRatingsPosition}
                onChange={e => onUpdate('sideRatingsPosition', e.target.value)} style={{ maxWidth: '12rem' }}>
                <option value="middle">Middle</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="custom">Custom offset</option>
              </select>
            </div>
            {config.sideRatingsPosition === 'custom' && (
              <div className="field">
                <label className="label" htmlFor={`${uid}-side-offset`}>Vertical offset (px)</label>
                <input id={`${uid}-side-offset`} className="input" type="number" inputMode="numeric"
                  min={-400} max={400} value={config.sideRatingsOffset || ''}
                  placeholder="0"
                  onChange={e => onUpdate('sideRatingsOffset', e.target.value === '' ? 0 : Number(e.target.value))}
                  style={{ maxWidth: '9rem' }} />
              </div>
            )}
            <div className="field">
              <label className="label" htmlFor={`${uid}-max-per-side`}>Max per side</label>
              <input id={`${uid}-max-per-side`} className="input" type="number" inputMode="numeric"
                min={0} max={20} value={config.ratingsMaxPerSide || ''}
                placeholder="no cap"
                onChange={e => onUpdate('ratingsMaxPerSide', e.target.value === '' ? 0 : Number(e.target.value))}
                style={{ maxWidth: '9rem' }} />
            </div>
          </>
        )}

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

            {fine && <RatingBadgesFine uid={uid} config={config} onUpdate={onUpdate} />}
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
                      className="color-swatch"
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

                {fine && <RatingRingFine uid={uid} config={config} onUpdate={onUpdate} />}
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
