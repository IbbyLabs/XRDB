'use client';

import { useState, useEffect } from 'react';
import {
  Save, Download, Upload, Check, AlertCircle, Star, Film, LayoutTemplate,
} from 'lucide-react';
import { fetchTemplates, type Template, type Profile } from '@/lib/api';
import type { ConfigState, UpdateConfigFn } from './configurator-types';
import { LAYOUT_OPTIONS, RATING_OPTIONS } from './configurator-types';

// ── Templates panel ───────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  minimal:   'Minimal',
  detailed:  'Detailed',
  cinema:    'Cinema',
  streaming: 'Streaming',
};

export function TemplatesPanel({ onApply }: { onApply: (t: Template) => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  useEffect(() => {
    fetchTemplates()
      .then(setTemplates)
      .catch((e: unknown) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="xrdb-card">
      <div className="xrdb-card-body" style={{ display: 'grid', gap: '0.75rem' }}>
        {[0,1,2].map(i => <div key={i} className="xrdb-skeleton" style={{ height: '4.5rem' }} />)}
      </div>
    </div>
  );
  if (error) return (
    <div className="xrdb-card">
      <div className="xrdb-card-body">
        <div className="xrdb-notice xrdb-notice-error" role="alert">
          <AlertCircle size={14} aria-hidden /><span>{error}</span>
        </div>
      </div>
    </div>
  );

  const grouped: Record<string, Template[]> = {};
  for (const t of templates) {
    (grouped[t.category] ??= []).push(t);
  }

  return (
    <div className="xrdb-card">
      <div className="xrdb-card-header">
        <LayoutTemplate size={14} aria-hidden style={{ color: 'var(--muted)' }} />
        <span className="xrdb-card-title">Templates</span>
      </div>
      <div className="xrdb-card-body cfg-fields">
        <p className="xrdb-field-hint" style={{ marginBottom: '0.75rem' }}>
          Apply a preset to the current configurator. You can fine-tune it after applying.
        </p>
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <span className="xrdb-label" style={{ display: 'block', marginBottom: '0.4rem' }}>
              {CATEGORY_LABELS[cat] ?? cat}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {items.map(t => (
                <div key={t.id} className="xrdb-card" style={{ padding: '0.6rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--ink)', display: 'block' }}>{t.name}</span>
                    <span className="xrdb-field-hint" style={{ marginTop: '0.1rem' }}>{t.description}</span>
                  </div>
                  <button
                    className="xrdb-btn xrdb-btn-primary"
                    style={{ flexShrink: 0, fontSize: '0.72rem', padding: '0.25rem 0.6rem', minHeight: '2rem' }}
                    onClick={() => onApply(t)}
                    aria-label={`Apply template: ${t.name}`}
                  >
                    Apply
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
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
    <div className="xrdb-card">
      <div className="xrdb-card-header">
        <Star size={14} aria-hidden style={{ color: 'var(--muted)' }} />
        <span className="xrdb-card-title">Ratings overlay</span>
      </div>
      <div className="xrdb-card-body cfg-fields">
        <div className="cfg-field">
          <label className="xrdb-label" htmlFor={`${uid}-layout`}>Position</label>
          <div className="cfg-layout-grid">
            {LAYOUT_OPTIONS.map(o => (
              <button
                key={o.id}
                className={`cfg-layout-btn${config.ratingsLayout === o.id ? ' cfg-layout-btn--active' : ''}`}
                onClick={() => onUpdate('ratingsLayout', o.id)}
                aria-pressed={config.ratingsLayout === o.id}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="xrdb-label" style={{ marginBottom: '0.5rem' }}>
            Sources
            {config.ratings.length > 0 && (
              <span className="cfg-ratings-count">{config.ratings.length}</span>
            )}
          </legend>
          <div className="cfg-rating-list" role="group">
            {RATING_OPTIONS.map(r => {
              const active = config.ratings.includes(r.id);
              return (
                <button
                  key={r.id}
                  className={`cfg-rating-row${active ? ' cfg-rating-row--active' : ''}`}
                  onClick={() => onToggleRating(r.id)}
                  aria-pressed={active}
                >
                  <span className="cfg-rating-accent" style={{ background: r.accent }} aria-hidden />
                  <span className="cfg-rating-label">{r.label}</span>
                  <span className="cfg-rating-check" aria-hidden>
                    {active ? <Check size={12} /> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <span className="xrdb-field-hint" style={{ marginTop: '0.4rem', display: 'block' }}>
            Displayed in the order selected
          </span>
        </fieldset>
      </div>
    </div>
  );
}

// ── Profile panel ─────────────────────────────────────────────────────────────

interface ProfilePanelProps {
  uid: string;
  profileId: string;
  setProfileId: (v: string) => void;
  profileName: string;
  setProfileName: (v: string) => void;
  recentProfiles: string[];
  isPending: boolean;
  importText: string;
  setImportText: (v: string) => void;
  showImport: boolean;
  setShowImport: React.Dispatch<React.SetStateAction<boolean>>;
  onSave: () => void;
  onExport: () => void;
  onImport: () => void;
}

export function ProfilePanel({
  uid, profileId, setProfileId, profileName, setProfileName,
  recentProfiles, isPending, importText, setImportText,
  showImport, setShowImport, onSave, onExport, onImport,
}: ProfilePanelProps) {
  return (
    <div className="xrdb-card">
      <div className="xrdb-card-header">
        <Film size={14} aria-hidden style={{ color: 'var(--muted)' }} />
        <span className="xrdb-card-title">Save profile</span>
      </div>
      <div className="xrdb-card-body cfg-fields">
        <div className="cfg-field">
          <label className="xrdb-label" htmlFor={`${uid}-pid`}>Profile ID</label>
          <input
            id={`${uid}-pid`}
            className="xrdb-input"
            value={profileId}
            onChange={e => setProfileId(e.target.value)}
            placeholder="my-profile"
            spellCheck={false}
          />
          <span className="xrdb-field-hint">Used in image URLs: /poster/&#123;id&#125;?config=your-profile-id</span>
        </div>

        <div className="cfg-field">
          <label className="xrdb-label" htmlFor={`${uid}-pname`}>Display name</label>
          <input
            id={`${uid}-pname`}
            className="xrdb-input"
            value={profileName}
            onChange={e => setProfileName(e.target.value)}
            placeholder="My Profile"
          />
        </div>

        {recentProfiles.length > 0 && (
          <div>
            <span className="xrdb-label" style={{ display: 'block', marginBottom: '0.35rem' }}>Recent</span>
            <div className="cfg-recent-profiles">
              {recentProfiles.map(id => (
                <button
                  key={id}
                  className="xrdb-btn xrdb-btn-ghost cfg-recent-btn"
                  onClick={() => setProfileId(id)}
                >
                  {id}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="cfg-profile-actions">
          <button className="xrdb-btn xrdb-btn-primary cfg-btn-save" onClick={onSave} disabled={isPending}>
            <Save size={13} aria-hidden />
            Save profile
          </button>
          <button className="xrdb-btn xrdb-btn-ghost" onClick={onExport} disabled={isPending} aria-label="Export profile as JSON">
            <Download size={13} aria-hidden />
            Export
          </button>
          <button className="xrdb-btn xrdb-btn-ghost" onClick={() => setShowImport(v => !v)} aria-expanded={showImport}>
            <Upload size={13} aria-hidden />
            Import
          </button>
        </div>

        {showImport && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <textarea
              className="xrdb-input"
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder='{"version":1,"profiles":[...]}'
              rows={4}
              spellCheck={false}
              style={{ resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem' }}
              aria-label="Import JSON payload"
            />
            <button
              className="xrdb-btn xrdb-btn-primary"
              onClick={onImport}
              disabled={isPending || !importText.trim()}
            >
              Import profiles
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
