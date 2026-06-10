'use client';

import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { fetchTemplates, type Template } from '@/lib/api';
import type { ConfigState, UpdateConfigFn } from './configurator-types';
import {
  LAYOUT_OPTIONS, RATING_OPTIONS, BADGE_STYLE_OPTIONS, BADGE_THEME_OPTIONS,
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
                      <span className="src-dot" style={{ background: r.accent }} aria-hidden />
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
            Displayed in the order selected
          </span>
        </fieldset>
      </div>
    </div>
  );
}
